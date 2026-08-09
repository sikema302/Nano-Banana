import {
  DEFAULT_GPT_IMAGE_PRICING,
  normalizeGptImagePricing,
  type GptImagePricing,
} from './model-pricing.js';
import type { VideoDurationSeconds, VideoModelId, VideoResolution } from './video-pricing.js';

export type NanoBananaCreditPricing = {
  oneK: number;
  twoK: number;
  fourK: number;
  enhancement: number;
};

export type VideoCreditPricing = Record<VideoModelId, Partial<Record<`${VideoResolution}:${VideoDurationSeconds}`, number>>>;

export type ModelCreditPricing = {
  gptImage2: GptImagePricing;
  nanoBanana: NanoBananaCreditPricing;
  video: VideoCreditPricing;
  updatedAt: string;
};

export const DEFAULT_MODEL_CREDIT_PRICING: ModelCreditPricing = {
  gptImage2: { ...DEFAULT_GPT_IMAGE_PRICING },
  nanoBanana: {
    oneK: 20,
    twoK: 24,
    fourK: 30,
    enhancement: 8,
  },
  video: {
    'gemini-veo31': {
      '720p:4': 150,
      '720p:6': 200,
      '720p:8': 250,
      '1080p:4': 200,
      '1080p:6': 250,
      '1080p:8': 300,
    },
    'firefly-video': {
      '720p:5': 300,
      '1080p:5': 350,
    },
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
  const video = source.video && typeof source.video === 'object' ? source.video : {};
  const normalizeVideoModel = (modelId: VideoModelId) => {
    const defaults = DEFAULT_MODEL_CREDIT_PRICING.video[modelId];
    const candidate = video[modelId] && typeof video[modelId] === 'object' ? video[modelId] : {};
    return Object.fromEntries(
      Object.entries(defaults).map(([key, fallback]) => [key, positiveCredit(candidate[key as keyof typeof candidate], Number(fallback))]),
    );
  };

  return {
    gptImage2: normalizeGptImagePricing(source.gptImage2),
    nanoBanana: {
      oneK: positiveCredit(banana.oneK, DEFAULT_MODEL_CREDIT_PRICING.nanoBanana.oneK),
      twoK: positiveCredit(banana.twoK, DEFAULT_MODEL_CREDIT_PRICING.nanoBanana.twoK),
      fourK: positiveCredit(banana.fourK, DEFAULT_MODEL_CREDIT_PRICING.nanoBanana.fourK),
      enhancement: positiveCredit(banana.enhancement, DEFAULT_MODEL_CREDIT_PRICING.nanoBanana.enhancement),
    },
    video: {
      'gemini-veo31': normalizeVideoModel('gemini-veo31'),
      'firefly-video': normalizeVideoModel('firefly-video'),
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
  if (modelId === 'gpt-image-2') {
    const normalizedQuality = String(quality).toLowerCase();
    if (imageSize === '2K') return normalizedQuality === 'high' ? pricing.gptImage2.twoKHigh : pricing.gptImage2.twoK;
    if (imageSize === '4K') return normalizedQuality === 'high' ? pricing.gptImage2.fourKHigh : pricing.gptImage2.fourK;
    return pricing.gptImage2.standard;
  }
  if (modelId === 'Nano_Banana_Pro') {
    if (imageSize === '1K') return pricing.nanoBanana.oneK;
    if (imageSize === '4K') return pricing.nanoBanana.fourK;
    return pricing.nanoBanana.twoK;
  }
  return 1;
}

export function getConfiguredVideoCredits(
  pricing: ModelCreditPricing,
  modelId: VideoModelId,
  resolution: VideoResolution,
  seconds: VideoDurationSeconds,
) {
  return Number(pricing.video[modelId]?.[`${resolution}:${seconds}`] || 0);
}
