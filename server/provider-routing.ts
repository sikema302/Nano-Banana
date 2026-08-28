export type Image2ProviderId = 'junliai-economy' | 'junliai-firefly' | 'schat-gpt-image-2' | 'visionary' | 'uselg';
export type BananaProviderId = 'flux' | 'visionary' | 'junliai' | 'junliai-nano-banana-2' | 'schat-nano-banana-2';
export type SeedreamProviderId = 'schat-seedream-4';
export type GrokImageProviderId = 'junliai-grok';
export type ProviderResolution = '1K' | '2K' | '4K';

export type ProviderChannel<T extends string = string> = {
  id: T;
  enabled: boolean;
};

export type ProviderResolutionRoutes<T extends string> = Record<
  ProviderResolution,
  Array<ProviderChannel<T>>
>;

export type ProviderRoutingConfig = {
  image2Routes: ProviderResolutionRoutes<Image2ProviderId>;
  bananaRoutes: ProviderResolutionRoutes<BananaProviderId>;
  seedreamRoutes: ProviderResolutionRoutes<SeedreamProviderId>;
  grokImageRoutes: ProviderResolutionRoutes<GrokImageProviderId>;
  junliaiGeminiVeo31: boolean;
  junliaiGrokVideo: boolean;
  schatSeedance25: boolean;
  junliaiSd2Fast: boolean;
};

export type ProviderRoutingPatch = Partial<ProviderRoutingConfig>;

type LegacyProviderRoutingConfig = {
  image2Channels?: unknown;
  bananaChannels?: unknown;
  junliaiGptImage2Economy?: unknown;
  junliaiGptImage2?: unknown;
  junliaiNanoBanana?: unknown;
  junliaiGeminiVeo31?: unknown;
  junliaiFireflyVideo?: unknown;
  junliaiGrokVideo?: unknown;
  schatSeedance25?: unknown;
  junliaiSd2Fast?: unknown;
};

type RoutingStore = {
  get: (key: string, fallback: string) => Promise<string>;
  set: (key: string, value: string) => Promise<void>;
};

type ProviderRoutingOptions = {
  store: RoutingStore;
  defaults: ProviderRoutingConfig;
  settingKey?: string;
};

const RESOLUTIONS: ProviderResolution[] = ['1K', '2K', '4K'];

function cloneRoutes<T extends string>(routes: ProviderResolutionRoutes<T>): ProviderResolutionRoutes<T> {
  return {
    '1K': routes['1K'].map((channel) => ({ ...channel })),
    '2K': routes['2K'].map((channel) => ({ ...channel })),
    '4K': routes['4K'].map((channel) => ({ ...channel })),
  };
}

function cloneConfig(config: ProviderRoutingConfig): ProviderRoutingConfig {
  return {
    image2Routes: cloneRoutes(config.image2Routes),
    bananaRoutes: cloneRoutes(config.bananaRoutes),
    seedreamRoutes: cloneRoutes(config.seedreamRoutes),
    grokImageRoutes: cloneRoutes(config.grokImageRoutes),
    junliaiGeminiVeo31: config.junliaiGeminiVeo31,
    junliaiGrokVideo: config.junliaiGrokVideo,
    schatSeedance25: config.schatSeedance25,
    junliaiSd2Fast: config.junliaiSd2Fast,
  };
}

function normalizeChannels<T extends string>(
  value: unknown,
  defaults: Array<ProviderChannel<T>>,
  legacyEnabled: Partial<Record<T, boolean>> = {},
) {
  const allowedIds = defaults.map((channel) => channel.id);
  const defaultEnabled = new Map(defaults.map((channel) => [channel.id, channel.enabled]));
  const normalized: Array<ProviderChannel<T>> = [];
  const seen = new Set<T>();

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Partial<ProviderChannel<T>>;
      if (!allowedIds.includes(record.id as T) || seen.has(record.id as T)) continue;
      const id = record.id as T;
      normalized.push({
        id,
        enabled: typeof record.enabled === 'boolean'
          ? record.enabled
          : legacyEnabled[id] ?? defaultEnabled.get(id) ?? true,
      });
      seen.add(id);
    }
  }

  for (const defaultChannel of defaults) {
    if (seen.has(defaultChannel.id)) continue;
    normalized.push({
      id: defaultChannel.id,
      enabled: legacyEnabled[defaultChannel.id] ?? defaultChannel.enabled,
    });
  }
  return normalized;
}

function normalizeRoutes<T extends string>(
  value: unknown,
  legacyValue: unknown,
  defaults: ProviderResolutionRoutes<T>,
  legacyEnabled: Partial<Record<T, boolean>>,
) {
  const record = value && typeof value === 'object'
    ? value as Partial<Record<ProviderResolution, unknown>>
    : {};
  return Object.fromEntries(
    RESOLUTIONS.map((resolution) => [
      resolution,
      normalizeChannels(record[resolution] ?? legacyValue, defaults[resolution], legacyEnabled),
    ]),
  ) as ProviderResolutionRoutes<T>;
}

function normalizeConfig(value: unknown, defaults: ProviderRoutingConfig): ProviderRoutingConfig {
  const record = value && typeof value === 'object'
    ? value as Partial<ProviderRoutingConfig> & LegacyProviderRoutingConfig
    : {};
  const legacyGptEnabled = typeof record.junliaiGptImage2 === 'boolean'
    ? record.junliaiGptImage2
    : undefined;

  return {
    image2Routes: normalizeRoutes(
      record.image2Routes,
      record.image2Channels,
      defaults.image2Routes,
      {
        'junliai-economy': typeof record.junliaiGptImage2Economy === 'boolean'
          ? record.junliaiGptImage2Economy
          : legacyGptEnabled,
        'junliai-firefly': legacyGptEnabled,
      },
    ),
    bananaRoutes: normalizeRoutes(
      record.bananaRoutes,
      record.bananaChannels,
      defaults.bananaRoutes,
      {
        junliai: typeof record.junliaiNanoBanana === 'boolean'
          ? record.junliaiNanoBanana
          : undefined,
        'junliai-nano-banana-2': typeof record.junliaiNanoBanana === 'boolean'
          ? record.junliaiNanoBanana
          : undefined,
      },
    ),
    seedreamRoutes: normalizeRoutes(
      record.seedreamRoutes,
      undefined,
      defaults.seedreamRoutes,
      {},
    ),
    grokImageRoutes: normalizeRoutes(
      record.grokImageRoutes,
      undefined,
      defaults.grokImageRoutes,
      {},
    ),
    junliaiGeminiVeo31: typeof record.junliaiGeminiVeo31 === 'boolean'
      ? record.junliaiGeminiVeo31
      : defaults.junliaiGeminiVeo31,
    junliaiGrokVideo: typeof record.junliaiGrokVideo === 'boolean'
      ? record.junliaiGrokVideo
      : defaults.junliaiGrokVideo,
    schatSeedance25: typeof record.schatSeedance25 === 'boolean'
      ? record.schatSeedance25
      : defaults.schatSeedance25,
    junliaiSd2Fast: typeof record.junliaiSd2Fast === 'boolean'
      ? record.junliaiSd2Fast
      : defaults.junliaiSd2Fast,
  };
}

export function routingResolution(imageSize: string): ProviderResolution {
  return imageSize === '2K' || imageSize === '4K' ? imageSize : '1K';
}

export function enabledProviderIds<T extends string>(channels: Array<ProviderChannel<T>>) {
  return channels.filter((channel) => channel.enabled).map((channel) => channel.id);
}

export function isProviderEnabled<T extends string>(channels: Array<ProviderChannel<T>>, id: T) {
  return channels.some((channel) => channel.id === id && channel.enabled);
}

export function applyProviderRoutingToImageSize(
  _modelId: string,
  imageSize: string,
  _config: ProviderRoutingConfig,
) {
  return imageSize;
}

export function createProviderRouting(options: ProviderRoutingOptions) {
  const settingKey = options.settingKey || 'provider_routing_v1';
  let cached: ProviderRoutingConfig | null = null;

  async function get() {
    if (cached) return cloneConfig(cached);
    const raw = await options.store.get(settingKey, JSON.stringify(options.defaults));
    try {
      cached = normalizeConfig(JSON.parse(raw), options.defaults);
    } catch {
      cached = cloneConfig(options.defaults);
    }
    return cloneConfig(cached);
  }

  async function update(patch: ProviderRoutingPatch) {
    const current = await get();
    const next = normalizeConfig({ ...current, ...patch }, current);
    await options.store.set(settingKey, JSON.stringify(next));
    cached = next;
    return cloneConfig(next);
  }

  return { get, update };
}
