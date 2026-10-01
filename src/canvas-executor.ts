// 无限画布的执行引擎：拓扑排序 + 节点输入收集 + 参考图转换。
// 与 React 组件解耦的纯逻辑，便于复用与测试；生图请求本身由 CanvasView 编排调用。

import type { Edge, Node } from '@xyflow/react';
import { downloadAsset, type ReferenceUploadInput } from './lib/api';
import type { CanvasNodeData, GenerationNodeData } from './lib/canvas-types';

// 拓扑排序所有 generation 节点：仅 generation→generation 的连线构成顺序依赖。
// 返回按依赖顺序排列的 generation 节点 id；若存在环则抛出错误。
export function topoSortGenerationNodes(nodes: Node<CanvasNodeData>[], edges: Edge[]): string[] {
  const generationIds = nodes
    .filter((node) => node.data.kind === 'generation')
    .map((node) => node.id);

  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const id of generationIds) {
    indegree.set(id, 0);
    adjacency.set(id, []);
  }

  const idSet = new Set(generationIds);
  for (const edge of edges) {
    if (idSet.has(edge.source) && idSet.has(edge.target)) {
      adjacency.get(edge.source)?.push(edge.target);
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    }
  }

  const queue = generationIds.filter((id) => indegree.get(id) === 0);
  const ordered: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }

  if (ordered.length < generationIds.length) {
    const cyclic = generationIds.filter((id) => !ordered.includes(id));
    throw new Error(`画布中存在循环依赖（${cyclic.length} 个生成节点形成闭环），请先断开连线`);
  }

  return ordered;
}

export interface GenerationInputs {
  promptParts: string[];
  referenceUrls: string[];
}

// 收集某 generation 节点的上游输入：
// - 上游 prompt 节点 → 提示词片段
// - 上游 reference 节点 → 参考图 URL
// - 上游 generation 节点（已执行）→ 其结果图 URL 作为参考图
export function collectUpstreamInputs(
  nodeId: string,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
): GenerationInputs {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const promptParts: string[] = [];
  const referenceUrls: string[] = [];

  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const source = nodeById.get(edge.source);
    if (!source) continue;
    const data = source.data;
    if (data.kind === 'prompt') {
      const text = data.text.trim();
      if (text) promptParts.push(text);
    } else if (data.kind === 'reference') {
      if (data.imageUrl) referenceUrls.push(data.imageUrl);
    } else if (data.kind === 'generation') {
      if (data.resultImageUrl) referenceUrls.push(data.resultImageUrl);
    }
  }

  return { promptParts, referenceUrls };
}

// 合成最终提示词：自身提示词在前，上游提示词片段追加在后。
export function composePrompt(ownPrompt: string, promptParts: string[]): string {
  const own = ownPrompt.trim();
  const upstream = promptParts.filter(Boolean).join('，');
  if (!own) return upstream;
  if (!upstream) return own;
  return `${own}。${upstream}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('读取参考图失败'));
    };
    reader.onerror = () => reject(new Error('读取参考图失败'));
    reader.readAsDataURL(blob);
  });
}

// 把一个图片 URL（R2/远程路径或 data URL）转成生图接口要求的 ReferenceUploadInput。
export async function urlToReferenceInput(url: string, name?: string): Promise<ReferenceUploadInput> {
  if (!url) throw new Error('参考图地址无效');

  if (url.startsWith('data:')) {
    const mime = /^data:([^;,]+)/.exec(url)?.[1] || 'image/png';
    const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    return { name: name || `reference.${ext}`, mimeType: mime, data: url };
  }

  const blob = await downloadAsset(url, 'canvas-reference', { save: false });
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('读取参考图失败，请稍后重试');
  }
  const mimeType = blob.type.startsWith('image/') ? blob.type : 'image/png';
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const data = await blobToDataUrl(new Blob([blob], { type: mimeType }));
  return { name: name || `reference.${ext}`, mimeType, data };
}

// 预留：根据节点数据拼出生图请求所需的公共字段（不包含 job 编排）。
export function buildGenerationPayload(nodeData: GenerationNodeData, prompt: string) {
  return {
    prompt,
    model: nodeData.model,
    dimensions: nodeData.dimensions,
    imageSize: nodeData.imageSize,
    quality: nodeData.quality === 'auto' ? undefined : nodeData.quality,
  };
}