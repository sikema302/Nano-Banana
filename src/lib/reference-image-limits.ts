export const MAX_REFERENCE_IMAGES = 6;
export const MAX_GPT_IMAGE_25_REFERENCE_IMAGES = 9;
export const MAX_REFERENCE_IMAGE_MB = 25;
export const MAX_REFERENCE_IMAGE_BYTES = MAX_REFERENCE_IMAGE_MB * 1024 * 1024;
/** GPT-image-2 上游对单张参考图的限制更严，单独收窄。 */
export const GPT_IMAGE_2_REFERENCE_IMAGE_MB = 20;

/** 按前端对外模型 id 返回单张参考图大小上限（MB）；未单独限定的模型用全局 25MB。 */
export function maxReferenceImageMBForModel(modelId?: string): number {
  return modelId === 'gpt-image-2' ? GPT_IMAGE_2_REFERENCE_IMAGE_MB : MAX_REFERENCE_IMAGE_MB;
}

export function maxReferenceImageBytesForModel(modelId?: string): number {
  return maxReferenceImageMBForModel(modelId) * 1024 * 1024;
}
