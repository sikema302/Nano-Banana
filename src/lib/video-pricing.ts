export type VideoModelId = 'gemini-veo31' | 'grok-video' | 'seedance2.5';
export type VideoResolution = '720p' | '1080p';
export type VideoRatio = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
export type VideoDurationSeconds = 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29;

export type VideoModelConfig = {
  id: VideoModelId;
  name: string;
  description: string;
  resolutions: VideoResolution[];
  ratios: VideoRatio[];
  durations: VideoDurationSeconds[];
};

export const VIDEO_GENERATION_MODELS: VideoModelConfig[] = [
  {
    id: 'gemini-veo31',
    name: 'Gemini Veo 3.1',
    description: 'Google Veo 高质量视频生成',
    resolutions: ['720p', '1080p'],
    ratios: ['16:9', '9:16'],
    durations: [4, 6, 8],
  },
  {
    id: 'grok-video',
    name: 'Grok Video',
    description: 'xAI Grok 视频生成',
    resolutions: ['720p'],
    ratios: ['16:9', '9:16'],
    durations: [6, 10, 15],
  },
  {
    id: 'seedance2.5',
    name: 'Seedance 2.5',
    description: 'Schat Seedance 2.5 720p 视频生成，支持全能参考',
    resolutions: ['720p'],
    ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
  },
];

const VIDEO_CREDIT_MULTIPLIER = 10;

const VIDEO_UPSTREAM_RESOLUTION_PRICES: Record<VideoModelId, Record<VideoResolution, number>> = {
  'gemini-veo31': { '720p': 10, '1080p': 15 },
  'grok-video': { '720p': 10, '1080p': Number.NaN },
  'seedance2.5': { '720p': 5, '1080p': Number.NaN },
};

const VIDEO_UPSTREAM_DURATION_PRICES: Record<VideoModelId, Partial<Record<VideoDurationSeconds, number>>> = {
  'gemini-veo31': { 4: 5, 6: 10, 8: 15 },
  'grok-video': { 6: 6, 10: 10, 15: 15 },
  'seedance2.5': {
    4: 4, 5: 8, 6: 12, 7: 16, 8: 20, 9: 24, 10: 28, 11: 32, 12: 36,
    13: 40, 14: 44, 15: 48, 16: 52, 17: 56, 18: 60, 19: 64, 20: 68,
    21: 72, 22: 76, 23: 80, 24: 84, 25: 88, 26: 92, 27: 96, 28: 100, 29: 104,
  },
};

export function getVideoModelConfig(modelId: VideoModelId) {
  return VIDEO_GENERATION_MODELS.find((model) => model.id === modelId) || VIDEO_GENERATION_MODELS[0];
}

export function getVideoGenerationCredits(
  modelId: VideoModelId,
  resolution: VideoResolution,
  seconds: VideoDurationSeconds,
) {
  const resolutionPrice = VIDEO_UPSTREAM_RESOLUTION_PRICES[modelId]?.[resolution];
  const durationPrice = VIDEO_UPSTREAM_DURATION_PRICES[modelId]?.[seconds];
  if (!Number.isFinite(resolutionPrice) || !Number.isFinite(durationPrice)) return 0;
  if (modelId === 'seedance2.5') {
    return Math.ceil(((Number(resolutionPrice) + Number(durationPrice)) / 3) * 20);
  }
  return (Number(resolutionPrice) + Number(durationPrice)) * VIDEO_CREDIT_MULTIPLIER;
}

export function supportsVideoConfiguration(
  modelId: VideoModelId,
  resolution: VideoResolution,
  ratio: VideoRatio,
  seconds: VideoDurationSeconds,
) {
  const model = getVideoModelConfig(modelId);
  return model.id === modelId
    && model.resolutions.includes(resolution)
    && model.ratios.includes(ratio)
    && model.durations.includes(seconds);
}
