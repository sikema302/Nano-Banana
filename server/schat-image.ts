import { MAX_REFERENCE_IMAGES } from '../src/lib/reference-image-limits.js';
import type { ImageGenerationInput } from './image-provider-router.js';

type SchatImageOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type SchatImagePayload = {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string } | string;
  message?: string;
  detail?: string;
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
    const result = payload.data?.[0];
    if (result?.b64_json) return `data:image/png;base64,${result.b64_json.replace(/\s+/g, '')}`;
    if (result?.url) return result.url;
    throw taggedError(`Schat image provider returned no image: ${raw.slice(0, 300)}`, true, response.status);
  } catch (error) {
    if (error && typeof error === 'object' && !('safeToFallback' in error)) {
      (error as { safeToFallback: boolean }).safeToFallback = !requestSent;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
