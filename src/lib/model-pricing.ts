export type GptImageQuality = 'auto' | 'low' | 'medium' | 'high';

export function normalizeGptImageQuality(value: unknown, imageSize: string): GptImageQuality {
  if (imageSize !== '2K' && imageSize !== '4K') return 'auto';
  const quality = String(value || '').trim().toLowerCase();
  if (quality === 'low' || quality === 'medium' || quality === 'high') return quality;
  return 'auto';
}

export function getGptImageCredits(imageSize: string, quality: unknown) {
  const normalizedQuality = normalizeGptImageQuality(quality, imageSize);
  if (imageSize === '2K') return normalizedQuality === 'high' ? 46 : 28;
  if (imageSize === '4K') return normalizedQuality === 'high' ? 48 : 34;
  return 20;
}
