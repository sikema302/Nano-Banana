export const DEDICATED_JUNLI_BANANA_KEY_HASH =
  '404c1b3a53e893f13cb9674ec2910fd898b7f481f2f6e4d1ca626ebfcdc7e931';

export function isDedicatedJunliBananaKeyHash(keyHash: string) {
  return String(keyHash || '').trim().toLowerCase() === DEDICATED_JUNLI_BANANA_KEY_HASH;
}

export function dedicatedJunliBananaCredits(imageSize: string, aiEnhancement: boolean) {
  const baseCredits = imageSize === '4K' ? 36 : 30;
  return baseCredits + (aiEnhancement ? 8 : 0);
}

export function dedicatedJunliBananaPolicy(
  keyHash: string,
  requestedImageSize: string,
  aiEnhancement: boolean,
) {
  if (!isDedicatedJunliBananaKeyHash(keyHash)) return null;
  const imageSize = requestedImageSize === '1K' || requestedImageSize === '4K'
    ? requestedImageSize
    : '2K';
  return {
    modelId: 'Nano_Banana_Pro' as const,
    upstreamModel: 'nano-banana-pro' as const,
    imageSize,
    aiEnhancement,
    credits: dedicatedJunliBananaCredits(imageSize, aiEnhancement),
    providerRouting: 'junliai_dedicated' as const,
  };
}
