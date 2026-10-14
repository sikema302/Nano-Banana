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

export type VideoCreditPricing = {
  /** 全参MinimaxH3 768p 档：10 秒以内固定积分。 */
  p768Base: number;
  /** 全参MinimaxH3 2K 档：10 秒以内固定积分。 */
  twoKBase: number;
  /** 超过 10 秒后每秒追加积分（768p 与 2K 一致）。 */
  excessPerSecond: number;
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
    p768Base: 480,
    twoKBase: 520,
    excessPerSecond: 20,
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
  const video: Partial<VideoCreditPricing> = source.video && typeof source.video === 'object'
    ? source.video
    : {};

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
      p768Base: positiveCredit(video.p768Base, DEFAULT_MODEL_CREDIT_PRICING.video.p768Base),
      twoKBase: positiveCredit(video.twoKBase, DEFAULT_MODEL_CREDIT_PRICING.video.twoKBase),
      excessPerSecond: positiveCredit(video.excessPerSecond, DEFAULT_MODEL_CREDIT_PRICING.video.excessPerSecond),
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

/** 视频总积分 = 底价（768p:480 / 2K:520） + max(0, 时长 - 10) × 每秒加价（20）。 */
export function getConfiguredVideoCredits(
  pricing: ModelCreditPricing,
  resolution: string,
  seconds: number,
) {
  const base = resolution === '2K' ? pricing.video.twoKBase : pricing.video.p768Base;
  const safeSeconds = Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 0;
  const excess = Math.max(0, safeSeconds - VIDEO_BASE_SECONDS) * pricing.video.excessPerSecond;
  return base + excess;
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