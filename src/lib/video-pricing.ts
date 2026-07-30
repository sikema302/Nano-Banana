export type VideoResolution = '720p' | '1080p';

export const VIDEO_GENERATION_CREDITS: Record<VideoResolution, number> = {
  '720p': 150,
  '1080p': 175,
};

export function getVideoGenerationCredits(resolution: VideoResolution) {
  return VIDEO_GENERATION_CREDITS[resolution];
}
