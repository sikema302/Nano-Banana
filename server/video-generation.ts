// Uselg(FluxPort) 视频生成渠道：MiniMax H3 与 grok-imagine-video-1.5 文生/图生视频。
//
// 契约（与 uselg.top 文档一致，base URL 为 api.ai-media.vip）：
//   提交  POST /v1/videos             （Authorization: Bearer + Idempotency-Key）
//   查询  GET  /v1/videos/{id}        （按 poll_after_ms / Retry-After 等待）
//   下载  GET  /v1/videos/{id}/content（video_available=true 且 asset_state=ready 后可下载）
//
// 模型与清晰度/比例由共享规格表 VIDEO_MODELS 控制，上游模型名按分辨率映射：
//   minimax-h3: 720p/1080p，比例 16:9/9:16，参考图最多 9、无参考视频/音频；按秒计费
//     （720p $0.075/s、1080p $0.138/s）；上游模型 `minimax-h3`
//     （2026-10-28 新文档 group 105 / offer media_9efd2d1e；旧 `全参MinimaxH3`、
//     `minimax_h3-768p` 上游均已下线）。
//   grok-imagine-video-1.5: 480p/720p，比例 5 种，480p 参考图 1、720p 参考图 7，无视频/音频；
//     上游模型 480p→`grok-imagine-video-1.5-lite`、720p→`grok-imagine-video-1.5（按次）`

import { randomUUID } from 'node:crypto';
import { pooledFetch, isConnectionTerminatedError } from './pooled-fetch.js';
import {
  VIDEO_MODELS,
  normalizeVideoModelId,
  type VideoModelId,
  type VideoResolution,
  type VideoAspect,
} from '../src/lib/model-credit-config.js';

// 供上层复用这些类型（与共享计费模块保持一致）。
export type { VideoModelId, VideoResolution, VideoAspect };

export type UselgVideoInput = {
  modelId: VideoModelId;
  prompt: string;
  resolution: VideoResolution;
  /** 画面比例，按 aspect_ratio 下发。 */
  aspect: VideoAspect;
  /** 4–15 的整数秒，默认 5。 */
  seconds: number;
  /** 参考图（图生视频），最多由模型规格决定。 */
  referenceImages: string[];
  /** 参考视频，最多由模型规格决定（minimax-h3/grok 均 0 段，不下发）。 */
  referenceVideos?: string[];
  /** 参考音频，最多由模型规格决定（minimax-h3/grok 均 0 段，不下发）。 */
  referenceAudios?: string[];
};

export type UselgVideoOptions = {
  baseUrl: string;
  apiKey: string;
  maxConcurrent?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (milliseconds: number) => Promise<void>;
};

export type UselgVideoResult = {
  buffer: Buffer;
  contentType: string;
  taskId: string;
  model: string;
};

/** 视频参考图上限（minimax 单模型兜底，供上层切片使用；grok 按分辨率 1/7）。 */
export const VIDEO_MAX_REFERENCE_IMAGES = 9;
export const VIDEO_MIN_SECONDS = 3;
export const VIDEO_MAX_SECONDS = 15;
export const VIDEO_DEFAULT_SECONDS = 5;

const SUCCESS_STATUSES = new Set([
  'completed', 'complete', 'succeeded', 'success', 'done', 'finished',
]);
const FAILED_STATUSES = new Set([
  'failed', 'failure', 'fail', 'canceled', 'cancelled', 'error', 'timed_out', 'timeout', 'expired',
]);
const MAX_TASK_POLLS = 1200;

type VideoTaskPayload = {
  id?: string;
  task_id?: string;
  request_id?: string;
  status?: string;
  message?: string;
  error?: string | { message?: string };
  video_available?: boolean;
  asset_state?: string;
  status_url?: string;
  poll_after_ms?: number;
};

function videoError(message: string, status?: number) {
  const error = new Error(message) as Error & { status?: number; sourceModel?: string };
  if (status) error.status = status;
  return error;
}

function payloadMessage(payload: VideoTaskPayload) {
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message || payload.message || '';
}

function taskStatus(payload: VideoTaskPayload) {
  return String(payload.status || '').trim().toLowerCase();
}

function taskId(payload: VideoTaskPayload) {
  return String(payload.task_id || payload.id || payload.request_id || '').trim();
}

function authHeader(apiKey: string): Record<string, string> {
  return { Authorization: /^Bearer\s/i.test(apiKey) ? apiKey : `Bearer ${apiKey}` };
}

async function parseJson<T>(response: Response): Promise<{ payload: T; raw: string }> {
  const raw = await response.text();
  let payload = {} as T;
  try {
    payload = raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    // 非 JSON 响应由调用方结合 raw 报错。
  }
  return { payload, raw };
}

export function normalizeVideoSeconds(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return VIDEO_DEFAULT_SECONDS;
  return Math.min(VIDEO_MAX_SECONDS, Math.max(VIDEO_MIN_SECONDS, parsed));
}

function resolveSpec(modelId: VideoModelId | string) {
  return VIDEO_MODELS[normalizeVideoModelId(modelId)];
}

export function normalizeVideoResolution(modelId: VideoModelId | string, value: string): VideoResolution {
  const spec = resolveSpec(modelId);
  return spec.resolutions.includes(value as VideoResolution) ? (value as VideoResolution) : spec.resolutions[0];
}

export function normalizeVideoAspect(modelId: VideoModelId | string, value: string): VideoAspect {
  const spec = resolveSpec(modelId);
  return spec.aspects.includes(value as VideoAspect) ? (value as VideoAspect) : spec.aspects[0];
}

/**
 * 提交视频任务、轮询状态、下载成片。单一渠道，无 fallback；整体超时后抛出
 * 携带 taskId 的错误，由上层按「不确定结果」处理（避免在不确定时误退款）。
 */
export async function generateUselgVideo(
  input: UselgVideoInput,
  options: UselgVideoOptions,
): Promise<UselgVideoResult> {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const modelId = normalizeVideoModelId(input.modelId);
  const spec = resolveSpec(modelId);
  const resolution = normalizeVideoResolution(modelId, input.resolution);
  const aspect = normalizeVideoAspect(modelId, input.aspect);
  const seconds = normalizeVideoSeconds(input.seconds);
  const referenceImages = input.referenceImages
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, spec.maxReferenceImages(resolution));
  const referenceVideos = (input.referenceVideos || [])
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, spec.maxReferenceVideos);
  const referenceAudios = (input.referenceAudios || [])
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, spec.maxReferenceAudios);

  const fetchImpl = options.fetchImpl || ((url: string, init?: RequestInit) =>
    pooledFetch(url, init || {}, {
      baseUrl,
      maxConcurrent: options.maxConcurrent,
      timeoutMs: options.timeoutMs,
    }));
  const sleepImpl = options.sleepImpl || ((milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15 * 60_000);
  const idempotencyKey = randomUUID();
  let submittedTaskId = '';

  try {
    // 1) 提交任务：model 按模型+清晰度映射，清晰度用 resolution、比例用 aspect_ratio 下发。
    const submitBody: Record<string, unknown> = {
      model: spec.upstreamModelFor(resolution),
      prompt: input.prompt,
      seconds,
      resolution,
      aspect_ratio: aspect,
    };
    if (referenceImages.length > 0) {
      submitBody.reference_images = referenceImages.map((url) => ({ url }));
    }
    if (referenceVideos.length > 0) {
      submitBody.reference_videos = referenceVideos.map((url) => ({ url }));
    }
    if (referenceAudios.length > 0) {
      submitBody.reference_audios = referenceAudios.map((url) => ({ url }));
    }

    const submitResponse = await fetchImpl(`${baseUrl}/v1/videos`, {
      method: 'POST',
      headers: {
        ...authHeader(options.apiKey),
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(submitBody),
      signal: controller.signal,
    });

    const { payload: submitPayload, raw: submitRaw } = await parseJson<VideoTaskPayload>(submitResponse);
    if (!submitResponse.ok) {
      throw videoError(
        payloadMessage(submitPayload) || `Video provider returned HTTP ${submitResponse.status}: ${submitRaw.slice(0, 240)}`,
        submitResponse.status,
      );
    }
    submittedTaskId = taskId(submitPayload);
    if (!submittedTaskId) {
      throw videoError(`Video provider returned no task id: ${submitRaw.slice(0, 240)}`);
    }

    // 2) 轮询状态
    const statusUrl = submitPayload.status_url
      ? new URL(submitPayload.status_url, `${baseUrl}/`).toString()
      : `${baseUrl}/v1/videos/${submittedTaskId}`;

    let payload: VideoTaskPayload = submitPayload;
    let polls = 0;
    let downloadUrl = `${baseUrl}/v1/videos/${submittedTaskId}/content`;

    while (polls < MAX_TASK_POLLS) {
      const status = taskStatus(payload);

      if (isVideoFailed(status)) {
        throw videoError(payloadMessage(payload) || `Video task ${status}`);
      }

      if (isVideoReady(payload)) {
        // 3) 下载成片
        const download = await fetchImpl(downloadUrl, {
          headers: authHeader(options.apiKey),
          signal: controller.signal,
        });
        if (download.ok) {
          const contentType = (download.headers.get('content-type') || 'video/mp4').split(';')[0].trim();
          const buffer = Buffer.from(await download.arrayBuffer());
          if (buffer.length === 0) {
            throw videoError('Video provider returned an empty file');
          }
          return {
            buffer,
            contentType,
            taskId: submittedTaskId,
            model: spec.upstreamModelFor(resolution),
          };
        }
        // 状态已就绪但下载仍未就绪（文件保存中），短暂等待后重试。
        await sleepImpl(Math.min(5_000, Math.max(500, Number(payload.poll_after_ms) || 2_000)));
        polls += 1;
        continue;
      }

      const delay = Math.min(30_000, Math.max(500, Number(payload.poll_after_ms) || 2_000));
      await sleepImpl(delay);
      polls += 1;

      let pollResponse: Response;
      try {
        pollResponse = await fetchImpl(statusUrl, {
          headers: authHeader(options.apiKey),
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (isConnectionTerminatedError(error)) {
          // 连接被对端断开：快速失败，避免空轮询耗尽超时窗口。
          throw videoError(`Video connection terminated: ${(error as Error).message || 'socket closed'}`);
        }
        await sleepImpl(delay);
        continue;
      }

      const { payload: pollPayload, raw: pollRaw } = await parseJson<VideoTaskPayload>(pollResponse);
      if (!pollResponse.ok) {
        // 查询接口偶发失败不等于任务失败；保留 taskId，短暂等待后继续查询原任务。
        if (pollResponse.status === 401 || pollResponse.status === 403 || pollResponse.status === 400) {
          throw videoError(
            payloadMessage(pollPayload) || `Video task status returned HTTP ${pollResponse.status}: ${pollRaw.slice(0, 240)}`,
            pollResponse.status,
          );
        }
        await sleepImpl(delay);
        continue;
      }
      payload = pollPayload;
    }

    throw videoError(
      payloadMessage(payload) || `Video task result is uncertain (${taskStatus(payload) || 'unknown'})`,
    );
  } catch (error) {
    if (error && typeof error === 'object' && !('status' in error)) {
      (error as Error & { status?: number }).status = undefined;
    }
    // 整体超时但任务已提交：附上 taskId 信息，供上层判定为「不确定结果」而非确定性失败。
    if (controller.signal.aborted && submittedTaskId && error instanceof Error) {
      (error as Error & { taskId?: string }).taskId = submittedTaskId;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isVideoReady(payload: VideoTaskPayload) {
  // 明确 completed 即进入下载；asset_state/video_available 仅作增强判断。
  return SUCCESS_STATUSES.has(taskStatus(payload));
}

function isVideoFailed(status: string) {
  return FAILED_STATUSES.has(status);
}

/** 供上层做归一化校验：返回规范化后的模型、秒数与分辨率档，非法值回退默认。 */
export function normalizeUselgVideoInput(input: UselgVideoInput) {
  const modelId = normalizeVideoModelId(input.modelId);
  const spec = resolveSpec(modelId);
  const resolution = normalizeVideoResolution(modelId, input.resolution);
  return {
    modelId,
    prompt: input.prompt,
    resolution,
    aspect: normalizeVideoAspect(modelId, input.aspect),
    seconds: normalizeVideoSeconds(input.seconds),
    referenceImages: input.referenceImages
      .filter((url) => /^https?:\/\//i.test(url))
      .slice(0, spec.maxReferenceImages(resolution)),
    referenceVideos: (input.referenceVideos || [])
      .filter((url) => /^https?:\/\//i.test(url))
      .slice(0, spec.maxReferenceVideos),
    referenceAudios: (input.referenceAudios || [])
      .filter((url) => /^https?:\/\//i.test(url))
      .slice(0, spec.maxReferenceAudios),
  };
}
