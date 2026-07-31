export type ImageGenerationInput = {
  prompt: string;
  modelId: string;
  ratio: string;
  imageSize: string;
  quality: string;
  optimizeChineseText: boolean;
  images: string[];
  requestContext?: {
    userId: string;
    username: string;
  };
};

export type PrimaryCircuitState = {
  consecutiveFailures: number;
  openUntil: number;
  reason: string;
  updatedAt: string;
};

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
  logger?: Pick<Console, 'info' | 'warn'>;
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

function requestSize(input: ImageGenerationInput) {
  const sizeKey = ['1K', '2K', '4K'].includes(input.imageSize) ? input.imageSize : 'STANDARD';
  const ratio = input.ratio === 'auto' ? '1:1' : input.ratio;
  return IMAGE_SIZES[sizeKey][ratio]
    || (/^\d+x\d+$/i.test(ratio) ? ratio : IMAGE_SIZES[sizeKey]['1:1']);
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
    try {
      const baseUrl = options.baseUrl.replace(/\/+$/, '');
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
        form.set('size', requestSize(input));
        form.set('response_format', 'b64_json');
        const blobs = await Promise.all(
          input.images.slice(0, 9).map((source) => imageBlob(source, controller.signal, fetchImpl)),
        );
        blobs.forEach((blob, index) => form.append('image', blob, `reference-${index + 1}.png`));
        body = form;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({
          model: upstreamModel,
          prompt: input.prompt,
          size: requestSize(input),
          response_format: 'b64_json',
        });
      }
      requestSent = true;
      const response = await fetchImpl(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      const raw = await response.text();
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
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function primaryCandidates(input: ImageGenerationInput) {
    const configured = options.primaryModelChains?.[input.modelId]
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
    const traceId = crypto.randomUUID();
    const primaryConfigured = Boolean(options.baseUrl.trim() && options.authorization.trim());
    const primaryEnabled = options.isPrimaryEnabled ? await options.isPrimaryEnabled(input) : true;
    const candidates = primaryCandidates(input);
    const primaryEligible =
      primaryConfigured &&
      primaryEnabled &&
      (input.modelId === 'gpt-image-2' || input.modelId === 'Nano_Banana_Pro') &&
      candidates.length > 0;
    if (!primaryEligible) return callFallback(input, traceId);

    const currentTime = now();
    for (const upstreamModel of candidates) {
      const modelEnabled = options.isPrimaryModelEnabled
        ? await options.isPrimaryModelEnabled(input, upstreamModel)
        : true;
      if (!modelEnabled) continue;
      const state = await readState(upstreamModel);
      if (state.openUntil > currentTime) continue;

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
          throw new Error(
            '上游生成结果暂时无法确认，为避免重复扣费，本次不会自动切换接口；本次积分将自动退回，请稍后重试。',
          );
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
          `[image-provider] ${upstreamModel} failed (${failure.kind}); trying next provider${shouldOpen ? ` after ${Math.ceil(cooldownMs / 60000)}m cooldown` : ''}`,
        );
      }
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
