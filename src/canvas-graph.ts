// 无限画布的连线校验与拓扑序列化。
// 依赖 @xyflow/react 的运行时类型，独立于 React 组件，便于单元测试与阶段 7 的持久化复用。

import type { Connection, Edge, Node } from '@xyflow/react';
import type { CanvasNodeData, CanvasNodeKind } from './lib/canvas-types';
import { isCanvasTarget } from './lib/canvas-types';

// 校验一次连线是否合法：
// - 必须有源/目标
// - 禁止自环
// - 目标节点必须是 generation（prompt/reference 无 target 端口）
// - 禁止完全重复的连线（同源同目标）
export function canConnectCanvas(
  connection: Connection | Edge,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
): boolean {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;

  const targetNode = nodes.find((node) => node.id === connection.target);
  if (!targetNode) return false;
  if (!isCanvasTarget((targetNode.type as CanvasNodeKind) ?? 'generation')) return false;

  const duplicated = edges.some(
    (edge) => edge.source === connection.source && edge.target === connection.target,
  );
  if (duplicated) return false;

  return true;
}

// —— 拓扑序列化：把 React Flow 运行时的 nodes/edges 转成可 JSON 持久化的纯数据 ——

export interface SerializedCanvasNode {
  id: string;
  type: CanvasNodeKind;
  position: { x: number; y: number };
  data: CanvasNodeData;
}

export interface SerializedCanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

export interface SerializedCanvasGraph {
  nodes: SerializedCanvasNode[];
  edges: SerializedCanvasEdge[];
}

export function serializeCanvas(nodes: Node<CanvasNodeData>[], edges: Edge[]): SerializedCanvasGraph {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: (node.type as CanvasNodeKind) ?? 'generation',
      position: { x: node.position.x, y: node.position.y },
      data: node.data,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    })),
  };
}

// 把持久化的图数据还原为 React Flow 的 nodes/edges；对非法字段做宽松兜底。
export function deserializeCanvas(graph: SerializedCanvasGraph | null | undefined): {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
} {
  if (!graph) return { nodes: [], edges: [] };

  const nodes: Node<CanvasNodeData>[] = Array.isArray(graph.nodes)
    ? graph.nodes
        .filter((item) => item && typeof item.id === 'string' && item.data)
        .map((item) => ({
          id: item.id,
          type: item.type,
          position: { x: item.position?.x ?? 0, y: item.position?.y ?? 0 },
          data: item.data,
        }))
    : [];

  const edges: Edge[] = Array.isArray(graph.edges)
    ? graph.edges
        .filter((item) => item && typeof item.source === 'string' && typeof item.target === 'string')
        .map((item) => ({
          id: item.id,
          source: item.source,
          target: item.target,
          sourceHandle: item.sourceHandle ?? undefined,
          targetHandle: item.targetHandle ?? undefined,
        }))
    : [];

  return { nodes, edges };
}