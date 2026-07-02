export type GptImageQuality = 'auto' | 'low' | 'medium' | 'high';

export type GptImagePricing = {
  standard: number;
  twoK: number;
  twoKHigh: number;
  fourK: number;
  fourKHigh: number;
};

export const DEFAULT_GPT_IMAGE_PRICING: GptImagePricing = {
  standard: 20,
  twoK: 28,
  twoKHigh: 48,
  fourK: 34,
  fourKHigh: 48,
};

export function normalizeGptImagePricing(value: unknown): GptImagePricing {
  const source = value && typeof value === 'object' ? (value as Partial<GptImagePricing>) : {};
  const normalized = { ...DEFAULT_GPT_IMAGE_PRICING };

  for (const key of Object.keys(normalized) as Array<keyof GptImagePricing>) {
    const credits = Number(source[key]);
    if (Number.isSafeInteger(credits) && credits > 0 && credits <= 10_000) {
      normalized[key] = credits;
    }
  }

  return normalized;
}

export function normalizeGptImageQuality(value: unknown, imageSize: string): GptImageQuality {
  if (imageSize !== '2K' && imageSize !== '4K') return 'auto';
  const quality = String(value || '').trim().toLowerCase();
  if (quality === 'low' || quality === 'medium' || quality === 'high') return quality;
  return 'auto';
}

export function getGptImageCredits(
  imageSize: string,
  quality: unknown,
  pricing: GptImagePricing = DEFAULT_GPT_IMAGE_PRICING,
) {
  const activePricing = normalizeGptImagePricing(pricing);
  const normalizedQuality = normalizeGptImageQuality(quality, imageSize);
  if (imageSize === '2K') return normalizedQuality === 'high' ? activePricing.twoKHigh : activePricing.twoK;
  if (imageSize === '4K') return normalizedQuality === 'high' ? activePricing.fourKHigh : activePricing.fourK;
  return activePricing.standard;
}
