// 无限画布的节点、连线与图数据类型。
// 独立于创作页的内部状态，通过 CanvasInfo.data 序列化持久化（阶段 7 接入）。

import type { GeneratedImagePayload } from './api';

export type CanvasDimension =
  | '1:1'
  | '3:2'
  | '16:9'
  | '4:3'
  | '9:16'
  | '3:4'
  | '2:3'
  | '21:9'
  | '5:4'
  | '4:5'
  | '3:1'
  | '1:4';

export type CanvasImageSize = 'STANDARD' | '1K' | '2K' | '4K';
export type CanvasQuality = 'auto' | 'low' | 'medium' | 'high';

export type CanvasNodeKind = 'generation' | 'prompt' | 'reference';

export type GenerationNodeData = {
  kind: 'generation';
  model: string;
  prompt: string;
  dimensions: CanvasDimension;
  imageSize: CanvasImageSize;
  quality: CanvasQuality;
  optimizeChineseText: boolean;
  resultImageUrl?: string;
  // 最近一次成功生成的完整结果元数据，用于收藏/备份/丢弃。
  resultImage?: GeneratedImagePayload;
  status: 'idle' | 'running' | 'done' | 'error';
  error?: string;
};

export type PromptNodeData = {
  kind: 'prompt';
  text: string;
};

export type ReferenceNodeData = {
  kind: 'reference';
  imageUrl: string;
  name?: string;
};

export type CanvasNodeData = GenerationNodeData | PromptNodeData | ReferenceNodeData;

export const DIMENSION_OPTIONS: CanvasDimension[] = [
  '1:1',
  '3:2',
  '16:9',
  '4:3',
  '9:16',
  '3:4',
  '2:3',
  '21:9',
  '5:4',
  '4:5',
  '3:1',
  '1:4',
];

export const IMAGE_SIZE_OPTIONS: { value: CanvasImageSize; label: string }[] = [
  { value: 'STANDARD', label: '标准' },
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

export const QUALITY_OPTIONS: { value: CanvasQuality; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

export const NODE_LABELS: Record<CanvasNodeKind, string> = {
  generation: '生成',
  prompt: '提示词',
  reference: '参考图',
};

// 连线端口标识：target 端统一为「输入」，source 端统一为「输出」。
export const CANVAS_TARGET_HANDLE = 'input';
export const CANVAS_SOURCE_HANDLE = 'output';

// 仅 generation 节点可作为连线目标（接收提示词/参考图/上游生成结果）；
// prompt / reference / generation 均可作为连线源。
export function isCanvasTarget(kind: CanvasNodeKind): boolean {
  return kind === 'generation';
}