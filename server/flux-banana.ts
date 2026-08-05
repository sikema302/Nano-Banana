export type FluxBananaInput = {
  prompt: string;
  ratio: string;
  imageSize: string;
  images: string[];
};

type FluxBananaOptions = {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  random?: () => number;
};

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

type GeminiPayload = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { message?: string } | string;
  message?: string;
};

export const FLUX_BANANA_FLASH_MODEL = 'gemini-3.1-flash-image-preview';
export const FLUX_BANANA_PRO_MODEL = 'gemini-3-pro-image-preview';

function providerError(message: string, safeToFallback: boolean, status?: number) {
  const error = new Error(message) as Error & { safeToFallback: boolean; status?: number };
  error.safeToFallback = safeToFallback;
  if (status) error.status = status;
  return error;
}

function payloadError(payload: GeminiPayload) {
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message || payload.message || '';
}

function normalizeImageSize(value: string) {
  return ['1K', '2K', '4K'].includes(value) ? value : '1K';
}

export function selectFluxBananaModel(imageSize: string, random: () => number = Math.random) {
  const normalized = normalizeImageSize(imageSize);
  if (normalized === '4K') return FLUX_BANANA_PRO_MODEL;
  if (normalized === '2K') {
    return random() < 0.5 ? FLUX_BANANA_PRO_MODEL : FLUX_BANANA_FLASH_MODEL;
  }
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
  return '';
}

export async function generateFluxBanana(input: FluxBananaInput, options: FluxBananaOptions) {
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15 * 60_000);
  const model = selectFluxBananaModel(input.imageSize, options.random);
  let requestSent = false;

  try {
    const parts: GeminiPart[] = [{ text: input.prompt }];
    parts.push(...await Promise.all(
      input.images.slice(0, 9).map((source) => referencePart(source, controller.signal, fetchImpl)),
    ));
    requestSent = true;
    const baseUrl = options.baseUrl.replace(/\/+$/, '');
    const response = await fetchImpl(
      `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
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
        signal: controller.signal,
      },
    );
    const raw = await response.text();
    let payload: GeminiPayload = {};
    try {
      payload = raw ? JSON.parse(raw) as GeminiPayload : {};
    } catch {
      // HTTP status and a short excerpt are sufficient for internal diagnostics.
    }
    if (!response.ok) {
      throw providerError(
        payloadError(payload) || `Flux image provider returned HTTP ${response.status}: ${raw.slice(0, 240)}`,
        true,
        response.status,
      );
    }
    const source = generatedImage(payload);
    if (!source) {
      throw providerError(`Flux image provider returned no image: ${raw.slice(0, 240)}`, true);
    }
    return { source, model };
  } catch (error) {
    if (error && typeof error === 'object' && !('safeToFallback' in error)) {
      (error as { safeToFallback?: boolean }).safeToFallback = !requestSent;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
