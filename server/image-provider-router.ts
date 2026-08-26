import { MAX_REFERENCE_IMAGES } from '../src/lib/reference-image-limits.js';

export type ImageGenerationInput = {
  prompt: string;
  modelId: string;
  ratio: string;
  imageSize: string;
  quality: string;
  optimizeChineseText: boolean;
  images: string[];
  providerRouting?: 'junliai_only' | 'junliai_dedicated';
  upstreamModelOverride?: string;
  traceId?: string;
  requestContext?: {
    userId: string;
    username: string;
    creditsUsed: number;
    successfulRequestId?: string;
  };
};

export type PrimaryCircuitState = {
  consecutiveFailures: number;
  openUntil: number;
  reason: string;
  updatedAt: string;
};

export const NANO_BANANA_1K_UNAVAILABLE_MESSAGE =
  'Nano Banana 1K 服务暂时不可用，请尝试选择 2K 后重新生成。';

type StateStore = {
  get: (upstreamModel?: string) => Promise<PrimaryCircuitState | null>;
  set: (state: PrimaryCircuitState, upstreamModel?: string) => Promise<void>;
};

type PrimaryModelCapability = {
  imageSizes?: string[];
  ratios?: string[];
  maxImages?: number;
};

type RouterOptions = {
  baseUrl: string;
  authorization: string;
  primaryModel: string;
  primaryModels?: Record<string, string>;
  primaryModelChains?: Record<string, string[]>;
  primaryModelCapabilities?: Record<string, PrimaryModelCapability>;
  isPrimaryEnabled?: (input: ImageGenerationInput) => boolean | Promise<boolean>;
  isPrimaryModelEnabled?: (
    input: ImageGenerationInput,
    upstreamModel: string,
  ) => boolean | Promise<boolean>;
  timeoutMs: number;
  failureThreshold: number;
  transientCooldownMs: number;
  quotaCooldownMs: number;
  authCooldownMs: number;
  store: StateStore;
  fallback: (input: ImageGenerationInput) => Promise<string>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  onAttempt?: (attempt: {
    traceId: string;
    modelId: string;
    provider: string;
    configuration: string;
    durationMs: number;
    success: boolean;
    failureReason?: string;
    errorMessage?: string;
    sourceModel: string;
    prompt: string;
    requestContext?: ImageGenerationInput['requestContext'];
  }) => void | Promise<void>;
};

type ImageApiPayload = {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string; type?: string; code?: string } | string;
  message?: string;
  detail?: string;
};

const CLOSED_STATE: PrimaryCircuitState = {
  consecutiveFailures: 0,
  openUntil: 0,
  reason: '',
  updatedAt: '',
};

function normalizeAuthorization(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^Bearer\s+/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`;
}

export function extractGeneratedImageSource(payload: ImageApiPayload) {
  const result = payload.data?.[0];
  if (result?.url) return result.url;
  if (result?.b64_json) return `data:image/png;base64,${result.b64_json.replace(/\s+/g, '')}`;
  return '';
}

const ONE_K_IMAGE_SIZES = {
  '1:1': '1024x1024', '16:9': '1280x720', '9:16': '720x1280',
  '4:3': '1024x768', '3:4': '768x1024', '3:2': '1200x800',
  '2:3': '800x1200', '21:9': '1680x720',
};

const IMAGE_SIZES: Record<string, Record<string, string>> = {
  STANDARD: ONE_K_IMAGE_SIZES,
  '1K': ONE_K_IMAGE_SIZES,
  '2K': {
    '1:1': '2048x2048', '16:9': '2048x1152', '9:16': '1152x2048',
    '4:3': '2048x1536', '3:4': '1536x2048', '3:2': '2400x1600',
    '2:3': '1600x2400', '21:9': '2520x1080',
  },
  '4K': {
    '1:1': '4096x4096', '16:9': '4096x2304', '9:16': '2304x4096',
    '4:3': '4096x3072', '3:4': '3072x4096', '3:2': '3600x2400',
    '2:3': '2400x3600', '21:9': '5040x2160',
  },
};

const FIREFLY_GPT_IMAGE_2_SIZES: Record<string, Record<string, string>> = {
  '1K': {
    '1:1': '1024x1024', '5:4': '1120x896', '4:3': '1152x864',
    '3:2': '1248x832', '16:9': '1280x720', '21:9': '1456x624',
    '4:5': '896x1120', '3:4': '864x1152', '2:3': '832x1248',
    '9:16': '720x1280',
  },
  '2K': {
    '1:1': '2048x2048', '5:4': '2240x1792', '4:3': '2304x1728',
    '3:2': '2496x1664', '16:9': '2560x1440', '21:9': '3024x1296',
    '4:5': '1792x2240', '3:4': '1728x2304', '2:3': '1664x2496',
    '9:16': '1440x2560',
  },
  '4K': {
    '1:1': '2880x2880', '5:4': '3200x2560', '4:3': '3264x2448',
    '3:2': '3504x2336', '16:9': '3840x2160', '21:9': '3696x1584',
    '4:5': '2560x3200', '3:4': '2448x3264', '2:3': '2336x3504',
    '9:16': '2160x3840',
  },
};

function requestSize(input: ImageGenerationInput, upstreamModel: string) {
  const sizeKey = ['1K', '2K', '4K'].includes(input.imageSize) ? input.imageSize : 'STANDARD';
  const ratio = input.ratio === 'auto' ? '1:1' : input.ratio;
  if (/^\d+x\d+$/i.test(ratio)) return ratio;
  if (upstreamModel === 'firefly-gpt-image-2') {
    const fireflySizeKey = sizeKey === 'STANDARD' ? '1K' : sizeKey;
    return FIREFLY_GPT_IMAGE_2_SIZES[fireflySizeKey][ratio]
      || FIREFLY_GPT_IMAGE_2_SIZES[fireflySizeKey]['1:1'];
  }
  return IMAGE_SIZES[sizeKey][ratio] || IMAGE_SIZES[sizeKey]['1:1'];
}

function payloadError(payload: ImageApiPayload) {
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message || payload.message || payload.detail || '';
}

async function imageBlob(source: string, signal: AbortSignal, fetchImpl: typeof fetch) {
  if (source.startsWith('data:')) {
    const match = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) throw new Error('Invalid reference image data URL');
    const bytes = match[2]
      ? Buffer.from(match[3].replace(/\s+/g, ''), 'base64')
      : Buffer.from(decodeURIComponent(match[3]));
    return new Blob([bytes], { type: match[1] || 'image/png' });
  }
  const response = await fetchImpl(source, { signal });
  if (!response.ok) throw new Error(`Unable to load reference image (${response.status})`);
  return response.blob();
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown primary provider error');
}

function classifyFailure(error: unknown) {
  const message = errorText(error).toLowerCase();
  const status = Number((error as { status?: unknown })?.status || 0);
  const safeToFallback = Boolean((error as { safeToFallback?: unknown })?.safeToFallback) || status >= 400;
  if (
    status === 401 ||
    status === 403 ||
    /unauthorized|forbidden|invalid token|token expired|authentication/.test(message)
  ) {
    return { kind: 'auth', immediate: true, safeToFallback };
  }
  if (
    status === 402 ||
    status === 429 ||
    /quota|insufficient|credit|balance|rate.?limit|too many requests|usage limit|额度|余额|限额/.test(message)
  ) {
    return { kind: 'quota', immediate: true, safeToFallback };
  }
  return { kind: 'transient', immediate: false, safeToFallback };
}

export function createImageProviderRouter(options: RouterOptions) {
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now;
  const logger = options.logger || console;
  const cachedStates = new Map<string, PrimaryCircuitState>();

  // 提取 fetch 层失败的真实底层原因（如 undici 的 ECONNRESET / UND_ERR_CONNECT_TIMEOUT）。
  // undici 的网络失败统一 message 是 "fetch failed"，真正的 code/message 在 error.cause 里。
  function errorCauseText(error: unknown): string {
    const cause = error && typeof error === 'object' ? (error as { cause?: unknown }).cause : undefined;
    if (cause == null) return '';
    if (cause instanceof Error) {
      const code = (cause as { code?: string }).code;
      return code ? `${code}: ${cause.message}` : cause.message;
    }
    if (typeof cause === 'object') {
      const record = cause as Partial<Record<'code' | 'message', string>>;
      if (record.code || record.message) return `${record.code || ''} ${record.message || ''}`.trim();
      try {
        return JSON.stringify(cause);
      } catch {
        return String(cause);
      }
    }
    return String(cause);
  }

  function configuration(input: ImageGenerationInput) {
    return `${input.imageSize || 'STANDARD'} / ${input.quality || 'default'} / ${input.ratio || '1:1'}`;
  }

  async function reportAttempt(
    traceId: string,
    input: ImageGenerationInput,
    provider: string,
    startedAt: number,
    success: boolean,
    failureReason = '',
    errorMessage = '',
    sourceModel = input.modelId,
  ) {
    try {
      await options.onAttempt?.({
        traceId,
        modelId: input.modelId,
        provider,
        configuration: configuration(input),
        durationMs: Math.max(0, now() - startedAt),
        success,
        failureReason: failureReason || undefined,
        errorMessage: errorMessage || undefined,
        sourceModel,
        prompt: input.prompt,
        requestContext: input.requestContext,
      });
    } catch (error) {
      logger.warn('[image-provider] failed to record provider metrics:', errorText(error));
    }
  }

  async function callFallback(input: ImageGenerationInput, traceId: string) {
    const startedAt = now();
    try {
      const result = await options.fallback(input);
      await reportAttempt(traceId, input, 'Visionary', startedAt, true);
      return result;
    } catch (error) {
      await reportAttempt(traceId, input, 'Visionary', startedAt, false, 'explicit_failure', errorText(error));
      throw error;
    }
  }

  async function readState(upstreamModel: string) {
    const cachedState = cachedStates.get(upstreamModel);
    if (cachedState) return cachedState;
    const state = (await options.store.get(upstreamModel).catch(() => null)) || { ...CLOSED_STATE };
    cachedStates.set(upstreamModel, state);
    return state;
  }

  async function writeState(upstreamModel: string, state: PrimaryCircuitState) {
    cachedStates.set(upstreamModel, state);
    await options.store.set(state, upstreamModel).catch((error) => {
      logger.warn('[image-provider] failed to persist circuit state:', errorText(error));
    });
  }

  async function callPrimary(input: ImageGenerationInput, upstreamModel: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    let requestSent = false;
    let requestUrl = '';
    let httpStatus = 0;
    let responseBody = '';
    try {
      const baseUrl = options.baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '');
      const headers: Record<string, string> = {
        Authorization: normalizeAuthorization(options.authorization),
      };
      let body: BodyInit;
      let endpoint = '/v1/images/generations';
      if (input.images.length) {
        endpoint = '/v1/images/edits';
        const form = new FormData();
        form.set('model', upstreamModel);
        form.set('prompt', input.prompt);
        form.set('size', requestSize(input, upstreamModel));
        form.set('response_format', 'url');
        const blobs = await Promise.all(
          input.images.slice(0, MAX_REFERENCE_IMAGES).map((source) => imageBlob(source, controller.signal, fetchImpl)),
        );
        const imageField = blobs.length > 1 ? 'image[]' : 'image';
        blobs.forEach((blob, index) => form.append(imageField, blob, `reference-${index + 1}.png`));
        body = form;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({
          model: upstreamModel,
          prompt: input.prompt,
          size: requestSize(input, upstreamModel),
          response_format: 'url',
        });
      }
      requestUrl = `${baseUrl}${endpoint}`;
      requestSent = true;
      const response = await fetchImpl(requestUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      httpStatus = response.status;
      const raw = await response.text();
      responseBody = raw.slice(0, 600);
      let payload: ImageApiPayload = {};
      try {
        payload = raw ? JSON.parse(raw) as ImageApiPayload : {};
      } catch {
        // The status and a short response excerpt are sufficient for failover classification.
      }
      if (!response.ok) {
        const error = new Error(
          payloadError(payload) || `Primary image provider returned HTTP ${response.status}: ${raw.slice(0, 300)}`,
        ) as Error & { status: number; safeToFallback: boolean };
        error.status = response.status;
        error.safeToFallback = true;
        throw error;
      }
      const imageSource = extractGeneratedImageSource(payload);
      if (!imageSource) {
        const error = new Error(`Primary image provider returned no image: ${raw.slice(0, 300)}`) as Error & {
          safeToFallback: boolean;
        };
        error.safeToFallback = true;
        throw error;
      }
      return imageSource;
    } catch (error) {
      if (!requestSent && error && typeof error === 'object') {
        (error as { safeToFallback?: boolean }).safeToFallback = true;
      }
      logger.error(
        `[image-provider] FAILED traceId=${input.traceId || ''} model=${input.modelId} upstream=${upstreamModel} ` +
        `size=${requestSize(input, upstreamModel)} ratio=${input.ratio} imageSize=${input.imageSize} ` +
        `images=${input.images.length} prompt="${input.prompt.slice(0, 200)}" ` +
        `url=${requestUrl || '(not sent)'} http=${httpStatus} body=${responseBody || ''} ` +
        `cause=${errorCauseText(error)} err=${errorText(error)}`,
      );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function primaryCandidates(input: ImageGenerationInput) {
    const configured = input.upstreamModelOverride
      ? [input.upstreamModelOverride]
      : options.primaryModelChains?.[input.modelId]
      || [options.primaryModels?.[input.modelId] || options.primaryModel];
    return [...new Set(configured.map((item) => item.trim()).filter(Boolean))].filter((upstreamModel) => {
      const capability = options.primaryModelCapabilities?.[upstreamModel];
      if (!capability) return true;
      const imageSize = ['1K', '2K', '4K'].includes(input.imageSize) ? input.imageSize : 'STANDARD';
      const ratio = input.ratio || '1:1';
      return (!capability.imageSizes || capability.imageSizes.includes(imageSize))
        && (!capability.ratios || capability.ratios.includes(ratio))
        && (capability.maxImages === undefined || input.images.length <= capability.maxImages);
    });
  }

  async function generate(input: ImageGenerationInput) {
    const traceId = input.traceId || crypto.randomUUID();
    const dedicatedJunliai = input.providerRouting === 'junliai_dedicated';
    const junliaiOnly = input.providerRouting === 'junliai_only' || dedicatedJunliai;
    const primaryConfigured = Boolean(options.baseUrl.trim() && options.authorization.trim());
    const primaryEnabled = dedicatedJunliai || (options.isPrimaryEnabled ? await options.isPrimaryEnabled(input) : true);
    const candidates = primaryCandidates(input);
    const primaryEligible =
      primaryConfigured &&
      primaryEnabled &&
      (input.modelId === 'gpt-image-2' || input.modelId === 'Nano_Banana_Pro' || input.modelId === 'Grok_Image') &&
      candidates.length > 0;
    if (!primaryEligible) {
      if (junliaiOnly) {
        const unavailableError = new Error(
          'Junliai-only route is unavailable; provider switching is disabled for this API key',
        ) as Error & { safeToFallback: boolean };
        unavailableError.safeToFallback = true;
        throw unavailableError;
      }
      return callFallback(input, traceId);
    }

    const currentTime = now();
    for (const upstreamModel of candidates) {
      const modelEnabled = dedicatedJunliai || (options.isPrimaryModelEnabled
        ? await options.isPrimaryModelEnabled(input, upstreamModel)
        : true);
      if (!modelEnabled) continue;
      const state = await readState(upstreamModel);
      // Managed single-channel calls are ordered and cooled down by the outer
      // route. Do not let this legacy model-wide circuit disturb that order.
      if (!junliaiOnly && state.openUntil > currentTime) continue;

      const primaryStartedAt = now();
      try {
        const result = await callPrimary(input, upstreamModel);
        await reportAttempt(traceId, input, `Junliai · ${upstreamModel}`, primaryStartedAt, true, '', '', upstreamModel);
        if (state.consecutiveFailures || state.openUntil) {
          await writeState(upstreamModel, {
            ...CLOSED_STATE,
            updatedAt: new Date(currentTime).toISOString(),
          });
          logger.info(`[image-provider] ${upstreamModel} recovered; circuit closed`);
        }
        return result;
      } catch (error) {
        const failure = classifyFailure(error);
        await reportAttempt(
          traceId,
          input,
          `Junliai · ${upstreamModel}`,
          primaryStartedAt,
          false,
          failure.safeToFallback ? failure.kind : 'uncertain',
          errorText(error),
          upstreamModel,
        );
        if (!failure.safeToFallback) {
          await writeState(upstreamModel, {
            consecutiveFailures: 0,
            openUntil: 0,
            reason: 'uncertain',
            updatedAt: new Date(currentTime).toISOString(),
          });
          logger.warn(`[image-provider] ${upstreamModel} result is uncertain; failover suppressed`);
          const uncertainError = new Error(
            '上游生成结果暂时无法确认，为避免重复扣费，本次不会自动切换接口；本次积分将自动退回，请稍后重试。',
          ) as Error & { safeToFallback: boolean };
          uncertainError.safeToFallback = false;
          throw uncertainError;
        }
        if (junliaiOnly) {
          logger.warn(`[image-provider] ${upstreamModel} failed (${failure.kind}); provider switching disabled`);
          const routeError = new Error(
            errorText(error) || 'Managed image channel failed',
          ) as Error & { safeToFallback: boolean; status?: number };
          routeError.safeToFallback = true;
          const status = Number((error as { status?: unknown } | null)?.status);
          if (Number.isFinite(status)) routeError.status = status;
          throw routeError;
        }
        const consecutiveFailures = state.consecutiveFailures + 1;
        const shouldOpen = failure.immediate || consecutiveFailures >= options.failureThreshold;
        const cooldownMs =
          failure.kind === 'auth'
            ? options.authCooldownMs
            : failure.kind === 'quota'
              ? options.quotaCooldownMs
              : options.transientCooldownMs;
        await writeState(upstreamModel, {
          consecutiveFailures,
          openUntil: shouldOpen ? currentTime + cooldownMs : 0,
          reason: failure.kind,
          updatedAt: new Date(currentTime).toISOString(),
        });
        logger.warn(
          `[image-provider] ${upstreamModel} failed (${failure.kind}); trying next provider${shouldOpen ? ` after ${Math.ceil(cooldownMs / 1000)}s cooldown` : ''}`,
        );
      }
    }
    if (junliaiOnly) {
      const unavailableError = new Error(
        'Junliai-only route is unavailable; provider switching is disabled for this API key',
      ) as Error & { safeToFallback: boolean };
      unavailableError.safeToFallback = true;
      throw unavailableError;
    }
    return callFallback(input, traceId);
  }

  async function resetCircuit() {
    const models = [...new Set([
      options.primaryModel,
      ...Object.values(options.primaryModels || {}),
      ...Object.values(options.primaryModelChains || {}).flat(),
    ].filter(Boolean))];
    await Promise.all(models.map((upstreamModel) => writeState(upstreamModel, {
      ...CLOSED_STATE,
      updatedAt: new Date(now()).toISOString(),
    })));
  }

  return { generate, resetCircuit };
}
