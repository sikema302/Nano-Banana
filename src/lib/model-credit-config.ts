import {
  DEFAULT_GPT_IMAGE_PRICING,
  normalizeGptImagePricing,
  type GptImagePricing,
} from './model-pricing.js';

export type NanoBananaCreditPricing = {
  oneK: number;
  twoK: number;
  fourK: number;
  enhancement: number;
};

export type GptImage2AdobeCreditPricing = {
  oneK: number;
};

/** 视频模型标识（内部规范化 ID）。 */
export type VideoModelId = 'minimax-h3' | 'grok-imagine-video-1.5';

/** 视频清晰度档：minimax 用 768p/2K，grok 用 480p/720p。 */
export type VideoResolution = '768p' | '2K' | '480p' | '720p';

/** 视频画面比例：minimax 3 种，grok 5 种。 */
export type VideoAspect = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

export type VideoModelSpec = {
  id: VideoModelId;
  /** 界面展示名。 */
  label: string;
  /** 写入 generations.model_id 的历史标识。 */
  historyModelId: string;
  /** 该模型支持的清晰度档。 */
  resolutions: VideoResolution[];
  /** 该模型支持的画面比例。 */
  aspects: VideoAspect[];
  /** 参考图上限（按清晰度）。 */
  maxReferenceImages: (resolution: VideoResolution) => number;
  /** 参考视频上限。 */
  maxReferenceVideos: number;
  /** 参考音频上限。 */
  maxReferenceAudios: number;
  /** 下发到上游的模型名（按清晰度）。 */
  upstreamModelFor: (resolution: VideoResolution) => string;
};

export const VIDEO_MODELS: Record<VideoModelId, VideoModelSpec> = {
  'minimax-h3': {
    id: 'minimax-h3',
    label: 'MiniMax H3',
    historyModelId: '全参MinimaxH3',
    resolutions: ['768p', '2K'],
    aspects: ['16:9', '9:16', '1:1'],
    maxReferenceImages: () => 9,
    maxReferenceVideos: 3,
    maxReferenceAudios: 3,
    upstreamModelFor: () => '全参MinimaxH3',
  },
  'grok-imagine-video-1.5': {
    id: 'grok-imagine-video-1.5',
    label: 'grok-imagine-video-1.5',
    historyModelId: 'grok-imagine-video-1.5',
    resolutions: ['480p', '720p'],
    aspects: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    maxReferenceImages: (resolution) => (resolution === '720p' ? 7 : 1),
    maxReferenceVideos: 0,
    maxReferenceAudios: 0,
    upstreamModelFor: (resolution) =>
      resolution === '720p' ? 'grok-imagine-video-1.5（按次）' : 'grok-imagine-video-1.5-lite',
  },
};

export const VIDEO_MODEL_IDS = Object.keys(VIDEO_MODELS) as VideoModelId[];
export const VIDEO_DEFAULT_MODEL_ID: VideoModelId = 'minimax-h3';

/** 把前端/历史传入的模型名归一化为内部 VideoModelId，非法值回退 minimax-h3。 */
export function normalizeVideoModelId(value: unknown): VideoModelId {
  if (value === 'minimax-h3' || value === 'minimax_h3' || value === '全参MinimaxH3') return 'minimax-h3';
  if (value === 'grok-imagine-video-1.5') return 'grok-imagine-video-1.5';
  return VIDEO_DEFAULT_MODEL_ID;
}

/** 全参 MinimaxH3 两档定价。 */
export type MinimaxVideoCreditPricing = {
  p768Base: number;
  twoKBase: number;
  excessPerSecond: number;
};

/** grok-imagine-video-1.5 两档定价。 */
export type GrokVideoCreditPricing = {
  p480Base: number;
  p720Base: number;
  excessPerSecond: number;
};

export type VideoCreditPricing = {
  minimax: MinimaxVideoCreditPricing;
  grok: GrokVideoCreditPricing;
};

export type ModelCreditPricing = {
  gptImage2: GptImagePricing;
  gptImage25Flare: GptImagePricing;
  gptImage25Sunburst: GptImagePricing;
  gptImage2Adobe: GptImage2AdobeCreditPricing;
  nanoBanana: NanoBananaCreditPricing;
  video: VideoCreditPricing;
  updatedAt: string;
};

export const DEFAULT_MODEL_CREDIT_PRICING: ModelCreditPricing = {
  gptImage2: { ...DEFAULT_GPT_IMAGE_PRICING },
  gptImage25Flare: { ...DEFAULT_GPT_IMAGE_PRICING },
  gptImage25Sunburst: {
    standard: 20,
    twoK: 34,
    twoKHigh: 48,
    fourK: 40,
    fourKHigh: 48,
  },
  gptImage2Adobe: {
    oneK: 26,
  },
  nanoBanana: {
    oneK: 24,
    twoK: 24,
    fourK: 24,
    enhancement: 8,
  },
  video: {
    minimax: { p768Base: 480, twoKBase: 520, excessPerSecond: 20 },
    grok: { p480Base: 180, p720Base: 320, excessPerSecond: 10 },
  },
  updatedAt: '',
};

function positiveCredit(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100_000 ? parsed : fallback;
}

export function normalizeModelCreditPricing(value: unknown): ModelCreditPricing {
  const source = value && typeof value === 'object' ? value as Partial<ModelCreditPricing> : {};
  const banana: Partial<NanoBananaCreditPricing> = source.nanoBanana && typeof source.nanoBanana === 'object'
    ? source.nanoBanana
    : {};
  const gptImage2Adobe: Partial<GptImage2AdobeCreditPricing> = source.gptImage2Adobe && typeof source.gptImage2Adobe === 'object'
    ? source.gptImage2Adobe
    : {};
  // 视频定价可能是新嵌套结构（{ minimax, grok }）或旧扁平结构（{ p768Base, twoKBase, excessPerSecond }）。
  const videoRaw = (source.video && typeof source.video === 'object' ? source.video : {}) as
    Partial<VideoCreditPricing> & Partial<MinimaxVideoCreditPricing>;
  const hasLegacyFlatVideo = 'p768Base' in videoRaw && !('minimax' in videoRaw);
  const minimaxVideo: Partial<MinimaxVideoCreditPricing> = hasLegacyFlatVideo
    ? videoRaw
    : (videoRaw.minimax as Partial<MinimaxVideoCreditPricing> | undefined) || {};
  const grokVideo: Partial<GrokVideoCreditPricing> = videoRaw.grok || {};

  return {
    gptImage2: normalizeGptImagePricing(source.gptImage2),
    gptImage25Flare: normalizeGptImagePricing(source.gptImage25Flare),
    gptImage25Sunburst: normalizeGptImagePricing(source.gptImage25Sunburst),
    gptImage2Adobe: {
      oneK: positiveCredit(gptImage2Adobe.oneK, DEFAULT_MODEL_CREDIT_PRICING.gptImage2Adobe.oneK),
    },
    nanoBanana: {
      oneK: positiveCredit(banana.oneK, DEFAULT_MODEL_CREDIT_PRICING.nanoBanana.oneK),
      twoK: positiveCredit(banana.twoK, DEFAULT_MODEL_CREDIT_PRICING.nanoBanana.twoK),
      fourK: positiveCredit(banana.fourK, DEFAULT_MODEL_CREDIT_PRICING.nanoBanana.fourK),
      enhancement: positiveCredit(banana.enhancement, DEFAULT_MODEL_CREDIT_PRICING.nanoBanana.enhancement),
    },
    video: {
      minimax: {
        p768Base: positiveCredit(minimaxVideo.p768Base, DEFAULT_MODEL_CREDIT_PRICING.video.minimax.p768Base),
        twoKBase: positiveCredit(minimaxVideo.twoKBase, DEFAULT_MODEL_CREDIT_PRICING.video.minimax.twoKBase),
        excessPerSecond: positiveCredit(minimaxVideo.excessPerSecond, DEFAULT_MODEL_CREDIT_PRICING.video.minimax.excessPerSecond),
      },
      grok: {
        p480Base: positiveCredit(grokVideo.p480Base, DEFAULT_MODEL_CREDIT_PRICING.video.grok.p480Base),
        p720Base: positiveCredit(grokVideo.p720Base, DEFAULT_MODEL_CREDIT_PRICING.video.grok.p720Base),
        excessPerSecond: positiveCredit(grokVideo.excessPerSecond, DEFAULT_MODEL_CREDIT_PRICING.video.grok.excessPerSecond),
      },
    },
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
  };
}

export function getConfiguredImageCredits(
  pricing: ModelCreditPricing,
  modelId: string,
  imageSize: string,
  quality = '',
) {
  if (modelId === 'gpt-image-2' || modelId === 'GPT-image-2.5-Flare' || modelId === 'GPT-image-2.5-Sunburst') {
    const gptPricing = modelId === 'GPT-image-2.5-Flare'
      ? pricing.gptImage25Flare
      : modelId === 'GPT-image-2.5-Sunburst'
        ? pricing.gptImage25Sunburst
        : pricing.gptImage2;
    const normalizedQuality = String(quality).toLowerCase();
    if (imageSize === '2K') return normalizedQuality === 'high' ? gptPricing.twoKHigh : gptPricing.twoK;
    if (imageSize === '4K') return normalizedQuality === 'high' ? gptPricing.fourKHigh : gptPricing.fourK;
    return gptPricing.standard;
  }
  if (modelId === 'gpt-image-2-adobe') {
    return pricing.gptImage2Adobe.oneK;
  }
  if (modelId === 'Nano_Banana_Pro') {
    if (imageSize === '1K') return pricing.nanoBanana.oneK;
    if (imageSize === '4K') return pricing.nanoBanana.fourK;
    return pricing.nanoBanana.twoK;
  }
  return 1;
}

/** 视频固定价目基准：10 秒以内按底价计，超过 10 秒每秒追加。 */
export const VIDEO_BASE_SECONDS = 10;

/** 视频总积分 = 底价（按模型/清晰度） + max(0, 时长 - 10) × 每秒加价。 */
export function getConfiguredVideoCredits(
  pricing: ModelCreditPricing,
  modelId: VideoModelId | string,
  resolution: VideoResolution | string,
  seconds: number,
) {
  const normalizedModel = normalizeVideoModelId(modelId);
  const safeSeconds = Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 0;
  const excess = Math.max(0, safeSeconds - VIDEO_BASE_SECONDS);
  if (normalizedModel === 'grok-imagine-video-1.5') {
    const base = resolution === '720p' ? pricing.video.grok.p720Base : pricing.video.grok.p480Base;
    return base + excess * pricing.video.grok.excessPerSecond;
  }
  const base = resolution === '2K' ? pricing.video.minimax.twoKBase : pricing.video.minimax.p768Base;
  return base + excess * pricing.video.minimax.excessPerSecond;
}

/** 视频参考图阶梯加价：前 5 张免费。 */
export const VIDEO_REFERENCE_IMAGE_FREE_COUNT = 5;
/** 视频参考图阶梯加价单价：第 6 张起每张 +30 积分（与时长、分辨率无关）。 */
export const VIDEO_EXTRA_REFERENCE_IMAGE_CREDITS = 30;

/**
 * 视频参考图加价积分 = max(0, 张数 - 5) × 30。
 * 只与参考图张数有关，不随视频时长和分辨率变化。
 * 调用方负责把张数按上游上限（9）截断后再传入。
 */
export function getVideoReferenceImageSurcharge(referenceImageCount: number) {
  const count = Number.isSafeInteger(referenceImageCount) && referenceImageCount > 0 ? referenceImageCount : 0;
  return Math.max(0, count - VIDEO_REFERENCE_IMAGE_FREE_COUNT) * VIDEO_EXTRA_REFERENCE_IMAGE_CREDITS;
}