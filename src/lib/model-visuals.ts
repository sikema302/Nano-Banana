// 生图模型选择器的视觉标识：logo 与悬停辉光色。
// 创作页与批量生图页共用同一份配置，保证两处外观一致。
const MODEL_THEME: Record<string, { glow: string }> = {
  'gpt-image-2': { glow: 'rgba(168,85,247,0.45)' },
  'GPT-image-2.5-Flare': { glow: 'rgba(251,146,60,0.45)' },
  'GPT-image-2.5-Sunburst': { glow: 'rgba(244,63,94,0.45)' },
  Nano_Banana_Pro: { glow: 'rgba(16,185,129,0.45)' },
  'gpt-image-2-adobe': { glow: 'rgba(56,189,248,0.45)' },
};

export function getModelTheme(modelId: string) {
  return MODEL_THEME[modelId] ?? { glow: 'rgba(148,163,184,0.4)' };
}

export function getModelLogo(modelId: string) {
  return modelId === 'Nano_Banana_Pro' ? '/images/model-nano-banana.svg' : '/images/model-gpt.svg';
}
