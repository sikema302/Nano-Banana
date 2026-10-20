export type Image2ProviderId = 'junliai-economy' | 'junliai-gpt-image-25' | 'junliai-firefly' | 'schat-gpt-image-2' | 'visionary' | 'uselg';
export type BananaProviderId = 'flux' | 'flux-flash' | 'visionary' | 'junliai' | 'junliai-nano-banana-2' | 'schat-nano-banana-2';
export type GrokImageProviderId = 'junliai-grok';
// GPT-image-2.5 Flare / Sunburst 独立渠道组：只有 junliai 的三个真 2.5 上游
// （经济版/通用渠道仅 1K，Firefly 支持 1K/2K/4K）。Uselg/Visionary 走的是
// 自家模型（Flux、gpt-image-2），不是 2.5 上游，不进这两组。
export type GptImage25ProviderId = 'junliai-economy' | 'junliai-gpt-image-25' | 'junliai-firefly';
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
  grokImageRoutes: ProviderResolutionRoutes<GrokImageProviderId>;
  flareRoutes: ProviderResolutionRoutes<GptImage25ProviderId>;
  sunburstRoutes: ProviderResolutionRoutes<GptImage25ProviderId>;
};

export type ProviderRoutingPatch = Partial<ProviderRoutingConfig>;

type LegacyProviderRoutingConfig = {
  image2Channels?: unknown;
  bananaChannels?: unknown;
  junliaiGptImage2Economy?: unknown;
  junliaiGptImage2?: unknown;
  junliaiNanoBanana?: unknown;
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
    grokImageRoutes: cloneRoutes(config.grokImageRoutes),
    flareRoutes: cloneRoutes(config.flareRoutes),
    sunburstRoutes: cloneRoutes(config.sunburstRoutes),
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
    grokImageRoutes: normalizeRoutes(
      record.grokImageRoutes,
      undefined,
      defaults.grokImageRoutes,
      {},
    ),
    // 旧配置没有 flare/sunburst 组：normalize 会按 defaults 兜底补齐，
    // 与旧版「2.5 共用 image2Routes」行为对齐（junliai 渠道优先，Uselg/Visionary 兜底）。
    flareRoutes: normalizeRoutes(
      record.flareRoutes,
      undefined,
      defaults.flareRoutes,
      {},
    ),
    sunburstRoutes: normalizeRoutes(
      record.sunburstRoutes,
      undefined,
      defaults.sunburstRoutes,
      {},
    ),
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