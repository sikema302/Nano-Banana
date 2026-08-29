import { MAX_REFERENCE_IMAGES } from '../src/lib/reference-image-limits.js';
import type { ImageGenerationInput } from './image-provider-router.js';

type SchatImageOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (milliseconds: number) => Promise<void>;
};

type SchatImagePayload = {
  data?: unknown;
  error?: { message?: string } | string;
  message?: string;
  detail?: string;
  status?: string;
  task_id?: string;
  id?: string;
  batch_id?: string;
  client_request_id?: string;
  request_id?: string;
  status_url?: string;
  poll_url?: string;
  result_url?: string;
  poll_after_ms?: number;
  execution_mode?: string;
  assets?: unknown;
  output?: unknown;
};

const ONE_K_SIZES: Record<string, string> = {
  '1:1': '1024x1024',
  '3:2': '1200x800',
  '16:9': '1280x720',
  '4:3': '1024x768',
  '9:16': '720x1280',
  '3:4': '768x1024',
  '2:3': '800x1200',
  '21:9': '1680x720',
};

const SCHAT_IMAGE_SIZES: Record<string, Record<string, string>> = {
  STANDARD: ONE_K_SIZES,
  '1K': ONE_K_SIZES,
  '2K': {
    '1:1': '2048x2048',
    '3:2': '2400x1600',
    '16:9': '2048x1152',
    '4:3': '2048x1536',
    '9:16': '1152x2048',
    '3:4': '1536x2048',
    '2:3': '1600x2400',
    '21:9': '2520x1080',
  },
  '4K': {
    '1:1': '4096x4096',
    '3:2': '3600x2400',
    '16:9': '4096x2304',
    '4:3': '4096x3072',
    '9:16': '2304x4096',
    '3:4': '3072x4096',
    '2:3': '2400x3600',
    '21:9': '5040x2160',
  },
};

export function schatImageSize(imageSize: string, ratio: string) {
  const sizeKey = SCHAT_IMAGE_SIZES[imageSize] ? imageSize : '1K';
  return SCHAT_IMAGE_SIZES[sizeKey][ratio] || SCHAT_IMAGE_SIZES[sizeKey]['1:1'];
}

function errorMessage(payload: SchatImagePayload, raw: string) {
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message || payload.message || payload.detail || raw.slice(0, 300);
}

function taggedError(message: string, safeToFallback: boolean, status?: number) {
  const error = new Error(message) as Error & { safeToFallback: boolean; status?: number };
  error.safeToFallback = safeToFallback;
  if (status !== undefined) error.status = status;
  return error;
}

const ACTIVE_TASK_STATUSES = new Set([
  'queued', 'dispatching', 'running', 'paused', 'in_progress', 'pending', 'processing',
  'submitted', 'created', 'active', 'waiting', 'started',
]);
const SUCCESS_TASK_STATUSES = new Set([
  'success', 'succeeded', 'successful', 'completed', 'complete', 'done', 'finished',
]);
const FAILED_TASK_STATUSES = new Set([
  'failed', 'failure', 'fail', 'canceled', 'cancelled', 'error', 'timed_out', 'timeout', 'expired',
]);
const MAX_TASK_POLLS = 600;

function toDataUrl(value: string, mimeType?: string) {
  return `data:${mimeType || 'image/png'};base64,${value.replace(/\s+/g, '')}`;
}

function imageSourceFromList(list: unknown): string {
  if (!Array.isArray(list)) return '';
  for (const item of list) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record.b64_json === 'string' && record.b64_json) return toDataUrl(record.b64_json);
    if (typeof record.data === 'string' && record.data) {
      const mimeType = typeof record.mime_type === 'string'
        ? record.mime_type
        : typeof record.mimeType === 'string' ? record.mimeType : undefined;
      return toDataUrl(record.data, mimeType);
    }
    if (typeof record.url === 'string' && record.url) return record.url;
    if (typeof record.download_url === 'string' && record.download_url) return record.download_url;
  }
  return '';
}

function extractGeneratedImage(payload: SchatImagePayload): string {
  if (Array.isArray(payload.data)) {
    const source = imageSourceFromList(payload.data);
    if (source) return source;
  } else if (payload.data && typeof payload.data === 'object') {
    const record = payload.data as Record<string, unknown>;
    const nested = imageSourceFromList(record.data);
    if (nested) return nested;
    const nestedAssets = imageSourceFromList(record.assets);
    if (nestedAssets) return nestedAssets;
  }
  const assetSource = imageSourceFromList(payload.assets);
  if (assetSource) return assetSource;
  if (Array.isArray(payload.output)) return imageSourceFromList(payload.output);
  if (payload.output && typeof payload.output === 'object') {
    const record = payload.output as Record<string, unknown>;
    return imageSourceFromList(record.data) || imageSourceFromList(record.assets);
  }
  return '';
}

function taskStatus(payload: SchatImagePayload) {
  if (typeof payload.status === 'string' && payload.status.trim()) return payload.status.trim().toLowerCase();
  if (payload.data && typeof payload.data === 'object') {
    const nested = (payload.data as Record<string, unknown>).status;
    if (typeof nested === 'string' && nested.trim()) return nested.trim().toLowerCase();
  }
  return '';
}

function taskUrlFrom(payload: SchatImagePayload) {
  return (payload.status_url || payload.poll_url || payload.result_url || '').trim();
}

function isActiveTask(status: string) {
  return ACTIVE_TASK_STATUSES.has(status);
}

function isSuccessTask(status: string) {
  return SUCCESS_TASK_STATUSES.has(status);
}

function isFailedTask(status: string) {
  return FAILED_TASK_STATUSES.has(status);
}

function isTerminalTask(status: string) {
  return isSuccessTask(status) || isFailedTask(status);
}

function taskIdFrom(payload: SchatImagePayload) {
  for (const key of ['task_id', 'id', 'batch_id', 'client_request_id', 'request_id'] as const) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (payload.data && typeof payload.data === 'object') {
    const record = payload.data as Record<string, unknown>;
    for (const key of ['task_id', 'id', 'request_id']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return '';
}

function isAsyncTaskResponse(payload: SchatImagePayload) {
  if (payload.execution_mode === 'async') return true;
  if (taskUrlFrom(payload)) return true;
  if (typeof payload.task_id === 'string' && payload.task_id.trim()) return true;
  if (typeof payload.status === 'string' && payload.status.trim()) return true;
  if (Array.isArray(payload.assets)) return true;
  if (Array.isArray(payload.data)) return false;
  if (payload.data && typeof payload.data === 'object') {
    const record = payload.data as Record<string, unknown>;
    if (typeof record.task_id === 'string' && record.task_id.trim()) return true;
    if (typeof record.status === 'string' && record.status.trim()) return true;
  }
  return false;
}

function resolvePollUrl(baseUrl: string, payload: SchatImagePayload, taskId: string) {
  const given = taskUrlFrom(payload);
  if (given) {
    if (/^https?:\/\//i.test(given)) return given;
    try {
      const resolved = new URL(given, `${baseUrl}/`).toString();
      if (/^https?:\/\//i.test(resolved)) return resolved;
    } catch {
      // An unresolvable task URL falls through to the task-id convention below.
    }
  }
  if (taskId) return `${baseUrl}/v1/images/tasks/${encodeURIComponent(taskId)}`;
  return '';
}

function dataUrlBlob(value: string) {
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  const bytes = match[2]
    ? Buffer.from(match[3].replace(/\s+/g, ''), 'base64')
    : Buffer.from(decodeURIComponent(match[3]));
  return new Blob([bytes], { type: match[1] || 'image/png' });
}

async function referenceBlob(value: string, signal: AbortSignal, fetchImpl: typeof fetch) {
  const inline = dataUrlBlob(value);
  if (inline) return inline;
  const response = await fetchImpl(value, { signal });
  if (!response.ok) throw taggedError(`Reference image returned HTTP ${response.status}`, true, response.status);
  return response.blob();
}

export async function generateSchatImage(
  input: Pick<ImageGenerationInput, 'prompt' | 'ratio' | 'imageSize' | 'images'>,
  options: SchatImageOptions,
) {
  if (!options.baseUrl.trim() || !options.apiKey.trim() || !options.model.trim()) {
    throw taggedError('Schat image channel is not configured', true);
  }

  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, options.timeoutMs ?? 900_000));
  let requestSent = false;
  const sleepImpl = options.sleepImpl || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  try {
    const baseUrl = options.baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.apiKey.trim().replace(/^Bearer\s+/i, '')}`,
    };
    const size = schatImageSize(input.imageSize, input.ratio);
    let endpoint = '/v1/images/generations';
    let body: BodyInit;

    if (input.images.length > 0) {
      endpoint = '/v1/images/edits';
      const form = new FormData();
      form.set('model', options.model.trim());
      form.set('prompt', input.prompt);
      form.set('size', size);
      const blobs = await Promise.all(
        input.images.slice(0, MAX_REFERENCE_IMAGES).map((image) => referenceBlob(image, controller.signal, fetchImpl)),
      );
      const field = blobs.length > 1 ? 'image[]' : 'image';
      blobs.forEach((blob, index) => form.append(field, blob, `reference-${index + 1}.png`));
      body = form;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ model: options.model.trim(), prompt: input.prompt, size });
    }

    requestSent = true;
    const response = await fetchImpl(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload: SchatImagePayload = {};
    try {
      payload = raw ? JSON.parse(raw) as SchatImagePayload : {};
    } catch {
      // A malformed completed response is an explicit upstream failure.
    }
    if (!response.ok) {
      throw taggedError(
        errorMessage(payload, raw) || `Schat image provider returned HTTP ${response.status}`,
        true,
        response.status,
      );
    }
    const immediate = extractGeneratedImage(payload);
    if (immediate) return immediate;

    if (!isAsyncTaskResponse(payload)) {
      throw taggedError(`Schat image provider returned no image: ${raw.slice(0, 300)}`, true, response.status);
    }

    const taskId = taskIdFrom(payload);
    let pollUrl = resolvePollUrl(baseUrl, payload, taskId);
    if (!pollUrl) {
      throw taggedError(`Schat image provider returned no task reference: ${raw.slice(0, 300)}`, false, response.status);
    }

    let current = payload;
    let polls = 0;
    while (pollUrl && (isActiveTask(taskStatus(current)) || !taskStatus(current))) {
      if (polls >= MAX_TASK_POLLS) {
        throw taggedError(`Schat image task polling exceeded ${MAX_TASK_POLLS} polls`, false);
      }
      const delay = Math.min(10_000, Math.max(250, Number(current.poll_after_ms) || 2_000));
      await sleepImpl(delay);
      const pollResponse = await fetchImpl(pollUrl, {
        headers,
        signal: controller.signal,
      });
      const pollRaw = await pollResponse.text();
      let pollPayload: SchatImagePayload = {};
      try {
        pollPayload = pollRaw ? JSON.parse(pollRaw) as SchatImagePayload : {};
      } catch {
        // A malformed task status response is surfaced by the poll check below.
      }
      if (!pollResponse.ok) {
        throw taggedError(
          errorMessage(pollPayload, pollRaw) || `Schat image task status returned HTTP ${pollResponse.status}`,
          false,
          pollResponse.status,
        );
      }
      current = pollPayload;
      const pollImage = extractGeneratedImage(current);
      if (pollImage) return pollImage;
      const nextUrl = taskUrlFrom(current);
      if (nextUrl) pollUrl = resolvePollUrl(baseUrl, current, taskId);
      polls += 1;
    }

    const finalStatus = taskStatus(current);
    const finalImage = extractGeneratedImage(current);
    if (finalImage) return finalImage;
    if (isFailedTask(finalStatus)) {
      throw taggedError(errorMessage(current, '') || `Schat image task ${finalStatus}`, true);
    }
    if (isSuccessTask(finalStatus)) {
      throw taggedError('Schat image task completed without an image', false);
    }
    throw taggedError(`Schat image task result is uncertain (${finalStatus || 'unknown'})`, false);
  } catch (error) {
    if (error && typeof error === 'object' && !('safeToFallback' in error)) {
      (error as { safeToFallback: boolean }).safeToFallback = !requestSent;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
