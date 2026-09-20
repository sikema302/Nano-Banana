import { MAX_REFERENCE_IMAGES } from '../src/lib/reference-image-limits.js';
import { pooledFetch, isConnectionTerminatedError } from './pooled-fetch.js';

export type FluxBananaInput = {
  prompt: string;
  ratio: string;
  imageSize: string;
  images: string[];
  /** 固定使用指定上游模型；缺省时按 imageSize 自动选择（4K=Pro，其余=Flash）。 */
  model?: string;
};

type FluxBananaOptions = {
  baseUrl: string;
  apiKey: string;
  maxConcurrent?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleepImpl?: (milliseconds: number) => Promise<void>;
};

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

type GeminiPayload = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  data?: unknown;
  assets?: Array<{
    b64_json?: string;
    data?: string;
    mime_type?: string;
    mimeType?: string;
    url?: string;
    download_url?: string;
    signed_url?: string;
  }>;
  error?: { message?: string } | string;
  message?: string;
  status?: string;
  task_id?: string;
  id?: string;
  request_id?: string;
  poll_after_ms?: number;
  poll_url?: string;
  status_url?: string;
  result_url?: string;
};

export const FLUX_BANANA_FLASH_MODEL = 'gemini-3.1-flash-image-preview';
export const FLUX_BANANA_PRO_MODEL = 'gemini-3-pro-image-preview';

function providerError(message: string, safeToFallback: boolean, status?: number) {
  const error = new Error(message) as Error & {
    safeToFallback: boolean;
    status?: number;
    sourceModel?: string;
  };
  error.safeToFallback = safeToFallback;
  if (status) error.status = status;
  return error;
}

const SUCCESS_TASK_STATUSES = new Set([
  'success', 'succeeded', 'successful', 'completed', 'complete', 'done', 'finished',
]);
const FAILED_TASK_STATUSES = new Set([
  'failed', 'failure', 'fail', 'canceled', 'cancelled', 'error', 'timed_out', 'timeout', 'expired',
]);
const MAX_TASK_POLLS = 600;
const MAX_CONSECUTIVE_TASK_FAILURES = 5;
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

const MODERATION_PATTERN = /upstream\s+error|content|safety|moderat|prohibit|block|policy|审核|敏感|违禁|违规|色情|暴力/i;

function isSuccessTask(status: string) {
  return SUCCESS_TASK_STATUSES.has(status);
}

function isFailedTask(status: string) {
  return FAILED_TASK_STATUSES.has(status);
}

function payloadError(payload: GeminiPayload) {
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message || payload.message || '';
}

function normalizeImageSize(value: string) {
  return ['1K', '2K', '4K'].includes(value) ? value : '1K';
}

export function selectFluxBananaModel(imageSize: string) {
  const normalized = normalizeImageSize(imageSize);
  if (normalized === '4K') return FLUX_BANANA_PRO_MODEL;
  return FLUX_BANANA_FLASH_MODEL;
}

/**
 * 同一把平台 Key 在两种协议下都可用：/v1/* 用 Bearer，/v1beta/* 用 x-goog-api-key。
 * 提交走 Gemini 原生仅用 x-goog-api-key；轮询与资产下载同时带两种头，兼容网关任意一种鉴权校验。
 */
function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'x-goog-api-key': apiKey,
  };
}

async function referencePart(source: string, signal: AbortSignal, fetchImpl: typeof fetch): Promise<GeminiPart> {
  if (source.startsWith('data:')) {
    const match = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) throw providerError('Invalid reference image data URL', true);
    const mimeType = match[1] || 'image/png';
    const data = match[2]
      ? match[3].replace(/\s+/g, '')
      : Buffer.from(decodeURIComponent(match[3])).toString('base64');
    return { inlineData: { mimeType, data } };
  }

  let response: Response;
  try {
    response = await fetchImpl(source, { signal });
  } catch (error) {
    throw providerError(error instanceof Error ? error.message : 'Unable to load reference image', true);
  }
  if (!response.ok) {
    throw providerError(`Unable to load reference image (${response.status})`, true, response.status);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    inlineData: {
      mimeType: response.headers.get('content-type') || 'image/png',
      data: bytes.toString('base64'),
    },
  };
}

function generatedImage(payload: GeminiPayload) {
  for (const candidate of payload.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      const inlineData = part.inlineData;
      if (inlineData?.data) {
        return `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data.replace(/\s+/g, '')}`;
      }
      const snakeCase = part.inline_data;
      if (snakeCase?.data) {
        return `data:${snakeCase.mime_type || 'image/png'};base64,${snakeCase.data.replace(/\s+/g, '')}`;
      }
    }
  }
  for (const asset of payload.assets || []) {
    const base64 = asset.b64_json || asset.data;
    if (base64) {
      return `data:${asset.mime_type || asset.mimeType || 'image/png'};base64,${base64.replace(/\s+/g, '')}`;
    }
    // 网关文档要求优先使用 signed_url（6 小时有效、无需 Authorization）。
    if (asset.signed_url) return asset.signed_url;
    if (asset.download_url || asset.url) return asset.download_url || asset.url || '';
  }
  // OpenAI 兼容同步响应：data: [{ b64_json | url }]
  if (Array.isArray(payload.data)) {
    for (const item of payload.data) {
      if (!item || typeof item !== 'object') continue;
      const record = item as { b64_json?: string; url?: string };
      if (typeof record.b64_json === 'string' && record.b64_json) {
        return `data:image/png;base64,${record.b64_json.replace(/\s+/g, '')}`;
      }
      if (typeof record.url === 'string' && record.url) return record.url;
    }
  }
  return '';
}

function resolveProviderUrl(baseUrl: string, value: string) {
  const base = new URL(`${baseUrl.replace(/\/+$/, '')}/`);
  const resolved = new URL(value, base);
  if (resolved.origin !== base.origin) {
    throw providerError('Flux image provider returned an untrusted task URL', false);
  }
  return resolved.toString();
}

async function parsePayload(response: Response) {
  const raw = await response.text();
  let payload: GeminiPayload = {};
  try {
    payload = raw ? JSON.parse(raw) as GeminiPayload : {};
  } catch {
    // A short response excerpt is included in the error below.
  }
  return { payload, raw };
}

async function fetchTaskPayload(
  url: string,
  options: FluxBananaOptions,
  signal: AbortSignal,
) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl || ((u: string, init?: RequestInit) =>
    pooledFetch(u, init || {}, {
      baseUrl,
      maxConcurrent: options.maxConcurrent,
      timeoutMs: options.timeoutMs,
    }));
  const response = await fetchImpl(url, {
    headers: authHeaders(options.apiKey),
    signal,
  });
  const parsed = await parsePayload(response);
  if (!response.ok) {
    throw providerError(
      payloadError(parsed.payload) || `Flux task status returned HTTP ${response.status}: ${parsed.raw.slice(0, 240)}`,
      false,
      response.status,
    );
  }
  return parsed.payload;
}

async function materializeImage(
  source: string,
  options: FluxBananaOptions,
  signal: AbortSignal,
) {
  if (source.startsWith('data:image/')) return source;
  const base = new URL(`${options.baseUrl.replace(/\/+$/, '')}/`);
  const url = new URL(source, base);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw providerError('Flux image provider returned an invalid asset URL', false);
  }
  // signed_url 等跨源地址不带凭据；同源受保护资产同时携带 Bearer 与 x-goog-api-key。
  const headers = url.origin === base.origin ? authHeaders(options.apiKey) : undefined;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl || ((u: string, init?: RequestInit) =>
    pooledFetch(u, init || {}, {
      baseUrl,
      maxConcurrent: options.maxConcurrent,
      timeoutMs: options.timeoutMs,
    }));
  const response = await fetchImpl(url.toString(), {
    headers,
    signal,
  });
  if (!response.ok) {
    throw providerError(`Flux image download returned HTTP ${response.status}`, false, response.status);
  }
  const mimeType = (response.headers.get('content-type') || 'image/png').split(';')[0];
  if (!mimeType.startsWith('image/')) {
    throw providerError(`Flux image download returned ${mimeType || 'an invalid content type'}`, false);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw providerError('Flux image download returned an empty file', false);
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

function taskStatus(payload: GeminiPayload) {
  return String(payload.status || '').trim().toLowerCase();
}

function taskUrl(payload: GeminiPayload) {
  return payload.status_url || payload.poll_url || payload.result_url || '';
}

/**
 * 解析异步任务的轮询地址：
 * 1. 优先使用网关显式返回的 status_url / poll_url / result_url；
 * 2. 否则用 task_id / id / request_id 自行拼接图片任务查询端点。
 */
function taskQueryUrl(payload: GeminiPayload, baseUrl: string) {
  const explicit = taskUrl(payload);
  if (explicit) return resolveProviderUrl(baseUrl, explicit);
  const taskId = payload.task_id || payload.id || payload.request_id || '';
  if (taskId) return resolveProviderUrl(baseUrl, `/v1/images/tasks/${taskId}`);
  return '';
}

/**
 * 香蕉（Gemini 图片模型）统一走 Gemini 原生 `generateContent` 接口（非流式），
 * 与 uselg 文档契约一致：请求头 x-goog-api-key，结果从响应 inlineData 读取；
 * 若网关返回 202 异步任务，则按 task_id / status_url 轮询查询，不重复提交同一张图。
 */
async function submitViaGeminiNative(
  input: FluxBananaInput,
  options: FluxBananaOptions,
  model: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
  rootUrl: string,
) {
  const parts: GeminiPart[] = [{ text: input.prompt }];
  parts.push(...await Promise.all(
    input.images.slice(0, MAX_REFERENCE_IMAGES).map((source) => referencePart(source, signal, fetchImpl)),
  ));
  const response = await fetchImpl(
    `${rootUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': options.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: input.ratio === 'auto' ? '1:1' : input.ratio || '1:1',
            imageSize: normalizeImageSize(input.imageSize),
          },
        },
      }),
      signal,
    },
  );
  if (!response.ok) {
    const { payload, raw } = await parsePayload(response);
    const upstreamMessage = payloadError(payload)
      || `Flux image provider returned HTTP ${response.status}: ${raw.slice(0, 240)}`;
    // gemini 400 多为提示词/参考图内容审核或参数被拒；这类错误换渠道重试无意义，
    // 标记为不 fallback，并交由 classifyPublicImageError 归入 sensitive_prompt 统一提示。
    const isModeration = response.status === 400 && MODERATION_PATTERN.test(upstreamMessage);
    throw providerError(
      isModeration ? `Content moderation rejected: ${upstreamMessage}` : upstreamMessage,
      !isModeration,
      response.status,
    );
  }
  return response;
}

export async function generateFluxBanana(input: FluxBananaInput, options: FluxBananaOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const rootUrl = baseUrl.replace(/\/v1$/i, '');
  const fetchImpl = options.fetchImpl || ((url: string, init?: RequestInit) =>
    pooledFetch(url, init || {}, {
      baseUrl,
      maxConcurrent: options.maxConcurrent,
      timeoutMs: options.timeoutMs,
    }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15 * 60_000);
  const model = input.model || selectFluxBananaModel(input.imageSize);
  let requestSent = false;

  try {
    const response = await submitViaGeminiNative(input, options, model, controller.signal, fetchImpl, rootUrl);
    requestSent = true;

    const { payload: initialPayload, raw } = await parsePayload(response);
    let payload = initialPayload;
    let source = generatedImage(payload);
    if (source) {
      return { source: await materializeImage(source, options, controller.signal), model };
    }

    // 网关返回 202 异步任务：保存 task_id / status_url 后按地址轮询，不重复提交。
    const initialStatus = taskStatus(payload);
    let pollUrl = taskQueryUrl(payload, baseUrl);
    if (!pollUrl && !initialStatus) {
      throw providerError(`Flux image provider returned no image: ${raw.slice(0, 240)}`, false);
    }

    let consecutiveFailures = 0;
    let consecutivePollErrors = 0;
    let polls = 0;
    while (pollUrl && polls < MAX_TASK_POLLS) {
      const status = taskStatus(payload);
      if (isSuccessTask(status)) break;
      if (isFailedTask(status)) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_TASK_FAILURES) break;
      } else {
        consecutiveFailures = 0;
      }
      const delay = Math.min(10_000, Math.max(250, Number(payload.poll_after_ms) || 2_000));
      await (options.sleepImpl || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))))(delay);
      let fetchedPayload: GeminiPayload = {};
      try {
        const pollResponse = await fetchImpl(pollUrl, {
          headers: authHeaders(options.apiKey),
          signal: controller.signal,
        });
        const parsed = await parsePayload(pollResponse);
        if (!pollResponse.ok) {
          consecutivePollErrors += 1;
          if (consecutivePollErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
            throw providerError(
              payloadError(parsed.payload) || `Flux task status returned HTTP ${pollResponse.status}: ${parsed.raw.slice(0, 240)}`,
              false,
              pollResponse.status,
            );
          }
          polls += 1;
          continue;
        }
        consecutivePollErrors = 0;
        fetchedPayload = parsed.payload;
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (error && typeof error === 'object' && 'safeToFallback' in error) throw error;
        // 连接被对端断开（UND_ERR_SOCKET/terminated/fetch failed）时快速失败，
        // 让调用方立即 fallback 到其他渠道，而不是在这里空轮询耗尽 15 分钟。
        if (isConnectionTerminatedError(error)) {
          throw providerError(
            `Flux connection terminated: ${(error as Error).message || 'socket closed'}`,
            true,
          );
        }
        consecutivePollErrors += 1;
        if (consecutivePollErrors >= MAX_CONSECUTIVE_POLL_ERRORS) throw error;
        polls += 1;
        continue;
      }
      payload = fetchedPayload;
      source = generatedImage(payload);
      if (source) {
        return { source: await materializeImage(source, options, controller.signal), model };
      }
      const nextUrl = taskUrl(payload);
      if (nextUrl) pollUrl = resolveProviderUrl(baseUrl, nextUrl);
      polls += 1;
    }

    const finalStatus = taskStatus(payload);
    if (isSuccessTask(finalStatus)) {
      const resultUrl = payload.result_url;
      if (resultUrl) {
        const resultPayload = await fetchTaskPayload(resolveProviderUrl(baseUrl, resultUrl), options, controller.signal);
        source = generatedImage(resultPayload);
        if (source) {
          return { source: await materializeImage(source, options, controller.signal), model };
        }
      }
      throw providerError('Flux image task completed without a downloadable image', false);
    }
    if (isFailedTask(finalStatus)) {
      throw providerError(payloadError(payload) || `Flux image task ${finalStatus}`, true);
    }
    throw providerError(
      payloadError(payload) || `Flux image task result is uncertain (${finalStatus || 'unknown'})`,
      false,
    );
  } catch (error) {
    if (error && typeof error === 'object') {
      const tagged = error as { safeToFallback?: boolean; sourceModel?: string };
      if (!('safeToFallback' in tagged)) tagged.safeToFallback = !requestSent;
      tagged.sourceModel = model;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
