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
  /** minimax_h3-768p 档，每秒积分。 */
  p768: number;
  /** minimax_h3-1080p 档，每秒积分。 */
  p1080: number;
  /** minimax_h3-2K 档，每秒积分。 */
  twoK: number;
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
    p768: 40,
    p1080: 60,
    twoK: 70,
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
      p768: positiveCredit(video.p768, DEFAULT_MODEL_CREDIT_PRICING.video.p768),
      p1080: positiveCredit(video.p1080, DEFAULT_MODEL_CREDIT_PRICING.video.p1080),
      twoK: positiveCredit(video.twoK, DEFAULT_MODEL_CREDIT_PRICING.video.twoK),
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

/** 视频每秒单价（积分/秒），按分辨率档区分。总消耗 = 单价 × 时长秒数。 */
export function getConfiguredVideoCredits(pricing: ModelCreditPricing, resolution: string) {
  if (resolution === '1080p') return pricing.video.p1080;
  if (resolution === '2K') return pricing.video.twoK;
  return pricing.video.p768;
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