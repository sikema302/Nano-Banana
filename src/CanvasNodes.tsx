import { createContext, useContext, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { Archive, Heart, ImageIcon, Sparkles, Trash2, Type as TypeIcon, Upload, X } from 'lucide-react';
import type { GeneratedImagePayload, ImageCategory, ModelInfo } from './lib/api';
import type {
  CanvasNodeData,
  GenerationNodeData,
  PromptNodeData,
  ReferenceNodeData,
} from './lib/canvas-types';
import {
  CANVAS_SOURCE_HANDLE,
  CANVAS_TARGET_HANDLE,
  DIMENSION_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  QUALITY_OPTIONS,
} from './lib/canvas-types';

// 提供可选模型列表给节点组件；由 CanvasView 注入，避免在每个节点 data 里冗余存模型表。
export const CanvasModelsContext = createContext<ModelInfo[]>([]);

// 提供「收藏 / 备份 / 丢弃」能力给生成节点；由 CanvasView 注入，最终落到 App 的现有分类区。
export const CanvasSaveContext = createContext<{
  saveImage?: (image: GeneratedImagePayload, category: ImageCategory) => Promise<boolean>;
}>({});

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

const fieldClass =
  'w-full rounded-md border border-white/10 bg-[#1c1c2a] px-2 py-1.5 text-[12px] text-zinc-200 outline-none focus:border-violet-400/50 [&>option]:bg-[#1c1c2a]';
const labelClass = 'block text-[10px] font-bold uppercase tracking-wide text-zinc-500';

function GenerationNode({ id, data }: NodeProps<Node<GenerationNodeData>>) {
  const models = useContext(CanvasModelsContext);
  const { saveImage } = useContext(CanvasSaveContext);
  const { updateNodeData, deleteElements } = useReactFlow();
  const modelName = models.find((item) => item.id === data.model)?.name ?? data.model;

  async function saveTo(category: ImageCategory) {
    if (!data.resultImage) return;
    try {
      await saveImage?.(data.resultImage, category);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '保存失败');
    }
  }

  return (
    <div className="w-64 rounded-xl border border-violet-400/25 bg-[#141420] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <Handle id={CANVAS_TARGET_HANDLE} type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-[#0b0b10] !bg-violet-400" />
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[12px] font-black text-violet-200">
          <Sparkles size={13} />
          生成节点
        </span>
        <button
          type="button"
          className="text-zinc-600 transition hover:text-red-400"
          onClick={() => deleteElements({ nodes: [{ id }] })}
          aria-label="删除节点"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-2 p-3">
        <div>
          <label className={labelClass}>提示词</label>
          <textarea
            className={`${fieldClass} min-h-[60px] resize-y`}
            value={data.prompt}
            placeholder="描述你想生成的画面…"
            onChange={(event) => updateNodeData(id, { prompt: event.target.value })}
          />
        </div>

        <div>
          <label className={labelClass}>模型 · {modelName}</label>
          <select
            className={fieldClass}
            value={data.model}
            onChange={(event) => updateNodeData(id, { model: event.target.value })}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelClass}>比例</label>
            <select
              className={fieldClass}
              value={data.dimensions}
              onChange={(event) => updateNodeData(id, { dimensions: event.target.value as GenerationNodeData['dimensions'] })}
            >
              {DIMENSION_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>清晰度</label>
            <select
              className={fieldClass}
              value={data.imageSize}
              onChange={(event) => updateNodeData(id, { imageSize: event.target.value as GenerationNodeData['imageSize'] })}
            >
              {IMAGE_SIZE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>质量</label>
            <select
              className={fieldClass}
              value={data.quality}
              onChange={(event) => updateNodeData(id, { quality: event.target.value as GenerationNodeData['quality'] })}
            >
              {QUALITY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {data.status === 'running' ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-violet-400/20 bg-violet-400/5 py-3 text-[11px] text-violet-300">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-300" />
            生成中…
          </div>
        ) : data.status === 'error' ? (
          <div className="rounded-lg border border-red-400/20 bg-red-400/5 px-2 py-2 text-[11px] leading-5 text-red-300">
            {data.error || '生成失败'}
          </div>
        ) : data.status === 'done' && data.resultImageUrl ? (
          <div className="space-y-2">
            <img src={data.resultImageUrl} alt="生成结果" className="w-full rounded-lg border border-white/10" />
            {data.resultImage ? (
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  className="flex items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-1 py-1.5 text-[11px] font-bold text-zinc-300 transition hover:border-rose-400/40 hover:text-rose-300"
                  onClick={() => saveTo('favorite')}
                >
                  <Heart size={11} /> 收藏
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-1 py-1.5 text-[11px] font-bold text-zinc-300 transition hover:border-amber-400/40 hover:text-amber-300"
                  onClick={() => saveTo('backup')}
                >
                  <Archive size={11} /> 备份
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-1 py-1.5 text-[11px] font-bold text-zinc-300 transition hover:border-zinc-400/40 hover:text-zinc-400"
                  onClick={() => saveTo('discarded')}
                >
                  <Trash2 size={11} /> 丢弃
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Handle id={CANVAS_SOURCE_HANDLE} type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-[#0b0b10] !bg-violet-400" />
    </div>
  );
}

function PromptNode({ id, data }: NodeProps<Node<PromptNodeData>>) {
  const { updateNodeData, deleteElements } = useReactFlow();
  return (
    <div className="w-56 rounded-xl border border-white/10 bg-[#141420] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[12px] font-black text-amber-200">
          <TypeIcon size={13} />
          提示词节点
        </span>
        <button
          type="button"
          className="text-zinc-600 transition hover:text-red-400"
          onClick={() => deleteElements({ nodes: [{ id }] })}
          aria-label="删除节点"
        >
          <X size={14} />
        </button>
      </div>
      <div className="p-3">
        <textarea
          className={`${fieldClass} min-h-[48px] resize-y`}
          value={data.text}
          placeholder="作为上游提示词，连接到生成节点…"
          onChange={(event) => updateNodeData(id, { text: event.target.value })}
        />
      </div>
      <Handle id={CANVAS_SOURCE_HANDLE} type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-[#0b0b10] !bg-amber-400" />
    </div>
  );
}

function ReferenceNode({ id, data }: NodeProps<Node<ReferenceNodeData>>) {
  const { updateNodeData, deleteElements } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draftUrl, setDraftUrl] = useState('');

  async function onFileChange(event: { target: HTMLInputElement }) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('请选择图片文件');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      window.alert('图片超过 25MB，请压缩后再上传');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateNodeData(id, { imageUrl: dataUrl, name: file.name });
    } catch {
      window.alert('读取图片失败');
    }
  }

  function applyUrl() {
    const value = draftUrl.trim();
    if (!value) return;
    updateNodeData(id, { imageUrl: value, name: value.split('/').pop() || '图片' });
    setDraftUrl('');
  }

  return (
    <div className="w-52 rounded-xl border border-white/10 bg-[#141420] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[12px] font-black text-sky-200">
          <ImageIcon size={13} />
          参考图节点
        </span>
        <button
          type="button"
          className="text-zinc-600 transition hover:text-red-400"
          onClick={() => deleteElements({ nodes: [{ id }] })}
          aria-label="删除节点"
        >
          <X size={14} />
        </button>
      </div>
      <div className="space-y-2 p-2">
        {data.imageUrl ? (
          <img src={data.imageUrl} alt={data.name ?? '参考图'} className="w-full rounded-lg border border-white/10 object-cover" />
        ) : (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-white/10 text-[11px] text-zinc-600">
            尚未选择参考图
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <input
            className={fieldClass}
            placeholder="粘贴图片 URL…"
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applyUrl();
            }}
          />
          <button
            type="button"
            className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] font-bold text-zinc-300 transition hover:bg-white/[0.1]"
            onClick={applyUrl}
          >
            设置
          </button>
        </div>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-white/15 bg-white/[0.02] px-2 py-1.5 text-[11px] font-bold text-zinc-400 transition hover:text-zinc-200"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={12} />
          上传本地图片
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      </div>
      <Handle id={CANVAS_SOURCE_HANDLE} type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-[#0b0b10] !bg-sky-400" />
    </div>
  );
}

export const canvasNodeTypes = {
  generation: GenerationNode,
  prompt: PromptNode,
  reference: ReferenceNode,
};

export type { CanvasNodeData };