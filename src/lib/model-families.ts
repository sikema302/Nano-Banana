/**
 * 香蕉（Gemini 图片）模型族。
 *
 * 同一族的模型共享这些能力，因此尺寸档、画面比例、参考图上限和
 * 「Banana 专用积分」池都按族判断；但每个模型有各自的上游渠道与单价，
 * 所以计费与渠道分发仍按具体 modelId 分支。
 */
export const NANO_BANANA_MODEL_IDS = ['Nano_Banana_Pro', 'Nano_Banana_2_1'] as const;

export type NanoBananaModelId = (typeof NANO_BANANA_MODEL_IDS)[number];

export function isNanoBananaModel(modelId: string | null | undefined): modelId is NanoBananaModelId {
  return modelId === 'Nano_Banana_Pro' || modelId === 'Nano_Banana_2_1';
}
