export type VideoModelId = 'gemini-veo31' | 'firefly-video';
export type VideoResolution = '720p' | '1080p';
export type VideoRatio = '16:9' | '1:1' | '9:16';
export type VideoDurationSeconds = 4 | 5 | 6 | 8;

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
    id: 'firefly-video',
    name: 'Firefly Video',
    description: 'Adobe Firefly 视频生成',
    resolutions: ['720p', '1080p'],
    ratios: ['16:9', '1:1', '9:16'],
    durations: [5],
  },
];

const VIDEO_CREDIT_MULTIPLIER = 10;

const VIDEO_UPSTREAM_RESOLUTION_PRICES: Record<VideoModelId, Record<VideoResolution, number>> = {
  'gemini-veo31': { '720p': 10, '1080p': 15 },
  'firefly-video': { '720p': 15, '1080p': 20 },
};

const VIDEO_UPSTREAM_DURATION_PRICES: Record<VideoModelId, Partial<Record<VideoDurationSeconds, number>>> = {
  'gemini-veo31': { 4: 5, 6: 10, 8: 15 },
  'firefly-video': { 5: 15 },
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
