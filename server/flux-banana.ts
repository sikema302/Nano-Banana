import { MAX_REFERENCE_IMAGES } from '../src/lib/reference-image-limits.js';
import { pooledFetch, shouldFastFailover, isConnectionTerminatedError } from './pooled-fetch.js';

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
  assets?: Array<{
    b64_json?: string;
    data?: string;
    mime_type?: string;
    mimeType?: string;
    url?: string;
    download_url?: string;
  }>;
  error?: { message?: string } | string;
  message?: string;
  status?: string;
  task_id?: string;
  id?: string;
  poll_after_ms?: number;
  poll_url?: string;
  status_url?: string;
  result_url?: string;
};

export const FLUX_BANANA_FLASH_MODEL = 'gemini-3.1-flash-image-preview';
export const FLUX_BANANA_PRO_MODEL = 'gemini-3-pro-image-preview';

function providerError(message: string, safeToFallback: boolean, status?: number) {
  const error = new Error(message) as Error & { safeToFallback: boolean; status?: number; sourceModel?: string };
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
    if (asset.download_url || asset.url) return asset.download_url || asset.url || '';
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

/**
 * 读取 SSE（text/event-stream）响应并逐个解析 data: 事件里的 JSON chunk。
 * 同步等待上游出图要 1~2 分钟，nginx 类网关 60 秒无字节就会断连（UND_ERR_SOCKET），
 * 流式端点持续推 chunk，可以避免「上游已出图扣费、我们这侧连接被掐断」的问题。
 * raw 仅保留开头一小段用于错误诊断，避免把 base64 图片全量留在内存里。
 */
async function readSsePayloads(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return { payloads: [] as GeminiPayload[], raw: '' };
  const decoder = new TextDecoder();
  let lineBuffer = '';
  let raw = '';
  const payloads: GeminiPayload[] = [];

  const flushEvent = (eventText: string) => {
    if (!eventText.trim()) return;
    const data = eventText
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!data || data === '[DONE]') return;
    if (raw.length < 4_096) raw = `${raw}${data}\n`.slice(0, 4_096);
    try {
      payloads.push(JSON.parse(data) as GeminiPayload);
    } catch {
      // 非 JSON 的心跳/注释帧直接忽略。
    }
  };

  let eventBuffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });
      let newlineIndex = lineBuffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = lineBuffer.slice(0, newlineIndex).replace(/\r$/, '');
        lineBuffer = lineBuffer.slice(newlineIndex + 1);
        if (line === '') {
          flushEvent(eventBuffer);
          eventBuffer = '';
        } else {
          eventBuffer += `${line}\n`;
        }
        newlineIndex = lineBuffer.indexOf('\n');
      }
    }
    if (lineBuffer.trim()) eventBuffer += `${lineBuffer.replace(/\r$/, '')}\n`;
    flushEvent(eventBuffer);
  } finally {
    reader.releaseLock();
  }
  return { payloads, raw };
}

async function fetchTaskPayload(
  url: string,
  options: FluxBananaOptions,
  signal: AbortSignal,
) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl || ((u: string, init?: RequestInit) =>
    pooledFetch(u, init || {}, { baseUrl, timeoutMs: options.timeoutMs }));
  const response = await fetchImpl(url, {
    headers: { 'x-goog-api-key': options.apiKey },
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
  const headers = url.origin === base.origin ? { 'x-goog-api-key': options.apiKey } : undefined;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl || ((u: string, init?: RequestInit) =>
    pooledFetch(u, init || {}, { baseUrl, timeoutMs: options.timeoutMs }));
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

export async function generateFluxBanana(input: FluxBananaInput, options: FluxBananaOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl || ((url: string, init?: RequestInit) =>
    pooledFetch(url, init || {}, { baseUrl, timeoutMs: options.timeoutMs }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15 * 60_000);
  const model = input.model || selectFluxBananaModel(input.imageSize);
  let requestSent = false;

  try {
    const parts: GeminiPart[] = [{ text: input.prompt }];
    parts.push(...await Promise.all(
      input.images.slice(0, MAX_REFERENCE_IMAGES).map((source) => referencePart(source, controller.signal, fetchImpl)),
    ));
    requestSent = true;
    const requestInit: RequestInit = {
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
      signal: controller.signal,
    };
    // 优先走流式端点：出图期间持续有字节流动，避免 nginx 类网关 60s 空闲断连
    // （上游已完成并扣费、我们这侧 UND_ERR_SOCKET 的丢图问题）。个别聚合端
    // 不支持该端点时退回同步 generateContent。
    let response = await fetchImpl(
      `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      requestInit,
    );
    if (response.status === 404) {
      response = await fetchImpl(
        `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        requestInit,
      );
    }
    if (!response.ok) {
      const { payload: initialPayload, raw } = await parsePayload(response);
      const upstreamMessage = payloadError(initialPayload)
        || `Flux image provider returned HTTP ${response.status}: ${raw.slice(0, 240)}`;
      // gemini 400 多为提示词/参考图内容审核或参数被拒；这类错误换渠道重试无意义，
      // 标记为不 fallback，并交由 classifyPublicImageError 归入 sensitive_prompt 统一提示。
      const isModeration = response.status === 400
        && /upstream\s+error|content|safety|moderat|prohibit|block|policy|审核|敏感|违禁|违规|色情|暴力/i.test(upstreamMessage);
      throw providerError(
        isModeration ? `Content moderation rejected: ${upstreamMessage}` : upstreamMessage,
        !isModeration,
        response.status,
      );
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    let payload: GeminiPayload = {};
    let raw = '';
    let source = '';
    if (contentType.includes('text/event-stream')) {
      const streamed = await readSsePayloads(response);
      raw = streamed.raw;
      for (const chunk of streamed.payloads) {
        if (chunk.error) {
          const upstreamMessage = payloadError(chunk) || 'Flux stream returned an error';
          const isModeration = /upstream\s+error|content|safety|moderat|prohibit|block|policy|审核|敏感|违禁|违规|色情|暴力/i.test(upstreamMessage);
          throw providerError(
            isModeration ? `Content moderation rejected: ${upstreamMessage}` : upstreamMessage,
            !isModeration,
          );
        }
        if (!source) source = generatedImage(chunk);
        payload = chunk;
      }
    } else {
      const parsed = await parsePayload(response);
      payload = parsed.payload;
      raw = parsed.raw;
      source = generatedImage(payload);
    }
    if (source) {
      return { source: await materializeImage(source, options, controller.signal), model };
    }

    const initialStatus = taskStatus(payload);
    const initialTaskUrl = taskUrl(payload);
    if (!initialTaskUrl || (!initialStatus && !payload.task_id && !payload.id)) {
      throw providerError(`Flux image provider returned no image: ${raw.slice(0, 240)}`, false);
    }

    let pollUrl = resolveProviderUrl(options.baseUrl, initialTaskUrl);
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
        const response = await (options.fetchImpl || fetch)(pollUrl, {
          headers: { 'x-goog-api-key': options.apiKey },
          signal: controller.signal,
        });
        const parsed = await parsePayload(response);
        if (!response.ok) {
          consecutivePollErrors += 1;
          if (consecutivePollErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
            throw providerError(
              payloadError(parsed.payload) || `Flux task status returned HTTP ${response.status}: ${parsed.raw.slice(0, 240)}`,
              false,
              response.status,
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
      if (nextUrl) pollUrl = resolveProviderUrl(options.baseUrl, nextUrl);
      polls += 1;
    }

    const finalStatus = taskStatus(payload);
    if (isSuccessTask(finalStatus)) {
      const resultUrl = payload.result_url;
      if (resultUrl) {
        const resultPayload = await fetchTaskPayload(resolveProviderUrl(options.baseUrl, resultUrl), options, controller.signal);
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
