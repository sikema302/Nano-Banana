import { type ChangeEvent, type DragEvent, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Download,
  ImagePlus,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react';
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
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_REFERENCE_IMAGE_MB,
  MAX_REFERENCE_IMAGES,
} from './lib/reference-image-limits';

type BatchMode = 'unified' | 'multiple';
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

const dimensionOptions = ['1:1', '3:2', '16:9', '2:3', '4:3', '3:4', '21:9', '9:16'] as const;
const qualityOptions: Array<{ value: ImageQuality; label: string }> = [
  { value: 'auto', label: 'auto' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];
const promptTemplates = [
  '保留原图主体与商品细节，统一替换为干净高级的商业摄影背景，光影自然，画面真实。',
  '将原图改造成电商详情页主视觉，突出主体卖点，构图简洁，高级棚拍质感。',
  '保留人物或商品特征，统一画面风格、色调和光线，提升质感与细节，不添加水印。',
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
  if (model.id === 'gpt-image-2') return getConfiguredImageCredits(modelCreditPricing, model.id, imageSize, quality);
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
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-zinc-400">
        <span>{label}</span>
        <span>{items.length}/{limit}</span>
      </div>
      <div className={`grid gap-1.5 ${compact ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-4 xl:grid-cols-5'}`}>
        {items.map((item, index) => (
          <div className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30" key={item.id}>
            <img alt={item.name} className="h-full w-full object-cover" src={item.previewUrl} />
            <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-black text-white">
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
            <span className="mt-1.5 text-[10px] font-black">添加图片</span>
          </label>
        ) : null}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  selected = false,
  onSelect,
  onDownload,
  compact = false,
}: {
  task: BatchTask;
  selected?: boolean;
  onSelect?: () => void;
  onDownload?: () => void;
  compact?: boolean;
}) {
  const imageUrl = task.image?.thumbnailPath || task.image?.imagePath;
  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-white/[0.025] ${selected ? 'border-orange-400' : 'border-white/8'}`}>
      {imageUrl && onSelect ? (
        <button
          className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border ${
            selected ? 'border-orange-300 bg-orange-500 text-white' : 'border-white/20 bg-black/70 text-transparent'
          }`}
          type="button"
          onClick={onSelect}
        >
          <Check size={13} strokeWidth={3} />
        </button>
      ) : null}
      {imageUrl && compact ? (
        <button
          className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-black/70 text-zinc-300 transition hover:text-white"
          type="button"
          onClick={onDownload}
        >
          <Download size={12} />
        </button>
      ) : null}
      <div className="aspect-square">
        {imageUrl ? (
          <img alt={task.prompt} className="h-full w-full object-cover" src={imageUrl} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-600">
            {task.status === 'processing' ? <LoaderCircle className="animate-spin text-orange-300" size={26} /> : <Sparkles size={24} />}
            <span className="text-sm font-black">
              {task.status === 'failed' ? '生成失败' : task.status === 'waiting' ? '等待生成' : `${task.progress}%`}
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
          <span className="truncate text-[11px] font-bold text-zinc-300">{task.sourceLabel}</span>
          {imageUrl ? (
            <button
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:text-white"
              type="button"
              onClick={onDownload}
            >
              <Download size={13} />
            </button>
          ) : null}
        </div>
        {task.status === 'processing' ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-orange-400 transition-all duration-500" style={{ width: `${task.progress}%` }} />
          </div>
        ) : null}
        {task.error ? <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-rose-300">{task.error}</p> : null}
      </div> : null}
    </div>
  );
}

function UnifiedPair({
  source,
  task,
  selected,
  onSelect,
  onDownload,
}: {
  source: UploadItem;
  task?: BatchTask;
  selected: boolean;
  onSelect: () => void;
  onDownload?: () => void;
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
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025]">
        <img alt={source.name} className="h-full w-full object-cover" src={source.previewUrl} />
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1.5 text-[10px] font-bold text-zinc-200">
          {source.name}
        </span>
      </div>
      <ArrowRight className="text-zinc-600" size={18} />
      <TaskCard
        task={placeholderTask}
        selected={selected}
        onSelect={task?.image ? onSelect : undefined}
        onDownload={onDownload}
      />
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
    () => models.filter((item) => item.id === 'gpt-image-2' || item.id === 'Nano_Banana_Pro'),
    [models],
  );
  const [mode, setMode] = useState<BatchMode>('unified');
  const [selectedModel, setSelectedModel] = useState('gpt-image-2');
  const [imageSize, setImageSize] = useState<ImageSize>('STANDARD');
  const [quality, setQuality] = useState<ImageQuality>('auto');
  const [dimensions, setDimensions] = useState<(typeof dimensionOptions)[number]>('3:2');
  const [optimizeChineseText, setOptimizeChineseText] = useState(false);
  const [promptPanel, setPromptPanel] = useState<'prompt' | 'templates'>('prompt');
  const [unifiedPrompt, setUnifiedPrompt] = useState('');
  const [prompts, setPrompts] = useState<PromptItem[]>([createPromptItem(), createPromptItem()]);
  const [sourceImages, setSourceImages] = useState<UploadItem[]>([]);
  const [extraReferences, setExtraReferences] = useState<UploadItem[]>([]);
  const [tasks, setTasks] = useState<BatchTask[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [thumbnailScale, setThumbnailScale] = useState(100);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');

  const model = availableModels.find((item) => item.id === selectedModel) || availableModels[0];
  const isNano = model?.id === 'Nano_Banana_Pro';
  const effectiveOptimizeChineseText = isNano && optimizeChineseText;
  const sourceLimit = mode === 'unified' ? MAX_UNIFIED_IMAGES : MAX_GROUP_IMAGES;
  const activePrompts = prompts.filter((item) => item.value.trim());
  const taskCount = mode === 'unified' ? sourceImages.length : activePrompts.length;
  const creditsPerTask = getCredits(model, imageSize, quality, effectiveOptimizeChineseText, gptImagePricing, modelCreditPricing);
  const estimatedCredits = creditsPerTask * taskCount;
  const creditBucket = model?.id === 'gpt-image-2' ? 'gpt' : model?.id === 'Nano_Banana_Pro' ? 'banana' : 'general';
  const creditsRemaining = user?.creditBalances
    ? creditBucket === 'general'
      ? user.creditBalances.general
      : user.creditBalances[creditBucket] + user.creditBalances.general
    : user?.creditsRemaining || 0;
  const hasEnoughCredits = !user || creditsRemaining >= estimatedCredits;
  const succeededCount = tasks.filter((task) => task.status === 'succeeded').length;
  const failedCount = tasks.filter((task) => task.status === 'failed').length;
  const succeededTasks = tasks.filter((task) => task.status === 'succeeded' && task.image);
  const sourceUploadLabel = mode === 'unified' ? '原图（每张生成一张）' : '原图组（所有提示词共同引用）';
  const resolutionOptions: ImageSize[] = isNano
    ? (['1K', '2K', '4K'] as ImageSize[]).filter((resolution) =>
        providerRouting.bananaRoutes[resolution as '1K' | '2K' | '4K'].some((channel) => channel.enabled))
    : (['STANDARD', '2K', '4K'] as ImageSize[]).filter((resolution) => {
        const routeResolution = resolution === 'STANDARD' ? '1K' : resolution;
        return providerRouting.image2Routes[routeResolution].some((channel) => channel.enabled);
      });

  function updateTask(id: string, patch: Partial<BatchTask>) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...patch } : task)));
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

  function changeMode(nextMode: BatchMode) {
    if (running || mode === nextMode) return;
    setMode(nextMode);
    setSourceImages((current) => current.slice(0, nextMode === 'unified' ? MAX_UNIFIED_IMAGES : MAX_GROUP_IMAGES));
    setTasks([]);
    setSelectedTaskIds([]);
    setNotice('');
  }

  function changeModel(modelId: string) {
    setSelectedModel(modelId);
    if (modelId === 'gpt-image-2') {
      setImageSize('STANDARD');
      setQuality('auto');
      setOptimizeChineseText(false);
    } else {
      const nextImageSize = (['1K', '2K', '4K'] as const).find((resolution) =>
        providerRouting.bananaRoutes[resolution].some((channel) => channel.enabled));
      setImageSize(nextImageSize || '1K');
    }
  }

  function clearWorkspace() {
    if (running) return;
    setSourceImages([]);
    setExtraReferences([]);
    setTasks([]);
    setSelectedTaskIds([]);
    setNotice('');
  }

  function toggleTaskSelection(taskId: string) {
    setSelectedTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
    );
  }

  function toggleAllTasks() {
    const availableIds = succeededTasks.map((task) => task.id);
    const allSelected = availableIds.length > 0 && availableIds.every((id) => selectedTaskIds.includes(id));
    setSelectedTaskIds(allSelected ? [] : availableIds);
  }

  async function downloadTask(task: BatchTask, index = 0) {
    const url = task.image?.imagePath;
    if (!url) return;
    try {
      await downloadAsset(url, `pixory-batch-${index + 1}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '下载失败');
    }
  }

  async function downloadSelectedTasks() {
    const selected = succeededTasks.filter((task) => selectedTaskIds.includes(task.id));
    for (let index = 0; index < selected.length; index += 1) {
      await downloadTask(selected[index], index);
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

  async function startBatch() {
    if (!user) {
      onLogin();
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
    setSelectedTaskIds([]);
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
          quality: model.id === 'gpt-image-2' ? quality : undefined,
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
    <section className="batch-create-shell custom-scrollbar h-full min-h-0 overflow-auto px-2.5 py-2.5 sm:px-3 lg:overflow-hidden">
      <div className="grid min-h-full gap-2.5 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2.5">
            <div className="grid w-full max-w-[280px] grid-cols-2 rounded-xl border border-white/10 bg-white/[0.035] p-0.5">
              <button
                className={`min-h-0 rounded-lg px-3 py-1.5 text-[11px] font-black transition ${mode === 'unified' ? 'bg-orange-500 text-white shadow-[0_8px_24px_rgba(249,115,22,0.25)]' : 'text-zinc-500 hover:text-zinc-200'}`}
                type="button"
                onClick={() => changeMode('unified')}
              >
                统一提示词
              </button>
              <button
                className={`min-h-0 rounded-lg px-3 py-1.5 text-[11px] font-black transition ${mode === 'multiple' ? 'bg-orange-500 text-white shadow-[0_8px_24px_rgba(249,115,22,0.25)]' : 'text-zinc-500 hover:text-zinc-200'}`}
                type="button"
                onClick={() => changeMode('multiple')}
              >
                多提示词
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {mode === 'unified' ? (
                <>
                  <span className="rounded-lg border border-white/8 bg-white/[0.025] px-2.5 py-1.5 text-[11px] font-black text-zinc-400">
                    已完成 <strong className="text-white">{succeededCount}/{sourceImages.length}</strong>
                  </span>
                  <button
                    className="btn-ghost min-h-0 px-2.5 py-1.5 text-[11px] text-zinc-400"
                    type="button"
                    disabled={succeededTasks.length === 0}
                    onClick={toggleAllTasks}
                  >
                    全选
                  </button>
                  <span className="rounded-lg border border-white/8 px-2.5 py-1.5 text-[11px] font-black text-zinc-400">
                    已选：{selectedTaskIds.length}
                  </span>
                  <button
                    className="btn-ghost min-h-0 gap-1 px-2.5 py-1.5 text-[11px] text-zinc-400"
                    type="button"
                    disabled={selectedTaskIds.length === 0}
                    onClick={downloadSelectedTasks}
                  >
                    <Download size={13} />
                    批量下载
                  </button>
                  <label className="flex items-center gap-2 rounded-lg border border-white/8 px-2 py-1 text-[10px] font-black text-zinc-500">
                    <ZoomIn size={13} />
                    <input
                      className="h-1 w-20 accent-orange-500"
                      type="range"
                      min="75"
                      max="125"
                      value={thumbnailScale}
                      onChange={(event) => setThumbnailScale(Number(event.target.value))}
                    />
                  </label>
                </>
              ) : null}
              <button
                className="btn-ghost min-h-0 gap-1 px-2 py-1.5 text-[11px] text-zinc-500"
                type="button"
                disabled={running}
                onClick={() => {
                  setTasks([]);
                  setSelectedTaskIds([]);
                }}
              >
                <RefreshCw size={14} />
                刷新
              </button>
              <button
                className="btn-ghost min-h-0 gap-1 px-2 py-1.5 text-[11px] text-zinc-500"
                type="button"
                disabled={running}
                onClick={clearWorkspace}
              >
                <Trash2 size={14} />
                清空
              </button>
            </div>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-auto px-2 pb-3">
            {mode === 'unified' ? (
              <div className="space-y-3">
                {sourceImages.length > 0 ? (
                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(360 * thumbnailScale / 100)}px, 1fr))` }}
                  >
                    {sourceImages.map((source) => {
                      const task = tasks.find((item) => item.sourceId === source.id);
                      return (
                        <div key={source.id}>
                          <UnifiedPair
                            source={source}
                            task={task}
                            selected={Boolean(task && selectedTaskIds.includes(task.id))}
                            onSelect={() => task && toggleTaskSelection(task.id)}
                            onDownload={task ? () => void downloadTask(task) : undefined}
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
                  <span className="mt-2 text-[10px] text-zinc-600">最多 10 张原图，单张不超过 {MAX_REFERENCE_IMAGE_MB}MB</span>
                </label>
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
                <div className="min-h-[440px] rounded-2xl border border-white/8 bg-black/20 p-3">
                  <UploadGrid
                    compact
                    items={sourceImages}
                    limit={MAX_GROUP_IMAGES}
                    label={sourceUploadLabel}
                    disabled={running}
                    onFiles={(files) => void appendFiles('sources', files)}
                    onRemove={(id) => setSourceImages((current) => current.filter((item) => item.id !== id))}
                  />
                  <p className="mt-3 text-[10px] leading-5 text-zinc-600">同一原图组会提供给每一条提示词，适合批量制作详情页、不同场景或不同角度。</p>
                </div>
                <div className="space-y-2">
                  {prompts.map((item, index) => {
                    const task = tasks.find((item) => item.sourceLabel === `提示词 ${index + 1}`);
                    return (
                      <div className="grid gap-2 rounded-2xl border border-white/8 bg-black/20 p-2 md:grid-cols-[minmax(0,1fr)_100px]" key={item.id}>
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-black text-orange-300">提示词 {index + 1}</span>
                            <div className="flex items-center gap-2">
                              <button
                                className="text-[10px] font-black text-orange-300 transition hover:text-orange-200"
                                type="button"
                                disabled={running}
                                onClick={() => setPrompts((current) => current.map((prompt) => prompt.id === item.id ? { ...prompt, value: promptTemplates[index % promptTemplates.length] } : prompt))}
                              >
                                使用模板
                              </button>
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
                          </div>
                          <div className="relative">
                            <textarea
                              className="h-[72px] w-full resize-none border-0 bg-transparent px-0 pb-5 pt-1 text-[11px] leading-4 text-zinc-300 outline-none placeholder:text-zinc-600"
                              placeholder={`例如：用原图组制作第 ${index + 1} 张电商详情图...`}
                              value={item.value}
                              disabled={running}
                              onChange={(event) => setPrompts((current) => current.map((prompt) => prompt.id === item.id ? { ...prompt, value: event.target.value.slice(0, MAX_PROMPT_LENGTH) } : prompt))}
                            />
                            <span className="pointer-events-none absolute bottom-1 right-1 text-[9px] text-zinc-600">
                              {item.value.length}/{MAX_PROMPT_LENGTH}
                            </span>
                          </div>
                        </div>
                        {task ? (
                          <TaskCard task={task} compact onDownload={() => void downloadTask(task)} />
                        ) : (
                          <div className="flex min-h-[92px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-zinc-600">
                            <Sparkles size={17} />
                            <span className="mt-1.5 text-[11px] font-black">待生成</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {prompts.length < MAX_PROMPTS ? (
                    <button
                      className="btn-secondary flex w-full min-h-0 items-center justify-center gap-1.5 py-2 text-[11px] font-black"
                      type="button"
                      disabled={running}
                      onClick={() => setPrompts((current) => [...current, createPromptItem()])}
                    >
                      <Plus size={14} />
                      添加提示词
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="app-panel custom-scrollbar flex min-h-0 flex-col overflow-auto p-3">
          <section>
            <div className="mb-2 text-[11px] font-black text-zinc-500">选择模型</div>
            <div className="grid grid-cols-2 gap-2">
              {availableModels.map((item) => {
                const active = item.id === model?.id;
                return (
                  <button
                    className={`h-[46px] min-h-0 rounded-xl border px-2.5 py-1.5 text-left transition ${active ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.035] text-zinc-400 hover:border-white/20'}`}
                    type="button"
                    disabled={running}
                    key={item.id}
                    onClick={() => changeModel(item.id)}
                  >
                    <span className="block text-[10px] font-black leading-4">{item.id === 'gpt-image-2' ? 'GPT Image 2' : item.name}</span>
                    <span className={`block truncate text-[8px] leading-3 ${active ? 'text-zinc-500' : 'text-zinc-600'}`}>{item.description}</span>
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
                <div className="mb-2 flex items-center gap-4 border-b border-white/8 pb-2 text-[11px] font-black">
                  <button
                    className={`min-h-0 p-0 ${promptPanel === 'prompt' ? 'text-zinc-300' : 'text-zinc-600'}`}
                    type="button"
                    onClick={() => setPromptPanel('prompt')}
                  >
                    图像提示词
                  </button>
                  <button
                    className={`min-h-0 p-0 ${promptPanel === 'templates' ? 'text-orange-300' : 'text-zinc-600'}`}
                    type="button"
                    onClick={() => setPromptPanel('templates')}
                  >
                    我的模板
                  </button>
                  <span className="ml-auto text-zinc-600">{unifiedPrompt.length}/{MAX_PROMPT_LENGTH}</span>
                </div>
                {promptPanel === 'prompt' ? (
                  <textarea
                    className="input h-[112px] resize-none px-3 py-2.5 text-[11px] leading-5"
                    placeholder="输入统一提示词，描述每张原图需要如何重新生成..."
                    value={unifiedPrompt}
                    disabled={running}
                    onChange={(event) => setUnifiedPrompt(event.target.value.slice(0, MAX_PROMPT_LENGTH))}
                  />
                ) : (
                  <div className="grid gap-1.5">
                    {promptTemplates.map((template, index) => (
                      <button
                        className="rounded-xl border border-orange-400/15 bg-orange-400/[0.05] px-3 py-2 text-left text-[10px] leading-4 text-orange-200 transition hover:bg-orange-400/10"
                        type="button"
                        disabled={running}
                        key={template}
                        onClick={() => {
                          setUnifiedPrompt(template);
                          setPromptPanel('prompt');
                        }}
                      >
                        <strong className="mr-2">模板 {index + 1}</strong>{template}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}

          <div className="mt-3 grid grid-cols-[0.9fr_1.1fr] gap-2">
            <section>
              <div className="mb-2 text-[11px] font-black text-zinc-500">清晰度</div>
              <div className={`grid gap-1.5 ${resolutionOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {resolutionOptions.map((item) => (
                  <button
                    className={`min-h-0 rounded-lg border px-1 py-1.5 text-[10px] font-black transition ${imageSize === item ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.035] text-zinc-500'}`}
                    type="button"
                    disabled={running}
                    key={item}
                    onClick={() => {
                      setImageSize(item);
                      if (item === 'STANDARD') setQuality('auto');
                    }}
                  >
                    {item === 'STANDARD' ? '标准' : item}
                  </button>
                ))}
              </div>
            </section>

            {model?.id === 'gpt-image-2' ? (
              <section>
                <div className="mb-2 text-[11px] font-black text-zinc-500">质量</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {qualityOptions.map((item) => (
                    <button
                      className={`min-h-0 rounded-lg border px-1 py-1.5 text-[10px] font-black transition ${quality === item.value ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.035] text-zinc-500'} ${imageSize === 'STANDARD' ? 'cursor-not-allowed opacity-45' : ''}`}
                      type="button"
                      disabled={running || imageSize === 'STANDARD'}
                      key={item.value}
                      onClick={() => setQuality(item.value)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <section>
                <div className="mb-2 text-[11px] font-black text-zinc-500">AI 增强</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[false, true].map((value) => (
                    <button
                      className={`min-h-0 rounded-lg border px-2 py-1.5 text-[10px] font-black transition ${optimizeChineseText === value ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.035] text-zinc-500'}`}
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
            )}
          </div>

          <section className="mt-3">
            <div className="mb-2 text-[11px] font-black text-zinc-500">画面比例</div>
            <div className="grid grid-cols-4 gap-1.5">
              {dimensionOptions.map((item) => (
                <button
                  className={`min-h-0 rounded-lg border px-1 py-1.5 text-[9px] font-black transition ${dimensions === item ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.035] text-zinc-500'}`}
                  type="button"
                  disabled={running}
                  key={item}
                  onClick={() => setDimensions(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>

          <div className="mt-3 border-t border-white/8 pt-3 lg:mt-auto">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-zinc-500">
              <span>预计积分：<strong className="text-white">{estimatedCredits}</strong> / {creditsRemaining}</span>
              <button className="min-h-0 p-0 font-black text-cyan-400" type="button" onClick={onPurchase}>
                在线购买积分
              </button>
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">
              共 {taskCount} 个任务，每个任务 {creditsPerTask} 积分；每个子任务沿用现有单次生成计费与失败处理规则。
            </p>
            {notice ? <div className={`mt-3 app-alert ${failedCount > 0 ? 'app-alert-error' : ''}`}>{notice}</div> : null}
            <button
              className="mt-2.5 flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,#f97316,#ea580c)] px-4 py-2.5 text-xs font-black text-white shadow-[0_12px_30px_rgba(234,88,12,0.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              disabled={running || !user || taskCount === 0 || !hasEnoughCredits}
              onClick={() => void startBatch()}
            >
              {running ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
              {running ? `生成中 ${succeededCount + failedCount}/${tasks.length}` : user ? '开始生成' : '登录后生成'}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
