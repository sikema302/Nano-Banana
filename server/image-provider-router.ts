export type ImageGenerationInput = {
  prompt: string;
  modelId: string;
  ratio: string;
  imageSize: string;
  quality: string;
  optimizeChineseText: boolean;
  images: string[];
};

export type PrimaryCircuitState = {
  consecutiveFailures: number;
  openUntil: number;
  reason: string;
  updatedAt: string;
};

type StateStore = {
  get: () => Promise<PrimaryCircuitState | null>;
  set: (state: PrimaryCircuitState) => Promise<void>;
};

type RouterOptions = {
  baseUrl: string;
  authorization: string;
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
};

type ChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string; type?: string; code?: string };
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

function contentText(payload: ChatCompletionPayload) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((item) => item.text || '').join('\n');
  return '';
}

export function extractGeneratedImageSource(payload: ChatCompletionPayload) {
  const text = contentText(payload).trim();
  if (!text) return '';
  const markdown = text.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+|data:image\/[^)]+)\)/i);
  if (markdown?.[1]) return markdown[1];
  const dataUrl = text.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+/i);
  if (dataUrl?.[0]) return dataUrl[0].replace(/\s+/g, '');
  const url = text.match(/https?:\/\/[^\s<>"')\]]+/i);
  return url?.[0] || '';
}

function requestPrompt(input: ImageGenerationInput) {
  const details = [
    `Aspect ratio: ${input.ratio || '1:1'}.`,
    `Resolution: ${input.imageSize || 'STANDARD'}.`,
    input.quality ? `Quality: ${input.quality}.` : '',
    input.optimizeChineseText ? 'Optimize the rendering of Chinese text.' : '',
    'Generate exactly one image and return the resulting image.',
  ].filter(Boolean);
  return `${input.prompt}\n\n${details.join(' ')}`;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown primary provider error');
}

function classifyFailure(error: unknown) {
  const message = errorText(error).toLowerCase();
  const status = Number((error as { status?: unknown })?.status || 0);
  if (
    status === 401 ||
    status === 403 ||
    /unauthorized|forbidden|invalid token|token expired|authentication/.test(message)
  ) {
    return { kind: 'auth', immediate: true };
  }
  if (
    status === 429 ||
    /quota|insufficient|credit|rate.?limit|too many requests|usage limit|额度|限额/.test(message)
  ) {
    return { kind: 'quota', immediate: true };
  }
  return { kind: 'transient', immediate: false };
}

export function createImageProviderRouter(options: RouterOptions) {
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now;
  const logger = options.logger || console;
  let probeInFlight = false;
  let cachedState: PrimaryCircuitState | null = null;

  async function readState() {
    if (cachedState) return cachedState;
    cachedState = (await options.store.get().catch(() => null)) || { ...CLOSED_STATE };
    return cachedState;
  }

  async function writeState(state: PrimaryCircuitState) {
    cachedState = state;
    await options.store.set(state).catch((error) => {
      logger.warn('[image-provider] failed to persist circuit state:', errorText(error));
    });
  }

  async function callPrimary(input: ImageGenerationInput) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const content: Array<Record<string, unknown>> = [{ type: 'text', text: requestPrompt(input) }];
      for (const image of input.images.slice(0, 9)) {
        content.push({ type: 'image_url', image_url: { url: image } });
      }
      const response = await fetchImpl(`${options.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: normalizeAuthorization(options.authorization),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          messages: [{ role: 'user', content }],
          stream: false,
        }),
        signal: controller.signal,
      });
      const raw = await response.text();
      let payload: ChatCompletionPayload = {};
      try {
        payload = raw ? JSON.parse(raw) as ChatCompletionPayload : {};
      } catch {
        // The status and a short response excerpt are sufficient for failover classification.
      }
      if (!response.ok) {
        const error = new Error(
          payload.error?.message || `Primary image provider returned HTTP ${response.status}: ${raw.slice(0, 300)}`,
        ) as Error & { status: number };
        error.status = response.status;
        throw error;
      }
      const imageSource = extractGeneratedImageSource(payload);
      if (!imageSource) {
        throw new Error(`Primary image provider returned no image: ${contentText(payload).slice(0, 300)}`);
      }
      return imageSource;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function generate(input: ImageGenerationInput) {
    const primaryConfigured = Boolean(options.baseUrl.trim() && options.authorization.trim());
    const primaryEligible = primaryConfigured && input.modelId === 'gpt-image-2';
    if (!primaryEligible) return options.fallback(input);

    const state = await readState();
    const currentTime = now();
    if (state.openUntil > currentTime || probeInFlight) {
      return options.fallback(input);
    }

    probeInFlight = true;
    try {
      const result = await callPrimary(input);
      if (state.consecutiveFailures || state.openUntil) {
        await writeState({ ...CLOSED_STATE, updatedAt: new Date(currentTime).toISOString() });
        logger.info('[image-provider] primary provider recovered; circuit closed');
      }
      return result;
    } catch (error) {
      const failure = classifyFailure(error);
      const consecutiveFailures = state.consecutiveFailures + 1;
      const shouldOpen = failure.immediate || consecutiveFailures >= options.failureThreshold;
      const cooldownMs =
        failure.kind === 'auth'
          ? options.authCooldownMs
          : failure.kind === 'quota'
            ? options.quotaCooldownMs
            : options.transientCooldownMs;
      await writeState({
        consecutiveFailures,
        openUntil: shouldOpen ? currentTime + cooldownMs : 0,
        reason: failure.kind,
        updatedAt: new Date(currentTime).toISOString(),
      });
      logger.warn(
        `[image-provider] primary failed (${failure.kind}); using fallback${shouldOpen ? ` for ${Math.ceil(cooldownMs / 60000)}m` : ''}`,
      );
      return options.fallback(input);
    } finally {
      probeInFlight = false;
    }
  }

  return { generate };
}
