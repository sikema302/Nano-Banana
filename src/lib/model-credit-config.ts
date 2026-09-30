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

export type ModelCreditPricing = {
  gptImage2: GptImagePricing;
  gptImage25Flare: GptImagePricing;
  gptImage25Sunburst: GptImagePricing;
  gptImage2Adobe: GptImage2AdobeCreditPricing;
  nanoBanana: NanoBananaCreditPricing;
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
    oneK: 20,
    twoK: 24,
    fourK: 30,
    enhancement: 8,
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