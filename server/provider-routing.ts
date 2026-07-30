export type ProviderRoutingConfig = {
  junliaiGptImage2: boolean;
  junliaiNanoBanana: boolean;
  junliaiFireflyVideo: boolean;
};

export function applyProviderRoutingToImageSize(
  modelId: string,
  imageSize: string,
  config: ProviderRoutingConfig,
) {
  return modelId === 'Nano_Banana_Pro' && imageSize === '1K' && !config.junliaiNanoBanana
    ? '2K'
    : imageSize;
}

type RoutingStore = {
  get: (key: string, fallback: string) => Promise<string>;
  set: (key: string, value: string) => Promise<void>;
};

type ProviderRoutingOptions = {
  store: RoutingStore;
  defaults: ProviderRoutingConfig;
  settingKey?: string;
};

const ROUTING_KEYS: Array<keyof ProviderRoutingConfig> = [
  'junliaiGptImage2',
  'junliaiNanoBanana',
  'junliaiFireflyVideo',
];

function normalizeConfig(value: unknown, defaults: ProviderRoutingConfig): ProviderRoutingConfig {
  const record = value && typeof value === 'object' ? value as Partial<ProviderRoutingConfig> : {};
  return {
    junliaiGptImage2:
      typeof record.junliaiGptImage2 === 'boolean' ? record.junliaiGptImage2 : defaults.junliaiGptImage2,
    junliaiNanoBanana:
      typeof record.junliaiNanoBanana === 'boolean' ? record.junliaiNanoBanana : defaults.junliaiNanoBanana,
    junliaiFireflyVideo:
      typeof record.junliaiFireflyVideo === 'boolean'
        ? record.junliaiFireflyVideo
        : defaults.junliaiFireflyVideo,
  };
}

export function createProviderRouting(options: ProviderRoutingOptions) {
  const settingKey = options.settingKey || 'provider_routing_v1';
  let cached: ProviderRoutingConfig | null = null;

  async function get() {
    if (cached) return { ...cached };
    const raw = await options.store.get(settingKey, JSON.stringify(options.defaults));
    try {
      cached = normalizeConfig(JSON.parse(raw), options.defaults);
    } catch {
      cached = { ...options.defaults };
    }
    return { ...cached };
  }

  async function update(patch: Partial<ProviderRoutingConfig>) {
    const current = await get();
    const next = { ...current };
    for (const key of ROUTING_KEYS) {
      if (typeof patch[key] === 'boolean') next[key] = patch[key];
    }
    await options.store.set(settingKey, JSON.stringify(next));
    cached = next;
    return { ...next };
  }

  return { get, update };
}
