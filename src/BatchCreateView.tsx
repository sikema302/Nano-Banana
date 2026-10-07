import { type ChangeEvent, type DragEvent, useMemo, useState } from 'react';
import {
  ArrowRight,
  Download,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import PromptTemplates from './PromptTemplates';
import {
  downloadAsset,
  fetchGenerateImageJob,
  fetchMe,
  startGenerateImageJob,
  type GeneratedImagePayload,
  type GenerationJobInfo,
  type ModelInfo,
  type ProviderRoutingConfig,
  type ReferenceUploadInput,
  type UserInfo,
} from './lib/api';
import type { GptImagePricing } from './lib/model-pricing';
import { getConfiguredImageCredits, type ModelCreditPricing } from './lib/model-credit-config';
import { getAiEnhancementRequestFlags } from './lib/image-generation-flags';
import {
  MAX_GPT_IMAGE_25_REFERENCE_IMAGES,
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_REFERENCE_IMAGE_MB,
  MAX_REFERENCE_IMAGES,
} from './lib/reference-image-limits';

type BatchMode = 'cards' | 'unified' | 'multiple';
type ImageSize = 'STANDARD' | '1K' | '2K' | '4K';
type ImageQuality = 'auto' | 'low' | 'medium' | 'high';
type TaskStatus = 'waiting' | 'processing' | 'succeeded' | 'failed';

interface UploadItem extends ReferenceUploadInput {
  id: string;
  previewUrl: string;
}

interface PromptItem {
  id: string;
  value: string;
}

interface BatchTask {
  id: string;
  sourceId?: string;
  prompt: string;
  sourceLabel: string;
  status: TaskStatus;
  progress: number;
  image?: GeneratedImagePayload;
  error?: string;
}

interface TaskCardData {
  id: string;
  references: UploadItem[];
  prompt: string;
  count: number;
  priorityAspect: string;
  status: TaskStatus;
  progress: number;
  results: GeneratedImagePayload[];
  error?: string;
}

interface BatchCreateViewProps {
  user: UserInfo | null;
  models: ModelInfo[];
  gptImagePricing: GptImagePricing;
  modelCreditPricing: ModelCreditPricing;
  providerRouting: ProviderRoutingConfig;
  onLogin: () => void;
  onPurchase: () => void;
  onCreditsChange: (creditsRemaining: number) => void;
  onGenerationComplete: () => void;
}

const MAX_UNIFIED_IMAGES = 10;
const MAX_GROUP_IMAGES = MAX_REFERENCE_IMAGES;
const MAX_EXTRA_REFERENCES = MAX_REFERENCE_IMAGES - 1;
const MAX_PROMPTS = 6;
const MAX_PROMPT_LENGTH = 8000;
const MAX_FILE_BYTES = MAX_REFERENCE_IMAGE_BYTES;
const POLL_INTERVAL_MS = 2000;
const MAX_TASK_CARDS = 30;
const MAX_CARD_COUNT = 10;

// 后端 /api/generate/jobs 的比例白名单（auto 仅 gpt-image-2 生效，其余模型会回退 1:1）。
const aspectOptions = ['auto', '1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9'] as const;
type Aspect = (typeof aspectOptions)[number];

// GPT-image-2.5 各档位支持的比例如下（源自 junliai 文档模型目录，与 App.tsx 中的定义保持同步）
const GPT_IMAGE_2_5_RATIO_OPTIONS: Record<string, Record<string, string[]>> = {
  'GPT-image-2.5-Flare': {
    '1K': ['1:1', '16:9', '9:16', '5:4', '4:3', '3:2', '4:5', '3:4'],
    '2K': ['1:1', '16:9', '9:16', '4:3', '3:2', '3:4', '2:3'],
    '4K': ['1:1', '16:9', '9:16', '4:3', '3:2', '3:4', '2:3'],
  },
  'GPT-image-2.5-Sunburst': {
    '1K': ['1:1', '16:9', '9:16', '4:3', '21:9', '3:1', '4:5', '3:4', '1:4'],
    '2K': ['1:1', '16:9', '9:16', '5:4', '4:3', '3:2', '3:1', '3:4'],
    '4K': ['1:1', '16:9', '9:16', '5:4', '4:3', '3:2', '3:1', '3:4'],
  },
};
const qualityOptions: Array<{ value: ImageQuality; label: string }> = [
  { value: 'auto', label: 'auto' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createPromptItem(value = ''): PromptItem {
  return { id: makeId('prompt'), value };
}

function createTaskCard(): TaskCardData {
  return {
    id: makeId('card'),
    references: [],
    prompt: '',
    count: 1,
    priorityAspect: '',
    status: 'waiting',
    progress: 0,
    results: [],
  };
}

function readImage(file: File) {
  return new Promise<UploadItem>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('图片读取失败'));
        return;
      }
      resolve({
        id: makeId('upload'),
        name: file.name,
        mimeType: file.type || 'image/png',
        data: reader.result,
        previewUrl: reader.result,
      });
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function taskProgress(job: GenerationJobInfo, startedAt: number) {
  if (job.status === 'succeeded') return 100;
  const elapsed = Math.max(0, Date.now() - startedAt) / 1000;
  const fallback = elapsed < 20 ? 8 + elapsed * 1.4 : 36 + (1 - Math.exp(-(elapsed - 20) / 90)) * 58;
  return Math.max(6, Math.min(96, Math.round(Math.max(job.progress || 0, fallback))));
}

function getCredits(
  model: ModelInfo | undefined,
  imageSize: ImageSize,
  quality: ImageQuality,
  optimizeChineseText: boolean,
  pricing: GptImagePricing,
  modelCreditPricing: ModelCreditPricing,
) {
  if (!model) return 0;
  if (model.id === 'gpt-image-2'
    || model.id === 'GPT-image-2.5-Flare'
    || model.id === 'GPT-image-2.5-Sunburst') {
    return getConfiguredImageCredits(modelCreditPricing, model.id, imageSize, quality);
  }
  if (model.id === 'Nano_Banana_Pro') {
    const base = getConfiguredImageCredits(modelCreditPricing, model.id, imageSize, quality);
    const enhancementCredits = optimizeChineseText
      ? imageSize === '1K' || imageSize === '2K' || imageSize === '4K'
        ? modelCreditPricing.nanoBanana.enhancement
        : 0
      : 0;
    return base + enhancementCredits;
  }
  return typeof model.creditsCost === 'number' ? model.creditsCost : 1;
}

function isGpt25Model(modelId: string) {
  return modelId === 'GPT-image-2.5-Flare' || modelId === 'GPT-image-2.5-Sunburst';
}

function UploadGrid({
  items,
  limit,
  label,
  compact = false,
  disabled,
  onFiles,
  onRemove,
}: {
  items: UploadItem[];
  limit: number;
  label: string;
  compact?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const [dragging, setDragging] = useState(false);

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    onFiles(Array.from(event.target.files || []));
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) onFiles(Array.from(event.dataTransfer.files || []));
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold text-zinc-400">
        <span>{label}</span>
        <span className="shrink-0 text-[10px] text-zinc-500">{items.length} / {limit}</span>
      </div>
      <div className={`grid gap-1.5 ${compact ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-4 xl:grid-cols-5'}`}>
        {items.map((item, index) => (
          <div className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30" key={item.id}>
            <img alt={item.name} className="h-full w-full object-cover" src={item.previewUrl} />
            <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-black text-white">
              {index + 1}
            </span>
            <button
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/75 text-zinc-300 opacity-0 transition hover:text-white group-hover:opacity-100"
              type="button"
              disabled={disabled}
              onClick={() => onRemove(item.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        {items.length < limit ? (
          <label
            className={`${compact ? 'aspect-square' : 'min-h-[88px]'} flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed ${
              dragging ? 'border-orange-400 bg-orange-400/10 text-orange-200' : 'border-orange-400/35 bg-orange-400/[0.035] text-orange-200/80'
            } transition hover:border-orange-300 hover:text-orange-100 ${disabled ? 'pointer-events-none opacity-45' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input className="hidden" type="file" accept="image/*" multiple disabled={disabled} onChange={handleFiles} />
            <ImagePlus size={compact ? 15 : 19} />
            <span className={compact ? 'mt-0.5 text-[9px] font-bold' : 'mt-1.5 text-xs font-black'}>添加图片</span>
          </label>
        ) : null}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onDownload,
  downloading = false,
  compact = false,
}: {
  task: BatchTask;
  onDownload?: () => void;
  downloading?: boolean;
  compact?: boolean;
}) {
  const imageUrl = task.image?.thumbnailPath || task.image?.imagePath;
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/8 bg-[#111113] ${compact ? 'flex h-full min-h-[128px] flex-col' : ''}`}>
      {imageUrl && compact ? (
        <button
          className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-black/70 text-zinc-300 transition hover:text-white disabled:cursor-wait disabled:opacity-70"
          type="button"
          onClick={onDownload}
          disabled={downloading}
        >
          {downloading ? <LoaderCircle size={12} className="animate-spin" /> : <Download size={12} />}
        </button>
      ) : null}
      <div className={compact ? 'flex flex-1 items-center justify-center' : 'aspect-square'}>
        {imageUrl ? (
          <img alt={task.prompt} className="h-full w-full object-cover" src={imageUrl} />
        ) : (
          <div className={compact ? 'flex items-center justify-center' : 'flex h-full flex-col items-center justify-center gap-3 text-zinc-600'}>
            {task.status === 'processing' ? <LoaderCircle className="animate-spin text-orange-300" size={26} /> : compact ? null : <Sparkles size={24} />}
            <span className={compact ? 'text-2xl font-black text-white' : 'text-sm font-black'}>
              {task.status === 'failed' ? '生成失败' : compact || task.status !== 'waiting' ? `${task.progress}%` : '等待生成'}
            </span>
          </div>
        )}
      </div>
      {compact && task.status === 'processing' ? (
        <div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-black/50">
          <div className="h-full rounded-full bg-orange-400 transition-all duration-500" style={{ width: `${task.progress}%` }} />
        </div>
      ) : null}
      {!compact ? <div className="border-t border-white/8 p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-bold text-zinc-300">{task.sourceLabel}</span>
          {imageUrl ? (
            <button
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:text-white disabled:cursor-wait disabled:opacity-70"
              type="button"
              onClick={onDownload}
              disabled={downloading}
            >
              {downloading ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
            </button>
          ) : null}
        </div>
        {task.status === 'processing' ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-orange-400 transition-all duration-500" style={{ width: `${task.progress}%` }} />
          </div>
        ) : null}
        {task.error ? <p className="mt-2 line-clamp-2 text-xs leading-4 text-rose-300">{task.error}</p> : null}
      </div> : null}
    </div>
  );
}

function UnifiedPair({
  source,
  task,
  onDownload,
  downloading = false,
}: {
  source: UploadItem;
  task?: BatchTask;
  onDownload?: () => void;
  downloading?: boolean;
}) {
  const placeholderTask: BatchTask = task || {
    id: `placeholder-${source.id}`,
    sourceId: source.id,
    prompt: '',
    sourceLabel: source.name,
    status: 'waiting',
    progress: 0,
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-center gap-1.5">
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/8 bg-[#111113]">
        <img alt={source.name} className="h-full w-full object-cover" src={source.previewUrl} />
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1.5 text-xs font-bold text-zinc-200">
          {source.name}
        </span>
      </div>
      <ArrowRight className="text-zinc-600" size={18} />
      <TaskCard task={placeholderTask} onDownload={onDownload} downloading={downloading} />
    </div>
  );
}

export default function BatchCreateView({
  user,
  models,
  gptImagePricing,
  modelCreditPricing,
  providerRouting,
  onLogin,
  onPurchase,
  onCreditsChange,
  onGenerationComplete,
}: BatchCreateViewProps) {
  const availableModels = useMemo(
    () => models.filter((item) => item.id === 'gpt-image-2'
      || item.id === 'GPT-image-2.5-Flare'
      || item.id === 'GPT-image-2.5-Sunburst'
      || item.id === 'Nano_Banana_Pro'),
    [models],
  );
  const [mode, setMode] = useState<BatchMode>('cards');
  const [selectedModel, setSelectedModel] = useState('gpt-image-2');
  const [imageSize, setImageSize] = useState<ImageSize>('STANDARD');
  const [quality, setQuality] = useState<ImageQuality>('auto');
  const [dimensions, setDimensions] = useState<Aspect>('3:2');
  const [optimizeChineseText, setOptimizeChineseText] = useState(false);
  const [unifiedPrompt, setUnifiedPrompt] = useState('');
  const [promptExpandOpen, setPromptExpandOpen] = useState(false);
  const [promptExpandDraft, setPromptExpandDraft] = useState('');
  // 拓展编辑的目标：卡片 id = 任务卡提示词；提示词条 id = 多提示词条目；都为空 = 统一提示词
  const [promptExpandCardId, setPromptExpandCardId] = useState<string | null>(null);
  const [promptExpandPromptId, setPromptExpandPromptId] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PromptItem[]>([createPromptItem(), createPromptItem()]);
  const [sourceImages, setSourceImages] = useState<UploadItem[]>([]);
  const [extraReferences, setExtraReferences] = useState<UploadItem[]>([]);
  const [taskCards, setTaskCards] = useState<TaskCardData[]>([createTaskCard(), createTaskCard()]);
  const [tasks, setTasks] = useState<BatchTask[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');
  const [downloadingTaskId, setDownloadingTaskId] = useState<string | null>(null);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [ratioMenuCardId, setRatioMenuCardId] = useState<string | null>(null);

  const model = availableModels.find((item) => item.id === selectedModel) || availableModels[0];
  const isNano = model?.id === 'Nano_Banana_Pro';
  const isGpt25 = model ? isGpt25Model(model.id) : false;
  const effectiveOptimizeChineseText = isNano && optimizeChineseText;
  const sourceLimit = mode === 'unified' ? MAX_UNIFIED_IMAGES : MAX_GROUP_IMAGES;
  const refsLimit = model && isGpt25Model(model.id) ? MAX_GPT_IMAGE_25_REFERENCE_IMAGES : MAX_REFERENCE_IMAGES;
  const activePrompts = prompts.filter((item) => item.value.trim());
  const activeCards = taskCards.filter((item) => item.prompt.trim());
  const taskCount = mode === 'unified'
    ? sourceImages.length
    : mode === 'multiple'
      ? activePrompts.length
      : activeCards.reduce((sum, item) => sum + item.count, 0);
  const creditsPerTask = getCredits(model, imageSize, quality, effectiveOptimizeChineseText, gptImagePricing, modelCreditPricing);
  const estimatedCredits = creditsPerTask * taskCount;
  const creditBucket = model?.id === 'gpt-image-2'
    || model?.id === 'GPT-image-2.5-Flare'
    || model?.id === 'GPT-image-2.5-Sunburst'
    ? 'gpt'
    : model?.id === 'Nano_Banana_Pro'
      ? 'banana'
      : 'general';
  const creditsRemaining = user?.creditBalances
    ? creditBucket === 'general'
      ? user.creditBalances.general
      : user.creditBalances[creditBucket] + user.creditBalances.general
    : user?.creditsRemaining || 0;
  const hasEnoughCredits = !user || creditsRemaining >= estimatedCredits;
  const anyCardProcessing = taskCards.some((item) => item.status === 'processing');
  const succeededCount = tasks.filter((task) => task.status === 'succeeded').length;
  const failedCount = tasks.filter((task) => task.status === 'failed').length;
  const succeededTasks = tasks.filter((task) => task.status === 'succeeded' && task.image);
  const cardsDoneCount = taskCards.reduce((sum, item) => sum + item.results.length, 0);
  const cardsFailedCount = taskCards.filter((item) => item.status === 'failed').length;
  const runningProgress = mode === 'cards'
    ? `${cardsDoneCount + cardsFailedCount}/${taskCount}`
    : `${succeededCount + failedCount}/${tasks.length}`;
  const successImages = mode === 'cards'
    ? taskCards.flatMap((item) => item.results)
    : succeededTasks.map((task) => task.image!).filter(Boolean);
  const sourceUploadLabel = mode === 'unified' ? '原图（每张生成一张）' : '原图组（所有提示词共同引用）';
  const dimensionChoices: readonly string[] = isGpt25 && model
    ? (GPT_IMAGE_2_5_RATIO_OPTIONS[model.id]?.[imageSize as string] || [])
    : aspectOptions;
  const resolutionOptions: ImageSize[] = isNano
    ? (['1K', '2K', '4K'] as ImageSize[]).filter((resolution) =>
        providerRouting.bananaRoutes[resolution as '1K' | '2K' | '4K'].some((channel) => channel.enabled))
    : isGpt25
      ? (['1K', '2K', '4K'] as ImageSize[]).filter((resolution) =>
          providerRouting.image2Routes[resolution as '1K' | '2K' | '4K'].some((channel) => channel.enabled))
      : (['STANDARD', '2K', '4K'] as ImageSize[]).filter((resolution) => {
        const routeResolution = resolution === 'STANDARD' ? '1K' : resolution;
        return providerRouting.image2Routes[routeResolution].some((channel) => channel.enabled);
      });

  function updateTask(id: string, patch: Partial<BatchTask>) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  }

  function updateCard(id: string, patch: Partial<TaskCardData>) {
    setTaskCards((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function appendFiles(target: 'sources' | 'references', files: File[]) {
    const setter = target === 'sources' ? setSourceImages : setExtraReferences;
    const current = target === 'sources' ? sourceImages : extraReferences;
    const limit = target === 'sources' ? sourceLimit : MAX_EXTRA_REFERENCES;
    const candidates = files.filter((file) => file.type.startsWith('image/'));
    const oversized = candidates.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) {
      setNotice(`“${oversized.name}”超过 ${MAX_REFERENCE_IMAGE_MB}MB，请压缩后再上传`);
      return;
    }
    const remaining = Math.max(0, limit - current.length);
    if (remaining === 0) {
      setNotice(`最多上传 ${limit} 张图片`);
      return;
    }
    try {
      const next = await Promise.all(candidates.slice(0, remaining).map(readImage));
      setter((items) => [...items, ...next].slice(0, limit));
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '图片读取失败');
    }
  }

  async function appendCardReferences(cardId: string, files: File[]) {
    const card = taskCards.find((item) => item.id === cardId);
    if (!card) return;
    const candidates = files.filter((file) => file.type.startsWith('image/'));
    const oversized = candidates.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) {
      setNotice(`“${oversized.name}”超过 ${MAX_REFERENCE_IMAGE_MB}MB，请压缩后再上传`);
      return;
    }
    const remaining = Math.max(0, refsLimit - card.references.length);
    if (remaining === 0) {
      setNotice(`每张任务卡最多 ${refsLimit} 张参考图`);
      return;
    }
    try {
      const next = await Promise.all(candidates.slice(0, remaining).map(readImage));
      updateCard(cardId, { references: [...card.references, ...next].slice(0, refsLimit) });
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '图片读取失败');
    }
  }

  function changeMode(nextMode: BatchMode) {
    if (running || mode === nextMode) return;
    setMode(nextMode);
    setTasks([]);
    setNotice('');
    if (nextMode !== 'cards') {
      setSourceImages((current) => current.slice(0, nextMode === 'unified' ? MAX_UNIFIED_IMAGES : MAX_GROUP_IMAGES));
    }
  }

  function changeModel(modelId: string) {
    setSelectedModel(modelId);
    const nextRefsLimit = isGpt25Model(modelId) ? MAX_GPT_IMAGE_25_REFERENCE_IMAGES : MAX_REFERENCE_IMAGES;
    setTaskCards((current) => current.map((item) => ({ ...item, references: item.references.slice(0, nextRefsLimit) })));
    if (modelId === 'gpt-image-2') {
      setImageSize('STANDARD');
      setQuality('auto');
      setOptimizeChineseText(false);
    } else if (isGpt25Model(modelId)) {
      // 与创作页一致：GPT-image-2.5 默认 1K（标准档）+ auto 质量，比例按档位白名单回退
      setImageSize('1K');
      setQuality('auto');
      setOptimizeChineseText(false);
      const allowed = GPT_IMAGE_2_5_RATIO_OPTIONS[modelId]?.['1K'] || [];
      setDimensions((current) => (allowed.includes(current) ? current : '1:1'));
      setTaskCards((current) => current.map((item) => ({
        ...item,
        priorityAspect: item.priorityAspect && allowed.includes(item.priorityAspect) ? item.priorityAspect : '',
      })));
    } else {
      const nextImageSize = (['1K', '2K', '4K'] as const).find((resolution) =>
        providerRouting.bananaRoutes[resolution].some((channel) => channel.enabled));
      setImageSize(nextImageSize || '1K');
    }
  }

  function resetAll() {
    if (running) return;
    setSourceImages([]);
    setExtraReferences([]);
    setTasks([]);
    setUnifiedPrompt('');
    setPrompts([createPromptItem(), createPromptItem()]);
    setTaskCards([createTaskCard(), createTaskCard()]);
    setNotice('');
  }

  async function downloadImage(url: string, name: string) {
    try {
      await downloadAsset(url, name);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '下载失败');
    }
  }

  async function downloadTask(task: BatchTask, index = 0) {
    const url = task.image?.imagePath;
    if (!url || downloadingTaskId === task.id) return;
    setDownloadingTaskId(task.id);
    await downloadImage(url, `pixory-batch-${index + 1}`);
    setDownloadingTaskId((current) => (current === task.id ? null : current));
  }

  async function downloadAllImages() {
    if (batchDownloading || successImages.length === 0) return;
    setBatchDownloading(true);
    try {
      for (let index = 0; index < successImages.length; index += 1) {
        const url = successImages[index].imagePath;
        if (url) await downloadImage(url, `pixory-batch-${index + 1}`);
      }
    } finally {
      setBatchDownloading(false);
    }
  }

  async function waitForJob(job: GenerationJobInfo, taskId: string, startedAt: number) {
    let current = job;
    let failures = 0;
    while (current.status === 'queued' || current.status === 'processing') {
      updateTask(taskId, { status: 'processing', progress: taskProgress(current, startedAt) });
      await sleep(POLL_INTERVAL_MS);
      try {
        ({ job: current } = await fetchGenerateImageJob(current.id));
        failures = 0;
      } catch (error) {
        failures += 1;
        if (failures >= 5) throw error;
      }
    }
    if (current.status === 'failed') throw new Error(current.error || '生成失败');
    if (!current.image) throw new Error('生成完成但没有返回图片');
    return current.image;
  }

  async function runSingleCard(card: TaskCardData): Promise<{ completed: number; failed: number }> {
    if (!model) return { completed: 0, failed: 0 };
    updateCard(card.id, { status: 'processing', progress: 6, error: undefined, results: [] });
    const collected: GeneratedImagePayload[] = [];
    let cardError = '';
    for (let index = 0; index < card.count; index += 1) {
      const startedAt = Date.now();
      try {
        const { job } = await startGenerateImageJob({
          prompt: card.prompt.trim(),
          model: model.id,
          dimensions: card.priorityAspect || dimensions,
          imageSize,
          quality: model.id === 'gpt-image-2' || isGpt25 ? quality : undefined,
          ...getAiEnhancementRequestFlags(effectiveOptimizeChineseText),
          reference_images: card.references.map(({ name, mimeType, data }) => ({ name, mimeType, data })),
        });
        const image = job.status === 'succeeded' && job.image ? job.image : await waitForJob(job, '', startedAt);
        collected.push(image);
        updateCard(card.id, {
          results: [...collected],
          progress: Math.round(((index + 1) / card.count) * 100),
          status: index + 1 >= card.count ? 'succeeded' : 'processing',
        });
      } catch (error) {
        cardError = error instanceof Error ? error.message : '生成失败';
        break;
      }

      try {
        const latestUser = await fetchMe();
        if (typeof latestUser.creditsRemaining === 'number') onCreditsChange(latestUser.creditsRemaining);
      } catch {
        // 用户信息刷新失败不影响已经完成的批量任务。
      }
    }
    if (cardError) {
      updateCard(card.id, { status: collected.length > 0 ? 'succeeded' : 'failed', error: cardError, progress: 0 });
    }
    return { completed: collected.length, failed: cardError ? 1 : 0 };
  }

  async function startCardsBatch() {
    if (!model) {
      setNotice('当前没有可用模型');
      return;
    }
    if (activeCards.length === 0) {
      setNotice('请至少在一张任务卡中填写提示词');
      return;
    }
    if (!hasEnoughCredits) {
      setNotice('当前积分不足，请先购买积分');
      return;
    }

    setTaskCards((current) => current.map((item) => (
      item.prompt.trim()
        ? { ...item, status: 'waiting' as TaskStatus, progress: 0, results: [], error: undefined }
        : item
    )));
    setRunning(true);
    setNotice('');

    let completed = 0;
    let failed = 0;
    for (const card of activeCards) {
      const result = await runSingleCard(card);
      completed += result.completed;
      failed += result.failed;
    }

    setRunning(false);
    setNotice(failed > 0 ? `批量任务完成：成功 ${completed} 张，失败 ${failed} 张` : `已成功生成 ${completed} 张图片`);
    onGenerationComplete();
  }

  async function startCard(cardId: string) {
    if (!user) {
      onLogin();
      return;
    }
    if (running || anyCardProcessing) return;
    const card = taskCards.find((item) => item.id === cardId);
    if (!card || !card.prompt.trim()) {
      setNotice('请先在任务卡中填写提示词');
      return;
    }
    const cardCredits = creditsPerTask * card.count;
    if (creditsRemaining < cardCredits) {
      setNotice(`当前积分不足：本任务卡预计需要 ${cardCredits} 积分`);
      return;
    }
    setNotice('');
    await runSingleCard(card);
    onGenerationComplete();
  }

  function resetCard(cardId: string) {
    if (running || anyCardProcessing) return;
    updateCard(cardId, { status: 'waiting', progress: 0, results: [], error: undefined });
  }

  async function downloadCardResults(card: TaskCardData) {
    if (card.results.length === 0) return;
    const cardIndex = taskCards.findIndex((item) => item.id === card.id) + 1;
    for (let index = 0; index < card.results.length; index += 1) {
      const url = card.results[index].imagePath;
      if (url) await downloadImage(url, `pixory-batch-${cardIndex}-${index + 1}`);
    }
  }

  async function startBatch() {
    if (!user) {
      onLogin();
      return;
    }
    if (mode === 'cards') {
      await startCardsBatch();
      return;
    }
    if (!model) {
      setNotice('当前没有可用模型');
      return;
    }
    if (sourceImages.length === 0) {
      setNotice(mode === 'unified' ? '请先上传需要批量处理的原图' : '请先上传原图组');
      return;
    }
    if (mode === 'unified' && !unifiedPrompt.trim()) {
      setNotice('请输入统一提示词');
      return;
    }
    if (mode === 'multiple' && activePrompts.length === 0) {
      setNotice('请至少填写一条提示词');
      return;
    }
    if (!hasEnoughCredits) {
      setNotice('当前积分不足，请先购买积分');
      return;
    }

    const specs = mode === 'unified'
      ? sourceImages.map((source, index) => ({
          id: makeId('task'),
          sourceId: source.id,
          prompt: unifiedPrompt.trim(),
          sourceLabel: source.name || `原图 ${index + 1}`,
          references: [source, ...extraReferences].slice(0, MAX_REFERENCE_IMAGES),
        }))
      : prompts
          .map((item, index) => ({
            id: makeId('task'),
            sourceId: item.id,
            prompt: item.value.trim(),
            sourceLabel: `提示词 ${index + 1}`,
            references: sourceImages.slice(0, MAX_REFERENCE_IMAGES),
          }))
          .filter((item) => item.prompt);

    setTasks(specs.map((item) => ({
      id: item.id,
      sourceId: item.sourceId,
      prompt: item.prompt,
      sourceLabel: item.sourceLabel,
      status: 'waiting',
      progress: 0,
    })));
    setRunning(true);
    setNotice('');

    let completed = 0;
    let failed = 0;
    for (const spec of specs) {
      const startedAt = Date.now();
      updateTask(spec.id, { status: 'processing', progress: 6, error: undefined });
      try {
        const { job } = await startGenerateImageJob({
          prompt: spec.prompt,
          model: model.id,
          dimensions,
          imageSize,
          quality: model.id === 'gpt-image-2' || isGpt25 ? quality : undefined,
          ...getAiEnhancementRequestFlags(effectiveOptimizeChineseText),
          reference_images: spec.references.map(({ name, mimeType, data }) => ({ name, mimeType, data })),
        });
        const image = job.status === 'succeeded' && job.image ? job.image : await waitForJob(job, spec.id, startedAt);
        updateTask(spec.id, { status: 'succeeded', progress: 100, image });
        completed += 1;
      } catch (error) {
        updateTask(spec.id, {
          status: 'failed',
          progress: 0,
          error: error instanceof Error ? error.message : '生成失败',
        });
        failed += 1;
      }

      try {
        const latestUser = await fetchMe();
        if (typeof latestUser.creditsRemaining === 'number') onCreditsChange(latestUser.creditsRemaining);
      } catch {
        // 用户信息刷新失败不影响已经完成的批量任务。
      }
    }

    setRunning(false);
    setNotice(failed > 0 ? `批量任务完成：成功 ${completed} 张，失败 ${failed} 张` : `已成功生成 ${completed} 张图片`);
    onGenerationComplete();
  }

  return (
    <section className="batch-create-shell no-scrollbar h-full min-h-0 overflow-auto px-2.5 py-2.5 sm:px-3 lg:overflow-hidden">
      <div className="grid min-h-full gap-2.5 lg:h-full lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="app-panel no-scrollbar flex min-h-0 flex-col overflow-hidden p-3">
          {/* 顶部工具条：固定在列顶部，不随下方设置区滚动 */}
          <div className="flex-none">
          <div className="grid w-full grid-cols-3 rounded-xl border border-white/8 bg-white/[0.035] p-0.5">
            {([
              ['cards', '多任务卡'],
              ['unified', '统一提示词'],
              ['multiple', '多提示词'],
            ] as Array<[BatchMode, string]>).map(([value, label]) => (
              <button
                className={`min-h-0 whitespace-nowrap rounded-lg px-2 py-1.5 text-[12px] font-black transition ${mode === value ? 'border border-white/10 bg-white/[0.1] font-black! text-white shadow-[0_6px_16px_rgba(0,0,0,0.2)]' : 'text-zinc-500 hover:text-zinc-200'}`}
                type="button"
                disabled={running || anyCardProcessing}
                key={value}
                onClick={() => changeMode(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className="flex min-h-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-xs font-bold text-zinc-300 transition hover:border-white/25 disabled:opacity-45"
              type="button"
              disabled={running || anyCardProcessing}
              onClick={resetAll}
            >
              <RotateCcw size={13} />
              重置全部
            </button>
            <button
              className="flex min-h-0 items-center justify-center gap-1.5 rounded-lg border border-sky-400/20 bg-sky-400/10 py-2 text-xs font-bold text-sky-300 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              disabled={running || successImages.length === 0 || batchDownloading}
              onClick={() => void downloadAllImages()}
            >
              {batchDownloading ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
              下载全部 ({successImages.length})
            </button>
          </div>
          </div>

          {/* 中间设置区：唯一滚动区域，顶部/底部工具条固定 */}
          <div className="no-scrollbar min-h-0 lg:flex-1 lg:overflow-y-auto">
          <section className="mt-4">
            <div className="mb-2 ml-1 text-[10px] font-bold text-zinc-500">选择模型</div>
            <div className="mx-auto grid w-[95%] grid-cols-2 gap-[6px]">
              {availableModels.map((item) => {
                const active = item.id === model?.id;
                return (
                  <button
                    className={`relative min-h-[44px] min-w-0 overflow-visible rounded-[10px] border px-2.5 py-2 text-center transition-colors ${active ? 'border-orange-400/40 bg-orange-500/15 text-orange-100' : 'border-white/15 bg-white/[0.03] text-white hover:border-orange-300/45 hover:bg-orange-500/[0.08]'}`}
                    type="button"
                    disabled={running}
                    key={item.id}
                    onClick={() => changeModel(item.id)}
                  >
                    <span className="block truncate text-center text-[12px] font-black leading-none">{item.id === 'gpt-image-2' ? 'GPT Image 2' : item.name}</span>
                    <span className={`mt-1 block truncate text-center text-[9px] font-bold leading-none ${active ? 'text-orange-300/70' : 'text-white/55'}`}>{item.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {mode === 'unified' ? (
            <>
              <section className="mt-3 rounded-2xl border border-white/8 bg-black/20 p-2">
                <UploadGrid
                  compact
                  items={extraReferences}
                  limit={MAX_EXTRA_REFERENCES}
                  label="补充参考图（可选）"
                  disabled={running}
                  onFiles={(files) => void appendFiles('references', files)}
                  onRemove={(id) => setExtraReferences((current) => current.filter((item) => item.id !== id))}
                />
              </section>
              <section className="mt-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold text-zinc-400">
                  <span className="flex items-center gap-2">
                    图像提示词
                    {/* 与创作页一致：弹层式「我的模版」，支持创建/删除个人模板 */}
                    <PromptTemplates
                      getInitialPrompt={() => unifiedPrompt}
                      onApply={(value) => setUnifiedPrompt(value.slice(0, MAX_PROMPT_LENGTH))}
                    />
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500">{unifiedPrompt.length} / {MAX_PROMPT_LENGTH}</span>
                    <button
                      aria-label="拓展编辑统一提示词"
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:border-white/25 hover:text-white"
                      title="拓展编辑"
                      type="button"
                      onClick={() => {
                        setPromptExpandCardId(null);
                        setPromptExpandPromptId(null);
                        setPromptExpandDraft(unifiedPrompt);
                        setPromptExpandOpen(true);
                      }}
                    >
                      <Maximize2 size={12} />
                    </button>
                  </span>
                </div>
                <textarea
                  className="input h-[82px] resize-none bg-transparent! px-3 py-2.5 text-[10px] leading-4 placeholder:text-zinc-600"
                  placeholder="输入统一提示词，描述每张原图需要如何重新生成..."
                  value={unifiedPrompt}
                  disabled={running}
                  onChange={(event) => setUnifiedPrompt(event.target.value.slice(0, MAX_PROMPT_LENGTH))}
                />
              </section>
            </>
          ) : null}

          <div className="mt-4 grid gap-3">
            <section>
              <div className="mb-2 text-xs font-bold text-zinc-500">清晰度</div>
              <div className={`grid gap-1.5 ${resolutionOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {resolutionOptions.map((item) => (
                  <button
                    className={`min-h-0 rounded-lg border px-1 py-2 text-xs font-black transition ${imageSize === item ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.04] text-zinc-400'}`}
                    type="button"
                    disabled={running}
                    key={item}
                    onClick={() => {
                      setImageSize(item);
                      if (item === 'STANDARD') setQuality('auto');
                      if (isGpt25 && model) {
                        // 与创作页一致：2.5 切档位后比例不在新档位白名单内则回退 1:1，1K 档质量重置 auto
                        const allowed = GPT_IMAGE_2_5_RATIO_OPTIONS[model.id]?.[item] || [];
                        setDimensions((current) => (allowed.includes(current) ? current : '1:1'));
                        if (item === '1K') setQuality('auto');
                        setTaskCards((current) => current.map((card) => ({
                          ...card,
                          priorityAspect: card.priorityAspect && allowed.includes(card.priorityAspect) ? card.priorityAspect : '',
                        })));
                      }
                    }}
                  >
                    {item === 'STANDARD' ? '标准' : item}
                  </button>
                ))}
              </div>
            </section>

            {model?.id === 'gpt-image-2' || isGpt25 ? (
              <section>
                <div className="mb-2 text-xs font-bold text-zinc-500">质量</div>
                <div className={`grid gap-1.5 ${isGpt25 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                  {qualityOptions
                    .filter((item) => !(isGpt25 && item.value === 'high'))
                    .map((item) => {
                      const qualityDisabled = imageSize === 'STANDARD' || (isGpt25 && imageSize === '1K');
                      return (
                        <button
                          className={`min-h-0 rounded-lg border px-1 py-2 text-xs font-black transition ${quality === item.value ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.04] text-zinc-400'} ${qualityDisabled ? 'cursor-not-allowed opacity-45' : ''}`}
                          type="button"
                          disabled={running || qualityDisabled}
                          key={item.value}
                          onClick={() => setQuality(item.value)}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                </div>
              </section>
            ) : isNano ? (
              <section>
                <div className="mb-2 flex items-center gap-1 text-xs font-bold text-zinc-500" title="开启后由 AI 优化中文提示词，额外消耗积分">
                  AI 增强
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-zinc-600 text-[10px] text-zinc-500">i</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[false, true].map((value) => (
                    <button
                      className={`min-h-0 rounded-lg border px-2 py-2 text-xs font-black transition ${optimizeChineseText === value ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.04] text-zinc-400'}`}
                      type="button"
                      disabled={running}
                      key={String(value)}
                      onClick={() => setOptimizeChineseText(value)}
                    >
                      {value ? '开' : '关'}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <section className="mt-4">
            <div className="mb-2 ml-1 text-[10px] font-bold text-zinc-500">画面比例</div>
            <div className="flex flex-wrap gap-[6px]">
              {dimensionChoices.map((item) => {
                const autoDisabled = item === 'auto' && model?.id !== 'gpt-image-2';
                return (
                  <button
                    className={`grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[8px] border p-0 text-center transition-colors ${dimensions === item ? 'border-white bg-white text-black shadow-lg shadow-white/10' : 'border-white/5 bg-white/5 text-zinc-400 hover:border-white/20'} ${autoDisabled ? 'cursor-not-allowed opacity-40' : ''}`}
                    type="button"
                    disabled={running || autoDisabled}
                    title={item === 'auto' && model?.id !== 'gpt-image-2' ? 'Auto 仅 GPT Image 2 支持' : undefined}
                    key={item}
                    onClick={() => setDimensions(item)}
                  >
                    <span className="block truncate text-center text-[10px] font-black leading-none">{item === 'auto' ? 'Auto' : item}</span>
                  </button>
                );
              })}
            </div>
          </section>
          </div>

          {/* 底部操作区：固定在列底部 */}
          <div className="mt-3 flex-none border-t border-white/8 pt-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-zinc-400">
              <span>
                使用积分：<span className="text-white">{estimatedCredits}</span>/<span className="text-white">{creditsRemaining}</span>
              </span>
              <button className="min-h-0 p-0 text-[11px] font-black! text-[#00b0f0] transition hover:text-[#4cc9ff]" type="button" onClick={onPurchase}>
                点击在线购买积分(25%优惠)
              </button>
            </div>
            {mode !== 'cards' ? (
              <>
                {notice ? <div className={`mt-3 app-alert ${failedCount > 0 || cardsFailedCount > 0 ? 'app-alert-error' : ''}`}>{notice}</div> : null}
                <button
                  className="mt-1 flex w-full min-h-[42px] flex-none items-center justify-center gap-2 rounded-xl border border-[#804303] bg-[#2a1303] px-3 text-sm font-black text-orange-100 shadow-[0_12px_30px_rgba(0,0,0,0.3)] transition hover:border-[#a55a04] hover:bg-[#3a1a04] disabled:cursor-not-allowed disabled:opacity-45"
                  type="button"
                  disabled={running || !user || taskCount === 0 || !hasEnoughCredits}
                  onClick={() => void startBatch()}
                >
                  {running ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
                  {running ? `生成中 ${runningProgress}` : user ? '开始生成' : '登录后生成'}
                </button>
              </>
            ) : notice ? (
              <div className={`mt-3 app-alert ${cardsFailedCount > 0 ? 'app-alert-error' : ''}`}>{notice}</div>
            ) : null}
          </div>
        </aside>

        <div className="no-scrollbar flex min-h-0 flex-col overflow-hidden px-1">
          {mode === 'cards' ? (
            <div className="no-scrollbar grid min-h-0 flex-1 auto-rows-max content-start gap-3 overflow-y-auto pr-1 grid-cols-[repeat(auto-fill,minmax(185px,1fr))]">
              {taskCards.map((card, index) => {
                const cardBusy = card.status === 'processing';
                return (
                  <article
                    className="flex min-w-0 flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3"
                    aria-label={`任务卡 ${index + 1}`}
                    key={card.id}
                  >
                    <header className="flex items-center justify-between gap-2">
                      <h3 className="text-[11px] font-bold text-white">任务 {index + 1}</h3>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full bg-white/5 px-2 py-1 text-[11px] ${card.status === 'succeeded' ? 'text-emerald-400' : card.status === 'failed' ? 'text-red-300' : 'text-zinc-300'}`}>
                          {cardBusy ? '生成中' : card.status === 'succeeded' ? '已完成' : card.status === 'failed' ? '生成失败' : '待开始'}
                        </span>
                        <button
                          aria-label={`移除任务卡 ${index + 1}`}
                          className="rounded-full p-1 text-zinc-400 transition hover:bg-red-400/20 hover:text-red-300 disabled:opacity-25"
                          type="button"
                          disabled={running || anyCardProcessing}
                          onClick={() => setTaskCards((current) => current.filter((item) => item.id !== card.id))}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </header>

                    <div className="grid grid-cols-3 gap-1.5">
                      {card.references.map((item) => (
                        <div className="group relative aspect-square overflow-hidden rounded-lg bg-black/45" key={item.id}>
                          <img alt={item.name} className="h-full w-full object-cover" src={item.previewUrl} />
                          <button
                            className="absolute right-0.5 top-0.5 z-20 flex h-4 w-4 items-center justify-center rounded-full border border-white/15 bg-black/72 text-zinc-200 opacity-0 transition hover:bg-red-500/85 hover:text-white group-hover:opacity-100"
                            type="button"
                            disabled={running || anyCardProcessing}
                            onClick={() => updateCard(card.id, { references: card.references.filter((ref) => ref.id !== item.id) })}
                          >
                            <X size={9} />
                          </button>
                        </div>
                      ))}
                      {Array.from({ length: Math.max(0, refsLimit - card.references.length) }).map((_, slotIndex) => (
                        <label
                          className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-orange-300/30 bg-orange-300/[0.04] text-center text-[9px] font-black leading-none text-orange-200 transition hover:border-orange-300/70 hover:bg-orange-300/[0.08]"
                          key={`${card.id}-slot-${slotIndex}`}
                          title="添加参考图"
                        >
                          <input
                            className="hidden"
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={running || anyCardProcessing}
                            onChange={(event) => {
                              void appendCardReferences(card.id, Array.from(event.target.files || []));
                              event.target.value = '';
                            }}
                          />
                          <Plus size={11} />
                          <span className="mt-1 whitespace-nowrap">添加参考图</span>
                        </label>
                      ))}
                    </div>

                    <div className={`flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-xl border bg-black/25 ${card.status === 'failed' ? 'border-red-400/70' : card.status === 'succeeded' ? 'border-emerald-400/70' : cardBusy ? 'border-sky-400/70' : 'border-white/10'}`}>
                      {card.results.length > 0 ? (
                        <div className={`grid h-full w-full gap-1 p-1.5 ${card.results.length > 1 ? 'grid-cols-2 content-start overflow-y-auto' : 'grid-cols-1'}`}>
                          {card.results.map((image, resultIndex) => (
                            <div className="group relative overflow-hidden rounded-lg" key={`${card.id}-result-${resultIndex}`}>
                              <img
                                alt={`生成结果 ${resultIndex + 1}`}
                                className={`w-full object-cover ${card.results.length > 1 ? 'aspect-square' : 'h-full'}`}
                                src={image.thumbnailPath || image.imagePath}
                              />
                              <button
                                className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-black/70 text-zinc-300 opacity-0 transition hover:text-white group-hover:opacity-100"
                                type="button"
                                onClick={() => void downloadImage(image.imagePath, `pixory-batch-${index + 1}-${resultIndex + 1}`)}
                              >
                                <Download size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : cardBusy ? (
                        <div className="flex flex-col items-center gap-2 text-zinc-500">
                          <LoaderCircle className="animate-spin text-orange-300" size={22} />
                          <span className="text-xs font-bold">{card.progress}%</span>
                        </div>
                      ) : (
                        <span className="px-2 text-center text-xs text-zinc-600">生成结果</span>
                      )}
                    </div>
                    {card.error ? <p className="line-clamp-2 text-xs leading-4 text-red-300">{card.error}</p> : null}

                    <div className="relative">
                      <textarea
                        className="no-scrollbar h-24 w-full resize-none rounded-xl border border-white/10 bg-black/25 p-3 text-xs leading-5 text-white outline-none transition focus:border-orange-300/60 placeholder:text-zinc-600 disabled:opacity-60"
                        placeholder="输入提示词，描述你想生成的图片…"
                        value={card.prompt}
                        disabled={running || anyCardProcessing}
                        onChange={(event) => updateCard(card.id, { prompt: event.target.value.slice(0, MAX_PROMPT_LENGTH) })}
                      />
                      <button
                        aria-label={`拓展编辑任务 ${index + 1} 提示词`}
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-black/60 text-zinc-400 transition hover:border-white/25 hover:text-white"
                        title="拓展编辑"
                        type="button"
                        onClick={() => {
                          setPromptExpandCardId(card.id);
                          setPromptExpandDraft(card.prompt);
                          setPromptExpandOpen(true);
                        }}
                      >
                        <Maximize2 size={12} />
                      </button>
                    </div>

                    <div className="mt-auto space-y-1">
                      <div className="flex items-center justify-between gap-1 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-[10px] leading-4 text-zinc-400">
                          <span>数量</span>
                          <div className="flex items-center">
                            <button
                              aria-label={`减少任务 ${index + 1} 生成数量`}
                              className="flex h-4 w-4 items-center justify-center rounded-l transition hover:bg-white/10 disabled:opacity-30"
                              type="button"
                              disabled={running || anyCardProcessing || card.count <= 1}
                              onClick={() => updateCard(card.id, { count: Math.max(1, card.count - 1) })}
                            >
                              <Minus size={12} />
                            </button>
                            <span aria-label={`任务 ${index + 1} 生成数量`} className="min-w-4 text-center text-[10px] tabular-nums">{card.count}</span>
                            <button
                              aria-label={`增加任务 ${index + 1} 生成数量`}
                              className="flex h-4 w-4 items-center justify-center rounded-r transition hover:bg-white/10 disabled:opacity-30"
                              type="button"
                              disabled={running || anyCardProcessing || card.count >= MAX_CARD_COUNT}
                              onClick={() => updateCard(card.id, { count: Math.min(MAX_CARD_COUNT, card.count + 1) })}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="relative flex min-w-0 items-center gap-1 whitespace-nowrap text-[10px] text-zinc-400">
                          <span>优先比例：</span>
                          <button
                            aria-label={`任务 ${index + 1} 优先比例`}
                            className="shrink-0 rounded border border-sky-400/30 bg-sky-500/15 px-1 py-0.5 font-bold text-sky-300 transition hover:bg-sky-500/25 disabled:opacity-40"
                            type="button"
                            disabled={running || anyCardProcessing}
                            onClick={() => setRatioMenuCardId((current) => (current === card.id ? null : card.id))}
                          >
                            {card.priorityAspect || '选择'}
                          </button>
                          {ratioMenuCardId === card.id ? (
                            <>
                              <button aria-label="关闭比例选择" className="fixed inset-0 z-20 cursor-default" type="button" onClick={() => setRatioMenuCardId(null)} />
                              <div className="absolute bottom-full left-0 z-30 mb-1 w-56 rounded-xl border border-sky-400/30 bg-[#0a0a0b] p-2 shadow-2xl">
                                <div className="grid grid-cols-3 gap-1">
                                  {dimensionChoices.filter((item) => item !== 'auto').map((item) => (
                                    <button
                                      className={`rounded-md px-1 py-1.5 text-[11px] transition hover:bg-sky-500/20 ${card.priorityAspect === item ? 'bg-sky-500/25 text-sky-200' : 'bg-white/5 text-zinc-200'}`}
                                      type="button"
                                      key={item}
                                      onClick={() => {
                                        updateCard(card.id, { priorityAspect: card.priorityAspect === item ? '' : item });
                                        setRatioMenuCardId(null);
                                      }}
                                    >
                                      {item}
                                    </button>
                                  ))}
                                </div>
                                {card.priorityAspect ? (
                                  <button
                                    className="mt-2 w-full rounded-md border border-white/10 py-1 text-[10px] text-zinc-400 transition hover:bg-white/10"
                                    type="button"
                                    onClick={() => {
                                      updateCard(card.id, { priorityAspect: '' });
                                      setRatioMenuCardId(null);
                                    }}
                                  >
                                    清除优先比例
                                  </button>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-[10px] text-zinc-500">预计 {creditsPerTask * card.count} 积分</div>
                      <div className="flex gap-2">
                        <button
                          className="min-h-9 flex-1 rounded-xl border border-[#804303] bg-[#2a1303] px-2 text-xs font-black text-orange-100 transition hover:border-[#a55a04] hover:bg-[#3a1a04] disabled:opacity-35"
                          type="button"
                          disabled={running || (anyCardProcessing && !cardBusy) || !card.prompt.trim()}
                          onClick={() => void startCard(card.id)}
                        >
                          {cardBusy ? '生成中' : card.results.length > 0 ? '重新生成' : '开始生成'}
                        </button>
                        <button
                          aria-label={`下载任务 ${index + 1} 全部结果`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/80 text-white transition hover:bg-emerald-400 disabled:opacity-30"
                          type="button"
                          disabled={card.results.length === 0 || cardBusy}
                          onClick={() => void downloadCardResults(card)}
                        >
                          <Download size={16} />
                        </button>
                        <button
                          aria-label={`重置任务卡 ${index + 1}`}
                          title="重置任务卡"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white transition hover:bg-red-400 disabled:opacity-30"
                          type="button"
                          disabled={cardBusy}
                          onClick={() => resetCard(card.id)}
                        >
                          <RotateCcw size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
              {taskCards.length < MAX_TASK_CARDS ? (
                <button
                  className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/12 text-orange-300 transition hover:border-orange-400/50 disabled:cursor-not-allowed disabled:opacity-45"
                  type="button"
                  disabled={running || anyCardProcessing}
                  onClick={() => setTaskCards((current) => [...current, createTaskCard()])}
                >
                  <Plus size={26} />
                  <span className="text-xs font-bold">添加任务卡</span>
                  <span className="text-xs text-zinc-600">{taskCards.length}/{MAX_TASK_CARDS}</span>
                </button>
              ) : null}
            </div>
          ) : (
            <div className="no-scrollbar min-h-0 flex-1 overflow-auto pb-2">
              {mode === 'unified' ? (
                <div className="space-y-3">
                  {sourceImages.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                      {sourceImages.map((source) => {
                        const task = tasks.find((item) => item.sourceId === source.id);
                        return (
                          <div key={source.id}>
                            <UnifiedPair
                              source={source}
                              task={task}
                              onDownload={task ? () => void downloadTask(task) : undefined}
                              downloading={Boolean(task && downloadingTaskId === task.id)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <label
                    className={`mx-auto flex w-full max-w-[580px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-orange-400/35 bg-orange-400/[0.025] text-orange-200/80 transition hover:border-orange-300 ${
                      sourceImages.length > 0 ? 'min-h-[270px]' : 'min-h-[470px]'
                    } ${running ? 'pointer-events-none opacity-45' : ''}`}
                  >
                    <input
                      className="hidden"
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={running}
                      onChange={(event) => {
                        void appendFiles('sources', Array.from(event.target.files || []));
                        event.target.value = '';
                      }}
                    />
                    <ImagePlus size={25} />
                    <span className="mt-2 text-sm font-black">添加原图</span>
                    <span className="mt-2 text-xs text-zinc-600">最多 10 张原图，单张不超过 {MAX_REFERENCE_IMAGE_MB}MB</span>
                  </label>
                </div>
              ) : (
                <div className="grid min-h-0 gap-3 lg:h-full lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)]">
                  {/* 左：原图组（所有提示词共用） */}
                  <div className="no-scrollbar rounded-2xl border border-white/8 bg-black/20 p-3 lg:overflow-y-auto">
                    <UploadGrid
                      compact
                      items={sourceImages}
                      limit={MAX_GROUP_IMAGES}
                      label="原图组"
                      disabled={running}
                      onFiles={(files) => void appendFiles('sources', files)}
                      onRemove={(id) => setSourceImages((current) => current.filter((item) => item.id !== id))}
                    />
                    <p className="mt-3 text-xs leading-5 text-zinc-600">同一原图组会提供给每一条提示词，适合批量制作详情页、不同场景或不同角度。</p>
                  </div>
                  {/* 右：提示词卡片 + 添加按钮 */}
                  <div className="no-scrollbar flex min-h-0 flex-col gap-2 lg:overflow-y-auto lg:pr-1">
                    {prompts.map((item, index) => {
                      const task = tasks.find((taskItem) => taskItem.sourceLabel === `提示词 ${index + 1}`);
                      return (
                        <div className="grid items-stretch gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" key={item.id}>
                          <div className="rounded-2xl border border-white/8 bg-[#111113] p-3">
                            <div className="mb-1 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-orange-300">提示词 {index + 1}</span>
                                <PromptTemplates
                                  getInitialPrompt={() => item.value}
                                  onApply={(value) => setPrompts((current) => current.map((prompt) => prompt.id === item.id ? { ...prompt, value: value.slice(0, MAX_PROMPT_LENGTH) } : prompt))}
                                />
                              </div>
                              {prompts.length > 1 ? (
                                <button
                                  className="text-zinc-600 transition hover:text-white"
                                  type="button"
                                  disabled={running}
                                  onClick={() => setPrompts((current) => current.filter((prompt) => prompt.id !== item.id))}
                                >
                                  <X size={14} />
                                </button>
                              ) : null}
                            </div>
                            <div className="relative">
                              <textarea
                                className="no-scrollbar h-[88px] w-full resize-none border-0 bg-transparent px-0 pr-8 pb-5 pt-1 text-[11px] leading-4 text-zinc-300 outline-none placeholder:text-zinc-600"
                                placeholder="例如：图1和图5做成电商详情图..."
                                value={item.value}
                                disabled={running}
                                onChange={(event) => setPrompts((current) => current.map((prompt) => prompt.id === item.id ? { ...prompt, value: event.target.value.slice(0, MAX_PROMPT_LENGTH) } : prompt))}
                              />
                              <button
                                aria-label={`拓展编辑提示词 ${index + 1}`}
                                className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition hover:text-white"
                                title="拓展编辑"
                                type="button"
                                onClick={() => {
                                  setPromptExpandPromptId(item.id);
                                  setPromptExpandDraft(item.value);
                                  setPromptExpandOpen(true);
                                }}
                              >
                                <Maximize2 size={12} />
                              </button>
                              <span className="pointer-events-none absolute bottom-1 right-1 text-[11px] text-zinc-600">
                                {item.value.length}/{MAX_PROMPT_LENGTH}
                              </span>
                            </div>
                          </div>
                          {task ? (
                            <TaskCard task={task} compact onDownload={() => void downloadTask(task)} downloading={downloadingTaskId === task.id} />
                          ) : (
                            <div className="flex min-h-[128px] items-center justify-center rounded-2xl border border-white/8 bg-[#111113]">
                              <span className="text-2xl font-black text-white">0%</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {prompts.length < MAX_PROMPTS ? (
                      <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                        <button
                          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#111113] text-sm font-bold text-zinc-200 transition hover:border-white/25 hover:bg-[#18181b] disabled:cursor-not-allowed disabled:opacity-45"
                          type="button"
                          disabled={running}
                          onClick={() => setPrompts((current) => [...current, createPromptItem()])}
                        >
                          <Plus size={15} />
                          添加提示词
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {promptExpandOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-4 backdrop-blur-sm">
          <button
            className="absolute inset-0"
            type="button"
            onClick={() => { setPromptExpandOpen(false); setPromptExpandCardId(null); setPromptExpandPromptId(null); }}
            aria-label="关闭提示词编辑弹窗"
          />
          <div className="relative z-10 flex w-full max-w-[640px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#0c0c0d] shadow-[0_28px_90px_rgba(0,0,0,0.6)]">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <h2 className="text-lg font-black text-white">图像提示词</h2>
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#2b2b2e] text-[#9a9ba3] transition hover:border-[#444449] hover:text-white"
                type="button"
                aria-label="关闭"
                onClick={() => { setPromptExpandOpen(false); setPromptExpandCardId(null); setPromptExpandPromptId(null); }}
              >
                <X size={16} />
              </button>
            </header>
            <div className="px-5 pb-5 pt-4">
              <textarea
                autoFocus
                className="block h-[260px] w-full resize-none rounded-2xl border border-sky-400/60 bg-white/[0.02] px-4 py-3 text-[13px] leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
                placeholder={promptExpandCardId
                  ? '输入提示词，描述你想生成的图片...'
                  : promptExpandPromptId
                    ? '例如：图1和图5做成电商详情图...'
                    : '输入统一提示词，描述每张原图需要如何重新生成...'}
                value={promptExpandDraft}
                onChange={(event) => setPromptExpandDraft(event.target.value.slice(0, MAX_PROMPT_LENGTH))}
              />
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
              <span className="text-xs font-semibold text-zinc-500">{promptExpandDraft.length} / {MAX_PROMPT_LENGTH}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full px-4 py-1.5 text-sm font-semibold text-zinc-400 transition hover:text-white"
                  onClick={() => { setPromptExpandOpen(false); setPromptExpandCardId(null); setPromptExpandPromptId(null); }}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black transition hover:brightness-95"
                  onClick={() => {
                    if (promptExpandCardId) {
                      updateCard(promptExpandCardId, { prompt: promptExpandDraft.slice(0, MAX_PROMPT_LENGTH) });
                    } else if (promptExpandPromptId) {
                      setPrompts((current) => current.map((prompt) => prompt.id === promptExpandPromptId ? { ...prompt, value: promptExpandDraft.slice(0, MAX_PROMPT_LENGTH) } : prompt));
                    } else {
                      setUnifiedPrompt(promptExpandDraft);
                    }
                    setPromptExpandOpen(false);
                    setPromptExpandCardId(null);
                    setPromptExpandPromptId(null);
                  }}
                >
                  确定
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
