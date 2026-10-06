// Uselg(FluxPort) 视频生成渠道：minimax_h3 系列文生视频 / 图生视频。
//
// 契约（与 uselg.top 文档一致，base URL 为 api.ai-media.vip）：
//   提交  POST /v1/videos             （Authorization: Bearer + Idempotency-Key）
//   查询  GET  /v1/videos/{id}        （按 poll_after_ms / Retry-After 等待）
//   下载  GET  /v1/videos/{id}/content（video_available=true 且 asset_state=ready 后可下载）
//
// 三档分辨率固定模型名，尺寸如下（均在 4–15 秒内，默认 5 秒）：
//   768p  -> minimax_h3-768p   size "1376x768"（文档只列横屏约 16:9）
//   1080p -> minimax_h3-1080p  文档给出比例→size 映射表：
//             16:9 -> 1920x1080, 9:16 -> 1080x1920, 1:1 -> 1440x1440
//             （另有 4:3/3:4/3:2/2:3，每秒加价，未开放）
//   2K    -> minimax_h3-2K     size "2K"（清晰度档由模型名固定）
//
// 比例按业务要求四档全开（16:9 / 9:16 / 1:1 / 21:9），实现见 resolveVideoSizeParams：
// size 与 aspect_ratio 二选一，16:9 用推荐 size，其余走 aspect_ratio。
// 注意：上游 1080p 文档写明「不支持 21:9」，768p/2K 也未给出其他比例的核验结论，
// 这些组合能否出片以上游实际返回为准（失败会在生成记录里按阶段归因，不扣积分）。

import { randomUUID } from 'node:crypto';
import { pooledFetch, isConnectionTerminatedError } from './pooled-fetch.js';

export type VideoResolution = '768p' | '1080p' | '2K';

/** 前端可选的画面比例；上游仅 1080p 档支持比例选择，且不支持 21:9。 */
export type VideoAspect = '16:9' | '9:16' | '1:1' | '21:9';

export type UselgVideoInput = {
  prompt: string;
  resolution: VideoResolution;
  /** 画面比例（四档全开）：16:9 走各档推荐 size，其余按 aspect_ratio 下发。 */
  aspect: VideoAspect;
  /** 4–15 的整数秒，默认 5。 */
  seconds: number;
  /** 参考图（图生视频），最多 9 个公开可读的 HTTP(S) URL。 */
  referenceImages: string[];
  /** 参考视频，最多 3 个公开可读的 HTTP(S) URL（单文件 ≤50MB，由上传侧校验）。 */
  referenceVideos?: string[];
  /** 参考音频，最多 3 个公开可读的 HTTP(S) URL。 */
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

/** 每档分辨率的固定模型名与推荐 size。 */
export const VIDEO_MODELS: Record<VideoResolution, { model: string; size: string }> = {
  '768p': { model: 'minimax_h3-768p', size: '1376x768' },
  '1080p': { model: 'minimax_h3-1080p', size: '1920x1080' },
  '2K': { model: 'minimax_h3-2K', size: '2K' },
};

/** 视频参考图上限（与上游文档一致）。 */
export const VIDEO_MAX_REFERENCE_IMAGES = 9;
/** 参考视频 / 参考音频上限（与上游文档一致，均最多 3 段）。 */
export const VIDEO_MAX_REFERENCE_VIDEOS = 3;
export const VIDEO_MAX_REFERENCE_AUDIOS = 3;
export const VIDEO_MIN_SECONDS = 4;
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

export function normalizeVideoResolution(value: string): VideoResolution {
  return value === '1080p' || value === '2K' ? value : '768p';
}

export function normalizeVideoAspect(value: string): VideoAspect {
  return value === '9:16' || value === '1:1' || value === '21:9' ? value : '16:9';
}

/**
 * 按清晰度档 + 画面比例解析提交参数。
 * 上游规则：`size` 与 `aspect_ratio` 二选一（同时传且比例不一致会被拒），
 * 因此 16:9 走各档推荐 size，其他比例改走 aspect_ratio。
 *   - 1080p：16:9 -> 1920x1080，9:16 -> 1080x1920，1:1 -> 1440x1440（文档映射表）
 *   - 768p：16:9 -> 1376x768（文档只列了横屏，其他比例走 aspect_ratio 由上游判定）
 *   - 2K：16:9 -> "2K"（清晰度档由模型名固定，其他比例走 aspect_ratio）
 */
export function resolveVideoSizeParams(
  resolution: VideoResolution,
  aspect: VideoAspect,
): { size?: string; aspectRatio?: string } {
  if (aspect === '16:9') {
    return { size: VIDEO_MODELS[resolution].size };
  }
  if (resolution === '1080p') {
    if (aspect === '9:16') return { size: '1080x1920' };
    if (aspect === '1:1') return { size: '1440x1440' };
  }
  return { aspectRatio: aspect };
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
  const resolution = normalizeVideoResolution(input.resolution);
  const modelInfo = VIDEO_MODELS[resolution];
  const aspect = normalizeVideoAspect(input.aspect);
  const seconds = normalizeVideoSeconds(input.seconds);
  const referenceImages = input.referenceImages
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, VIDEO_MAX_REFERENCE_IMAGES);
  const referenceVideos = (input.referenceVideos || [])
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, VIDEO_MAX_REFERENCE_VIDEOS);
  const referenceAudios = (input.referenceAudios || [])
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, VIDEO_MAX_REFERENCE_AUDIOS);

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
    // 1) 提交任务（size 与 aspect_ratio 二选一，按上游文档不传 resolution/quality）
    const { size, aspectRatio } = resolveVideoSizeParams(resolution, aspect);
    const submitBody: Record<string, unknown> = {
      model: modelInfo.model,
      prompt: input.prompt,
      seconds,
    };
    if (size) submitBody.size = size;
    if (aspectRatio) submitBody.aspect_ratio = aspectRatio;
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
            model: modelInfo.model,
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

/** 供上层做归一化校验：返回规范化后的秒数与分辨率档，非法值回退默认。 */
export function normalizeUselgVideoInput(input: UselgVideoInput) {
  return {
    prompt: input.prompt,
    resolution: normalizeVideoResolution(input.resolution),
    aspect: normalizeVideoAspect(input.aspect),
    seconds: normalizeVideoSeconds(input.seconds),
    referenceImages: input.referenceImages
      .filter((url) => /^https?:\/\//i.test(url))
      .slice(0, VIDEO_MAX_REFERENCE_IMAGES),
    referenceVideos: (input.referenceVideos || [])
      .filter((url) => /^https?:\/\//i.test(url))
      .slice(0, VIDEO_MAX_REFERENCE_VIDEOS),
    referenceAudios: (input.referenceAudios || [])
      .filter((url) => /^https?:\/\//i.test(url))
      .slice(0, VIDEO_MAX_REFERENCE_AUDIOS),
  };
}
