import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  LogIn,
  ImageIcon,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Workflow,
} from 'lucide-react';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  createCanvas,
  deleteCanvas,
  fetchCanvases,
  fetchGenerateImageJob,
  startGenerateImageJob,
  updateCanvas,
  type CanvasInfo,
  type GeneratedImagePayload,
  type GenerationJobInfo,
  type ImageCategory,
  type ModelInfo,
  type ReferenceUploadInput,
  type UserInfo,
} from './lib/api';
import type { CanvasNodeData, CanvasNodeKind, GenerationNodeData } from './lib/canvas-types';
import { NODE_LABELS } from './lib/canvas-types';
import { canConnectCanvas, deserializeCanvas, serializeCanvas, type SerializedCanvasGraph } from './canvas-graph';
import {
  buildGenerationPayload,
  collectUpstreamInputs,
  composePrompt,
  topoSortGenerationNodes,
  urlToReferenceInput,
} from './canvas-executor';
import { getAiEnhancementRequestFlags } from './lib/image-generation-flags';
import { CanvasModelsContext, CanvasSaveContext, canvasNodeTypes } from './CanvasNodes';

const CANVAS_JOB_POLL_INTERVAL_MS = 2000;
const CANVAS_JOB_POLL_MAX_MS = 6 * 60_000;
const CANVAS_AUTOSAVE_DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function pollCanvasJob(jobId: string): Promise<GenerationJobInfo> {
  const deadline = Date.now() + CANVAS_JOB_POLL_MAX_MS;
  let job = (await fetchGenerateImageJob(jobId)).job;
  while (job.status !== 'succeeded' && job.status !== 'failed') {
    if (Date.now() > deadline) throw new Error('生成超时，请稍后重试');
    await sleep(CANVAS_JOB_POLL_INTERVAL_MS);
    try {
      job = (await fetchGenerateImageJob(jobId)).job;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      // 网络/网关抖动不意味着失败，继续轮询。
    }
  }
  return job;
}

interface CanvasViewProps {
  user: UserInfo | null;
  onLogin: () => void;
  models: ModelInfo[];
  onCreditsChange?: (creditsRemaining: number) => void;
  onGenerationComplete?: () => void;
  onSaveImage?: (image: GeneratedImagePayload, category: ImageCategory) => Promise<boolean>;
}

type SaveState = 'saved' | 'dirty' | 'saving';

const defaultNodes: Node<CanvasNodeData>[] = [
  {
    id: 'generation-1',
    type: 'generation',
    position: { x: 80, y: 60 },
    data: {
      kind: 'generation',
      model: 'gpt-image-2',
      prompt: '',
      dimensions: '1:1',
      imageSize: 'STANDARD',
      quality: 'auto',
      optimizeChineseText: false,
      status: 'idle',
    },
  },
];

function NodePalette({ onAdd }: { onAdd: (kind: CanvasNodeKind) => void }) {
  const items: { kind: CanvasNodeKind; icon: typeof Sparkles; label: string; className: string }[] = [
    { kind: 'generation', icon: Sparkles, label: NODE_LABELS.generation, className: 'text-violet-300' },
    { kind: 'prompt', icon: TypeIcon, label: NODE_LABELS.prompt, className: 'text-amber-300' },
    { kind: 'reference', icon: ImageIcon, label: NODE_LABELS.reference, className: 'text-sky-300' },
  ];

  return (
    <div className="absolute left-3 top-3 z-10 flex flex-col gap-2 rounded-xl border border-white/10 bg-[#141420]/95 p-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur">
      <span className="px-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">添加节点</span>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.kind}
            type="button"
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[12px] font-bold text-zinc-200 transition hover:bg-white/[0.08] hover:text-white"
            onClick={() => onAdd(item.kind)}
          >
            <Icon size={14} className={item.className} />
            {item.label}节点
          </button>
        );
      })}
    </div>
  );
}

interface CanvasInnerProps {
  models: ModelInfo[];
  canvasId: string | null;
  initialGraph: SerializedCanvasGraph | null;
  onCreditsChange?: (creditsRemaining: number) => void;
  onGenerationComplete?: () => void;
  onSaveImage?: (image: GeneratedImagePayload, category: ImageCategory) => Promise<boolean>;
  onSaveState?: (state: SaveState) => void;
  registerFlush?: (flush: (() => void) | null) => void;
}

function CanvasInner({
  models,
  canvasId,
  initialGraph,
  onCreditsChange,
  onGenerationComplete,
  onSaveImage,
  onSaveState,
  registerFlush,
}: CanvasInnerProps) {
  const initial = useMemo(() => deserializeCanvas(initialGraph), [initialGraph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CanvasNodeData>>(
    initial.nodes.length > 0 ? initial.nodes : defaultNodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow<Node<CanvasNodeData>, Edge>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(0);
  const clipboardRef = useRef<Node<CanvasNodeData>[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const runningRef = useRef(false);

  // —— 自动保存：跟踪 nodes/edges 变化，防抖写入服务端 ——
  const latestGraphRef = useRef<{ nodes: Node<CanvasNodeData>[]; edges: Edge[] }>({ nodes, edges });
  const dirtyRef = useRef(false);
  const firstRunRef = useRef(true);
  const saveTimerRef = useRef<number | null>(null);
  const canvasIdRef = useRef(canvasId);

  useEffect(() => {
    latestGraphRef.current = { nodes, edges };
  }, [nodes, edges]);

  useEffect(() => {
    canvasIdRef.current = canvasId;
  }, [canvasId]);

  const flushSave = useCallback(async () => {
    if (!dirtyRef.current) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const id = canvasIdRef.current;
    if (!id) return;
    onSaveState?.('saving');
    try {
      await updateCanvas(id, {
        data: serializeCanvas(latestGraphRef.current.nodes, latestGraphRef.current.edges),
      });
      dirtyRef.current = false;
      onSaveState?.('saved');
    } catch {
      onSaveState?.('dirty');
    }
  }, [onSaveState]);

  useEffect(() => {
    if (!canvasId) return;
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    dirtyRef.current = true;
    onSaveState?.('dirty');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void flushSave();
    }, CANVAS_AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [nodes, edges, canvasId, flushSave, onSaveState]);

  useEffect(() => {
    registerFlush?.(() => {
      void flushSave();
    });
    return () => {
      registerFlush?.(null);
      void flushSave();
    };
  }, [registerFlush, flushSave]);

  const nodeTypes = useMemo(() => canvasNodeTypes, []);

  const markGenerationData = useCallback(
    (id: string, patch: Partial<GenerationNodeData>) => {
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== id || node.data.kind !== 'generation') return node;
          return { ...node, data: { ...node.data, ...patch } };
        }),
      );
    },
    [setNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => setEdges((current) => addEdge(connection, current)),
    [setEdges],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => canConnectCanvas(connection, getNodes(), edges),
    [getNodes, edges],
  );

  const defaultEdgeOptions = useMemo(
    () => ({ style: { stroke: 'var(--primary)', strokeWidth: 2 } }),
    [],
  );

  function addNode(kind: CanvasNodeKind) {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const center = screenToFlowPosition({
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
    });

    const id = `${kind}-${Date.now()}-${counterRef.current++}`;
    const position = { x: center.x - 100, y: center.y - 40 };

    const node: Node<CanvasNodeData> =
      kind === 'generation'
        ? {
            id,
            type: 'generation',
            position,
            data: {
              kind: 'generation',
              model: 'gpt-image-2',
              prompt: '',
              dimensions: '1:1',
              imageSize: 'STANDARD',
              quality: 'auto',
              optimizeChineseText: false,
              status: 'idle',
            },
          }
        : kind === 'prompt'
          ? { id, type: 'prompt', position, data: { kind: 'prompt', text: '' } }
          : { id, type: 'reference', position, data: { kind: 'reference', imageUrl: '' } };

    setNodes((current) => current.concat(node));
  }

  async function runCanvas(nodeIds?: string[]) {
    if (runningRef.current) return;

    const currentNodes = getNodes();
    const currentEdges = getEdges();
    const scoped = nodeIds ? new Set(nodeIds) : null;
    const generationNodes = currentNodes.filter((node) => node.data.kind === 'generation');
    if (generationNodes.length === 0) {
      window.alert('画布上还没有生成节点，请先从左侧添加');
      return;
    }
    if (scoped && generationNodes.every((node) => !scoped.has(node.id))) {
      window.alert('没有选中生成节点，请先点选或框选生成节点');
      return;
    }

    let order: string[];
    try {
      order = topoSortGenerationNodes(currentNodes, currentEdges);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '执行失败');
      return;
    }
    if (scoped) order = order.filter((id) => scoped.has(id));

    runningRef.current = true;
    setIsRunning(true);

    try {
      for (const nodeId of order) {
        const node = getNodes().find((item) => item.id === nodeId);
        if (!node || node.data.kind !== 'generation') continue;
        if (node.data.status === 'done' && node.data.resultImageUrl) continue;

        markGenerationData(nodeId, { status: 'running', error: undefined });
        try {
          const inputs = collectUpstreamInputs(nodeId, getNodes(), getEdges());
          const prompt = composePrompt(node.data.prompt, inputs.promptParts);
          if (!prompt.trim()) {
            throw new Error('提示词为空，请填写提示词或连接提示词节点');
          }

          const references: ReferenceUploadInput[] = [];
          for (const url of inputs.referenceUrls) {
            references.push(await urlToReferenceInput(url));
          }

          const { job } = await startGenerateImageJob({
            ...buildGenerationPayload(node.data, prompt),
            ...getAiEnhancementRequestFlags(
              node.data.model === 'Nano_Banana_Pro' ? node.data.optimizeChineseText : false,
            ),
            reference_images: references,
          });

          const finalJob =
            job.status === 'succeeded' || job.status === 'failed' ? job : await pollCanvasJob(job.id);

          if (finalJob.creditsRemaining != null) onCreditsChange?.(finalJob.creditsRemaining);

          if (finalJob.status === 'succeeded' && finalJob.image) {
            markGenerationData(nodeId, {
              status: 'done',
              resultImageUrl: finalJob.image.imagePath,
              resultImage: finalJob.image,
            });
          } else {
            throw new Error(finalJob.error || '生成失败');
          }
        } catch (error) {
          markGenerationData(nodeId, {
            status: 'error',
            error: error instanceof Error ? error.message : '生成失败',
          });
        }
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
      onGenerationComplete?.();
    }
  }

  function runSelected() {
    const selectedGen = getNodes()
      .filter((node) => node.selected && node.data.kind === 'generation')
      .map((node) => node.id);
    void runCanvas(selectedGen);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isEditing) return;

      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      if (event.key.toLowerCase() === 'c') {
        const selected = getNodes().filter((node) => node.selected);
        if (selected.length === 0) return;
        clipboardRef.current = selected.map((node) => ({ ...node, data: { ...node.data } }));
      } else if (event.key.toLowerCase() === 'v') {
        if (clipboardRef.current.length === 0) return;
        event.preventDefault();
        const pasted = clipboardRef.current.map((node) => {
          const data: CanvasNodeData =
            node.data.kind === 'generation'
              ? {
                  ...node.data,
                  status: 'idle',
                  error: undefined,
                  resultImageUrl: undefined,
                  resultImage: undefined,
                }
              : { ...node.data };
          return {
            ...node,
            id: `${node.type ?? 'node'}-${Date.now()}-${counterRef.current++}`,
            position: { x: node.position.x + 24, y: node.position.y + 24 },
            selected: true,
            data,
          };
        });
        setNodes((current) => [
          ...current.map((node) => (node.selected ? { ...node, selected: false } : node)),
          ...pasted,
        ]);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [getNodes, setNodes]);

  return (
    <CanvasSaveContext.Provider value={{ saveImage: onSaveImage }}>
      <CanvasModelsContext.Provider value={models}>
        <NodePalette onAdd={addNode} />
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#141420]/95 px-3 py-2.5 text-[12px] font-bold text-zinc-200 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={runSelected}
            disabled={isRunning}
            title="仅运行选中的生成节点"
          >
            <Play size={14} />
            运行选中
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-violet-400/30 bg-[#141420]/95 px-4 py-2.5 text-[12px] font-bold text-violet-200 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur transition hover:bg-violet-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void runCanvas()}
            disabled={isRunning}
          >
            {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {isRunning ? '运行中…' : '运行画布'}
          </button>
        </div>
        <div ref={wrapperRef} className="h-full w-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            defaultEdgeOptions={defaultEdgeOptions}
            nodeTypes={nodeTypes}
            colorMode="dark"
            fitView
            fitViewOptions={{ maxZoom: 1 }}
            panOnScroll
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
            <Controls />
            <MiniMap nodeColor="#5f5ac7" pannable zoomable />
          </ReactFlow>
        </div>
      </CanvasModelsContext.Provider>
    </CanvasSaveContext.Provider>
  );
}

export default function CanvasView({ user, onLogin, models, onCreditsChange, onGenerationComplete, onSaveImage }: CanvasViewProps) {
  const [canvases, setCanvases] = useState<CanvasInfo[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState('未命名画布');
  const [nameDraft, setNameDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const flushRef = useRef<(() => void) | null>(null);

  const registerFlush = useCallback((flush: (() => void) | null) => {
    flushRef.current = flush;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { canvases: list } = await fetchCanvases();
        if (cancelled) return;
        if (list.length > 0) {
          setCanvases(list);
          setActiveCanvasId(list[0].id);
          setActiveName(list[0].name);
          setNameDraft(list[0].name);
        } else {
          const { canvas } = await createCanvas('未命名画布');
          if (cancelled) return;
          if (canvas) {
            setCanvases([canvas]);
            setActiveCanvasId(canvas.id);
            setActiveName(canvas.name);
            setNameDraft(canvas.name);
          }
        }
      } catch {
        // 未登录或网络异常：保持空列表
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeGraph = useMemo(() => {
    const canvas = canvases.find((item) => item.id === activeCanvasId);
    const data = canvas?.data;
    if (data && typeof data === 'object' && 'nodes' in data && 'edges' in data) {
      return data as SerializedCanvasGraph;
    }
    return null;
  }, [canvases, activeCanvasId]);

  function switchCanvas(id: string) {
    if (id === activeCanvasId) return;
    flushRef.current?.();
    const canvas = canvases.find((item) => item.id === id);
    setActiveCanvasId(id);
    setActiveName(canvas?.name ?? '未命名画布');
    setNameDraft(canvas?.name ?? '未命名画布');
    setSaveState('saved');
  }

  async function handleNewCanvas() {
    flushRef.current?.();
    try {
      const { canvas } = await createCanvas('未命名画布');
      if (!canvas) return;
      setCanvases((current) => [canvas, ...current]);
      setActiveCanvasId(canvas.id);
      setActiveName(canvas.name);
      setNameDraft(canvas.name);
      setSaveState('saved');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '新建画布失败');
    }
  }

  async function handleDeleteCanvas() {
    if (!activeCanvasId) return;
    if (!window.confirm('确定删除当前画布？此操作不可恢复。')) return;
    try {
      await deleteCanvas(activeCanvasId);
      const remaining = canvases.filter((item) => item.id !== activeCanvasId);
      if (remaining.length > 0) {
        setCanvases(remaining);
        setActiveCanvasId(remaining[0].id);
        setActiveName(remaining[0].name);
        setNameDraft(remaining[0].name);
      } else {
        const { canvas } = await createCanvas('未命名画布');
        if (canvas) {
          setCanvases([canvas]);
          setActiveCanvasId(canvas.id);
          setActiveName(canvas.name);
          setNameDraft(canvas.name);
        } else {
          setCanvases([]);
          setActiveCanvasId(null);
        }
      }
      setSaveState('saved');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '删除画布失败');
    }
  }

  async function commitRename() {
    const nextName = nameDraft.trim() || '未命名画布';
    if (!activeCanvasId || nextName === activeName) {
      setNameDraft(activeName);
      return;
    }
    try {
      await updateCanvas(activeCanvasId, { name: nextName });
      setActiveName(nextName);
      setCanvases((current) => current.map((item) => (item.id === activeCanvasId ? { ...item, name: nextName } : item)));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '重命名失败');
      setNameDraft(activeName);
    }
  }

  if (!user) {
    return (
      <section className="flex h-full min-h-0 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-400/25 bg-[linear-gradient(135deg,rgba(139,92,246,0.18),rgba(99,102,241,0.13))] text-violet-100">
          <Workflow size={26} />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-black text-white">无限画布</h2>
          <p className="max-w-sm text-sm leading-6 text-zinc-400">
            在无限画布上排布生成节点，连接提示词与参考图，链式完成多步生图。登录后即可使用。
          </p>
        </div>
        <button
          className="btn-primary mt-1 min-w-36 justify-center gap-2 px-5 py-2.5 text-sm font-bold"
          type="button"
          onClick={onLogin}
        >
          <LogIn size={16} />
          登录
        </button>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/8 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Workflow size={16} className="text-violet-300" />
          <span className="text-sm font-bold text-zinc-100">无限画布</span>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-white/10 bg-[#141420] px-2 py-1.5 text-[12px] text-zinc-200 outline-none focus:border-violet-400/50 [&>option]:bg-[#141420]"
            value={activeCanvasId ?? ''}
            onChange={(event) => switchCanvas(event.target.value)}
            disabled={loading || canvases.length === 0}
          >
            {canvases.map((canvas) => (
              <option key={canvas.id} value={canvas.id}>
                {canvas.name}
              </option>
            ))}
          </select>

          <input
            className="w-32 rounded-lg border border-white/10 bg-[#141420] px-2 py-1.5 text-[12px] text-zinc-200 outline-none focus:border-violet-400/50"
            value={nameDraft}
            placeholder="画布名称"
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            }}
          />

          <button
            type="button"
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[12px] font-bold text-zinc-200 transition hover:bg-white/[0.08]"
            onClick={handleNewCanvas}
            title="新建画布"
          >
            <Plus size={14} />
            新建
          </button>

          <button
            type="button"
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[12px] font-bold text-zinc-200 transition hover:border-red-400/40 hover:text-red-300"
            onClick={handleDeleteCanvas}
            disabled={!activeCanvasId}
            title="删除画布"
          >
            <Trash2 size={14} />
          </button>

          <span className="min-w-14 text-right text-[11px] text-zinc-500">
            {saveState === 'saving' ? (
              <span className="inline-flex items-center gap-1 text-zinc-400">
                <Loader2 size={11} className="animate-spin" />
                保存中
              </span>
            ) : saveState === 'dirty' ? (
              <span className="text-amber-400">未保存</span>
            ) : (
              <span>已保存</span>
            )}
          </span>
        </div>
      </div>

      <div className="relative min-h-[60vh] flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={20} className="animate-spin text-zinc-500" />
          </div>
        ) : (
          <ReactFlowProvider>
            <Fragment key={activeCanvasId ?? 'empty'}>
              <CanvasInner
                models={models}
                canvasId={activeCanvasId}
                initialGraph={activeGraph}
                onCreditsChange={onCreditsChange}
                onGenerationComplete={onGenerationComplete}
                onSaveImage={onSaveImage}
                onSaveState={setSaveState}
                registerFlush={registerFlush}
              />
            </Fragment>
          </ReactFlowProvider>
        )}
      </div>
    </section>
  );
}