import { Fragment, type ChangeEvent, type FormEvent, type ReactNode, type SyntheticEvent, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Bell,
  Bookmark,
  Clock3,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Code2 as CodeIcon,
  Copy,
  Download,
  Film,
  ImagePlus,
  Info,
  Home,
  KeyRound,
  Layers3,
	  LoaderCircle,
	  LogIn,
	  Music,
  LogOut,
  MessageCircle,
  Minus,
  Plus,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  TicketPercent,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import {
  clearSession,
  createAdminNotification,
  createPublicApiKey,
  createUserApiKey,
  createInviteCode,
  createInviteCodesBatch,
  deleteAdminUser,
  deleteAdminNotification,
  deletePublicApiKey,
  deleteInviteCode as deleteInviteCodeRequest,
  deleteInviteCodesBatch,
  downloadAsset,
  deductPublicApiKeyCredits,
  deductAdminUserCredits,
  fetchAdminDashboard,
  fetchAdminGenerationRanking,
  fetchAdminNotifications,
  fetchAdminInviteCodes,
  fetchAdminOverview,
  fetchAdminRecords,
  fetchAdminUserInviteRedemptions,
  fetchAdminUsers,
  fetchPublicApiKeyBalance,
  fetchPublicApiKeys,
  fetchUserApiKeys,
  deleteImage,
  acknowledgePromoCoupon,
  claimPromoCoupon,
  claimInvitePopup,
  fetchHealth,
  fetchNotifications,
  fetchMe,
  fetchModels,
  fetchPromoCoupon,
  fetchUserHistory,
  fetchUserImages,
  fetchGenerateImageJob,
  fetchGenerateVideoJob,
  getStoredUser,
  login,
  loginWithInvite,
  markAllNotificationsRead,
  markNotificationPopupShown,
  markNotificationRead,
  moveImage,
  rechargeAdminUserCredits,
  rechargeInviteCodeCredits as rechargeInviteCodeCreditsRequest,
  rechargePublicApiKeyCredits,
  redeemInviteCode,
  reclaimInviteCodeCredits as reclaimInviteCodeCreditsRequest,
  register,
  publishAdminNotification,
  revokePublicApiKey,
  rotateUserApiKey,
  updateUserApiKey,
  updateAdminNotification,
  updateAdminProviderRouting,
  updateAdminModelCreditPricing,
  fetchAdminAutomationStatus,
  startAdminCommit,
  startAdminDeploy,
  startGenerateImageJob,
  startGenerateVideoJob,
  type AdminDashboardStats,
  type AdminGenerationRanking,
  type AdminRecordsStats,
  type AdminUserSummary,
  type CreditSummary,
  type CreditBalances,
  type GeneratedImagePayload,
  type GenerationJobInfo,
  type VideoGenerationJobInfo,
  type GenerationRecord,
  type ImageCategory,
  type InviteCodeInfo,
  type InviteRedemptionRecord,
  type ModelInfo,
  type NotificationPayload,
  type PaginationInfo,
  type PromoCouponInfo,
  type ProviderMetricRow,
  type ProviderRiskRecord,
  type ProviderRoutingConfig,
  type PublicApiKeyInfo,
  type ReferenceUploadInput,
  type SavedImage,
  type SiteNotification,
  type UserInfo,
  type UserApiKeyInfo,
  type AdminAutomationOperation,
} from './lib/api';
import {
  DEFAULT_GPT_IMAGE_PRICING,
  type GptImagePricing,
} from './lib/model-pricing';
import {
  DEFAULT_MODEL_CREDIT_PRICING,
  getConfiguredImageCredits,
  getConfiguredVideoCredits,
  type ModelCreditPricing,
} from './lib/model-credit-config';
import { findCreationActivityStageIndex } from './lib/creation-activity';
import { getAiEnhancementRequestFlags } from './lib/image-generation-flags';
import {
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_REFERENCE_IMAGE_MB,
  MAX_REFERENCE_IMAGES,
} from './lib/reference-image-limits';
import { buildImageEditPrompt, type EditLock } from './lib/image-editing';
import { formatPromoCouponCountdown, getPromoDiscountLabel, getPromoDiscountRate } from './lib/promo-coupon';
import {
  getVideoModelConfig,
  VIDEO_GENERATION_MODELS,
  type VideoDurationSeconds,
  type VideoModelId,
  type VideoRatio,
  type VideoResolution,
} from './lib/video-pricing';
import ChatView from './ChatView';
import BatchCreateView from './BatchCreateView';

interface UploadPreview {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  previewUrl: string;
}

interface DisplayImage extends GeneratedImagePayload {
  imageUrl: string;
  thumbnailUrl?: string;
  savedImageId?: number;
  category?: ImageCategory;
  editInstruction?: string;
}

interface GenerationProgress {
  completed: number;
  total: number;
  visual: number;
  startedAt: number;
}

interface ActiveImageGeneration {
  id: string;
  progress: GenerationProgress;
  images: DisplayImage[];
}

const defaultModels: ModelInfo[] = [
  { id: 'gpt-image-2', name: 'GPT-image-2', description: 'OpenAI\u6700\u5f3a\u751f\u56fe\u6a21\u578b\uff01' },
  { id: 'Nano_Banana_Pro', name: 'Nano Banana Pro', description: '\u8c37\u6b4c\u6700\u5f3a\u751f\u56fe\u6a21\u578b\uff01' },
  { id: 'Seedream_4', name: 'Seedream 4', description: '\u5373\u68a6 Seedream 4 \u751f\u56fe\u6a21\u578b' },
];

type DimensionOption = '1:1' | '3:2' | '16:9' | '4:3' | '9:16' | '3:4' | '2:3' | '21:9';
type ImageSizeOption = 'STANDARD' | '1K' | '2K' | '4K';
type GptQualityOption = 'auto' | 'low' | 'medium' | 'high';
type AppTab = 'home' | 'create' | 'batchCreate' | 'chat' | 'history' | 'apiDocs' | 'admin';
type AdminSection = 'dashboard' | 'modelCredits' | 'notifications' | 'invites' | 'users' | 'records' | 'apiKeys';

const APP_TAB_PATHS: Record<AppTab, string> = {
  home: '/',
  create: '/create',
  batchCreate: '/batch-create',
  chat: '/chat',
  history: '/history',
  apiDocs: '/apidoc',
  admin: '/manage',
};

function getTabPath(tab: AppTab) {
  return APP_TAB_PATHS[tab] || '/';
}

function getTabFromPath(pathname: string, canAccessAdmin: boolean) {
  if (pathname === '/create') return 'create';
  if (pathname === '/batch-create') return 'batchCreate';
  if (pathname === '/chat') return 'home';
  if (pathname === '/history') return 'history';
  if (pathname === '/apidoc') return 'apiDocs';
  if (pathname === '/manage') return canAccessAdmin ? 'admin' : 'home';
  return 'home';
}

interface AdminOverviewState {
  users: AdminUserSummary[];
  usersPage: PaginationInfo;
  records: GenerationRecord[];
  recordsPage: PaginationInfo;
  inviteCodes: InviteCodeInfo[];
  inviteCodesPage: PaginationInfo;
  adminCredits: CreditSummary;
  dashboardStats: AdminDashboardStats;
  providerMetrics: ProviderMetricRow[];
  providerRisks: ProviderRiskRecord[];
  generationRanking: AdminGenerationRanking;
  recordsStats: AdminRecordsStats;
  recordModelOptions: string[];
  recordResolutionOptions: string[];
}

const emptyPage: PaginationInfo = {
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1,
};

const emptyDashboardStats: AdminDashboardStats = {
  todayRecordCount: 0,
  todayCreditsUsed: 0,
  inviteUsageRate: 0,
  lowCreditUserCount: 0,
  userCount: 0,
  inviteCodeCount: 0,
  recordCount: 0,
  usedInviteCodeCount: 0,
};

const defaultProviderRouting: ProviderRoutingConfig = {
  image2Routes: {
    '1K': [
      { id: 'junliai-economy', enabled: true },
      { id: 'junliai-firefly', enabled: true },
      { id: 'schat-gpt-image-2', enabled: false },
      { id: 'uselg', enabled: true },
      { id: 'visionary', enabled: true },
    ],
    '2K': [
      { id: 'junliai-firefly', enabled: true },
      { id: 'schat-gpt-image-2', enabled: false },
      { id: 'uselg', enabled: true },
      { id: 'visionary', enabled: true },
    ],
    '4K': [
      { id: 'junliai-firefly', enabled: true },
      { id: 'schat-gpt-image-2', enabled: false },
      { id: 'uselg', enabled: true },
      { id: 'visionary', enabled: true },
    ],
  },
  bananaRoutes: {
    '1K': [
      { id: 'flux', enabled: true },
      { id: 'visionary', enabled: true },
      { id: 'junliai', enabled: true },
      { id: 'junliai-nano-banana-2', enabled: true },
      { id: 'schat-nano-banana-2', enabled: false },
    ],
    '2K': [
      { id: 'flux', enabled: true },
      { id: 'visionary', enabled: true },
      { id: 'junliai', enabled: true },
      { id: 'junliai-nano-banana-2', enabled: true },
    ],
    '4K': [
      { id: 'flux', enabled: true },
      { id: 'visionary', enabled: true },
      { id: 'junliai', enabled: true },
    ],
  },
  seedreamRoutes: {
    '1K': [],
    '2K': [{ id: 'schat-seedream-4', enabled: false }],
    '4K': [{ id: 'schat-seedream-4', enabled: false }],
  },
  grokImageRoutes: {
    '1K': [{ id: 'junliai-grok', enabled: true }],
    '2K': [{ id: 'junliai-grok', enabled: true }],
    '4K': [],
  },
  junliaiGeminiVeo31: true,
  junliaiGrokVideo: true,
  schatSeedance25: false,
  junliaiSd2Fast: false,
};

const PROVIDER_CHANNEL_NAMES: Record<string, string> = {
  'junliai-economy': 'Junli · GPT 经济版',
  'junliai-firefly': 'Junli · Firefly',
  'schat-gpt-image-2': 'Schat · GPT Image 2',
  'uselg': 'Uselg · Flux',
  'junliai-grok': 'Junli · Grok Image',
  'visionary': 'Visionary',
  'flux': 'Flux',
  'junliai': 'Junli · Nano Banana Pro',
  'junliai-nano-banana-2': 'Junli · Nano Banana 2',
  'schat-nano-banana-2': 'Schat · Nano Banana 2',
  'schat-seedream-4': 'Schat · Seedream 4',
};

function providerChannelName(id: string) {
  return PROVIDER_CHANNEL_NAMES[id] ?? id;
}

// 用户端只展示前端模型名（GPT-image-2 / Nano Banana Pro / Seedream 4 / Grok Image），
// 隐藏内部渠道与上游模型（如 "Flux · gemini-3-pro-image-preview"）。
function displayModelName(modelName: string) {
  const value = String(modelName ?? '').trim();
  if (!value) return value;
  const probe = value.toLowerCase();
  if (probe.includes('seedream')) return 'Seedream 4';
  if (probe.includes('grok')) return 'Grok Image';
  if (probe.includes('gpt-image') || probe.includes('firefly')) return 'GPT-image-2';
  if (
    probe.includes('nano-banana') ||
    probe.includes('nano banana') ||
    probe.includes('gemini') ||
    probe.includes('banana')
  ) {
    return 'Nano Banana Pro';
  }
  // 未识别时也隐藏渠道前缀，避免暴露内部渠道名
  const parts = value.split('·');
  return parts.length > 1 ? parts[parts.length - 1].trim() || value : value;
}

function isImageResolutionEnabled(
  routing: ProviderRoutingConfig,
  modelId: string,
  imageSize: string,
) {
  const resolution = imageSize === '2K' || imageSize === '4K' ? imageSize : '1K';
  const channels = modelId === 'Nano_Banana_Pro'
    ? routing.bananaRoutes[resolution]
    : modelId === 'Seedream_4'
      ? routing.seedreamRoutes[resolution]
      : modelId === 'Grok_Image'
        ? routing.grokImageRoutes[resolution]
        : routing.image2Routes[resolution];
  return channels.some((channel) => channel.enabled);
}

const emptyRecordsStats: AdminRecordsStats = {
  todayCreditsUsed: 0,
  todayRecordCount: 0,
  totalCreditsUsed: 0,
  mostUsedModel: '',
  mostActiveHour: '',
};

function getMaxReferences(modelId: string) {
  return modelId === 'Grok_Image' ? 3 : MAX_REFERENCE_IMAGES;
}
function getMaxReferenceMB(modelId: string) {
  return modelId === 'Seedream_4' ? 20 : MAX_REFERENCE_IMAGE_MB;
}
const MAX_PROMPT_LENGTH = 8000;
const MAX_BATCH_COUNT = 5;
const ADMIN_STATS_TIME_ZONE = 'Asia/Shanghai';

// 灶台阶段状态按标签页隔离地读写 sessionStorage（每个窗口独立，互不串扰）。
function readStageStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStageStorage<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 忽略配额/序列化异常，不影响界面
  }
}

const dimensionOptions: Array<{ value: DimensionOption; label: string }> = [
  { value: '1:1', label: '1:1' },
  { value: '3:2', label: '3:2' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '21:9', label: '21:9' },
  { value: '9:16', label: '9:16' },
  { value: '3:4', label: '3:4' },
  { value: '2:3', label: '2:3' },
];

const gptImageSizeOptions: Array<{ value: ImageSizeOption; label: string; hint: string }> = [
  { value: 'STANDARD', label: '\u6807\u51c6', hint: '' },
  { value: '2K', label: '2K', hint: '' },
  { value: '4K', label: '4K', hint: '' },
];

const gptQualityOptions: Array<{ value: GptQualityOption; label: string }> = [
  { value: 'auto', label: 'auto' },
  { value: 'low', label: '\u4f4e' },
  { value: 'medium', label: '\u4e2d' },
  { value: 'high', label: '\u9ad8' },
];

const gptHighQualityTips = [
  '\u66f4\u9ad8\u8d28\u91cfPRO\u6a21\u578b\uff01',
  '\u4e2d\u6587\u4e71\u7801\u7387\u6781\u4f4e\uff01',
  '\u8fdd\u89c4\u63d0\u793a\u8bcd\u9650\u5236\u66f4\u4e25\u683c\uff01',
];

const imageSizeOptions: Array<{ value: ImageSizeOption; label: string; hint: string }> = [
  { value: '1K', label: '1K', hint: '\u5feb\u901f\u8f93\u51fa' },
  { value: '2K', label: '2K', hint: '\u7a33\u5b9a\u9ad8\u6e05\u8f93\u51fa' },
  { value: '4K', label: '4K', hint: '\u8d85\u6e05\u8f93\u51fa\uff0c\u7ec6\u8282\u66f4\u5f3a' },
];

function fileToBase64(file: File, maxBytes = 25 * 1024 * 1024, maxMB = 25) {

  if (file.size > maxBytes) {
    throw new Error(`"${file.name}"超过 ${maxMB}MB，请压缩后再上传`);
  }

  return new Promise<UploadPreview>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('文件读取失败'));
        return;
      }

      resolve({
        id: `${file.name}-${file.lastModified}`,
        name: file.name,
        mimeType: file.type || 'image/png',
        data: reader.result,
        previewUrl: reader.result,
      });
    };

    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

async function imageToReferenceInput(image: DisplayImage): Promise<ReferenceUploadInput> {
  const blob = await downloadAsset(image.imageUrl, 'edit-source', { save: false });
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('读取当前图片失败，请稍后重试');
  }
  if (!blob.type.startsWith('image/')) throw new Error('当前结果不是可编辑的图片格式');
  if (blob.size > 25 * 1024 * 1024) {
    throw new Error(`当前图片超过 25MB，暂时无法连续编辑`);
  }
  const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const preview = await fileToBase64(new File([blob], `edit-source.${extension}`, { type: blob.type }));
  return { name: preview.name, mimeType: preview.mimeType, data: preview.data };
}

function toDisplayImage(payload: GeneratedImagePayload): DisplayImage {
  return {
    ...payload,
    imageUrl: payload.imagePath,
    thumbnailUrl: payload.thumbnailPath,
  };
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\//g, '/');
}

const ORIGINAL_IMAGE_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

function isOriginalImageExpired(createdAt: string) {
  const createdTime = new Date(createdAt).getTime();
  return Number.isFinite(createdTime) && Date.now() - createdTime >= ORIGINAL_IMAGE_RETENTION_MS;
}

function isVideoAssetUrl(value: string) {
  return /\.mp4(?:$|[?#])/i.test(value);
}

function fallbackToOriginal(event: SyntheticEvent<HTMLImageElement>, originalUrl: string) {
  const image = event.currentTarget;
  if (!originalUrl || image.dataset.originalFallback === 'true') return;
  image.dataset.originalFallback = 'true';
  image.src = originalUrl;
}

function fallbackToThumbnail(event: SyntheticEvent<HTMLImageElement>, thumbnailUrl?: string) {
  const image = event.currentTarget;
  if (!thumbnailUrl || image.dataset.thumbnailFallback === 'true') return;
  image.dataset.thumbnailFallback = 'true';
  image.src = thumbnailUrl;
}

function formatApiRequestTime(value?: number) {
  const milliseconds = Number(value || 0);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '-';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function formatDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_STATS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((item) => item.type === 'year')?.value || '0000';
  const month = parts.find((item) => item.type === 'month')?.value || '00';
  const day = parts.find((item) => item.type === 'day')?.value || '00';
  return `${year}-${month}-${day}`;
}

function formatHourKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: ADMIN_STATS_TIME_ZONE,
    hour: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

function formatCouponTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getGenerationPercent(progress: GenerationProgress | null) {
  if (!progress) return 0;
  const completedPercent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
  return Math.max(4, Math.min(99, Math.round(Math.max(progress.visual, completedPercent))));
}

function getGenerationHint(percent: number) {
  if (percent < 18) return '正在理解你的提示词，先把灵感翻译成画面语言。';
  if (percent < 38) return '正在规划构图、光影和主体关系，画面骨架快搭好了。';
  if (percent < 62) return '细节正在慢慢长出来，材质、色彩和氛围都在校准。';
  if (percent < 84) return '进入精修阶段了，系统正在检查边缘、纹理和整体一致性。';
  return '最后收尾中，请别刷新页面，好图马上抵达。';
}

function getActivityPreviewRange(hour = new Date().getHours()) {
  if (hour >= 6 && hour < 12) return { min: 1_000, max: 2_000 };
  if (hour >= 12 && hour < 18) return { min: 3_000, max: 4_000 };
  return { min: 2_000, max: 3_000 };
}

function createActivityPreviewCount() {
  const { min, max } = getActivityPreviewRange();
  return Math.round(min + (max - min) * 0.52);
}

const GENERATION_JOB_POLL_INTERVAL_MS = 2000;
// 生成任务在服务端异步执行；轮询命中网络/网关抖动时不应过早放弃。
// 用一个宽松的整体上限兜底，避免因瞬时抖动把「后台其实还在正常生成」的任务误判为失败。
const GENERATION_JOB_POLL_MAX_MS = 6 * 60_000;
const SHOW_CREATION_ACTIVITY = true;
const SHOW_PROMO_COUPON_HEADER_ENTRY = false;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getFriendlyJobProgress(job: GenerationJobInfo, fallbackStartedAt: number) {
  if (job.status === 'succeeded') return 100;
  const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : fallbackStartedAt;
  const elapsedMs = Math.max(0, Date.now() - (Number.isFinite(startedAt) ? startedAt : fallbackStartedAt));
  const elapsedSeconds = elapsedMs / 1000;
  const timeProgress =
    elapsedSeconds < 20
      ? 8 + (elapsedSeconds / 20) * 28
      : 36 + (1 - Math.exp(-(elapsedSeconds - 20) / 90)) * 58;
  return Math.max(6, Math.min(96, Math.round(Math.max(job.progress || 0, timeProgress))));
}

function getBatchVisualProgress(completed: number, total: number, activeJobPercent: number) {
  if (total <= 0) return 0;
  return Math.min(99, ((completed + activeJobPercent / 100) / total) * 100);
}

function getModelCredits(
  model: Pick<ModelInfo, 'id' | 'creditsCost'> | null,
  options?: {
    imageSize?: ImageSizeOption;
    quality?: GptQualityOption;
    optimizeChineseText?: boolean;
    pricing?: GptImagePricing;
    modelCreditPricing?: ModelCreditPricing;
  },
) {
  if (!model) return 0;
  const configuredPricing = options?.modelCreditPricing || DEFAULT_MODEL_CREDIT_PRICING;
  if (model.id === 'gpt-image-2') {
    return getConfiguredImageCredits(configuredPricing, model.id, options?.imageSize || 'STANDARD', options?.quality || 'auto');
  }
  if (model.id === 'Nano_Banana_Pro') {
    const baseCredits = getConfiguredImageCredits(configuredPricing, model.id, options?.imageSize || '2K');
    const enhancementCredits = options?.optimizeChineseText
      ? options.imageSize === '1K' || options.imageSize === '2K' || options.imageSize === '4K'
        ? configuredPricing.nanoBanana.enhancement
        : 0
      : 0;
    return baseCredits + enhancementCredits;
  }
  if (model.id === 'Seedream_4') {
    return getConfiguredImageCredits(configuredPricing, model.id, options?.imageSize || '2K');
  }
  if (typeof model.creditsCost === 'number') return model.creditsCost;
  return 1;
}

function getModelSortOrder(modelId: string) {
  if (modelId === 'gpt-image-2') return 0;
  if (modelId === 'Nano_Banana_Pro') return 1;
  if (modelId === 'Seedream_4') return 2;
  return 99;
}

function getAvailableUserCredits(user: UserInfo | null, bucket: 'gpt' | 'banana' | 'general') {
  if (!user) return 0;
  const balances = user.creditBalances;
  if (!balances) return user.creditsRemaining ?? 0;
  return bucket === 'general' ? balances.general : balances[bucket] + balances.general;
}

function getModelSuccessRate(modelId: string) {
  if (modelId === 'gpt-image-2') return '99%成功率';
  return '';
}

function CreditsSummary({
  user,
  selectedModel,
  creditsCost,
  creditsRemaining,
  onOpenPurchase,
}: {
  user: UserInfo | null;
  selectedModel: ModelInfo | null;
  creditsCost: number;
  creditsRemaining: number;
  onOpenPurchase: () => void;
}) {
  const insufficientCredits = Boolean(user) && creditsRemaining < creditsCost;

  return (
    <div className="space-y-1 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-zinc-300">
          使用积分: <span className="text-white">{creditsCost}</span>/<span className="text-white">{creditsRemaining ?? '--'}</span>
        </span>
        <button
          className="min-h-0 p-0 text-[12px] font-black text-cyan-400 transition hover:text-cyan-300"
          type="button"
          onClick={onOpenPurchase}
        >
          点击在线购买积分(25%优惠)
        </button>
      </div>
      {selectedModel ? (
        <p className={`text-sm ${insufficientCredits ? 'text-zinc-300' : 'text-zinc-400'}`}>
          {insufficientCredits ? '当前积分已用完，暂时无法继续生成图片。' : `当前模型 ${selectedModel.name}，积分充足可继续生成图片。`}
        </p>
      ) : null}
    </div>
  );
}

function StageCard({
  item,
  loading,
  progress,
  showActions,
  downloading,
  onDownload,
  onSave,
  onDelete,
  onPreview,
  onEdit,
  showActivity,
  activityPreviewCount,
}: {
  item: DisplayImage | null;
  loading?: boolean;
  progress?: GenerationProgress | null;
  showActions?: boolean;
  downloading?: boolean;
  onDownload?: () => void;
  onSave?: (category: ImageCategory) => void;
  onDelete?: () => void;
  onPreview?: (item: DisplayImage) => void;
  onEdit?: (item: DisplayImage) => void;
  showActivity?: boolean;
  activityPreviewCount?: number;
}) {
  const percent = loading ? getGenerationPercent(progress || null) : 0;
  const currentBatch = progress ? Math.min(progress.completed + 1, progress.total) : 1;

  return (
    <article className="stage-card relative flex min-h-[108px] flex-col overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,12,14,0.98)_0%,rgba(8,8,10,0.98)_100%)] p-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)] sm:h-[108px] sm:flex-row sm:p-3">
      <div
        className={`relative h-40 w-full shrink-0 overflow-hidden rounded-[18px] border sm:h-full sm:w-[112px] ${
          loading ? 'border-pink-300/25 bg-pink-300/10' : 'border-white/8 bg-black/45'
        }`}
      >
        {loading ? (
          <div className="generation-orbit flex h-full w-full items-center justify-center">
            <span className="text-center text-[11px] font-black leading-5 text-pink-100">灶台工作中</span>
          </div>
        ) : item ? (
          <button className="h-full w-full" type="button" onClick={() => onPreview?.(item)}>
            <img alt={item.prompt} className="h-full w-full object-cover" src={item.thumbnailUrl || item.imageUrl} onError={(event) => fallbackToOriginal(event, item.imageUrl)} />
          </button>
        ) : (
          <div className="flex h-full w-full items-center justify-center border border-dashed border-white/10 text-[11px] font-black text-zinc-300">
            空闲中
          </div>
        )}
      </div>

      {loading ? (
        <div className="relative flex min-w-0 flex-1 flex-col justify-center overflow-hidden rounded-[18px] border border-pink-300/15 bg-[radial-gradient(circle_at_12%_0%,rgba(255,143,205,0.2),transparent_34%),linear-gradient(135deg,rgba(20,8,16,0.86),rgba(6,6,8,0.9))] px-4 py-3 sm:ml-3 sm:py-0">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="generation-grid h-full w-full" />
          </div>
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-black text-white">
                <LoaderCircle className="animate-spin text-[#ffb7df]" size={15} />
                <span>正在生成你的作品</span>
              </div>
              <p className="mt-1 truncate text-[11px] font-semibold text-zinc-400">
                {progress && progress.total > 1 ? `第 ${currentBatch} / ${progress.total} 张` : '保持页面打开，灵感正在成形'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-black leading-none text-[#ffd9ef]">{percent}%</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff8fcd]">render</p>
            </div>
          </div>
          <div className="relative mt-3">
            <div className="h-2 overflow-hidden rounded-full border border-white/8 bg-black/45 shadow-[inset_0_0_10px_rgba(0,0,0,0.55)]">
              <div
                className="generation-progress-fill relative h-full rounded-full bg-[linear-gradient(90deg,#ff8fcd_0%,#ffd1ea_48%,#7dd3fc_100%)] shadow-[0_0_18px_rgba(255,143,205,0.7)] transition-[width] duration-700 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="generation-scan pointer-events-none absolute inset-y-0 left-0 h-2 w-1/3 rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.8),transparent)]" />
          </div>
          <div className="relative mt-2 text-[11px] font-semibold text-[#ffd9ef]/90">
            {getGenerationHint(percent)}
          </div>
        </div>
      ) : item ? (
        <div className="relative flex min-w-0 flex-1 flex-col justify-between rounded-[18px] border border-white/6 bg-black/35 px-4 py-3 sm:ml-3">
          <div className="min-w-0">
            <button
              className="block max-w-full truncate text-left text-sm font-semibold text-white hover:text-pink-200"
              type="button"
              onClick={() => onPreview?.(item)}
            >
              {item.prompt}
            </button>
            <p className="mt-1 text-xs text-zinc-500">
              {displayModelName(item.modelName)} / {item.dimensions}
              {item.imageSize ? ` / ${item.imageSize}` : ''}
            </p>
          </div>
          {showActions ? (
            <div className="flex flex-wrap gap-1.5">
              {onEdit ? (
                <button
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-sky-400/25 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-100 transition hover:bg-sky-500/20"
                  type="button"
                  onClick={() => onEdit(item)}
                >
                  <MessageCircle size={12} />
                  继续修改
                </button>
              ) : null}
              <button
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100 transition hover:bg-emerald-500/20"
                type="button"
                onClick={() => onSave?.('favorite')}
              >
                <Star size={12} />
                满意
              </button>
              <button
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-pink-400/25 bg-pink-500/10 px-2 py-1 text-[11px] text-pink-100 transition hover:bg-pink-500/20"
                type="button"
                onClick={() => onSave?.('backup')}
              >
                <Bookmark size={12} />
                备份
              </button>
              <button
                className={`inline-flex w-[74px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] text-zinc-200 transition ${
                  downloading
                    ? 'cursor-wait opacity-60'
                    : 'hover:border-white/20 hover:text-white'
                }`}
                type="button"
                onClick={onDownload}
                disabled={downloading}
              >
                <Download size={12} className={downloading ? 'animate-spin' : ''} />
                {downloading ? '下载中…' : '下载'}
              </button>
              <button
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-400/25 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-100 transition hover:bg-rose-500/20"
                type="button"
                onClick={onDelete}
              >
                <Trash2 size={12} />
                删除
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="relative flex min-w-0 flex-1 items-center justify-center rounded-[18px] border border-white/6 bg-black/45 px-4 py-3 text-[12px] font-black text-zinc-200 sm:ml-3 sm:py-0">
          等待下单...
        </div>
      )}
    </article>
  );
}

function ContinuousEditPanel({
  versions,
  currentImage,
  instruction,
  locks,
  loading,
  creditsCost,
  creditsRemaining,
  onInstructionChange,
  onToggleLock,
  onSelectVersion,
  onSubmit,
  onClose,
}: {
  versions: DisplayImage[];
  currentImage: DisplayImage;
  instruction: string;
  locks: Set<EditLock>;
  loading: boolean;
  creditsCost: number;
  creditsRemaining: number;
  onInstructionChange: (value: string) => void;
  onToggleLock: (lock: EditLock) => void;
  onSelectVersion: (image: DisplayImage) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const quickActions = [
    ['换背景', '只更换背景，其他内容保持不变'],
    ['删除元素', '删除画面中不需要的元素'],
    ['调整光线', '调整画面光线和色彩，让整体更有质感'],
  ] as const;
  const lockOptions: Array<{ id: EditLock; label: string }> = [
    { id: 'person', label: '锁定人物' },
    { id: 'composition', label: '锁定构图' },
    { id: 'text', label: '锁定文字' },
  ];

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-[20px] border border-white/8 bg-black/25 lg:h-full">
      <div className="flex items-start justify-between gap-3 border-b border-white/8 px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-black text-white">继续编辑这张图</h2>
            <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold text-sky-200">
              自动引用当前版本
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-zinc-500">直接描述修改要求，每次生成都会保留一个版本。</p>
        </div>
        <button className="btn-ghost min-h-0 shrink-0 px-2 py-1.5 text-[11px] text-zinc-400" type="button" onClick={onClose}>
          结束编辑
        </button>
      </div>

      <div className="custom-scrollbar min-h-[180px] flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2.5 text-[11px] leading-5 text-zinc-400">
          图片已准备好。你不需要下载或重新上传，告诉我下一步想改什么即可。
        </div>
        {versions.slice(1).map((item, index) => (
          <div className="ml-auto max-w-[92%] rounded-xl border border-sky-400/15 bg-sky-400/10 px-3 py-2.5 text-[11px] leading-5 text-zinc-200" key={item.imageUrl}>
            {item.editInstruction || item.prompt}
            <div className="mt-1 text-[10px] text-zinc-500">已生成 V{index + 2}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/8 px-3 py-3">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {versions.map((item, index) => {
            const active = item.imageUrl === currentImage.imageUrl;
            return (
              <button
                className={`flex shrink-0 items-center gap-2 rounded-lg border p-1.5 pr-2.5 text-[10px] transition ${
                  active ? 'border-sky-300/45 bg-sky-400/10 text-white' : 'border-white/8 bg-white/[0.025] text-zinc-500 hover:text-zinc-200'
                }`}
                type="button"
                key={item.imageUrl}
                onClick={() => onSelectVersion(item)}
              >
                <img className="h-8 w-8 rounded-md object-cover" src={item.thumbnailUrl || item.imageUrl} alt="" />
                {index === 0 ? '原图' : `V${index + 1}`}
              </button>
            );
          })}
        </div>

        <form className="space-y-2" onSubmit={onSubmit}>
          <div className="flex flex-wrap gap-1.5">
            {lockOptions.map((item) => {
              const active = locks.has(item.id);
              return (
                <button
                  className={`min-h-0 rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${
                    active ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-white/10 text-zinc-500 hover:text-zinc-300'
                  }`}
                  type="button"
                  key={item.id}
                  aria-pressed={active}
                  onClick={() => onToggleLock(item.id)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map(([label, value]) => (
              <button
                className="min-h-0 rounded-full border border-white/8 bg-white/[0.035] px-2.5 py-1 text-[10px] text-zinc-400 transition hover:text-white"
                type="button"
                key={label}
                onClick={() => onInstructionChange(instruction ? `${instruction}；${value}` : value)}
              >
                {label}
              </button>
            ))}
          </div>
          <textarea
            className="input h-[82px] resize-none px-3 py-2.5 text-[12px] leading-5 placeholder:text-zinc-600"
            placeholder="例如：天空再偏紫一点，人物和构图保持不变……"
            value={instruction}
            maxLength={MAX_PROMPT_LENGTH}
            onChange={(event) => onInstructionChange(event.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-500">预计 {creditsCost} 积分 / 剩余 {creditsRemaining} · 失败自动退回</span>
            <button
              className="btn-primary min-h-0 px-3 py-2 text-[11px] font-black disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={loading || !instruction.trim() || creditsRemaining < creditsCost}
            >
              {loading ? <LoaderCircle className="animate-spin" size={13} /> : <Sparkles size={13} />}
              {loading ? '生成中...' : '生成新版本'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreationHeatSlot({ count }: { count: number }) {
  return (
    <span
      className="absolute right-2 top-1/2 flex h-[60px] -translate-y-1/2 items-center gap-1 overflow-hidden rounded-lg border border-sky-400/10 bg-sky-400/[0.045] px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
      aria-label="实时创作动态"
    >
      <UserRound size={12} className="shrink-0 text-sky-400" />
      <span className="whitespace-nowrap text-[9px] font-black text-sky-200" aria-live="polite">
        当前下单人数：<span className="text-amber-400">{count.toLocaleString('zh-CN')}</span>
      </span>
    </span>
  );
}

function SidePanel({
  title,
  count,
  icon,
  items,
  emptyText,
  actionLabel,
  onAction,
  onMove,
  onDelete,
  loggedIn,
}: {
  title: string;
  count: number;
  icon: ReactNode;
  items: SavedImage[];
  emptyText: string;
  actionLabel?: string;
  onAction?: () => void;
  onMove?: (item: SavedImage) => void;
  onDelete?: (item: SavedImage) => void;
  loggedIn: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-md border border-white/8 bg-white/[0.03] p-1.5 text-zinc-300">{icon}</span>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white">{title}</h3>
            <span className="text-xs text-zinc-500">{count}</span>
          </div>
        </div>

        {actionLabel && onAction ? (
          <button
            className="btn-secondary min-h-0 px-3 py-1.5 text-xs"
            type="button"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>

      <div className="card min-h-[138px] p-3">
        {items.length > 0 ? (
          <div className="custom-scrollbar flex max-w-full gap-3 overflow-x-auto overflow-y-hidden pb-1">
            {items.map((item) => (
              <article key={item.id} className="card w-36 shrink-0 p-2.5">
                <img alt={item.prompt} className="h-20 w-full rounded-xl object-cover" src={item.thumbnailUrl || item.imageUrl} onError={(event) => fallbackToOriginal(event, item.imageUrl)} />
                <p className="mt-2 text-xs leading-5 text-zinc-300">{item.prompt}</p>
                <p className="mt-2 text-[11px] text-zinc-500">{formatTime(item.createdAt)}</p>

                {loggedIn ? (
                  <div className="mt-2 flex gap-2">
                    {onMove ? (
                      <button
                        className="btn-secondary min-h-0 px-2 py-1 text-[11px]"
                        type="button"
                        onClick={() => onMove(item)}
                      >
                        移回主区
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        className="btn-ghost min-h-0 px-2 py-1 text-[11px]"
                        type="button"
                        onClick={() => onDelete(item)}
                      >
                        删除
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[112px] items-center justify-center px-5 text-center text-sm leading-7 text-zinc-500">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}

function VideoCreateView({
  user,
  providerRouting,
  modelCreditPricing,
  onSwitchImage,
  onLogin,
  onPurchase,
  onCreditsChange,
}: {
  user: UserInfo | null;
  providerRouting: ProviderRoutingConfig;
  modelCreditPricing: ModelCreditPricing;
  onSwitchImage: () => void;
  onLogin: () => void;
  onPurchase: () => void;
  onCreditsChange: (creditsRemaining: number) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState<VideoModelId>('sd2.0fast');
  const [ratio, setRatio] = useState<VideoRatio>('16:9');
  const [resolution, setResolution] = useState<VideoResolution>('720p');
  const [seconds, setSeconds] = useState<VideoDurationSeconds>(4);
  const modelConfig = getVideoModelConfig(modelId);
  const creditsNeeded = getConfiguredVideoCredits(modelCreditPricing, modelId, resolution, seconds);
  const availableVideoCredits = getAvailableUserCredits(user, 'general');
  const isSd2Fast = modelId === 'sd2.0fast';
  const [references, setReferences] = useState<UploadPreview[]>([]);
  const [audioReferences, setAudioReferences] = useState<UploadPreview[]>([]);
  const [realPerson, setRealPerson] = useState(false);
  const [job, setJob] = useState<VideoGenerationJobInfo | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [recentVideos, setRecentVideos] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const pollingRunRef = useRef(0);

  useEffect(() => () => {
    pollingRunRef.current += 1;
  }, []);

  const isVideoModelEnabled = (candidate: VideoModelId) => candidate === 'gemini-veo31'
    ? providerRouting.junliaiGeminiVeo31
    : candidate === 'seedance2.5'
      ? providerRouting.schatSeedance25
      : candidate === 'sd2.0fast'
        ? providerRouting.junliaiSd2Fast
        : providerRouting.junliaiGrokVideo;

  function selectVideoModel(nextModelId: VideoModelId) {
    const next = getVideoModelConfig(nextModelId);
    setModelId(nextModelId);
    setRatio((current) => next.ratios.includes(current) ? current : next.ratios[0]);
    setResolution((current) => next.resolutions.includes(current) ? current : next.resolutions[0]);
    setSeconds(next.durations[0]);
    setError('');
  }

  useEffect(() => {
    if (isVideoModelEnabled(modelId)) return;
    const next = VIDEO_GENERATION_MODELS.find((candidate) => isVideoModelEnabled(candidate.id));
    if (next) selectVideoModel(next.id);
  }, [modelId, providerRouting.junliaiGrokVideo, providerRouting.junliaiGeminiVeo31, providerRouting.schatSeedance25, providerRouting.junliaiSd2Fast]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files: File[] = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    setError('');

    const maxImages = isSd2Fast ? 9 : 2;
    const maxMB = isSd2Fast ? 30 : 20;
    const maxBytes = maxMB * 1024 * 1024;

    const remaining = Math.max(0, maxImages - references.length);
    if (remaining === 0) {
      setError(`最多上传 ${maxImages} 张参考图`);
      return;
    }

    const selected = files.slice(0, remaining);
    const oversized = selected.find((file) => file.size > maxBytes);
    if (oversized) {
      setError(`${oversized.name} 超过 ${maxMB}MB，请压缩后再上传`);
      return;
    }

    try {
      const next = await Promise.all(selected.map((file) => fileToBase64(file, maxBytes, maxMB)));
      setReferences((current) => [...current, ...next].slice(0, maxImages));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '参考图读取失败');
    }
  }

  async function handleAudioUpload(event: ChangeEvent<HTMLInputElement>) {
    const files: File[] = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    setError('');

    const maxAudio = 3;
    const maxMB = 15;
    const maxBytes = maxMB * 1024 * 1024;

    const remaining = Math.max(0, maxAudio - audioReferences.length);
    if (remaining === 0) {
      setError('最多上传 3 个音频文件');
      return;
    }

    const selected = files.slice(0, remaining);
    const oversized = selected.find((file) => file.size > maxBytes);
    if (oversized) {
      setError(`${oversized.name} 超过 ${maxMB}MB，请压缩后再上传`);
      return;
    }

    try {
      const next = await Promise.all(selected.map((file) => fileToBase64(file, maxBytes, maxMB)));
      setAudioReferences((current) => [...current, ...next].slice(0, maxAudio));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '音频文件读取失败');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      onLogin();
      return;
    }

    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      setError('请先填写视频提示词');
      return;
    }

    if (availableVideoCredits < creditsNeeded) {
      setError(`积分不足，${resolution} 视频需要 ${creditsNeeded} 积分`);
      return;
    }

    const runId = pollingRunRef.current + 1;
    pollingRunRef.current = runId;
    setError('');
    setVideoUrl('');
    setGenerating(true);

    try {
      const started = await startGenerateVideoJob({
        modelId,
        prompt: normalizedPrompt,
        ratio,
        resolution,
        seconds,
        referenceImages: references.map(({ name, mimeType, data }) => ({ name, mimeType, data })),
        ...(isSd2Fast ? {
          audioReferences: audioReferences.map(({ name, mimeType, data }) => ({ name, mimeType, data })),
          realPerson,
        } : {}),
      });
      setJob(started.job);

      let currentJob = started.job;
      while (pollingRunRef.current === runId && currentJob.status !== 'succeeded' && currentJob.status !== 'failed') {
        await new Promise((resolve) => window.setTimeout(resolve, 4_000));
        if (pollingRunRef.current !== runId) return;
        const result = await fetchGenerateVideoJob(currentJob.id);
        currentJob = result.job;
        setJob(currentJob);
      }

      if (pollingRunRef.current !== runId) return;
      if (currentJob.status === 'failed') {
        throw new Error(currentJob.error || '视频生成失败，请稍后重试');
      }
      if (!currentJob.videoUrl) {
        throw new Error('视频已生成，但暂时无法读取结果');
      }

      setVideoUrl(currentJob.videoUrl);
      setRecentVideos((current) => [currentJob.videoUrl!, ...current.filter((item) => item !== currentJob.videoUrl)].slice(0, 6));
      if (typeof currentJob.creditsRemaining === 'number') {
        onCreditsChange(currentJob.creditsRemaining);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '视频生成失败，请稍后重试');
    } finally {
      if (pollingRunRef.current === runId) setGenerating(false);
    }
  }

  const progress = Math.max(0, Math.min(100, Math.round(job?.progress || 0)));
  const videoFrameClass = ratio === '9:16'
    ? 'aspect-[9/16] max-h-full'
    : ratio === '1:1'
      ? 'aspect-square max-h-full'
      : 'aspect-video w-full';

  return (
    <div className="col-span-full grid min-h-0 grid-cols-1 space-y-4 lg:h-full lg:grid-cols-[2fr_3fr_2fr] lg:space-y-0">
      <aside className="app-panel custom-scrollbar overflow-visible px-3 pb-4 pt-3 lg:h-full lg:overflow-y-auto lg:rounded-none lg:border-0 lg:border-r lg:pb-[calc(env(safe-area-inset-bottom)+16px)] lg:pt-2">
        <form className="flex min-h-full flex-col gap-2" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 rounded-xl border border-white/8 bg-white/[0.035] p-0.5">
            <button
              className="flex min-h-0 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-black text-zinc-500 transition hover:text-zinc-200"
              type="button"
              onClick={onSwitchImage}
            >
              <ImagePlus size={13} />
              生图
            </button>
            <button
              className="flex min-h-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.1] px-2.5 py-1.5 text-[12px] font-black text-white shadow-[0_6px_16px_rgba(0,0,0,0.2)]"
              type="button"
            >
              <Film size={13} />
              生视频
            </button>
          </div>

          <section className="space-y-1.5">
            <div className="px-0.5 text-[11px] font-extrabold text-zinc-400">模型</div>
            <select
              className="input min-h-[42px] w-full px-3 py-2 text-[12px] font-bold text-zinc-100 outline-none"
              disabled={generating}
              value={modelId}
              onChange={(event) => selectVideoModel(event.target.value as VideoModelId)}
            >
              {VIDEO_GENERATION_MODELS.filter(m => m.id !== 'seedance2.5').map((model) => (
                <option className="bg-[#111111]" disabled={!isVideoModelEnabled(model.id)} key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            <p className="px-0.5 text-[9px] leading-4 text-zinc-500">{modelConfig.description}</p>
          </section>

          <section className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-extrabold text-zinc-400">
              <span>视频提示词</span>
              <span className="text-[10px] text-zinc-500">{prompt.length} / 8000</span>
            </div>
            <textarea
              className="input h-[92px] resize-none px-3 py-2.5 text-[12px] leading-5 placeholder:text-zinc-600"
              placeholder="描述想要的画面、镜头运动、光线与氛围..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value.slice(0, 8000))}
            />
          </section>

          <div className="grid grid-cols-2 gap-2">
            <section className="space-y-1.5">
              <div className="text-[11px] font-extrabold text-zinc-400">画面比例</div>
              <div className="grid grid-cols-3 gap-1.5">
                {modelConfig.ratios.map((item) => (
                  <button
                    key={item}
                    className={ratio === item
                      ? 'min-h-0 rounded-lg border border-white bg-white px-1.5 py-2 text-[11px] font-black text-black'
                      : 'btn-secondary min-h-0 rounded-lg px-1.5 py-2 text-[11px] font-black text-zinc-400'}
                    type="button"
                    onClick={() => setRatio(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>
            <section className="space-y-1.5">
              <div className="text-[11px] font-extrabold text-zinc-400">分辨率</div>
              <div className="grid grid-cols-2 gap-1.5">
                {modelConfig.resolutions.map((item) => (
                  <button
                    key={item}
                    className={resolution === item
                      ? 'min-h-0 rounded-lg border border-white bg-white px-1.5 py-1.5 text-[11px] font-black text-black'
                      : 'btn-secondary min-h-0 rounded-lg px-1.5 py-1.5 text-[11px] font-black text-zinc-400'}
                    type="button"
                    onClick={() => setResolution(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section className="space-y-1.5">
            <div className="text-[11px] font-extrabold text-zinc-400">时长</div>
            <div className="flex flex-wrap gap-1.5">
              {modelConfig.durations.map((item) => (
                <button
                  key={item}
                  className={seconds === item
                    ? 'inline-flex min-h-0 items-center justify-center rounded-lg border border-white bg-white px-3.5 py-2 text-[12px] font-black text-black'
                    : 'btn-secondary min-h-0 rounded-lg px-3.5 py-2 text-[12px] font-black text-zinc-400'}
                  type="button"
                  aria-pressed={seconds === item}
                  onClick={() => setSeconds(item)}
                >
                  {item}s
                </button>
              ))}
            </div>
          </section>

          {isSd2Fast ? (
            <label className="flex items-center gap-2 text-[11px] font-extrabold text-zinc-400">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-violet-500"
                checked={realPerson}
                onChange={(e) => setRealPerson(e.target.checked)}
              />
              过真人请勾选
            </label>
          ) : null}

          {isSd2Fast ? (
            <section className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px] font-extrabold text-zinc-400">
                <span>参考素材（最多12个·图片≤30MB, 视频≤50MB, 音频≤15MB）</span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
                    <span>图片</span>
                    <span>{references.length} / 9</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {references.length < 9 ? (
                      <label className="flex h-[64px] w-[64px] cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-white/12 bg-white/[0.018] p-0 text-zinc-500 transition hover:border-violet-400/35 hover:bg-violet-500/[0.04] hover:text-white">
                        <input className="hidden" type="file" accept="image/*" multiple onChange={handleUpload} />
                        <Plus size={18} />
                      </label>
                    ) : null}
                    {references.map((item) => (
                      <button
                        key={item.id}
                        className="group relative h-[64px] w-[64px] overflow-hidden rounded-xl border border-white/10"
                        type="button"
                        title="点击删除"
                        onClick={() => setReferences((current) => current.filter((target) => target.id !== item.id))}
                      >
                        <img alt={item.name} className="h-full w-full object-cover transition group-hover:opacity-60" src={item.previewUrl} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
                    <span>音频</span>
                    <span>{audioReferences.length} / 3</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {audioReferences.length < 3 ? (
                      <label className="flex h-[64px] w-[64px] cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-white/12 bg-white/[0.018] p-0 text-zinc-500 transition hover:border-violet-400/35 hover:bg-violet-500/[0.04] hover:text-white">
                        <input className="hidden" type="file" accept="audio/*" multiple onChange={handleAudioUpload} />
                        <Plus size={18} />
                      </label>
                    ) : null}
                    {audioReferences.map((item) => (
                      <button
                        key={item.id}
                        className="group relative flex h-[64px] w-[64px] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-zinc-800/50 text-[10px] font-bold text-zinc-300"
                        type="button"
                        title="点击删除"
                        onClick={() => setAudioReferences((current) => current.filter((target) => target.id !== item.id))}
                      >
                        <Music size={16} />
                        <span className="absolute bottom-1 truncate px-1 text-[8px]">{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px] font-extrabold text-zinc-400">
                <span>参考图（最多 2 张 · 首帧/末帧 · 单张 ≤20MB）</span>
                <span className="shrink-0 text-[10px] text-zinc-500">{references.length} / 2</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {references.length < 2 ? (
                  <label className="flex h-[72px] w-[72px] cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-white/12 bg-white/[0.018] p-0 text-zinc-500 transition hover:border-violet-400/35 hover:bg-violet-500/[0.04] hover:text-white">
                    <input className="hidden" type="file" accept="image/*" multiple onChange={handleUpload} />
                    <Plus size={20} />
                  </label>
                ) : null}
                {references.map((item, index) => (
                  <button
                    key={item.id}
                    className="group relative h-[72px] w-[72px] overflow-hidden rounded-xl border border-white/10"
                    type="button"
                    title="点击删除"
                    onClick={() => setReferences((current) => current.filter((target) => target.id !== item.id))}
                  >
                    <img alt={item.name} className="h-full w-full object-cover transition group-hover:opacity-60" src={item.previewUrl} />
                    <span className="absolute inset-x-1 bottom-1 rounded bg-black/70 py-0.5 text-[9px] font-bold text-white">{index === 0 ? '首帧' : '末帧'}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="mt-auto space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-extrabold text-zinc-400">
              <span>使用积分：<span className="text-white">{creditsNeeded}</span>/<span className="text-white">{availableVideoCredits}</span></span>
              <button
                className="min-h-0 p-0 text-[11px] font-black text-cyan-400 transition hover:text-cyan-300"
                type="button"
                onClick={onPurchase}
              >
                点击在线购买积分(25%优惠)
              </button>
            </div>
            {error ? <div className="app-alert app-alert-error">{error}</div> : null}
            <button
              className="btn-primary flex w-full items-center justify-center gap-2 px-4 py-3 text-[14px] font-black disabled:cursor-not-allowed disabled:opacity-60"
              disabled={generating || !user || availableVideoCredits < creditsNeeded}
              type="submit"
            >
              {generating ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
              {generating ? '生成中...' : user ? `生成 · ${creditsNeeded} 积分` : '登录后生成'}
            </button>
          </div>
        </form>
      </aside>

      <section className="min-h-[520px] overflow-hidden border-r border-white/8 px-4 py-4 lg:min-h-0">
        <div className="flex h-full min-h-0 flex-col rounded-[24px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.08),transparent_42%),rgba(255,255,255,0.012)] p-4">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
            <div>
              <h2 className="text-[15px] font-black text-white">视频结果</h2>
              <p className="mt-1 text-[11px] text-zinc-500">生成完成后自动保存到本站，避免临时链接失效。</p>
            </div>
            {videoUrl ? (
              <button
                className="btn-secondary min-h-0 px-3 py-2 text-[12px] font-bold"
                type="button"
                onClick={() => void downloadAsset(videoUrl, 'pixory-video').catch((downloadError) => {
                  setError(downloadError instanceof Error ? downloadError.message : '下载失败');
                })}
              >
                <Download size={14} />
                下载
              </button>
            ) : null}
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden py-4">
            {videoUrl ? (
              <video className={`${videoFrameClass} rounded-2xl bg-black object-contain shadow-[0_24px_70px_rgba(0,0,0,0.45)]`} src={videoUrl} controls playsInline />
            ) : (
              <div className="flex max-w-sm flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-200">
                  {generating ? <LoaderCircle className="animate-spin" size={28} /> : <Film size={28} />}
                </div>
                <div className="mt-5 text-[16px] font-black text-zinc-200">{generating ? '正在生成你的视频' : '等待你的下一段灵感'}</div>
                <p className="mt-2 text-[12px] leading-6 text-zinc-500">
                  {generating ? 'Firefly 正在渲染，通常需要几分钟，请保持页面打开。' : '填写提示词并选择画幅，生成结果会在这里播放。'}
                </p>
              </div>
            )}

            {generating ? (
              <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/10 bg-black/70 p-3 backdrop-blur">
                <div className="flex items-center justify-between text-[11px] font-bold text-zinc-300">
                  <span>{job?.status === 'processing' ? '正在渲染' : '正在排队'}</span>
                  <span>{progress > 0 ? `${progress}%` : '请稍候'}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#7c3aed,#a855f7)] transition-all duration-500" style={{ width: `${progress || 6}%` }} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <aside className="custom-scrollbar overflow-y-auto px-3 py-3 sm:px-4 lg:h-full lg:pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="space-y-4">
          <section>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-200"><Film size={15} /></div>
                <h2 className="text-[15px] font-black text-white">本次作品</h2>
              </div>
              <span className="text-[11px] text-zinc-500">{recentVideos.length}</span>
            </div>
            <div className="mt-3 min-h-[180px] rounded-[22px] border border-white/8 bg-white/[0.025] p-3">
              {recentVideos.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {recentVideos.map((item, index) => (
                    <button className="group relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black" type="button" key={item} onClick={() => setVideoUrl(item)}>
                      <video className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100" src={item} muted preload="metadata" />
                      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">作品 {recentVideos.length - index}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[154px] items-center justify-center px-5 text-center text-[12px] leading-6 text-zinc-500">生成的视频会集中显示在这里。</div>
              )}
            </div>
          </section>

          <section className="rounded-[22px] border border-white/8 bg-white/[0.025] p-4">
            <h3 className="text-[13px] font-black text-zinc-200">提示词建议</h3>
            <p className="mt-2 text-[11px] leading-6 text-zinc-500">按“主体 + 动作 + 镜头运动 + 光线 + 风格”描述，生成效果通常更稳定。</p>
            <div className="mt-3 rounded-xl bg-black/25 px-3 py-2.5 text-[11px] leading-5 text-zinc-400">示例：金色麦田里的橘猫向镜头奔跑，低机位跟拍，黄昏逆光，电影感。</div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function HomeView({
  onNavigate,
  onStartImage,
  onStartVideo,
}: {
  onNavigate: (tab: 'create' | 'apiDocs') => void;
  onStartImage: () => void;
  onStartVideo: () => void;
}) {
  const features = [
    {
      title: '多模型图片创作',
      description: '文生图、图生图与高清输出，一站完成视觉创作。',
      icon: <ImagePlus size={25} />,
    },
    {
      title: 'AI 视频创作',
      description: '支持文生视频与参考图生视频，提供 720P、1080P 输出。',
      icon: <Film size={25} />,
    },
    {
      title: '稳定 API 接入',
      description: '清晰的接口文档与稳定服务，帮助业务快速接入。',
      icon: <CodeIcon size={25} />,
    },
  ];

  return (
    <section className="custom-scrollbar h-full overflow-y-auto px-4 py-5 sm:px-6 lg:overflow-hidden lg:px-8 lg:py-4">
      <div className="mx-auto flex min-h-full w-full max-w-[1380px] flex-col">
        <div className="grid flex-1 items-center gap-6 lg:min-h-0 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
          <div className="max-w-2xl py-2 lg:py-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/15 bg-violet-500/10 px-4 py-2 text-xs font-bold tracking-[0.12em] text-violet-200">
              <Sparkles size={13} />
              PIXORY · AI CREATIVE STUDIO
            </div>
            <h1 className="mt-5 text-4xl font-black leading-[1.16] tracking-tight text-white sm:text-5xl lg:text-[48px]">
              一站完成 AI 图片
              <span className="block bg-[linear-gradient(90deg,#c4b5fd_0%,#f0abfc_52%,#67e8f9_100%)] bg-clip-text text-transparent">与视频创作</span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-zinc-400 sm:text-lg">
              从一张图片到一段动态影像，PIXORY 支持文生图、图生图、文生视频与参考图生视频。
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-bold">
              <span className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-zinc-300">多模型图片生成</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-1.5 text-fuchsia-200">
                <Film size={12} /> AI 视频已上线
              </span>
              <span className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-zinc-300">720P · 1080P</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="btn-primary min-w-40 justify-center gap-2 px-6 py-3 text-base font-bold"
                type="button"
                onClick={onStartImage}
              >
                <ImagePlus size={17} />
                创作图片
              </button>
              <button
                className="inline-flex min-w-40 items-center justify-center gap-2 rounded-xl border border-fuchsia-400/25 bg-[linear-gradient(135deg,rgba(168,85,247,0.18),rgba(236,72,153,0.13))] px-6 py-3 text-base font-bold text-fuchsia-100 shadow-[0_12px_36px_rgba(168,85,247,0.12)] transition hover:border-fuchsia-300/40 hover:bg-fuchsia-500/20"
                type="button"
                onClick={onStartVideo}
              >
                <Film size={17} />
                创作视频
              </button>
            </div>
            <button className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 transition hover:text-violet-200" type="button" onClick={() => onNavigate('apiDocs')}>
              <CodeIcon size={13} />
              需要接入业务？查看 API 文档
            </button>
          </div>

          <div className="rounded-[26px] bg-white/[0.035] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.24)] ring-1 ring-inset ring-white/[0.07] sm:p-4">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-black text-white sm:text-base">图片与视频创作</h2>
              <div className="flex gap-2 text-[10px] font-bold text-zinc-400 sm:text-[11px]">
                <span className="rounded-full bg-black/25 px-2.5 py-1">GPT Image 2</span>
                <span className="rounded-full bg-fuchsia-500/10 px-2.5 py-1 text-fuchsia-200">Gemini Veo 3.1</span>
              </div>
            </div>
            <div className="group relative overflow-hidden rounded-[18px] bg-black">
              <img
                alt="PIXORY AI 图片与视频创作"
                className="aspect-[16/9] max-h-[360px] w-full object-cover transition duration-700 group-hover:scale-[1.02]"
                src="/images/pixory-showcase.webp"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-[linear-gradient(180deg,transparent_0%,rgba(7,7,12,0.9)_100%)] px-4 pb-4 pt-16">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-md">
                    <Film size={18} />
                  </span>
                  <span>
                    <span className="block text-xs font-black text-white sm:text-sm">让静态画面动起来</span>
                    <span className="mt-0.5 block text-[10px] text-zinc-300 sm:text-[11px]">文生视频 · 参考图生视频</span>
                  </span>
                </div>
                <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[10px] font-black text-white backdrop-blur-md">5 秒高清输出</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-[20px] bg-white/[0.025] p-4 ring-1 ring-inset ring-white/[0.055]">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
                  {feature.icon}
                </div>
                <div>
                  <h3 className="font-black text-white">{feature.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 sm:text-sm">{feature.description}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-1 py-3 text-xs text-zinc-600">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black tracking-[0.14em] text-zinc-300">PIXORY</span>
            <span>专业 AI 图片与视频创作服务</span>
          </div>
          <span>产品服务 · API 文档 · 服务条款 · 隐私政策 · 联系我们</span>
        </footer>
      </div>
    </section>
  );
}

function HistoryView({
  records,
  onPreview,
}: {
  records: GenerationRecord[];
  onPreview: (item: GenerationRecord) => void;
}) {
  const [sortKey, setSortKey] = useState<'createdAt' | 'creditsUsed' | 'modelName'>('createdAt');
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const sortedRecords = [...records].sort((left, right) => {
    if (sortKey === 'creditsUsed') return right.creditsUsed - left.creditsUsed;
    if (sortKey === 'modelName') return left.modelName.localeCompare(right.modelName);
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRecords = sortedRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <section className="page-shell min-h-0 overflow-auto py-4 lg:h-full lg:overflow-hidden">
      <div className="card flex min-h-[420px] flex-col lg:h-full lg:min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">历史记录</h2>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>排序</span>
            <select
              className="input min-h-0 px-2 py-1 text-xs"
              value={sortKey}
              onChange={(event) => {
                setSortKey(event.target.value as 'createdAt' | 'creditsUsed' | 'modelName');
                setPage(1);
              }}
            >
              <option className="bg-[#111]" value="createdAt">时间最新</option>
              <option className="bg-[#111]" value="modelName">模型名称</option>
            </select>
          </div>
        </div>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
        {records.length > 0 ? (
          <table className="min-w-[640px] text-left text-xs sm:min-w-full">
            <thead className="sticky top-0 bg-[#090909] text-zinc-500">
              <tr className="border-b border-white/8">
                <th className="px-4 py-2 font-medium">图片</th>
                <th className="px-4 py-2 font-medium">提示词</th>
                <th className="px-4 py-2 font-medium">模型</th>
                <th className="px-4 py-2 font-medium">比例</th>
                <th className="px-4 py-2 font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {pageRecords.map((item) => (
                <tr key={item.id} className="h-14 text-zinc-300">
                  <td className="px-4 py-2">
                    <button className="h-10 w-10 overflow-hidden rounded-lg bg-black" type="button" onClick={() => onPreview(item)}>
                      {isVideoAssetUrl(item.imageUrl) ? (
                        <video className="h-full w-full object-cover" src={item.imageUrl} muted preload="metadata" />
                      ) : (
                        <img alt={item.prompt} className="h-full w-full object-cover" src={item.thumbnailUrl || item.imageUrl} onError={(event) => fallbackToOriginal(event, item.imageUrl)} />
                      )}
                    </button>
                  </td>
                  <td className="max-w-[520px] truncate px-4 py-2 text-white">{item.prompt}</td>
                  <td className="px-4 py-2">{item.modelName}</td>
                  <td className="px-4 py-2">
                    {item.dimensions}
                    {item.imageSize ? ` / ${item.imageSize}` : ''}
                  </td>
                  <td className="px-4 py-2">{formatTime(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">暂无生图记录</div>
        )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 px-4 py-3 text-xs text-zinc-400">
          <span>共 {records.length} 条</span>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40" disabled={currentPage <= 1} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
            <span>{currentPage} / {totalPages}</span>
            <button className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40" disabled={currentPage >= totalPages} type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ApiDocsView({
  onNotice,
  gptImagePricing,
  user,
  onRequireLogin,
}: {
  onNotice: (message: string) => void;
  gptImagePricing: GptImagePricing;
  user: UserInfo | null;
  onRequireLogin: () => void;
}) {
  const [copiedText, setCopiedText] = useState('');
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [balanceApiKey, setBalanceApiKey] = useState('');
  const [balanceResult, setBalanceResult] = useState<CreditSummary | null>(null);
  const [balanceError, setBalanceError] = useState('');
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [activeDocSection, setActiveDocSection] = useState('quick-start');
  const [userApiKeys, setUserApiKeys] = useState<UserApiKeyInfo[]>([]);
  const [userKeyName, setUserKeyName] = useState('');
  const [generatedUserKey, setGeneratedUserKey] = useState('');
  const [userKeysLoading, setUserKeysLoading] = useState(false);
  const docsScrollRef = useRef<HTMLElement | null>(null);
  const baseUrl = typeof window === 'undefined' ? 'https://pixory.top' : window.location.origin;
  const apiKeyPlaceholder = 'px_your_api_key';
  const apiKeyHighlightClassName = 'font-mono text-[1.08em] font-black tracking-[0.04em] text-[#8fd3ff]';
  const submitEndpoint = `${baseUrl}/v1/async/images/generations`;
  const queryEndpoint = `${baseUrl}/v1/async/images/generations/TASK_ID`;
  const quickStartCurl = `curl --location '${submitEndpoint}' \\
--header 'Authorization: Bearer ${apiKeyPlaceholder}' \\
--header 'Content-Type: application/json' \\
--data '{
  "model": "nano-banana-pro",
  "prompt": "生成一张具有高级质感的品牌海报",
  "aspectRatio": "1:1",
  "imageSize": "2K"
}'`;
  const requestExample = JSON.stringify(
    {
      model: 'nano-banana-pro',
      prompt: '将两张参考图融合成一张高级感产品海报，保留主体轮廓和品牌色',
      images: ['https://example.com/reference-1.png', 'https://example.com/reference-2.png'],
      aspectRatio: '1:1',
      imageSize: '2K',
      optimizeChineseText: true,
    },
    null,
    2,
  );
  const successExample = `{
  "id": "pxgen_1783562400000_a1b2c3d4e5f6",
  "taskId": "pxgen_1783562400000_a1b2c3d4e5f6",
  "object": "image.generation.task",
  "status": "queued",
  "generationStatus": "pending",
  "results": [],
  "progress": 0,
  "retryAfterSeconds": 3,
  "usage": {
    "creditsUsed": 32,
    "remainingCredits": 968
  }
}`;
  const completedExample = `{
  "id": "pxgen_1783562400000_a1b2c3d4e5f6",
  "taskId": "pxgen_1783562400000_a1b2c3d4e5f6",
  "object": "image.generation.task",
  "status": "succeeded",
  "generationStatus": "succeeded",
  "results": [
    {
      "url": "https://pixory.top/uploads/generated/xxx.png"
    }
  ],
  "progress": 100,
  "retryAfterSeconds": 0
}`;
  const errorExample = `{
  "error": "API Key 额度不足，需要 32，剩余 12"
}`;
  const requestRows = [
    ['model', 'string', '是', '支持 gpt-image-2、nano-banana-pro、seedream-4。'],
    ['prompt', 'string', '是', '图像提示词。建议写清主体、画面、风格、尺寸用途和需要避免的内容。'],
    ['images', 'string[]', '否', `HTTPS 参考图 URL 数组，最多 ${MAX_REFERENCE_IMAGES} 张。`],
    ['aspectRatio', 'string', '否', '比例或常见像素值，例如 1:1、16:9、2048x2048。'],
    ['imageSize', 'string', '否', 'Nano Banana Pro 支持 1K、2K、4K（默认 2K）；GPT-image-2 支持 STANDARD、2K、4K。'],
    ['quality', 'string', '否', 'GPT-image-2 可传 auto、low、medium、high；高质量按高质量档计费，不传按 auto。'],
    ['optimizeChineseText', 'boolean', '否', 'Nano Banana Pro AI 增强计费选项：支持 1K / 2K / 4K，开启后前端账单额外增加 8 积分；不会调用任何上游原生增强接口。'],
  ];
  const modelRows = [
    { model: 'gpt-image-2', name: 'GPT-image-2', cost: `STANDARD ${gptImagePricing.standard} / 2K ${gptImagePricing.twoK}（高 ${gptImagePricing.twoKHigh}）/ 4K ${gptImagePricing.fourK}（高 ${gptImagePricing.fourKHigh}）`, note: '适合高质量通用生图，支持 quality 参数。' },
    { model: 'nano-banana-pro', name: 'Nano Banana Pro', cost: '1K 20 / 2K 24 / 4K 30；AI 增强 +8', note: 'AI 增强仅影响前端账单，不调用上游增强接口；API Key 与网站使用相同的后台渠道顺序。' },
    { model: 'seedream-4', name: 'Seedream 4', cost: '2K 18 / 4K 20', note: '仅支持 2K、4K，使用通用积分。' },
  ];
  const gptPixelGroups = [
    {
      label: '\u6807\u51c6 / 1K',
      cost: `\u6210\u529f\u6263 ${gptImagePricing.standard} \u70b9`,
      rows: [
        ['1024x1024', '1:1'],
        ['1280x720', '16:9'],
        ['720x1280', '9:16'],
        ['1152x864', '4:3'],
        ['864x1152', '3:4'],
        ['1536x1024', '3:2'],
        ['1024x1536', '2:3'],
        ['1456x624', '21:9'],
      ],
    },
    {
      label: '2K',
      cost: `\u6210\u529f\u6263 ${gptImagePricing.twoK} \u70b9\uff0c\u9ad8\u8d28\u91cf ${gptImagePricing.twoKHigh} \u70b9`,
      rows: [
        ['2048x2048', '1:1'],
        ['2048x1152', '16:9'],
        ['1152x2048', '9:16'],
        ['2048x1536', '4:3'],
        ['1536x2048', '3:4'],
        ['2016x1344', '3:2'],
        ['1344x2016', '2:3'],
        ['3024x1296', '21:9'],
      ],
    },
    {
      label: '4K',
      cost: `\u6210\u529f\u6263 ${gptImagePricing.fourK} \u70b9\uff0c\u9ad8\u8d28\u91cf ${gptImagePricing.fourKHigh} \u70b9`,
      rows: [
        ['2880x2880', '1:1'],
        ['3840x2160', '16:9'],
        ['2160x3840', '9:16'],
        ['3264x2448', '4:3'],
        ['2448x3264', '3:4'],
        ['3504x2336', '3:2'],
        ['2336x3504', '2:3'],
        ['3696x1584', '21:9'],
      ],
    },
  ];
  const pricingCards = [
    {
      model: 'gpt-image-2',
      rows: [
        ['标准 / 1K', `${gptImagePricing.standard} 点 / 张`, 'imageSize=STANDARD 或标准像素值；quality 任意'],
        ['2K 非高质量', `${gptImagePricing.twoK} 点 / 张`, 'imageSize=2K；quality=auto / low / medium 或不传'],
        ['2K 高质量', `${gptImagePricing.twoKHigh} 点 / 张`, 'imageSize=2K；quality=high'],
        ['4K 非高质量', `${gptImagePricing.fourK} 点 / 张`, 'imageSize=4K；quality=auto / low / medium 或不传'],
        ['4K 高质量', `${gptImagePricing.fourKHigh} 点 / 张`, 'imageSize=4K；quality=high'],
      ],
      note: '',
    },
    {
      model: 'nano-banana-pro',
      rows: [
        ['1K 基础生成', '20 点 / 张', '支持文生图与参考图生成'],
        ['2K 基础生成', '24 点 / 张', '保持原有计费'],
        ['4K 基础生成', '30 点 / 张', '4K 新计费'],
        ['1K / 2K / 4K AI 增强', '额外 +8 点 / 张', '仅影响前端账单，不调用任何上游原生增强接口'],
      ],
      note: '适合参考图重绘、融合、商品图和中文场景增强。',
    },
  ];
  const endpointSections = [
    {
      id: 'gpt-image-2',
      label: 'GPT-Image-2 接口',
      title: 'GPT-Image-2 图像生成',
      subtitle: '适合通用高质量生图。通过同一个 PIXORY 入口调用，model 固定传 gpt-image-2。',
      model: 'gpt-image-2',
      endpointPath: '/v1/async/images/generations',
      request: JSON.stringify(
        {
          model: 'gpt-image-2',
          prompt: '生成一张高级感黑金香水产品图，摄影棚布光，超清细节',
          images: [],
          aspectRatio: '2048x2048',
          quality: 'low',
        },
        null,
        2,
      ),
      bullets: ['支持 1:1、16:9、9:16 等比例和常见像素值。', 'STANDARD / 2K / 4K 会按 imageSize 或像素值自动计费。'],
    },
    {
      id: 'nano-banana',
      label: 'Nano Banana 接口',
      title: 'Nano Banana 图像生成',
      subtitle: '适合参考图重绘、融合、商品图改版和中文场景增强。model 可传 nano-banana-pro。',
      model: 'nano-banana-pro',
      endpointPath: '/v1/async/images/generations',
      request: requestExample,
                  bullets: ['支持 1K / 2K / 4K；每种分辨率都按网站后台的启用状态和排序依次尝试渠道。明确失败会自动切换下一渠道；失败渠道暂避 30 秒，随后恢复从第一顺位判断。', `参考图建议使用 HTTPS 图片 URL，最多 ${MAX_REFERENCE_IMAGES} 张，Base64 单张不超过 ${MAX_REFERENCE_IMAGE_MB}MB；全部分辨率均可开启 AI 增强计费选项，额外消耗 8 积分，但不会调用任何上游原生增强接口。`],
    },
  ];
  const docNavigation = [
    ['1', '快速开始', 'quick-start'],
    ['2', '开发指南', 'development'],
    ['3', 'GPT-Image-2 接口', 'gpt-image-2'],
    ['4', 'Nano Banana 接口', 'nano-banana'],
    ['5', '价格指南', 'pricing'],
  ];
  docNavigation.push(['6', '\u6211\u7684 API Keys', 'developer-center']);

  function handleDocsScroll() {
    const container = docsScrollRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    let current = docNavigation[0][2];
    for (const [, , id] of docNavigation) {
      const element = document.getElementById(id);
      if (element && element.getBoundingClientRect().top - containerTop <= 150) current = id;
    }
    if (container.scrollHeight - container.scrollTop - container.clientHeight <= 4) {
      current = docNavigation[docNavigation.length - 1][2];
    }
    setActiveDocSection((previous) => (previous === current ? previous : current));
  }

  function renderHighlightedApiKey(value: string) {
    const parts = value.split(apiKeyPlaceholder);
    return parts.map((part, index) => (
      <Fragment key={`${value.length}-${index}`}>
        {part}
        {index < parts.length - 1 ? <span className={apiKeyHighlightClassName}>{apiKeyPlaceholder}</span> : null}
      </Fragment>
    ));
  }

  async function copyText(value: string, label: string) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) throw new Error('copy_failed');
      }

      setCopiedText(label);
      window.setTimeout(() => setCopiedText((current) => (current === label ? '' : current)), 1600);
    } catch {
      onNotice('复制失败，请手动复制');
    }
  }

  function openBalanceDialog() {
    setBalanceApiKey('');
    setBalanceResult(null);
    setBalanceError('');
    setBalanceDialogOpen(true);
  }

  function closeBalanceDialog() {
    if (balanceLoading) return;
    setBalanceDialogOpen(false);
    setBalanceApiKey('');
    setBalanceResult(null);
    setBalanceError('');
  }

  async function handleBalanceQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const apiKey = balanceApiKey.trim();
    if (!apiKey) {
      setBalanceError('\u8bf7\u8f93\u5165\u5b8c\u6574\u7684 API Key');
      return;
    }

    setBalanceLoading(true);
    setBalanceError('');
    setBalanceResult(null);
    try {
      const payload = await fetchPublicApiKeyBalance(apiKey);
      setBalanceResult(payload.balance);
    } catch (error) {
      setBalanceError(error instanceof Error ? error.message : '\u67e5\u8be2 API Key \u989d\u5ea6\u5931\u8d25');
    } finally {
      setBalanceLoading(false);
    }
  }

  async function refreshUserApiKeys() {
    if (!user) {
      setUserApiKeys([]);
      return;
    }
    setUserKeysLoading(true);
    try {
      setUserApiKeys((await fetchUserApiKeys()).keys);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '\u52a0\u8f7d API Key \u5931\u8d25');
    } finally {
      setUserKeysLoading(false);
    }
  }

  useEffect(() => {
    void refreshUserApiKeys();
  }, [user?.id]);

  async function handleCreateUserKey() {
    if (!user) {
      onRequireLogin();
      return;
    }
    setUserKeysLoading(true);
    try {
      const payload = await createUserApiKey(userKeyName.trim() || '\u9ed8\u8ba4 Key');
      setGeneratedUserKey(payload.apiKey);
      setUserKeyName('');
      await refreshUserApiKeys();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '\u521b\u5efa API Key \u5931\u8d25');
    } finally {
      setUserKeysLoading(false);
    }
  }

  async function handleUserKeyAction(item: UserApiKeyInfo, action: 'pause' | 'resume' | 'revoke' | 'rotate') {
    if ((action === 'revoke' || action === 'rotate') && !window.confirm(
      action === 'rotate'
        ? '\u8f6e\u6362\u540e\u65e7 Key \u4f1a\u7acb\u5373\u5931\u6548\uff0c\u786e\u8ba4\u7ee7\u7eed\uff1f'
        : '\u6ce8\u9500\u540e\u65e0\u6cd5\u6062\u590d\uff0c\u786e\u8ba4\u7ee7\u7eed\uff1f',
    )) return;
    setUserKeysLoading(true);
    try {
      if (action === 'rotate') {
        const payload = await rotateUserApiKey(item.id);
        setGeneratedUserKey(payload.apiKey);
      } else {
        await updateUserApiKey(item.id, action);
      }
      await refreshUserApiKeys();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '\u66f4\u65b0 API Key \u5931\u8d25');
    } finally {
      setUserKeysLoading(false);
    }
  }

  return (
    <section ref={docsScrollRef} className="api-docs-view custom-scrollbar h-full overflow-auto bg-[#050505] px-4 pb-20 pt-8 text-zinc-200 md:px-6 md:pt-10" onScroll={handleDocsScroll}>
      <div className="mx-auto grid max-w-[1500px] gap-6">
        <div className="grid min-w-0 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="min-w-0 self-start border-y border-white/10 bg-[#11131a] p-2 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:rounded-2xl lg:border lg:p-3">
            <p className="px-2 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">API 文档</p>
            <div className="mt-3 flex gap-1.5 overflow-x-auto text-sm lg:grid">
              {docNavigation.map(([index, title, id]) => {
                const active = activeDocSection === id;
                return (
                <a key={title} aria-current={active ? 'location' : undefined} className={`flex flex-none items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-[0.78rem] transition ${active ? 'bg-sky-400/10 font-semibold text-sky-100' : 'font-medium text-zinc-300 hover:bg-white/5 hover:text-white'}`} href={`#${id}`} onClick={() => setActiveDocSection(id)}>
                  <span className={`font-mono text-[0.66rem] font-black ${active ? 'text-sky-300' : 'text-zinc-600'}`}>{index}</span>
                  {title}
                </a>
                );
              })}
            </div>
          </aside>

          <main className="flex min-w-0 flex-col gap-8">
            <section id="developer-center" className="order-last scroll-mt-28 overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#11131a]">
              <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">{'\u5f00\u53d1\u8005\u4e2d\u5fc3'}</div>
                  <h1 className="text-xl font-semibold text-white">{'\u6211\u7684 API Keys'}</h1>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">{'\u65b0 Key \u4e0e\u7f51\u7ad9\u8d26\u53f7\u5171\u4eab\u79ef\u5206\uff0c\u5bc6\u94a5\u53ea\u5728\u521b\u5efa\u6216\u8f6e\u6362\u65f6\u5c55\u793a\u4e00\u6b21\u3002'}</p>
                </div>
                {user ? <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">{user.username} · {user.creditsRemaining ?? 0} {'\u79ef\u5206'}</span> : null}
              </div>
              <div className="p-5">
                {!user ? (
                  <button className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black" type="button" onClick={onRequireLogin}>{'\u767b\u5f55\u540e\u7ba1\u7406 API Key'}</button>
                ) : (
                  <>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-300/35" maxLength={40} placeholder={'Key \u540d\u79f0\uff0c\u4f8b\u5982\uff1a\u751f\u4ea7\u670d\u52a1\u5668'} value={userKeyName} onChange={(event) => setUserKeyName(event.target.value)} />
                      <button className="rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-black text-black disabled:opacity-50" disabled={userKeysLoading || userApiKeys.filter((item) => item.status !== 'revoked').length >= 5} type="button" onClick={() => void handleCreateUserKey()}>{userKeysLoading ? '\u5904\u7406\u4e2d...' : '\u521b\u5efa API Key'}</button>
                    </div>
                    {generatedUserKey ? (
                      <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-4">
                        <div className="text-xs font-bold text-amber-100">{'\u8bf7\u7acb\u5373\u590d\u5236\uff0c\u5173\u95ed\u540e\u65e0\u6cd5\u518d\u6b21\u67e5\u770b'}</div>
                        <div className="mt-2 flex gap-2">
                          <code className="min-w-0 flex-1 overflow-auto rounded-lg bg-black/30 px-3 py-2 text-xs text-amber-50">{generatedUserKey}</code>
                          <button className="rounded-lg border border-amber-200/20 px-3 text-xs text-amber-50" type="button" onClick={() => void copyText(generatedUserKey, 'user-key')}>{copiedText === 'user-key' ? '\u5df2\u590d\u5236' : '\u590d\u5236'}</button>
                          <button className="rounded-lg border border-white/10 px-3 text-xs text-zinc-300" type="button" onClick={() => setGeneratedUserKey('')}>{'\u5173\u95ed'}</button>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-4 grid gap-2">
                      {userApiKeys.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">{userKeysLoading ? '\u52a0\u8f7d\u4e2d...' : '\u8fd8\u6ca1\u6709 API Key'}</div> : userApiKeys.map((item) => (
                        <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 lg:flex-row lg:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2"><span className="font-semibold text-white">{item.name}</span><span className={`rounded px-2 py-0.5 text-[10px] ${item.status === 'active' ? 'bg-emerald-400/10 text-emerald-200' : item.status === 'paused' ? 'bg-amber-400/10 text-amber-200' : 'bg-zinc-500/10 text-zinc-500'}`}>{item.status === 'active' ? '\u4f7f\u7528\u4e2d' : item.status === 'paused' ? '\u5df2\u6682\u505c' : '\u5df2\u6ce8\u9500'}</span></div>
                            <code className="mt-1 block text-xs text-zinc-400">{item.keyPreview}</code>
                            <div className="mt-1 text-[11px] text-zinc-600">{'\u521b\u5efa\uff1a'}{new Date(item.createdAt).toLocaleString()}{item.lastUsedAt ? ` · \u6700\u540e\u8c03\u7528\uff1a${new Date(item.lastUsedAt).toLocaleString()}` : ''}</div>
                          </div>
                          {item.status !== 'revoked' ? <div className="flex flex-wrap gap-2 text-xs">
                            <button className="rounded-lg border border-white/10 px-3 py-2 text-zinc-300" disabled={userKeysLoading} type="button" onClick={() => void handleUserKeyAction(item, item.status === 'paused' ? 'resume' : 'pause')}>{item.status === 'paused' ? '\u6062\u590d' : '\u6682\u505c'}</button>
                            <button className="rounded-lg border border-sky-300/15 px-3 py-2 text-sky-200" disabled={userKeysLoading} type="button" onClick={() => void handleUserKeyAction(item, 'rotate')}>{'\u8f6e\u6362'}</button>
                            <button className="rounded-lg border border-red-300/15 px-3 py-2 text-red-200" disabled={userKeysLoading} type="button" onClick={() => void handleUserKeyAction(item, 'revoke')}>{'\u6ce8\u9500'}</button>
                          </div> : null}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="mt-5 border-t border-white/10 pt-5">
                  <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-white">{'\u67e5\u8be2\u65e7\u7248 / \u5176\u4ed6 Key \u989d\u5ea6'}</h2>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{'\u9002\u7528\u4e8e\u539f\u6709\u72ec\u7acb\u989d\u5ea6 Key\uff0c\u4e5f\u53ef\u67e5\u8be2\u4efb\u610f\u6709\u6743\u4f7f\u7528\u7684 Key\u3002'}</p>
                    </div>
                    <button
                      className="inline-flex flex-none items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2.5 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15"
                      type="button"
                      onClick={openBalanceDialog}
                    >
                      <KeyRound size={15} />
                      {'\u67e5\u8be2 Key \u989d\u5ea6'}
                    </button>
                  </div>
                </div>
              </div>
            </section>
            <section id="quick-start" className="scroll-mt-28 space-y-5">
              <section className="rounded-2xl border border-white/10 bg-[#11131a] p-4 md:p-5">
                <div className="border-b border-white/10 pb-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[0.72rem] font-semibold text-sky-200">PIXORY API</span>
                    <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[0.72rem] font-semibold text-emerald-200">异步任务接口</span>
                  </div>
                  <h1 className="text-[1.7rem] font-semibold text-white">快速开始</h1>
                  <p className="mt-2 text-[0.82rem] leading-6 text-zinc-400">使用统一的图片生成入口提交任务，再通过任务 ID 查询生成结果。</p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {[
                    ['提交任务', 'POST /v1/async/images/generations，立即返回任务 ID。'],
                    ['查询结果', 'GET /v1/async/images/generations/:id 查询任务状态。'],
                    ['批量查询', 'POST /v1/async/images/generations/status 一次查询多个任务。'],
                    ['读取图片', '任务成功后读取 results[0].url。'],
                  ].map(([title, body]) => (
                    <article key={title} className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <h3 className="text-[0.86rem] font-semibold text-white">{title}</h3>
                      <p className="mt-1 text-[0.74rem] leading-5 text-zinc-400">{body}</p>
                    </article>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-3">
                  <h3 className="text-sm font-black text-sky-100">{'\u667a\u80fd\u8def\u7531\uff0c\u65e7\u63a5\u5165\u96f6\u6539\u52a8'}</h3>
                  <p className="mt-1 text-xs leading-6 text-sky-100/70">
                    {'GPT-image-2 \u4e0e Nano Banana \u90fd\u4e0e\u7f51\u7ad9\u5171\u7528\u540e\u53f0\u914d\u7f6e\u7684\u6e20\u9053\u987a\u5e8f\u3002\u67d0\u6e20\u9053\u660e\u786e\u5931\u8d25\u65f6\u4f1a\u987a\u6ed1\u5207\u6362\u5230\u4e0b\u4e00\u4e2a\uff1b\u5931\u8d25\u6e20\u9053\u6682\u907f 30 \u79d2\uff0c\u5230\u671f\u540e\u4e0b\u4e00\u4e2a\u8bf7\u6c42\u91cd\u65b0\u4ece\u7b2c\u4e00\u987a\u4f4d\u5224\u65ad\u3002\u5982\u679c\u7ed3\u679c\u72b6\u6001\u65e0\u6cd5\u786e\u8ba4\uff0c\u4e3a\u907f\u514d\u91cd\u590d\u751f\u6210\u548c\u91cd\u590d\u6210\u672c\uff0c\u5f53\u6b21\u4e0d\u4f1a\u81ea\u52a8\u5207\u6362\uff0c\u4efb\u52a1\u5931\u8d25\u4f1a\u9000\u56de\u9884\u6263\u79ef\u5206\u3002'}
                  </p>
                </div>
              </section>
              <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#11131a]">
                <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-200"><CodeIcon size={17} /></div>
                  <h2 className="text-[1rem] font-semibold text-white">两步完成接入</h2>
                </div>
                <div className="grid min-w-0 gap-4 p-5 xl:grid-cols-2">
                  <div className="min-w-0 space-y-3"><h3 className="text-[0.88rem] font-semibold text-white">1. 提交任务</h3><pre className="overflow-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-[0.74rem] leading-5 text-zinc-200">{renderHighlightedApiKey(quickStartCurl)}</pre></div>
                  <div className="min-w-0 space-y-3"><h3 className="text-[0.88rem] font-semibold text-white">2. 查询结果</h3><pre className="overflow-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-[0.74rem] leading-5 text-zinc-200">{renderHighlightedApiKey(`curl '${queryEndpoint}' \\
  -H 'Authorization: Bearer ${apiKeyPlaceholder}'`)}</pre></div>
                </div>
              </section>
            </section>

            <section id="development" className="scroll-mt-28 space-y-5">
              <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#11131a]">
                <div className="border-b border-white/10 px-5 py-5">
                  <div className="mb-3 inline-flex rounded-md border border-orange-300/20 bg-orange-300/10 px-2.5 py-1 text-[0.72rem] font-semibold text-orange-200">开发指南</div>
                  <h1 className="text-[1.7rem] font-semibold text-white">认证、任务与图片接入</h1>
                  <p className="mt-2 text-[0.82rem] leading-6 text-zinc-400">API Key 必须保存在服务端。提交和查询请求都使用相同的 Bearer Token。</p>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-3">
                  {[
                    ['服务端调用', '不要把 API Key 写入网页前端、公开仓库或移动端安装包。'],
                    ['异步轮询', '优先遵循 retryAfterSeconds，避免高频查询触发限流。'],
                    ['及时归档', '结果地址生成后应保存到自己的业务存储中。'],
                  ].map(([title, body]) => <article key={title} className="rounded-xl border border-white/10 bg-black/20 p-4"><h3 className="text-[0.86rem] font-semibold text-white">{title}</h3><p className="mt-1 text-[0.74rem] leading-5 text-zinc-400">{body}</p></article>)}
                </div>
              </section>
            </section>
            {endpointSections.map((section) => {
              const sectionCurl = `curl --location '${baseUrl}${section.endpointPath}' \\
--header 'Authorization: Bearer ${apiKeyPlaceholder}' \\
--header 'Content-Type: application/json' \\
--data '${section.request}'`;
              const sectionJs = `const PIXORY_API_KEY = '${apiKeyPlaceholder}';

const response = await fetch('${baseUrl}${section.endpointPath}', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + PIXORY_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${section.request}),
});

const result = await response.json();
if (!response.ok) throw new Error(result.error || 'Submit task failed');

let task = result;
while (task.status === 'queued' || task.status === 'running') {
  await new Promise((resolve) =>
    setTimeout(resolve, (task.retryAfterSeconds || 5) * 1000)
  );
  const query = await fetch(
    '${baseUrl}/v1/async/images/generations/' + task.id,
    { headers: { Authorization: 'Bearer ' + PIXORY_API_KEY } }
  );
  task = await query.json();
  if (!query.ok) throw new Error(task.error || 'Query task failed');
}

if (task.status !== 'succeeded') {
  throw new Error(task.error || 'Generate failed');
}
console.log(task.results[0].url);`;
              const sectionModels = modelRows.filter((item) =>
                section.id === 'gpt-image-2' ? item.model === 'gpt-image-2' : item.model === 'nano-banana-pro',
              );

              return (
                <div key={section.id} id={section.id} className="scroll-mt-28 space-y-5">
                  <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#11131a]">
                    <div className="border-b border-white/10 px-5 py-5">
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-orange-500/15 px-2.5 py-1 text-xs font-black text-orange-300">POST</span>
                        <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-black text-emerald-200">异步提交，轮询结果</span>
                      </div>
                      <h1 className="text-[1.7rem] font-black text-white">{section.title}</h1>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{section.subtitle}</p>
                    </div>
                    <div className="p-4">
                      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3 md:flex-row md:items-center">
                        <span className="flex-none rounded-md bg-orange-500/15 px-2.5 py-1 text-xs font-black text-orange-300">POST</span>
                        <code className="min-w-0 flex-1 break-all text-sm font-black text-sky-100">{baseUrl}{section.endpointPath}</code>
                      </div>
                      <div className="mt-3 grid gap-2">
                        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3 md:flex-row md:items-center">
                          <span className="flex-none rounded-md bg-sky-500/15 px-2.5 py-1 text-xs font-black text-sky-200">GET</span>
                          <code className="min-w-0 flex-1 break-all text-sm font-black text-sky-100">{baseUrl}/v1/async/images/generations/:id</code>
                        </div>
                        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3 md:flex-row md:items-center">
                          <span className="flex-none rounded-md bg-violet-500/15 px-2.5 py-1 text-xs font-black text-violet-200">POST</span>
                          <code className="min-w-0 flex-1 break-all text-sm font-black text-sky-100">{baseUrl}/v1/async/images/generations/status</code>
                          <span className="text-xs text-zinc-500">批量查询</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-3 md:grid-cols-2">
                    <article className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-start gap-3">
                        <ShieldCheck size={18} className="mt-0.5 text-sky-200" />
                        <div>
                          <h3 className="text-base font-black text-white">服务端调用</h3>
                          <p className="mt-1 text-sm leading-6 text-zinc-400">
                            不要把 <code className="rounded-md bg-[#12314d] px-2 py-0.5 font-mono text-[1.02em] font-black tracking-[0.04em] text-[#8fd3ff]">{apiKeyPlaceholder}</code> 写进网页前端代码，避免密钥泄露和额度被盗刷。
                          </p>
                        </div>
                      </div>
                    </article>
                    <article className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-start gap-3">
                        <KeyRound size={18} className="mt-0.5 text-sky-200" />
                        <div>
                          <h3 className="text-base font-black text-white">按 Key 扣额度</h3>
                          <p className="mt-1 text-sm leading-6 text-zinc-400">提交时预扣模型额度，任务失败会自动退回；额度不足会直接拒绝。</p>
                        </div>
                      </div>
                    </article>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#11131a]">
                    <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-200"><ShieldCheck size={17} /></div>
                      <h2 className="text-base font-black text-white">认证方式</h2>
                    </div>
                    <div className="p-5">
                      <p className="text-sm leading-6 text-zinc-300">请求头必须携带 API Key：</p>
                      <pre className="mt-3 overflow-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-xs leading-6 text-zinc-200">{renderHighlightedApiKey(`Authorization: Bearer ${apiKeyPlaceholder}
Content-Type: application/json`)}</pre>
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#11131a]">
                    <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-200"><Info size={17} /></div>
                      <h2 className="text-base font-black text-white">请求参数</h2>
                    </div>
                    <div className="overflow-auto p-5">
                      <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                        <thead className="bg-white/[0.04] text-zinc-400">
                          <tr>
                            <th className="px-4 py-3 font-semibold">参数名</th>
                            <th className="px-4 py-3 font-semibold">类型</th>
                            <th className="px-4 py-3 font-semibold">必填</th>
                            <th className="px-4 py-3 font-semibold">说明</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {requestRows.map(([name, type, required, desc]) => (
                            <tr key={`${section.id}-${name}`} className="align-top">
                              <td className="px-4 py-3"><code className="rounded-md border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 font-mono font-semibold text-sky-200">{name}</code></td>
                              <td className="px-4 py-3 text-zinc-300">{type}</td>
                              <td className="px-4 py-3 text-zinc-300">{required}</td>
                              <td className="px-4 py-3 leading-6 text-zinc-400">{desc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {section.id === 'gpt-image-2' ? (
                    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#11131a]">
                      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-200"><ImagePlus size={17} /></div>
                        <h2 className="text-base font-black text-white">{'gpt-image-2 \u50cf\u7d20\u6bd4\u4f8b\u8bf4\u660e'}</h2>
                      </div>
                      <div className="grid gap-4 p-5">
                        {gptPixelGroups.map((group) => (
                          <article key={group.label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                              <h3 className="text-base font-black text-white">{group.label}</h3>
                              <span className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs font-black text-sky-100">{group.cost}</span>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                              {group.rows.map(([pixels, ratio]) => (
                                <div key={`${group.label}-${pixels}`} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                                  <span className="font-mono text-sm font-black text-sky-200">{pixels}</span>
                                  <span className="ml-2 text-xs font-semibold text-zinc-500">{ratio}</span>
                                </div>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#11131a]">
                    <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-200"><CodeIcon size={17} /></div>
                      <h2 className="text-base font-black text-white">请求示例</h2>
                    </div>
                    <div className="grid gap-4 p-5 xl:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-black text-white">JSON Body</h3>
                          <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300" type="button" onClick={() => void copyText(section.request, `${section.id}-body`)}>
                            {copiedText === `${section.id}-body` ? '已复制' : '复制'}
                          </button>
                        </div>
                        <pre className="overflow-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-xs leading-6 text-zinc-200">{section.request}</pre>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-black text-white">cURL</h3>
                          <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300" type="button" onClick={() => void copyText(sectionCurl, `${section.id}-curl`)}>
                            {copiedText === `${section.id}-curl` ? '已复制' : '复制'}
                          </button>
                        </div>
                        <pre className="overflow-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-xs leading-6 text-zinc-200">{renderHighlightedApiKey(sectionCurl)}</pre>
                      </div>
                      <div className="space-y-3 xl:col-span-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-black text-white">JavaScript</h3>
                          <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300" type="button" onClick={() => void copyText(sectionJs, `${section.id}-js`)}>
                            {copiedText === `${section.id}-js` ? '已复制' : '复制'}
                          </button>
                        </div>
                        <pre className="overflow-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-xs leading-6 text-zinc-200">{renderHighlightedApiKey(sectionJs)}</pre>
                      </div>
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#11131a]">
                    <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-200"><Copy size={17} /></div>
                      <h2 className="text-base font-black text-white">返回响应</h2>
                    </div>
                    <div className="grid gap-4 p-5 xl:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-black text-white"><span className="rounded-md bg-orange-500/15 px-2 py-0.5 text-xs text-orange-200">202</span>任务已提交</div>
                        <pre className="overflow-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-xs leading-6 text-zinc-200">{successExample}</pre>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-black text-white"><span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">200</span>查询成功结果</div>
                        <pre className="overflow-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-xs leading-6 text-zinc-200">{completedExample}</pre>
                      </div>
                      <div className="space-y-3 xl:col-span-2">
                        <div className="flex items-center gap-2 text-sm font-black text-white"><span className="rounded-md bg-red-500/15 px-2 py-0.5 text-xs text-red-200">400 / 401 / 402 / 404 / 502</span>请求失败</div>
                        <pre className="overflow-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-xs leading-6 text-zinc-200">{errorExample}</pre>
                      </div>
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#11131a]">
                    <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-200"><ImagePlus size={17} /></div>
                      <h2 className="text-base font-black text-white">模型消耗积分额度</h2>
                    </div>
                    <div className="grid gap-3 p-5">
                      {sectionModels.map((item) => (
                        <article key={`${section.id}-${item.model}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <h3 className="font-black text-white">{item.name}</h3>
                              <code className="mt-2 inline-flex rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-xs font-semibold text-sky-200">{item.model}</code>
                            </div>
                            <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs font-black text-sky-100">{item.cost}</div>
                          </div>
                          <p className="mt-3 text-xs leading-5 text-zinc-400">{item.note}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              );
            })}

            <section id="pricing" className="scroll-mt-28 overflow-hidden rounded-2xl border border-white/10 bg-[#11131a]">
              <div className="flex items-center gap-4 border-b border-white/10 px-5 py-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-200"><WalletCards size={20} /></div>
                <h2 className="text-[1.15rem] font-semibold text-white">价格说明</h2>
              </div>
              <div className="grid items-stretch gap-4 p-5 lg:grid-cols-2">
                {pricingCards.map((item) => (
                  <article key={item.model} className="flex min-h-[360px] flex-col rounded-2xl border border-white/10 bg-black/20 p-5">
                    <code className="inline-flex self-start rounded-lg border border-sky-400/25 bg-sky-400/10 px-3 py-1.5 text-[0.82rem] font-semibold text-sky-100">
                      {item.model}
                    </code>
                    <div className="mt-4 grid gap-3">
                      {item.rows.map(([label, value, detail]) => (
                        <div
                          key={`${item.model}-${label}`}
                          className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[0.78rem] font-medium text-zinc-400">{label}</span>
                            <span className="whitespace-nowrap text-[0.82rem] font-semibold text-sky-100">{value}</span>
                          </div>
                          {detail ? <p className="mt-2 text-[0.68rem] leading-5 text-zinc-500">{detail}</p> : null}
                        </div>
                      ))}
                    </div>
                    {item.note ? <p className="mt-5 text-[0.74rem] leading-6 text-zinc-500">{item.note}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          </main>
        </div>

      </div>
      {balanceDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <button
            aria-label="Close API key balance dialog"
            className="absolute inset-0"
            type="button"
            onClick={closeBalanceDialog}
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0e14] shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5">
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                  <KeyRound size={19} />
                </div>
                <h2 className="text-xl font-black text-white">{'\u67e5\u8be2 API Key \u989d\u5ea6'}</h2>
                <p className="mt-1 text-sm text-zinc-500">{'Key \u4ec5\u7528\u4e8e\u672c\u6b21\u67e5\u8be2\uff0c\u4e0d\u4f1a\u4fdd\u5b58\u5728\u6d4f\u89c8\u5668\u4e2d\u3002'}</p>
              </div>
              <button
                aria-label="Close"
                className="rounded-full border border-white/10 p-2 text-zinc-400 transition hover:border-white/20 hover:text-white disabled:opacity-40"
                disabled={balanceLoading}
                type="button"
                onClick={closeBalanceDialog}
              >
                <X size={16} />
              </button>
            </div>

            <form className="p-5" onSubmit={(event) => void handleBalanceQuery(event)}>
              <label className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500" htmlFor="api-key-balance-input">
                API Key
              </label>
              <input
                autoComplete="off"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-cyan-300/35"
                id="api-key-balance-input"
                placeholder="px_..."
                spellCheck={false}
                type="password"
                value={balanceApiKey}
                onChange={(event) => {
                  setBalanceApiKey(event.target.value);
                  setBalanceError('');
                  setBalanceResult(null);
                }}
              />

              {balanceError ? (
                <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                  {balanceError}
                </div>
              ) : null}

              {balanceResult ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ['\u603b\u989d\u5ea6', balanceResult.totalCredits, 'text-white'],
                    ['\u5df2\u4f7f\u7528', balanceResult.usedCredits, 'text-amber-200'],
                    ['\u5269\u4f59\u989d\u5ea6', balanceResult.remainingCredits, 'text-emerald-200'],
                  ].map(([label, value, color]) => (
                    <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-4 text-center">
                      <div className="text-[11px] font-semibold text-zinc-500">{label}</div>
                      <div className={`mt-2 text-xl font-black ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              <button
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-black transition hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60"
                disabled={balanceLoading}
                type="submit"
              >
                {balanceLoading ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={16} />}
                {balanceLoading ? '\u67e5\u8be2\u4e2d...' : '\u67e5\u8be2\u989d\u5ea6'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AdminApiKeysPanel({ onNotice }: { onNotice: (message: string) => void }) {
  const [apiKeys, setApiKeys] = useState<PublicApiKeyInfo[]>([]);
  const [keyName, setKeyName] = useState('');
  const [keyCredits, setKeyCredits] = useState(100);
  const [generatedKey, setGeneratedKey] = useState('');
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [submittingKey, setSubmittingKey] = useState(false);
  const [deductingKeyId, setDeductingKeyId] = useState('');
  const [rechargingKeyId, setRechargingKeyId] = useState('');
  const [copiedText, setCopiedText] = useState('');

  useEffect(() => {
    setLoadingKeys(true);
    fetchPublicApiKeys()
      .then((payload) => setApiKeys(payload.keys))
      .catch((error) => onNotice(error instanceof Error ? error.message : 'API Key 加载失败'))
      .finally(() => setLoadingKeys(false));
  }, [onNotice]);

  async function copyText(value: string, label: string) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) throw new Error('copy_failed');
      }

      setCopiedText(label);
      window.setTimeout(() => setCopiedText((current) => (current === label ? '' : current)), 1600);
    } catch {
      onNotice('复制失败，请手动复制');
    }
  }

  async function refreshKeys() {
    setLoadingKeys(true);
    try {
      const payload = await fetchPublicApiKeys();
      setApiKeys(payload.keys);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'API Key 加载失败');
    } finally {
      setLoadingKeys(false);
    }
  }

  async function handleCreateApiKey() {
    setSubmittingKey(true);
    try {
      const payload = await createPublicApiKey({
        name: keyName.trim() || 'API Key',
        credits: keyCredits,
      });
      setGeneratedKey(payload.apiKey);
      setKeyName('');
      await refreshKeys();
      onNotice('API Key 已生成，请及时复制完整 Key');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'API Key 生成失败');
    } finally {
      setSubmittingKey(false);
    }
  }

  async function handleRevokeApiKey(id: string) {
    if (!window.confirm('确认停用这个 API Key 吗？停用后无法继续调用接口。')) return;

    try {
      await revokePublicApiKey(id);
      await refreshKeys();
      onNotice('API Key 已停用');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'API Key 停用失败');
    }
  }

  async function handleDeductApiKeyCredits(item: PublicApiKeyInfo) {
    const rawValue = window.prompt(`请输入要从 ${item.name} 扣除的额度`, '10');
    if (rawValue === null) return;

    const credits = Math.floor(Number(rawValue));
    if (!Number.isFinite(credits) || credits <= 0) {
      window.alert('请输入大于 0 的整数额度');
      return;
    }

    setDeductingKeyId(item.id);
    try {
      const payload = await deductPublicApiKeyCredits(item.id, credits);
      setApiKeys((current) => current.map((key) => (key.id === item.id ? payload.key : key)));
      onNotice(`已从 API Key ${item.name} 扣除 ${payload.deductedCredits} 额度`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'API Key 扣额度失败');
    } finally {
      setDeductingKeyId('');
    }
  }

  async function handleRechargeApiKeyCredits(item: PublicApiKeyInfo) {
    const rawValue = window.prompt(`请输入要给 ${item.name} 充值的额度`, '100');
    if (rawValue === null) return;

    const credits = Math.floor(Number(rawValue));
    if (!Number.isFinite(credits) || credits <= 0) {
      window.alert('请输入大于 0 的整数额度');
      return;
    }

    setRechargingKeyId(item.id);
    try {
      const payload = await rechargePublicApiKeyCredits(item.id, credits);
      setApiKeys((current) => current.map((key) => (key.id === item.id ? payload.key : key)));
      onNotice(`已给 API Key ${item.name} 充值 ${payload.rechargedCredits} 额度`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'API Key 充值失败');
    } finally {
      setRechargingKeyId('');
    }
  }

  async function handleDeleteApiKey(id: string) {
    if (!window.confirm('确认删除这个 API Key 吗？删除后将无法恢复。')) return;

    try {
      await deletePublicApiKey(id);
      await refreshKeys();
      onNotice('API Key 已删除');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'API Key 删除失败');
    }
  }

  return (
    <div className="rounded-[24px] border border-white/10 bg-[#10131b] p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">API KEY</p>
          <h2 className="mt-2 text-xl font-black text-white">发放 API Key</h2>
          <p className="mt-1 text-sm text-zinc-500">给用户生成带额度的 Key，完整 Key 只在生成后显示一次。</p>
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-zinc-200 transition hover:border-white/20 hover:text-white disabled:opacity-50"
          disabled={loadingKeys}
          type="button"
          onClick={() => void refreshKeys()}
        >
          <RotateCw className={loadingKeys ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          刷新
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_auto]">
        <input
          className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
          placeholder="Key 名称，例如客户A / 渠道B"
          value={keyName}
          onChange={(event) => setKeyName(event.target.value)}
        />
        <input
          className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
          min={1}
          type="number"
          value={keyCredits}
          onChange={(event) => setKeyCredits(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
        />
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-zinc-200 disabled:opacity-50"
          disabled={submittingKey}
          type="button"
          onClick={() => void handleCreateApiKey()}
        >
          <KeyRound size={15} />
          {submittingKey ? '生成中...' : '生成 Key'}
        </button>
      </div>

      {generatedKey ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-400/15 bg-emerald-400/10 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-emerald-100">{generatedKey}</code>
          <button
            className="rounded-xl border border-emerald-300/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/10"
            type="button"
            onClick={() => void copyText(generatedKey, 'generated-key')}
          >
            {copiedText === 'generated-key' ? '已复制' : '复制完整 Key'}
          </button>
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/8">
        <table className="min-w-[900px] w-full text-left text-xs">
          <thead className="bg-white/[0.04] text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">名称</th>
              <th className="px-3 py-2 font-medium">Key ID</th>
              <th className="px-3 py-2 font-medium">Key</th>
              <th className="px-3 py-2 font-medium">额度</th>
              <th className="px-3 py-2 font-medium">状态</th>
              <th className="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/6">
            {apiKeys.length > 0 ? apiKeys.map((item) => (
              <tr key={item.id} className="text-zinc-300">
                <td className="px-3 py-3 font-semibold text-white">{item.name}</td>
                <td className="px-3 py-3 font-mono text-zinc-500">
                  <button
                    className="transition hover:text-sky-200"
                    title="点击复制 Key ID；用户页中的 api-前缀对应此 ID"
                    type="button"
                    onClick={() => void copyText(item.id, `api-key-id-${item.id}`)}
                  >
                    {copiedText === `api-key-id-${item.id}` ? '已复制' : item.id}
                  </button>
                </td>
                <td className="px-3 py-3 font-mono text-zinc-500">
                  <div>{item.keyPreview}</div>
                  {!item.copyable ? <div className="mt-1 text-[11px] text-amber-300/80">旧 Key 暂不可复制</div> : null}
                </td>
                <td className="px-3 py-3">
                  <div>
                    <span className="font-semibold text-sky-200">{item.remainingCredits}</span>
                    <span className="text-zinc-500"> / {item.totalCredits}</span>
                  </div>
                  {item.quotaSource === 'account' ? (
                    <div className="mt-1 text-[11px] text-emerald-300/80">
                      账户共享{item.ownerUsername ? ` · ${item.ownerUsername}` : ''}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3">{item.revokedAt ? '已停用' : '可用'}</td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-[11px] text-sky-100 transition hover:bg-sky-500/20 disabled:opacity-40"
                      disabled={!item.copyable}
                      type="button"
                      onClick={() => void copyText(item.plainKey, `api-key-${item.id}`)}
                    >
                      {copiedText === `api-key-${item.id}` ? '已复制' : '复制 Key'}
                    </button>
                    <button
                      className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-40"
                      disabled={item.quotaSource === 'account' || Boolean(item.revokedAt) || item.remainingCredits <= 0 || deductingKeyId === item.id}
                      title={item.quotaSource === 'account' ? '请在用户管理中调整所属账户积分' : undefined}
                      type="button"
                      onClick={() => void handleDeductApiKeyCredits(item)}
                    >
                      {deductingKeyId === item.id ? '扣除中...' : '扣额度'}
                    </button>
                    <button
                      className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-100 transition hover:bg-emerald-500/20 disabled:opacity-40"
                      disabled={item.quotaSource === 'account' || Boolean(item.revokedAt) || rechargingKeyId === item.id}
                      title={item.quotaSource === 'account' ? '请在用户管理中调整所属账户积分' : undefined}
                      type="button"
                      onClick={() => void handleRechargeApiKeyCredits(item)}
                    >
                      {rechargingKeyId === item.id ? '充值中...' : '充值'}
                    </button>
                    <button
                      className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-40"
                      disabled={Boolean(item.revokedAt)}
                      type="button"
                      onClick={() => void handleRevokeApiKey(item.id)}
                    >
                      停用
                    </button>
                    <button
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-zinc-200 transition hover:border-white/20 hover:text-white"
                      type="button"
                      onClick={() => void handleDeleteApiKey(item.id)}
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td className="px-3 py-8 text-center text-zinc-500" colSpan={5}>暂无 API Key</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminNotificationsPanel({ onNotice }: { onNotice: (message: string) => void }) {
  const emptyForm = {
    content: '',
  };
  const [items, setItems] = useState<SiteNotification[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState('');

  async function loadItems() {
    setLoading(true);
    try {
      const result = await fetchAdminNotifications();
      setItems(result.notifications);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '\u83b7\u53d6\u901a\u77e5\u5931\u8d25');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  function resetForm() {
    setEditingId('');
    setForm(emptyForm);
  }

  async function saveDraft(publishAfterSave: boolean) {
    if (!form.content.trim()) {
      onNotice('\u8bf7\u586b\u5199\u901a\u77e5\u5185\u5bb9');
      return;
    }
    setSubmitting(true);
    try {
      const payload = { content: form.content.trim() };
      const result = editingId
        ? await updateAdminNotification(editingId, payload)
        : await createAdminNotification(payload);
      if (publishAfterSave) await publishAdminNotification(result.notification.id);
      onNotice(publishAfterSave ? '\u901a\u77e5\u5df2\u53d1\u5e03' : '\u8349\u7a3f\u5df2\u4fdd\u5b58');
      resetForm();
      await loadItems();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '\u4fdd\u5b58\u901a\u77e5\u5931\u8d25');
    } finally {
      setSubmitting(false);
    }
  }

  function editItem(item: SiteNotification) {
    setEditingId(item.id);
    setForm({
      content: item.content || item.title,
    });
  }

  async function runAction(id: string, action: 'publish' | 'delete') {
    if (action === 'delete' && !window.confirm('\u786e\u5b9a\u5220\u9664\u8fd9\u6761\u901a\u77e5\u5417\uff1f')) return;
    setActingId(id);
    try {
      if (action === 'publish') await publishAdminNotification(id);
      if (action === 'delete') await deleteAdminNotification(id);
      onNotice(action === 'publish' ? '\u901a\u77e5\u5df2\u53d1\u5e03' : '\u901a\u77e5\u5df2\u5220\u9664');
      if (editingId === id) resetForm();
      await loadItems();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '\u64cd\u4f5c\u5931\u8d25');
    } finally {
      setActingId('');
    }
  }

  const statusLabels = { draft: '\u8349\u7a3f', published: '\u5df2\u53d1\u5e03', archived: '\u5df2\u5f52\u6863' };

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(420px,1.2fr)]">
      <section className="rounded-[22px] border border-white/8 bg-black/35 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-white">{'\u53d1\u5e03\u901a\u77e5'}</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{'\u65b0\u901a\u77e5\u53d1\u5e03\u540e\u4f1a\u51fa\u73b0\u5728\u7528\u6237\u9876\u90e8\u7684\u901a\u77e5\u4e2d\u5fc3\u3002'}</p>
          </div>
          {editingId ? <button className="text-xs font-bold text-zinc-400 hover:text-white" type="button" onClick={resetForm}>{'\u53d6\u6d88\u7f16\u8f91'}</button> : null}
        </div>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-bold text-zinc-300">
            {'\u901a\u77e5\u5185\u5bb9'}
            <textarea className="input min-h-64 resize-y leading-6" maxLength={5000} placeholder={'\u8bf7\u8f93\u5165\u901a\u77e5\u5185\u5bb9'} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn-secondary px-4 py-3 text-sm font-black disabled:opacity-50" disabled={submitting} type="button" onClick={() => void saveDraft(false)}>{submitting ? '\u4fdd\u5b58\u4e2d...' : editingId ? '\u4fdd\u5b58\u4fee\u6539' : '\u4fdd\u5b58\u8349\u7a3f'}</button>
            <button className="btn-primary px-4 py-3 text-sm font-black disabled:opacity-50" disabled={submitting} type="button" onClick={() => void saveDraft(true)}>{submitting ? '\u53d1\u5e03\u4e2d...' : '\u7acb\u5373\u53d1\u5e03'}</button>
          </div>
        </div>
      </section>

      <section className="custom-scrollbar min-h-0 overflow-y-auto rounded-[22px] border border-white/8 bg-black/35 p-5">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-black text-white">{'\u901a\u77e5\u8bb0\u5f55'}</h2><p className="mt-1 text-xs text-zinc-500">{`\u5171 ${items.length} \u6761`}</p></div>
          <button className="btn-secondary min-h-0 p-2" disabled={loading} type="button" onClick={() => void loadItems()}><RotateCw className={loading ? 'animate-spin' : ''} size={15} /></button>
        </div>
        <div className="mt-4 grid gap-3">
          {items.length ? items.map((item) => (
            <article className="rounded-[18px] border border-white/8 bg-white/[0.025] p-4" key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${item.status === 'published' ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : item.status === 'archived' ? 'border-zinc-500/25 bg-zinc-500/10 text-zinc-400' : 'border-amber-400/25 bg-amber-500/10 text-amber-200'}`}>{statusLabels[item.status]}</span>
                  </div>
                  <p className="mt-3 line-clamp-4 whitespace-pre-wrap break-words text-base font-black leading-7 text-white">{item.content || item.title}</p>
                  <p className="mt-3 text-[11px] text-zinc-600">{item.publishedAt ? `\u53d1\u5e03\u4e8e ${formatTime(item.publishedAt)}` : `\u521b\u5efa\u4e8e ${formatTime(item.createdAt)}`}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-3">
                <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white" type="button" onClick={() => editItem(item)}>{'\u7f16\u8f91'}</button>
                {item.status !== 'published' ? <button className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-200 disabled:opacity-50" disabled={actingId === item.id} type="button" onClick={() => void runAction(item.id, 'publish')}>{'\u53d1\u5e03'}</button> : null}
                <button className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-200 disabled:opacity-50" disabled={actingId === item.id} type="button" onClick={() => void runAction(item.id, 'delete')}>{'\u5220\u9664'}</button>
              </div>
            </article>
          )) : <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-zinc-500">{loading ? '\u52a0\u8f7d\u4e2d...' : '\u8fd8\u6ca1\u6709\u901a\u77e5'}</div>}
        </div>
      </section>
    </div>
  );
}

function AdminModelCreditPanel({
  pricing,
  onSave,
}: {
  pricing: ModelCreditPricing;
  onSave: (pricing: ModelCreditPricing) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ModelCreditPricing>(pricing);
  const [saving, setSaving] = useState(false);

  const setGpt = (key: keyof ModelCreditPricing['gptImage2'], value: number) => {
    setDraft((current) => ({ ...current, gptImage2: { ...current.gptImage2, [key]: value } }));
  };
  const setBanana = (key: keyof ModelCreditPricing['nanoBanana'], value: number) => {
    setDraft((current) => ({ ...current, nanoBanana: { ...current.nanoBanana, [key]: value } }));
  };
  const setSeedream = (key: keyof ModelCreditPricing['seedream'], value: number) => {
    setDraft((current) => ({ ...current, seedream: { ...current.seedream, [key]: value } }));
  };
  const setGrokImage = (key: keyof ModelCreditPricing['grokImage'], value: number) => {
    setDraft((current) => ({ ...current, grokImage: { ...current.grokImage, [key]: value } }));
  };
  const setVideo = (modelId: VideoModelId, key: string, value: number) => {
    setDraft((current) => ({
      ...current,
      video: {
        ...current.video,
        [modelId]: { ...current.video[modelId], [key]: value },
      },
    }));
  };
  const creditInput = (value: number, onChange: (value: number) => void) => (
    <input
      className="input w-28 text-right font-black"
      min={1}
      max={100000}
      step={1}
      type="number"
      value={value}
      onChange={(event) => onChange(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
    />
  );
  const row = (label: string, description: string, input: ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 py-3 last:border-0">
      <div><div className="text-sm font-bold text-zinc-100">{label}</div><div className="mt-1 text-[11px] text-zinc-500">{description}</div></div>
      {input}
    </div>
  );

  return (
    <div className="rounded-[22px] border border-white/8 bg-black/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-white">模型积分管理</h2>
          <p className="mt-1 text-xs text-zinc-500">保存后服务端立即生效，已登录客户端会在 15 秒内自动同步最新积分。</p>
        </div>
        <button
          className="btn-primary"
          type="button"
          disabled={saving}
          onClick={() => void (async () => {
            setSaving(true);
            try { await onSave(draft); } finally { setSaving(false); }
          })()}
        >
          {saving ? '保存中...' : '保存并立即生效'}
        </button>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
          <h3 className="font-black text-sky-100">GPT-image-2</h3>
          <p className="mt-1 text-[11px] text-zinc-500">扣 GPT 专用积分，不足部分自动扣通用积分。</p>
          <div className="mt-3">
            {row('STANDARD', '标准清晰度', creditInput(draft.gptImage2.standard, (value) => setGpt('standard', value)))}
            {row('2K 普通', 'auto / low / medium', creditInput(draft.gptImage2.twoK, (value) => setGpt('twoK', value)))}
            {row('2K 高质量', 'quality=high', creditInput(draft.gptImage2.twoKHigh, (value) => setGpt('twoKHigh', value)))}
            {row('4K 普通', 'auto / low / medium', creditInput(draft.gptImage2.fourK, (value) => setGpt('fourK', value)))}
            {row('4K 高质量', 'quality=high', creditInput(draft.gptImage2.fourKHigh, (value) => setGpt('fourKHigh', value)))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
          <h3 className="font-black text-emerald-100">Seedream 4</h3>
          <p className="mt-1 text-[11px] text-zinc-500">使用通用积分，仅提供 2K 与 4K。</p>
          <div className="mt-3">
            {row('2K', '标准档位', creditInput(draft.seedream.twoK, (value) => setSeedream('twoK', value)))}
            {row('4K', '高清档位', creditInput(draft.seedream.fourK, (value) => setSeedream('fourK', value)))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
          <h3 className="font-black text-rose-100">Grok Image</h3>
          <p className="mt-1 text-[11px] text-zinc-500">使用通用积分，仅提供 1K 与 2K。</p>
          <div className="mt-3">
            {row('1K', '基础档位', creditInput(draft.grokImage.oneK, (value) => setGrokImage('oneK', value)))}
            {row('2K', '标准档位', creditInput(draft.grokImage.twoK, (value) => setGrokImage('twoK', value)))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
          <h3 className="font-black text-amber-100">Nano Banana Pro</h3>
          <p className="mt-1 text-[11px] text-zinc-500">扣 Banana 专用积分，不足部分自动扣通用积分。</p>
          <div className="mt-3">
            {row('1K', '基础档位', creditInput(draft.nanoBanana.oneK, (value) => setBanana('oneK', value)))}
            {row('2K', '标准档位', creditInput(draft.nanoBanana.twoK, (value) => setBanana('twoK', value)))}
            {row('4K', '高清档位', creditInput(draft.nanoBanana.fourK, (value) => setBanana('fourK', value)))}
            {row('AI 增强附加', '开启中文文字增强时额外收取', creditInput(draft.nanoBanana.enhancement, (value) => setBanana('enhancement', value)))}
          </div>
        </section>

        {([
          ['gemini-veo31', 'Gemini Veo 3.1', ['720p:4', '720p:6', '720p:8', '1080p:4', '1080p:6', '1080p:8']],
          ['grok-video', 'Grok Video', ['720p:6', '720p:10', '720p:15']],
          ['seedance2.5', 'Seedance 2.5', Array.from({ length: 26 }, (_, index) => `720p:${index + 4}`)],
        ] as const).map(([modelId, title, tiers]) => (
          <section key={modelId} className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
            <h3 className="font-black text-violet-100">{title}</h3>
            <p className="mt-1 text-[11px] text-zinc-500">视频与其他非图片模型仅扣通用积分。</p>
            <div className="mt-3">
              {tiers.map((tier) => row(
                tier.replace(':', ' · ') + ' 秒',
                '分辨率与时长组合',
                creditInput(Number(draft.video[modelId]?.[tier] || 1), (value) => setVideo(modelId, tier, value)),
              ))}
            </div>
          </section>
        ))}
      </div>
      {draft.updatedAt ? <p className="mt-4 text-right text-[11px] text-zinc-600">最近保存：{new Date(draft.updatedAt).toLocaleString('zh-CN')}</p> : null}
    </div>
  );
}

function AdminView({
  users,
  usersPage,
  records,
  recordsPage,
  inviteCodes,
  inviteCodesPage,
  adminCredits,
  dashboardStats,
  providerMetrics,
  providerRisks,
  generationRanking,
  providerRouting,
  modelCreditPricing,
  recordsStats,
  recordModelOptions,
  recordResolutionOptions,
  loading,
  onCreateInviteCode,
  onCreateInviteCodesBatch,
  onDeleteInviteCode,
  onDeleteInviteCodesBatch,
  onRechargeInviteCode,
  onReclaimInviteCode,
  onRechargeUser,
  onDeductUser,
  onDeleteUser,
  onUpdateProviderRouting,
  onUpdateModelCreditPricing,
  onLoadSection,
  onPreview,
  onNotice,
}: {
  users: AdminUserSummary[];
  usersPage: PaginationInfo;
  records: GenerationRecord[];
  recordsPage: PaginationInfo;
  inviteCodes: InviteCodeInfo[];
  inviteCodesPage: PaginationInfo;
  adminCredits: CreditSummary;
  dashboardStats: AdminDashboardStats;
  providerMetrics: ProviderMetricRow[];
  providerRisks: ProviderRiskRecord[];
  generationRanking: AdminGenerationRanking;
  providerRouting: ProviderRoutingConfig;
  modelCreditPricing: ModelCreditPricing;
  recordsStats: AdminRecordsStats;
  recordModelOptions: string[];
  recordResolutionOptions: string[];
  loading: boolean;
  onCreateInviteCode: (
    credits: number,
    options?: { quiet?: boolean; refresh?: boolean },
  ) => Promise<InviteCodeInfo | null | undefined>;
  onCreateInviteCodesBatch: (credits: number, count: number) => Promise<InviteCodeInfo[]>;
  onDeleteInviteCode: (code: string) => Promise<void>;
  onDeleteInviteCodesBatch: (codes: string[]) => Promise<string[]>;
  onRechargeInviteCode: (code: string, credits: number) => Promise<void>;
  onReclaimInviteCode: (code: string, credits: number) => Promise<void>;
  onRechargeUser: (user: AdminUserSummary, credits: CreditBalances) => Promise<void>;
  onDeductUser: (user: AdminUserSummary, credits: number) => Promise<void>;
  onDeleteUser: (user: AdminUserSummary) => Promise<void>;
  onUpdateProviderRouting: (patch: Partial<ProviderRoutingConfig>, notice?: string) => Promise<void>;
  onUpdateModelCreditPricing: (pricing: ModelCreditPricing) => Promise<void>;
  onLoadSection: (
    section: AdminSection,
    params?: {
      page?: number;
      pageSize?: number;
      status?: string;
      sort?: string;
      search?: string;
      model?: string;
      resolution?: string;
      range?: string;
    },
  ) => Promise<void>;
  onPreview: (item: GenerationRecord) => void;
  onNotice: (message: string) => void;
}) {
  type InviteStatusFilter = 'all' | 'unused' | 'used';
  type InviteSortMode = 'created-desc' | 'created-asc' | 'credits-desc' | 'credits-asc';
  type UserSortMode = 'recent-desc' | 'recent-asc';
  type RecordRange = 'all' | '24h' | '7d' | '30d';

  const [section, setSection] = useState<AdminSection>('dashboard');
  const [credits, setCredits] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [deletingCode, setDeletingCode] = useState('');
  const [rechargingCode, setRechargingCode] = useState('');
  const [reclaimingCode, setReclaimingCode] = useState('');
  const [automation, setAutomation] = useState<AdminAutomationOperation | null>(null);
  const [automationRunning, setAutomationRunning] = useState(false);
  const [automationMessage, setAutomationMessage] = useState('');
  const [automationBusy, setAutomationBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const [rechargingUserId, setRechargingUserId] = useState('');
  const [rechargeUser, setRechargeUser] = useState<AdminUserSummary | null>(null);
  const [rechargeAmounts, setRechargeAmounts] = useState<CreditBalances>({ gpt: 0, banana: 0, general: 0 });
  const [deductingUserId, setDeductingUserId] = useState('');
  const [deletingUserId, setDeletingUserId] = useState('');
  const [redemptionUser, setRedemptionUser] = useState<AdminUserSummary | null>(null);
  const [redemptionRecords, setRedemptionRecords] = useState<InviteRedemptionRecord[]>([]);
  const [redemptionLoading, setRedemptionLoading] = useState(false);
  const [redemptionError, setRedemptionError] = useState('');
  const [copiedCode, setCopiedCode] = useState('');
  const [selectedProviderRisks, setSelectedProviderRisks] = useState<ProviderRiskRecord[]>([]);
  const [inviteBatchCount, setInviteBatchCount] = useState(1);
  const [batchCopied, setBatchCopied] = useState(false);
  const [generatedInviteCodes, setGeneratedInviteCodes] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedInviteCodes, setSelectedInviteCodes] = useState<string[]>([]);
  const [updatingProviderRoute, setUpdatingProviderRoute] = useState<string | null>(null);
  const [inviteStatusFilter, setInviteStatusFilter] = useState<InviteStatusFilter>('all');
  const [inviteSortMode, setInviteSortMode] = useState<InviteSortMode>('created-desc');
  const [inviteSearchDraft, setInviteSearchDraft] = useState('');
  const [inviteSearch, setInviteSearch] = useState('');
  const [invitePage, setInvitePage] = useState(1);
  const [userSearchDraft, setUserSearchDraft] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userSortMode, setUserSortMode] = useState<UserSortMode>('recent-desc');
  const [userPage, setUserPage] = useState(1);
  const [recordUserFilterDraft, setRecordUserFilterDraft] = useState('');
  const [recordUserFilter, setRecordUserFilter] = useState('');
  const [recordModelFilter, setRecordModelFilter] = useState('all');
  const [recordResolutionFilter, setRecordResolutionFilter] = useState('all');
  const [recordRange, setRecordRange] = useState<RecordRange>('all');
  const [recordPage, setRecordPage] = useState(1);
  const normalizedCredits = Math.max(0, Math.floor(Number(credits) || 0));
  const normalizedInviteBatchCount = Math.max(1, Math.min(100, Math.floor(Number(inviteBatchCount) || 1)));
  const inviteCreditsTotal = normalizedCredits * normalizedInviteBatchCount;
  const isInvalidCredits = normalizedCredits <= 0 || normalizedInviteBatchCount <= 0 || inviteCreditsTotal > adminCredits.remainingCredits;
  const today = new Date();
  const todayKey = formatDateKey(today);
  const todayRecords = dashboardStats.todayRecordCount > 0
    ? Array.from({ length: dashboardStats.todayRecordCount }, () => ({ createdAt: todayKey, creditsUsed: 0 } as GenerationRecord))
    : records.filter((item) => formatDateKey(item.createdAt) === todayKey);
  const lowCreditUsers = users.filter((item) => item.remainingCredits <= 50);
  const dashboardTodayRecordCount = dashboardStats.todayRecordCount || todayRecords.length;
  const todayCreditsUsed = dashboardStats.todayCreditsUsed || todayRecords.reduce((sum, item) => sum + item.creditsUsed, 0);
  const totalInviteCodes = dashboardStats.inviteCodeCount || inviteCodesPage.total || inviteCodes.length;
  const usedInviteCodes = dashboardStats.usedInviteCodeCount || inviteCodes.filter((item) => Boolean(item.redeemedBy)).length;
  const currentInviteUsageRate = dashboardStats.inviteUsageRate || (totalInviteCodes > 0 ? Math.round((usedInviteCodes / totalInviteCodes) * 100) : 0);

  async function handleRechargeUser(user: AdminUserSummary) {
    setRechargeUser(user);
    setRechargeAmounts({ gpt: 0, banana: 0, general: 0 });
  }

  async function submitUserRecharge() {
    if (!rechargeUser) return;
    const credits = {
      gpt: Math.max(0, Math.floor(Number(rechargeAmounts.gpt) || 0)),
      banana: Math.max(0, Math.floor(Number(rechargeAmounts.banana) || 0)),
      general: Math.max(0, Math.floor(Number(rechargeAmounts.general) || 0)),
    };
    const total = credits.gpt + credits.banana + credits.general;
    if (total <= 0) {
      window.alert('请至少填写一种大于 0 的积分');
      return;
    }
    if (rechargeUser.username.toLowerCase() !== 'admin' && total > adminCredits.remainingCredits) {
      window.alert(`admin 剩余积分不足，当前剩余 ${adminCredits.remainingCredits}`);
      return;
    }

    setRechargingUserId(rechargeUser.userId);
    try {
      await onRechargeUser(rechargeUser, credits);
      setRechargeUser(null);
    } finally {
      setRechargingUserId('');
    }
  }

  async function handleDeductUser(user: AdminUserSummary) {
    const rawValue = window.prompt(`请输入要从 ${user.username} 扣除的积分`, '100');
    if (rawValue === null) return;

    const deductCredits = Math.floor(Number(rawValue));
    if (!Number.isFinite(deductCredits) || deductCredits <= 0) {
      window.alert('请输入大于 0 的整数积分');
      return;
    }
    if (deductCredits > user.remainingCredits) {
      window.alert(`扣除积分不能超过用户剩余积分 ${user.remainingCredits}`);
      return;
    }

    setDeductingUserId(user.userId);
    try {
      await onDeductUser(user, deductCredits);
    } finally {
      setDeductingUserId('');
    }
  }

  async function handleDeleteUser(user: AdminUserSummary) {
    const creditNotice = user.username.toLowerCase() === 'admin'
      ? 'admin 的个人剩余积分不会计入或退回平台总额度。'
      : '剩余积分会退回平台总额度。';
    const confirmed = window.confirm(
      `确定删除用户 ${user.username}？\n\n将同时删除该用户兑换的邀请码、积分账户、生成记录和收藏图片，${creditNotice}此操作不可撤销。`,
    );
    if (!confirmed) return;

    setDeletingUserId(user.userId);
    try {
      await onDeleteUser(user);
    } finally {
      setDeletingUserId('');
    }
  }

  async function handleViewRedemptions(user: AdminUserSummary) {
    setRedemptionUser(user);
    setRedemptionRecords([]);
    setRedemptionError('');
    setRedemptionLoading(true);
    try {
      const payload = await fetchAdminUserInviteRedemptions(user.userId);
      setRedemptionRecords(payload.redemptions);
    } catch (error) {
      setRedemptionError(error instanceof Error ? error.message : '积分兑换记录加载失败');
    } finally {
      setRedemptionLoading(false);
    }
  }

  const usersById = users.reduce<Record<string, AdminUserSummary>>((accumulator, item) => {
    accumulator[item.userId] = item;
    return accumulator;
  }, {});

  const invitePrefixesByUserId = records.reduce<Record<string, string[]>>((accumulator, item) => {
    if (!item.inviteCode) return accumulator;
    const next = accumulator[item.userId] || [];
    if (!next.includes(item.inviteCode)) {
      next.push(item.inviteCode);
    }
    accumulator[item.userId] = next;
    return accumulator;
  }, {});

  const usageTrendByUserId = users.reduce<Record<string, number[]>>((accumulator, item) => {
    const buckets = Array.from({ length: 7 }, () => 0);
    for (const record of records) {
      if (record.userId !== item.userId) continue;
      const diff = Math.floor((today.getTime() - new Date(record.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      if (diff >= 0 && diff < 7) {
        buckets[6 - diff] += record.creditsUsed;
      }
    }
    accumulator[item.userId] = buckets;
    return accumulator;
  }, {});

  const filteredInviteCodes = inviteCodes;

  const searchableUsers = users;

  const modelOptions = recordModelOptions.length > 0 ? recordModelOptions : Array.from(new Set(records.map((item) => item.modelName))).sort();
  const resolutionOptions = recordResolutionOptions.length > 0
    ? recordResolutionOptions
    : Array.from(new Set(records.map((item) => (item.imageSize ? `${item.dimensions} / ${item.imageSize}` : item.dimensions)))).sort();

  const filteredRecords = records;

  const filteredRecordCredits = recordsStats.totalCreditsUsed || filteredRecords.reduce((sum, item) => sum + item.creditsUsed, 0);
  const filteredTodayRecords = filteredRecords.filter((item) => formatDateKey(item.createdAt) === todayKey);
  const filteredTodayRecordCredits = recordsStats.todayCreditsUsed || filteredTodayRecords.reduce((sum, item) => sum + item.creditsUsed, 0);
  const filteredTodayRecordCount = recordsStats.todayRecordCount || filteredTodayRecords.length;
  const invitePageSize = 10;
  const inviteTotalPages = inviteCodesPage.totalPages || Math.max(1, Math.ceil(filteredInviteCodes.length / invitePageSize));
  const currentInvitePage = inviteCodesPage.page || Math.min(invitePage, inviteTotalPages);
  const pagedInviteCodes = filteredInviteCodes;
  const recordPageSize = 10;
  const recordTotalPages = recordsPage.totalPages || Math.max(1, Math.ceil(filteredRecords.length / recordPageSize));
  const currentRecordPage = recordsPage.page || Math.min(recordPage, recordTotalPages);
  const pagedRecords = filteredRecords;
  const userPageSize = 10;
  const userTotalPages = usersPage.totalPages || Math.max(1, Math.ceil(searchableUsers.length / userPageSize));
  const currentUserPage = usersPage.page || Math.min(userPage, userTotalPages);
  const pagedUsers = searchableUsers;
  const modelUsageCounter = filteredRecords.reduce<Record<string, number>>((accumulator, item) => {
    accumulator[item.modelName] = (accumulator[item.modelName] || 0) + 1;
    return accumulator;
  }, {});
  const mostUsedModel = Object.entries(modelUsageCounter).sort((left, right) => right[1] - left[1])[0]?.[0] || '暂无';
  const hourUsageCounter = filteredRecords.reduce<Record<string, number>>((accumulator, item) => {
    const hour = formatHourKey(item.createdAt);
    if (!hour) return accumulator;
    accumulator[hour] = (accumulator[hour] || 0) + 1;
    return accumulator;
  }, {});
  const mostActiveHour = Object.entries(hourUsageCounter).sort((left, right) => right[1] - left[1])[0]?.[0];
  const displayMostUsedModel = recordsStats.mostUsedModel || mostUsedModel;
  const displayMostActiveHour = recordsStats.mostActiveHour || mostActiveHour;

  const canSelectInviteCodes = pagedInviteCodes.map((item) => item.code);
  const allSelectableChecked =
    canSelectInviteCodes.length > 0 && canSelectInviteCodes.every((code) => selectedInviteCodes.includes(code));
  function getSectionParams(targetSection: AdminSection) {
    if (targetSection === 'invites') {
      return {
        page: invitePage,
        pageSize: invitePageSize,
        status: inviteStatusFilter,
        sort: inviteSortMode,
        search: inviteSearch.trim(),
      };
    }

    if (targetSection === 'users') {
      return {
        page: userPage,
        pageSize: userPageSize,
        search: userSearch.trim(),
        sort: userSortMode,
      };
    }

    if (targetSection === 'records') {
      return {
        page: recordPage,
        pageSize: recordPageSize,
        search: recordUserFilter.trim(),
        model: recordModelFilter,
        resolution: recordResolutionFilter,
        range: recordRange,
      };
    }

    if (targetSection === 'apiKeys') {
      return { page: 1, pageSize: 10 };
    }

    return { page: 1, pageSize: 10 };
  }

  function refreshCurrentSection() {
    return onLoadSection(section, getSectionParams(section));
  }

  function commitInviteSearch() {
    setInvitePage(1);
    setInviteSearch(inviteSearchDraft.trim());
  }

  function commitUserSearch() {
    setUserPage(1);
    setUserSearch(userSearchDraft.trim());
  }

  function commitRecordSearch() {
    setRecordPage(1);
    setRecordUserFilter(recordUserFilterDraft.trim());
  }

  useEffect(() => {
    setInvitePage(1);
  }, [inviteStatusFilter, inviteSortMode, inviteSearch]);

  useEffect(() => {
    setRecordPage(1);
  }, [recordUserFilter, recordModelFilter, recordResolutionFilter, recordRange]);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const payload = await fetchAdminAutomationStatus();
        if (!disposed) {
          setAutomation(payload.operation);
          setAutomationRunning(payload.running);
          setPendingFiles(payload.pendingFiles || []);
        }
      } catch { /* best effort */ }
    };
    void load();
    const timer = window.setInterval(() => void load(), 2_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);

  async function runAutomation(kind: 'commit' | 'deploy') {
    setAutomationBusy(true);
    try {
      const payload = kind === 'commit'
        ? await startAdminCommit(automationMessage.trim() || undefined)
        : await startAdminDeploy(automationMessage.trim() || undefined);
      setAutomation(payload.operation);
      setAutomationRunning(true);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '操作启动失败');
    } finally {
      setAutomationBusy(false);
    }
  }

  useEffect(() => {
    if (section === 'apiKeys') return;

    const timer = window.setTimeout(() => {
      void onLoadSection(section, getSectionParams(section));
    }, section === 'dashboard' ? 0 : 220);

    return () => window.clearTimeout(timer);
  }, [
    section,
    invitePage,
    inviteStatusFilter,
    inviteSortMode,
    inviteSearch,
    userPage,
    userSearch,
    userSortMode,
    recordPage,
    recordUserFilter,
    recordModelFilter,
    recordResolutionFilter,
    recordRange,
  ]);

  function formatPercent(value: number) {
    return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
  }

  function toggleInviteCode(code: string) {
    setSelectedInviteCodes((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }

  function toggleAllInviteCodes() {
    setSelectedInviteCodes((current) =>
      allSelectableChecked ? current.filter((code) => !canSelectInviteCodes.includes(code)) : canSelectInviteCodes,
    );
  }

  function getStatusBadge(used: boolean) {
    return (
      <span
        className={
          used
            ? 'inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-zinc-300'
            : 'inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300'
        }
      >
        <span className={used ? 'h-2 w-2 rounded-full bg-zinc-400' : 'h-2 w-2 rounded-full bg-emerald-400'} />
        {used ? '已使用' : '未使用'}
      </span>
    );
  }

  function getCreditsTone(creditsUsed: number) {
    if (creditsUsed > 50) return 'text-rose-300';
    if (creditsUsed >= 20) return 'text-amber-300';
    return 'text-emerald-300';
  }

  function truncatePrompt(prompt: string) {
    return prompt.length > 20 ? `${prompt.slice(0, 20)}...` : prompt;
  }

  function renderSparkline(points: number[]) {
    const width = 132;
    const height = 44;
    const maxValue = Math.max(...points, 1);
    const path = points
      .map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * width;
        const y = height - (point / maxValue) * (height - 8) - 4;
        return `${index === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');

    return (
      <svg className="h-12 w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <path d={path} fill="none" stroke="url(#trend-gradient)" strokeLinecap="round" strokeWidth="2.5" />
        <defs>
          <linearGradient id="trend-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  async function handleCreateInviteCode() {
    setSubmitting(true);
    try {
      const inviteCodes = normalizedInviteBatchCount > 1
        ? await onCreateInviteCodesBatch(normalizedCredits, normalizedInviteBatchCount)
        : [await onCreateInviteCode(normalizedCredits, { quiet: true, refresh: true })].filter(Boolean);
      const nextCodes = inviteCodes.map((item) => item.code).filter(Boolean);

      if (nextCodes.length !== normalizedInviteBatchCount) {
        throw new Error('\u9080\u8bf7\u7801\u751f\u6210\u5931\u8d25');
      }
      setCredits(100);
      setInviteBatchCount(1);
      if (nextCodes.length > 0) {
        setGeneratedInviteCodes(nextCodes);
        setBatchCopied(false);
        onNotice(`\u5df2\u751f\u6210 ${nextCodes.length} \u4e2a\u9080\u8bf7\u7801`);
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '\u9080\u8bf7\u7801\u751f\u6210\u5931\u8d25');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteInviteCode(code: string) {
    if (!window.confirm(`确认删除邀请码 ${code} 吗？删除后积分会退回 admin 账户。`)) {
      return;
    }

    setDeletingCode(code);
    try {
      await onDeleteInviteCode(code);
      setSelectedInviteCodes((current) => current.filter((item) => item !== code));
    } finally {
      setDeletingCode('');
    }
  }

  async function handleRechargeInviteCode(code: string) {
    const rawValue = window.prompt(`请输入要给 ${code} 充值的积分数量`, '100');
    if (rawValue === null) return;

    const credits = Math.floor(Number(rawValue));
    if (!Number.isFinite(credits) || credits <= 0) {
      window.alert('请输入大于 0 的整数积分');
      return;
    }

    setRechargingCode(code);
    try {
      await onRechargeInviteCode(code, credits);
    } finally {
      setRechargingCode('');
    }
  }

  async function handleReclaimInviteCode(code: string) {
    const rawValue = window.prompt(`请输入要从 ${code} 回收的积分数量`, '10');
    if (rawValue === null) return;

    const credits = Math.floor(Number(rawValue));
    if (!Number.isFinite(credits) || credits <= 0) {
      window.alert('请输入大于 0 的整数积分');
      return;
    }

    setReclaimingCode(code);
    try {
      await onReclaimInviteCode(code, credits);
    } finally {
      setReclaimingCode('');
    }
  }

  async function handleBulkDeleteInviteCodes() {
    const availableCodes = selectedInviteCodes.filter((code) => inviteCodes.some((item) => item.code === code));

    if (availableCodes.length === 0) return;
    if (!window.confirm(`确认批量删除 ${availableCodes.length} 个邀请码吗？删除后积分会退回 admin。`)) {
      return;
    }

    setBulkDeleting(true);
    try {
      const deletedCodes = await onDeleteInviteCodesBatch(availableCodes);
      if (deletedCodes.length > 0) {
        setSelectedInviteCodes((current) => current.filter((code) => !deletedCodes.includes(code)));
      }
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleCopyGeneratedInviteCodes() {
    const value = generatedInviteCodes.join('\n');
    if (!value) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error('copy failed');
        }
      }

      setBatchCopied(true);
      window.setTimeout(() => setBatchCopied(false), 1800);
    } catch {
      window.alert('\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5');
    }
  }

  async function handleCopyInviteCode(code: string) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error('复制失败');
        }
      }

      setCopiedCode(code);
      window.setTimeout(() => {
        setCopiedCode((current) => (current === code ? '' : current));
      }, 1800);
    } catch {
      window.alert('复制失败，请重试');
    }
  }

  const menuItems: Array<{ id: AdminSection; label: string }> = [
    { id: 'dashboard', label: '看板' },
    { id: 'modelCredits', label: '模型积分管理' },
    { id: 'notifications', label: '通知管理' },
    { id: 'invites', label: '邀请码' },
    { id: 'apiKeys', label: 'API Key' },
    { id: 'users', label: '用户' },
    { id: 'records', label: '请求记录' },
  ];

  return (
    <section className="admin-page-shell flex min-h-0 flex-col overflow-auto py-4 lg:h-full lg:overflow-hidden">
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-4">
        <aside className="app-panel flex flex-col p-3">
          <div className="card mb-4 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Admin Console</p>
            <p className="mt-2 text-lg font-black text-white">后台管理</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">邀请码、用户、记录和运行状态集中处理。</p>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            {menuItems.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  className={
                    active
                      ? 'rounded-[16px] border border-sky-400/30 bg-sky-400/12 px-4 py-3 text-left'
                      : 'rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-3 text-left transition hover:border-white/15 hover:bg-white/[0.05]'
                  }
                  type="button"
                  onClick={() => {
                    setInvitePage(1);
                    setUserPage(1);
                    setRecordPage(1);
                    setSelectedInviteCodes([]);
                    setSection(item.id);
                  }}
                >
                  <span className={active ? 'block text-sm font-black text-white' : 'block text-sm font-black text-zinc-200'}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="custom-scrollbar flex min-h-0 flex-col overflow-visible pr-0 lg:overflow-y-auto lg:pr-1">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-visible">
            {section === 'dashboard' ? (
            <>
            <div className="grid gap-3 xl:grid-cols-4">
              {[
                { label: '今日生成次数', value: String(todayRecords.length), hint: '按全部记录统计' },
                { label: '今日消耗积分', value: String(todayCreditsUsed), hint: '统一积分池计费' },
                { label: '邀请码使用率', value: formatPercent(currentInviteUsageRate), hint: `${usedInviteCodes}/${Math.max(totalInviteCodes, 1)}` },
                { label: '低积分用户提醒', value: String(lowCreditUsers.length), hint: '剩余 <= 50 积分' },
              ].map((card) => (
                <div key={card.label} className="rounded-[22px] border border-white/8 bg-black/35 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-500">{card.label}</p>
                  <p className="mt-3 text-3xl font-black text-white">{card.value}</p>
                  <p className="mt-2 text-xs text-zinc-500">{card.hint}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[22px] border border-white/8 bg-black/35 p-4">
                <h2 className="text-base font-black text-white">今日生图数量排名</h2>
                <p className="mt-1 text-xs text-zinc-500">仅按生图数量排序，积分仅供参考、不计入排名</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/[0.04] text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 font-bold">排名</th>
                        <th className="px-3 py-2 font-bold">用户</th>
                        <th className="px-3 py-2 text-right font-bold">生图数量</th>
                        <th className="px-3 py-2 text-right font-bold">消耗积分</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/8">
                      {generationRanking.today.map((item, index) => (
                        <tr key={item.userId} className="text-zinc-300">
                          <td className="px-3 py-2.5 font-black text-white">{index + 1}</td>
                          <td className="px-3 py-2.5">{item.username}</td>
                          <td className="px-3 py-2.5 text-right font-black text-white">{item.generationCount}</td>
                          <td className="px-3 py-2.5 text-right text-amber-200">{item.creditsUsed}</td>
                        </tr>
                      ))}
                      {generationRanking.today.length === 0 && (
                        <tr>
                          <td className="px-3 py-8 text-center text-zinc-500" colSpan={4}>今日暂无数据</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/35 p-4">
                <h2 className="text-base font-black text-white">总生图数量排名</h2>
                <p className="mt-1 text-xs text-zinc-500">全量累计，仅按生图数量排序</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/[0.04] text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 font-bold">排名</th>
                        <th className="px-3 py-2 font-bold">用户</th>
                        <th className="px-3 py-2 text-right font-bold">生图数量</th>
                        <th className="px-3 py-2 text-right font-bold">消耗积分</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/8">
                      {generationRanking.total.map((item, index) => (
                        <tr key={item.userId} className="text-zinc-300">
                          <td className="px-3 py-2.5 font-black text-white">{index + 1}</td>
                          <td className="px-3 py-2.5">{item.username}</td>
                          <td className="px-3 py-2.5 text-right font-black text-white">{item.generationCount}</td>
                          <td className="px-3 py-2.5 text-right text-amber-200">{item.creditsUsed}</td>
                        </tr>
                      ))}
                      {generationRanking.total.length === 0 && (
                        <tr>
                          <td className="px-3 py-8 text-center text-zinc-500" colSpan={4}>暂无数据</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="rounded-[22px] border border-amber-300/15 bg-amber-500/[0.04] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-white">代码与部署</h2>
                  <p className="mt-1 text-xs text-zinc-500">仅管理员可见。部署会执行检查、推送并等待 GitHub Actions 滚动更新完成。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="input min-h-9 w-56 px-3 py-2 text-xs"
                    placeholder="提交说明（可选）"
                    value={automationMessage}
                    onChange={(event) => setAutomationMessage(event.target.value.slice(0, 200))}
                    disabled={automationRunning || automationBusy}
                  />
                  <button type="button" className="btn-secondary min-h-9 px-3 text-xs font-black" disabled={automationRunning || automationBusy} onClick={() => void runAutomation('commit')}>
                    提交代码
                  </button>
                  <button type="button" className="btn-primary min-h-9 px-3 text-xs font-black" disabled={automationRunning || automationBusy} onClick={() => void runAutomation('deploy')}>
                    {automationRunning && automation?.kind === 'deploy' ? '部署中…' : '提交并部署'}
                  </button>
                </div>
              </div>
              {automation ? (
                <div className="mt-3 rounded-xl border border-white/8 bg-black/35 p-3">
                  <div className="flex items-center justify-between text-[11px] font-bold text-zinc-300">
                    <span>{automation.kind === 'deploy' ? '部署任务' : '提交任务'} · {automation.status}</span>
                    <span>{new Date(automation.startedAt).toLocaleString('zh-CN')}</span>
                  </div>
                  {automation.status === 'succeeded' ? (
                    <div className="mt-2 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-200">
                      {automation.kind === 'deploy' ? '部署成功：服务器已完成滚动更新，健康检查通过。' : '提交成功：代码已提交到当前分支。'}
                    </div>
                  ) : automation.status === 'failed' ? (
                    <div className="mt-2 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-200">
                      {automation.kind === 'deploy' ? '部署失败：服务器未完成更新，请查看下方错误日志。' : '提交失败：代码未完成提交，请查看下方错误日志。'}
                    </div>
                  ) : (
                    <div className="mt-2 rounded-lg border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-200">
                      {automation.kind === 'deploy' ? '部署进行中，请保持页面打开。' : '正在提交代码，请稍候。'}
                    </div>
                  )}
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] leading-4 text-zinc-500">{automation.error || automation.output || '等待输出…'}</pre>
                </div>
              ) : null}
              <div className="mt-3 text-[10px] text-zinc-500">
                {pendingFiles.length > 0 ? `待提交文件（${pendingFiles.length}）：${pendingFiles.join(' · ')}` : '当前没有待提交文件'}
              </div>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/35 p-4">
              <div>
                <h2 className="text-base font-black text-white">生图渠道顺序</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Image2 与 Banana 独立管理；每个分辨率都可以单独调整优先级或停用渠道。
                </p>
              </div>
              <div className="mt-5 space-y-6">
                {([
                  { key: 'image2Routes', title: 'Image2', subtitle: 'STANDARD 在这里按 1K 管理' },
                  { key: 'bananaRoutes', title: 'Banana', subtitle: '1K / 2K / 4K 分别路由' },
                  { key: 'seedreamRoutes', title: 'Seedream', subtitle: '仅开放 2K / 4K 路由' },
                ] as const).map((group) => (
                  <section key={group.key} className="rounded-[20px] border border-white/8 bg-white/[0.025] p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-black text-white">{group.title}</h3>
                      <span className="text-[11px] text-zinc-500">{group.subtitle}</span>
                    </div>
                    <div className="mt-4 grid gap-4 xl:grid-cols-3">
                      {(['1K', '2K', '4K'] as const)
                        .filter((resolution) => group.key !== 'seedreamRoutes' || resolution !== '1K')
                        .map((resolution) => {
                        const channels = providerRouting[group.key][resolution];
                        return (
                          <div key={resolution} className="rounded-[18px] border border-white/8 bg-black/30 p-3">
                            <div className="mb-3 flex items-center justify-between">
                              <span className="text-xs font-black text-sky-200">{resolution}</span>
                              <span className="text-[10px] text-zinc-600">从上到下依次尝试</span>
                            </div>
                            <div className="space-y-2">
                              {channels.map((channel, index) => {
                                const routeLabel = providerChannelName(channel.id);
                                const routeKey = `${group.key}:${resolution}:${channel.id}`;
                                const updating = updatingProviderRoute === routeKey;
                                const saveChannels = async (
                                  nextChannels: Array<{ id: string; enabled: boolean }>,
                                  notice: string,
                                ) => {
                                  setUpdatingProviderRoute(routeKey);
                                  try {
                                    await onUpdateProviderRouting({
                                      [group.key]: {
                                        ...providerRouting[group.key],
                                        [resolution]: nextChannels,
                                      },
                                    } as Partial<ProviderRoutingConfig>, notice);
                                  } catch (error) {
                                    onNotice(error instanceof Error ? error.message : '渠道配置更新失败');
                                  } finally {
                                    setUpdatingProviderRoute(null);
                                  }
                                };
                                return (
                                  <article
                                    key={channel.id}
                                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                                      channel.enabled
                                        ? 'border-emerald-400/15 bg-emerald-500/[0.05]'
                                        : 'border-white/8 bg-white/[0.02] opacity-65'
                                    } ${updating ? 'animate-pulse' : ''}`}
                                  >
                                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-white/5 text-[10px] font-black text-zinc-400">
                                      {index + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-xs font-bold text-white">{routeLabel}</div>
                                    </div>
                                    <div className="flex flex-none items-center gap-1">
                                      <button
                                        type="button"
                                        aria-label={`${routeLabel} 上移`}
                                        disabled={index === 0 || updatingProviderRoute !== null}
                                        className="rounded-md p-1 text-zinc-500 transition hover:bg-white/8 hover:text-white disabled:opacity-25"
                                        onClick={() => {
                                          const next = channels.map((item) => ({ ...item }));
                                          [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                          void saveChannels(next, `${group.title} ${resolution} 渠道顺序已更新`);
                                        }}
                                      >
                                        <ChevronUp size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={`${routeLabel} 下移`}
                                        disabled={index === channels.length - 1 || updatingProviderRoute !== null}
                                        className="rounded-md p-1 text-zinc-500 transition hover:bg-white/8 hover:text-white disabled:opacity-25"
                                        onClick={() => {
                                          const next = channels.map((item) => ({ ...item }));
                                          [next[index], next[index + 1]] = [next[index + 1], next[index]];
                                          void saveChannels(next, `${group.title} ${resolution} 渠道顺序已更新`);
                                        }}
                                      >
                                        <ChevronDown size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        role="switch"
                                        aria-label={`${routeLabel} ${channel.enabled ? '停用' : '启用'}`}
                                        aria-checked={channel.enabled}
                                        disabled={updatingProviderRoute !== null}
                                        className={`relative ml-1 h-6 w-10 rounded-full border transition ${
                                          channel.enabled
                                            ? 'border-emerald-300/40 bg-emerald-500'
                                            : 'border-white/15 bg-zinc-800'
                                        }`}
                                        onClick={() => {
                                          const next = channels.map((item) => item.id === channel.id
                                            ? { ...item, enabled: !item.enabled }
                                            : { ...item });
                                          void saveChannels(
                                            next,
                                            `${routeLabel} 已${channel.enabled ? '停用' : '启用'}`,
                                          );
                                        }}
                                      >
                                        <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition ${
                                          channel.enabled ? 'left-[19px]' : 'left-0.5'
                                        }`} />
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              <div className="mt-5 border-t border-white/8 pt-4">
                <div className="mb-3 text-xs font-black text-zinc-300">视频线路开关</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    { key: 'junliaiGeminiVeo31', title: 'Gemini Veo 3.1' },
                    { key: 'junliaiFireflyVideo', title: 'Firefly Video' },
                    { key: 'schatSeedance25', title: 'Schat · Seedance 2.5' },
                    { key: 'junliaiSd2Fast', title: 'seedance 2.0 fast' },
                  ] as const).map((route, index) => {
                    const enabled = providerRouting[route.key];
                    const updating = updatingProviderRoute === route.key;
                    return (
                      <article key={route.key} className="flex items-center justify-between rounded-[16px] border border-white/8 bg-black/25 p-3">
                        <div>
                          <div className="text-xs font-bold text-white">{`视频接口 ${index + 1}`}</div>
                          <div className="mt-1 text-[10px] text-zinc-500">{enabled ? '已启用' : '已停用'}</div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          disabled={updatingProviderRoute !== null}
                          className={`relative h-7 w-12 rounded-full border transition ${
                            enabled ? 'border-emerald-300/40 bg-emerald-500' : 'border-white/15 bg-zinc-800'
                          } ${updating ? 'opacity-50' : ''}`}
                          onClick={async () => {
                            setUpdatingProviderRoute(route.key);
                            try {
                              await onUpdateProviderRouting({ [route.key]: !enabled });
                            } catch (error) {
                              onNotice(error instanceof Error ? error.message : '接口开关更新失败');
                            } finally {
                              setUpdatingProviderRoute(null);
                            }
                          }}
                        >
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                            enabled ? 'left-[22px]' : 'left-0.5'
                          }`} />
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/35 p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-white">{'\u4eca\u65e5\u6a21\u578b\u4e0e\u63a5\u53e3\u8c03\u7528'}</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {'\u6309\u6a21\u578b\u3001\u5b9e\u9645\u547d\u4e2d\u63a5\u53e3\u548c\u751f\u6210\u914d\u7f6e\u5206\u7ec4\uff0c\u54cd\u5e94\u65f6\u95f4\u4e3a\u5f53\u65e5\u5e73\u5747\u503c\u3002'}
                  </p>
                </div>
                <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-100">
                  {`${providerMetrics.reduce((sum, item) => sum + item.callCount, 0)} \u6b21\u4e0a\u6e38\u8c03\u7528`}
                </span>
              </div>
              <div className="custom-scrollbar mt-4 overflow-x-auto rounded-[18px] border border-white/8">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="bg-white/[0.04] text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 font-bold">{'\u6a21\u578b'}</th>
                      <th className="px-4 py-3 font-bold">{'\u5b9e\u9645\u63a5\u53e3'}</th>
                      <th className="px-4 py-3 font-bold">{'\u914d\u7f6e'}</th>
                      <th className="px-4 py-3 text-right font-bold">{'\u8c03\u7528\u6b21\u6570'}</th>
                      <th className="px-4 py-3 text-right font-bold">{'\u6210\u529f / \u5931\u8d25'}</th>
                      <th className="px-4 py-3 text-right font-bold">{'\u5e73\u5747\u54cd\u5e94\u65f6\u95f4'}</th>
                      <th className="px-4 py-3 text-right font-bold">{'\u8ba1\u8d39\u98ce\u9669'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8">
                    {providerMetrics.length > 0 ? providerMetrics.map((item) => (
                      <tr key={`${item.modelId}:${item.provider}:${item.configuration}`} className="text-zinc-300">
                        <td className="px-4 py-3 font-bold text-white">{item.modelId}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2.5 py-1 font-bold ${
                            item.provider.startsWith('Junliai')
                              ? 'border-violet-400/25 bg-violet-500/10 text-violet-100'
                              : 'border-sky-400/25 bg-sky-500/10 text-sky-100'
                          }`}>
                            {item.provider}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-zinc-400">{item.configuration}</td>
                        <td className="px-4 py-3 text-right text-base font-black text-white">{item.callCount}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-emerald-300">{item.successCount}</span>
                          <span className="mx-1.5 text-zinc-600">/</span>
                          <span className={item.failureCount > 0 ? 'font-bold text-rose-300' : 'text-zinc-500'}>{item.failureCount}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-black text-amber-100">
                          {item.averageResponseMs >= 1000
                            ? `${(item.averageResponseMs / 1000).toFixed(1)} s`
                            : `${item.averageResponseMs} ms`}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {(() => {
                            const matches = providerRisks.filter((risk) => {
                              const riskConfiguration = risk.configuration.split('/')[0].trim().toUpperCase() || 'STANDARD';
                              const providerCalled = item.provider.startsWith('Junliai')
                                ? risk.junliaiStatus !== 'not_called'
                                : risk.visionaryStatus !== 'not_called';
                              return risk.modelId === item.modelId
                                && riskConfiguration === item.configuration.toUpperCase()
                                && providerCalled
                                && risk.riskLevel !== 'normal';
                            });
                            const suspected = matches.filter((risk) => risk.riskLevel === 'suspected_duplicate').length;
                            if (matches.length === 0) {
                              return <span className="text-emerald-300">{'\u6b63\u5e38'}</span>;
                            }
                            return (
                              <button
                                className={`rounded-full border px-2.5 py-1 font-bold ${suspected > 0 ? 'border-rose-400/30 bg-rose-500/10 text-rose-200' : 'border-amber-400/30 bg-amber-500/10 text-amber-100'}`}
                                type="button"
                                onClick={() => setSelectedProviderRisks(matches)}
                              >
                                {suspected > 0 ? `\u7591\u4f3c ${suspected}` : `\u5f85\u6838\u5bf9 ${matches.length}`}
                              </button>
                            );
                          })()}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td className="px-4 py-8 text-center text-zinc-500" colSpan={7}>
                          {'\u4eca\u65e5\u6682\u65e0\u4e0a\u6e38\u63a5\u53e3\u8c03\u7528\u8bb0\u5f55'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="hidden">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-white">{'\u4e0a\u6e38\u8ba1\u8d39\u98ce\u9669\u76d1\u63a7'}</h2>
                  <p className="mt-1 text-xs text-zinc-500">{'\u6309\u5355\u6b21\u7528\u6237\u4efb\u52a1\u5173\u8054 Junliai \u548c Visionary\uff0c\u201c\u7591\u4f3c\u91cd\u590d\u201d\u9700\u7ed3\u5408\u4e0a\u6e38\u6d88\u8d39\u6d41\u6c34\u6700\u7ec8\u6838\u5bf9\u3002'}</p>
                </div>
                <div className="flex gap-2 text-xs font-bold">
                  <span className="rounded-full border border-rose-400/25 bg-rose-500/10 px-3 py-1 text-rose-200">
                    {`${providerRisks.filter((item) => item.riskLevel === 'suspected_duplicate').length} \u6761\u7591\u4f3c\u91cd\u590d`}
                  </span>
                  <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-amber-100">
                    {`${providerRisks.filter((item) => item.riskLevel === 'review').length} \u6761\u5f85\u6838\u5bf9`}
                  </span>
                </div>
              </div>
              <div className="custom-scrollbar mt-4 overflow-x-auto rounded-[18px] border border-white/8">
                <table className="w-full min-w-[1050px] text-left text-xs">
                  <thead className="bg-white/[0.04] text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">{'\u65f6\u95f4 / \u8ffd\u8e2a ID'}</th>
                      <th className="px-4 py-3">{'\u6a21\u578b\u914d\u7f6e'}</th>
                      <th className="px-4 py-3">{'Junliai'}</th>
                      <th className="px-4 py-3">{'Visionary'}</th>
                      <th className="px-4 py-3">{'\u98ce\u9669\u7ed3\u8bba'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8">
                    {providerRisks.slice(0, 20).map((item) => (
                      <tr key={item.traceId} className="text-zinc-300">
                        <td className="px-4 py-3">
                          <div>{new Date(item.createdAt).toLocaleString('zh-CN')}</div>
                          <code className="mt-1 block text-[10px] text-zinc-600">{item.traceId.slice(0, 12)}</code>
                        </td>
                        <td className="px-4 py-3"><div className="font-bold text-white">{item.modelId}</div><div className="mt-1 font-mono text-[10px] text-zinc-500">{item.configuration}</div></td>
                        <td className="px-4 py-3">{item.junliaiStatus === 'not_called' ? '\u672a\u8c03\u7528' : `${item.junliaiStatus === 'success' ? '\u6210\u529f' : item.junliaiStatus === 'uncertain' ? '\u7ed3\u679c\u672a\u77e5' : '\u660e\u786e\u5931\u8d25'} · ${(item.junliaiDurationMs / 1000).toFixed(1)}s`}</td>
                        <td className="px-4 py-3">{item.visionaryStatus === 'not_called' ? '\u672a\u8c03\u7528' : `${item.visionaryStatus === 'success' ? '\u6210\u529f' : '\u5931\u8d25'} · ${(item.visionaryDurationMs / 1000).toFixed(1)}s`}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 font-bold ${item.riskLevel === 'suspected_duplicate' ? 'border-rose-400/25 bg-rose-500/10 text-rose-200' : item.riskLevel === 'review' ? 'border-amber-400/25 bg-amber-500/10 text-amber-100' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'}`}>{item.riskLevel === 'suspected_duplicate' ? '\u7591\u4f3c\u91cd\u590d' : item.riskLevel === 'review' ? '\u5f85\u6838\u5bf9' : '\u6b63\u5e38'}</span>
                          <div className="mt-1 max-w-[320px] text-[10px] leading-4 text-zinc-500">{item.riskReason}</div>
                        </td>
                      </tr>
                    ))}
                    {providerRisks.length === 0 ? <tr><td className="px-4 py-8 text-center text-zinc-500" colSpan={5}>{'\u4eca\u65e5\u6682\u65e0\u53ef\u6838\u5bf9\u7684\u4e0a\u6e38\u8c03\u7528'}</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
            </>
            ) : null}

            {section === 'notifications' ? <AdminNotificationsPanel onNotice={onNotice} /> : null}

            {section === 'modelCredits' ? (
              <AdminModelCreditPanel pricing={modelCreditPricing} onSave={onUpdateModelCreditPricing} />
            ) : null}

            {section === 'invites' ? (
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-white/8 bg-black/35 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-white">邀请码管理</h2>
                    <p className="mt-1 text-xs text-zinc-500">总池 / 已分配 / 剩余 一眼看清，支持筛选、排序和批量删除。</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-zinc-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={loading}
                      type="button"
                      onClick={() => void refreshCurrentSection()}
                    >
                      <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <span className={isInvalidCredits ? 'text-xs font-semibold text-rose-300' : 'text-xs font-semibold text-zinc-400'}>
                      本次发放 {inviteCreditsTotal} 积分
                    </span>
                    <input
                      className={`w-28 rounded-xl border px-3 py-2 text-sm font-semibold outline-none ${isInvalidCredits ? 'border-rose-500/50 bg-rose-500/10 text-rose-100' : 'border-white/10 bg-black/40 text-white'}`}
                      min={1}
                      max={adminCredits.remainingCredits}
                      type="number"
                      value={credits}
                      onChange={(event) => setCredits(Math.max(0, Number(event.target.value) || 0))}
                    />
                    <span className="text-xs font-semibold text-zinc-500">{"\u6570\u91cf"}</span>
                    <input
                      className={`w-20 rounded-xl border px-3 py-2 text-sm font-semibold outline-none ${isInvalidCredits ? 'border-rose-500/50 bg-rose-500/10 text-rose-100' : 'border-white/10 bg-black/40 text-white'}`}
                      min={1}
                      max={100}
                      type="number"
                      value={inviteBatchCount}
                      onChange={(event) => setInviteBatchCount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
                    />
                    <button
                      className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50"
                      disabled={submitting || isInvalidCredits}
                      type="button"
                      onClick={() => void handleCreateInviteCode()}
                    >
                      {submitting ? '生成中...' : normalizedInviteBatchCount > 1 ? '批量生成' : '生成邀请码'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    { label: '总池', value: adminCredits.totalCredits, tone: 'text-white' },
                    { label: '已分配', value: adminCredits.usedCredits, tone: 'text-amber-300' },
                    { label: '剩余', value: adminCredits.remainingCredits, tone: 'text-sky-300' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                      <p className="text-xs font-semibold text-zinc-500">{item.label}</p>
                      <p className={`mt-2 text-2xl font-black ${item.tone}`}>{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-white/[0.02] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none"
                      value={inviteStatusFilter}
                      onChange={(event) => setInviteStatusFilter(event.target.value as InviteStatusFilter)}
                    >
                      <option value="all">全部状态</option>
                      <option value="unused">未使用</option>
                      <option value="used">已使用</option>
                    </select>
                    <select
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none"
                      value={inviteSortMode}
                      onChange={(event) => setInviteSortMode(event.target.value as InviteSortMode)}
                    >
                      <option value="created-desc">创建时间：最新</option>
                      <option value="created-asc">创建时间：最早</option>
                      <option value="credits-desc">积分：高到低</option>
                      <option value="credits-asc">积分：低到高</option>
                    </select>
                    <input
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-500 md:w-56"
                      placeholder="搜索邀请码 / 使用者"
                      value={inviteSearchDraft}
                      onChange={(event) => setInviteSearchDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          commitInviteSearch();
                        }
                      }}
                    />
                  </div>
                  <button
                    className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={bulkDeleting || selectedInviteCodes.length === 0}
                    type="button"
                    onClick={() => void handleBulkDeleteInviteCodes()}
                  >
                    {bulkDeleting ? '批量删除中...' : `批量删除 (${selectedInviteCodes.length})`}
                  </button>
                </div>

                <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
                  {filteredInviteCodes.length > 0 ? (
                    <>
                    <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
                    <table className="min-w-[980px] w-full table-fixed text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-[#0a0a0a] text-zinc-500">
                        <tr className="border-b border-white/8">
                          <th className="w-10 px-3 py-2 font-medium">
                            <input checked={allSelectableChecked} type="checkbox" onChange={toggleAllInviteCodes} />
                          </th>
                          <th className="px-3 py-2 font-medium">邀请码</th>
                          <th className="px-3 py-2 font-medium">积分</th>
                          <th className="px-3 py-2 font-medium">状态</th>
                          <th className="px-3 py-2 font-medium">使用者</th>
                          <th className="px-3 py-2 font-medium">后续消耗积分</th>
                          <th className="px-3 py-2 font-medium">创建时间</th>
                          <th className="px-3 py-2 text-right font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/6">
                        {pagedInviteCodes.map((item) => {
                          const consumedAfterRedeem = item.redeemedBy ? item.consumedAfterRedeem ?? usersById[item.redeemedBy]?.creditsUsed ?? 0 : 0;
                          return (
                            <tr key={item.code} className="text-zinc-300">
                              <td className="px-3 py-3 align-top">
                                <input
                                  checked={selectedInviteCodes.includes(item.code)}
                                  type="checkbox"
                                  onChange={() => toggleInviteCode(item.code)}
                                />
                              </td>
                              <td className="break-all px-3 py-3 font-mono font-semibold text-white">{item.code}</td>
                              <td className="px-3 py-3 font-semibold text-sky-200">{item.credits}</td>
                              <td className="px-3 py-3">{getStatusBadge(Boolean(item.redeemedBy))}</td>
                              <td className="truncate px-3 py-3 text-zinc-400">{item.redeemedBy || '-'}</td>
                              <td className={`px-3 py-3 font-semibold ${consumedAfterRedeem > 150 ? 'text-rose-300' : 'text-zinc-200'}`}>
                                {consumedAfterRedeem}
                              </td>
                              <td className="px-3 py-3">{formatTime(item.createdAt)}</td>
                              <td className="whitespace-nowrap px-3 py-3 text-right">
                                <button
                                  className="hidden"
                                  type="button"
                                  onClick={() => void handleCopyInviteCode(item.code)}
                                >
                                  {copiedCode === item.code ? '已复制' : '复制'}
                                </button>
                                <button
                                  className="mr-2 inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-lg border border-sky-400/35 bg-sky-500/15 px-3 py-1.5 text-[11px] font-semibold text-sky-100 transition hover:bg-sky-500/25"
                                  type="button"
                                  onClick={() => void handleCopyInviteCode(item.code)}
                                >
                                  <Copy size={12} />
                                  {copiedCode === item.code ? '已复制' : '复制'}
                                </button>
                                <button
                                  className="mr-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                  disabled={rechargingCode === item.code}
                                  type="button"
                                  onClick={() => void handleRechargeInviteCode(item.code)}
                                >
                                  {rechargingCode === item.code ? '充值中...' : '充值'}
                                </button>
                                <button
                                  className="mr-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                  disabled={reclaimingCode === item.code}
                                  type="button"
                                  onClick={() => void handleReclaimInviteCode(item.code)}
                                >
                                  {reclaimingCode === item.code ? '回收中...' : '扣积分'}
                                </button>
                                <button
                                  className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                  disabled={deletingCode === item.code}
                                  type="button"
                                  onClick={() => void handleDeleteInviteCode(item.code)}
                                >
                                  {deletingCode === item.code ? '删除中...' : '删除'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                    <div className="mt-2 shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3 text-xs text-zinc-400">
                      <span>共 {inviteCodesPage.total || filteredInviteCodes.length} 条邀请码，每页 10 条</span>
                      <div className="flex items-center gap-2">
                        <button
 className="btn-secondary min-h-0 px-3 py-1 text-xs disabled:opacity-40"
                          disabled={currentInvitePage <= 1}
                          type="button"
                          onClick={() => setInvitePage((current) => Math.max(1, current - 1))}
                        >
                          上一页
                        </button>
                        <span>{currentInvitePage} / {inviteTotalPages}</span>
                        <button
                          className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40"
                          disabled={currentInvitePage >= inviteTotalPages}
                          type="button"
                          onClick={() => setInvitePage((current) => Math.min(inviteTotalPages, current + 1))}
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                    </>
                  ) : (
                    <div className="py-10 text-center text-sm text-zinc-500">当前筛选条件下暂无邀请码</div>
                  )}
                </div>
              </div>
            ) : null}

            {section === 'apiKeys' ? (
              <AdminApiKeysPanel onNotice={onNotice} />
            ) : null}

            {section === 'users' ? (
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-white/8 bg-black/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-white">用户信息与 Key 使用页</h2>
                    <p className="mt-1 text-xs text-zinc-500">支持按用户 ID / 邀请码前缀搜索，点击最近生成可切换活跃排序。</p>
                  </div>
                  <div className="flex w-full items-center gap-2 md:w-auto">
                    <input
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none md:w-72"
                      placeholder="搜索用户 ID、用户名、invite-/admin/credit-"
                      value={userSearchDraft}
                      onChange={(event) => setUserSearchDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          commitUserSearch();
                        }
                      }}
                    />
                    <button
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-zinc-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={loading}
                      type="button"
                      onClick={() => void refreshCurrentSection()}
                    >
                      <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
                  {searchableUsers.length > 0 ? (
                    <>
                    <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
                    <table className="w-[1020px] table-fixed text-left text-xs">
                      <colgroup>
                        <col style={{ width: '115px' }} />
                        <col style={{ width: '65px' }} />
                        <col style={{ width: '145px' }} />
                        <col style={{ width: '65px' }} />
                        <col style={{ width: '155px' }} />
                        <col style={{ width: '125px' }} />
                        <col style={{ width: '105px' }} />
                        <col style={{ width: '245px' }} />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-[#0a0a0a] text-zinc-500">
                        <tr className="border-b border-white/8">
                          <th className="px-3 py-2 font-medium">用户</th>
                          <th className="px-3 py-2 font-medium">用户 ID</th>
                          <th className="px-3 py-2 font-medium">{"\u9080\u8bf7\u7801"}</th>
                          <th className="px-3 py-2 font-medium">生成次数</th>
                          <th className="px-3 py-2 font-medium">剩余 / 总额</th>
                          <th className="px-3 py-2 font-medium">Key 积分消耗</th>
                          <th className="px-3 py-2 font-medium">
                            <button
                              className="inline-flex items-center gap-1 text-zinc-400 transition hover:text-white"
                              type="button"
                              onClick={() => {
                                setUserSortMode((current) => (current === 'recent-desc' ? 'recent-asc' : 'recent-desc'));
                                setUserPage(1);
                              }}
                            >
                              最近生成 {userSortMode === 'recent-desc' ? '↓' : '↑'}
                            </button>
                          </th>
                          <th className="sticky right-0 z-20 border-l border-white/8 bg-[#0a0a0a] px-2 py-2 text-left font-medium shadow-[-12px_0_24px_rgba(0,0,0,0.35)]">{'\u64cd\u4f5c'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/6">
                        {pagedUsers.map((item) => {
                          const isApiKeyUsage = Boolean(item.apiKeyId || item.userId.startsWith('api-key:'));
                          const usageRate = item.totalCredits > 0 ? (item.usedCredits / item.totalCredits) * 100 : 0;
                          const trend = item.usageTrend || usageTrendByUserId[item.userId] || Array.from({ length: 7 }, () => 0);
                          const inviteCode = item.inviteCode || invitePrefixesByUserId[item.userId]?.[0] || '';
                          return (
                            <tr key={item.userId} className="text-zinc-300">
                              <td className="px-2.5 py-2.5 font-semibold text-white">{item.username}</td>
                              <td className="truncate px-2.5 py-2.5 text-zinc-500">{item.userId}</td>
                              <td className="truncate px-2.5 py-2.5 font-mono text-zinc-400">{inviteCode || '-'}</td>
                              <td className="px-2.5 py-2.5">{item.generations}</td>
                              <td className="px-2.5 py-2.5">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-semibold text-white">{item.remainingCredits}</span>
                                  <span className="text-zinc-500">/ {item.totalCredits}</span>
                                </div>
                                {item.quotaSource === 'account' ? (
                                  <div className="mt-1 text-[11px] text-emerald-300/80">
                                    账户共享{item.ownerUsername ? ` · ${item.ownerUsername}` : ''}
                                  </div>
                                ) : null}
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#22d3ee_100%)]" style={{ width: `${100 - usageRate}%` }} />
                                </div>
                                <div className="mt-1 text-[11px] text-zinc-500">使用率 {formatPercent(usageRate)}</div>
                              </td>
                              <td className="px-2.5 py-2.5">
                                <div className="group relative inline-flex cursor-default items-center gap-2 font-semibold text-sky-200">
                                  <span>{item.creditsUsed} 点</span>
                                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400">近 7 天</span>
                                  <div className="pointer-events-none absolute left-0 top-full z-10 hidden w-44 rounded-2xl border border-white/10 bg-[#0b0b0b] p-3 text-[11px] text-zinc-300 shadow-[0_18px_48px_rgba(0,0,0,0.35)] group-hover:block">
                                    <div className="mb-2 flex items-center justify-between">
                                      <span>最近 7 天消耗</span>
                                      <span>{trend.reduce((sum, value) => sum + value, 0)} 点</span>
                                    </div>
                                    {renderSparkline(trend)}
                                  </div>
                                </div>
                              </td>
                              <td className="px-2.5 py-2.5">{item.lastGeneratedAt ? formatTime(item.lastGeneratedAt) : '暂无'}</td>
                              <td className="sticky right-0 z-[5] border-l border-white/8 bg-[#0d0d15] px-2 py-2.5 text-left shadow-[-12px_0_24px_rgba(0,0,0,0.35)]">
                                <div className="flex items-center justify-start gap-1">
                                  {!isApiKeyUsage && !item.username.toLowerCase().startsWith('invite-') ? (
                                    <button
                                      className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-2 py-1.5 text-[11px] font-semibold text-sky-100 transition hover:bg-sky-500/20"
                                      type="button"
                                      onClick={() => void handleViewRedemptions(item)}
                                    >
                                      兑换记录
                                    </button>
                                  ) : null}
                                  <button
                                    className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={isApiKeyUsage || (item.username.toLowerCase() !== 'admin' && adminCredits.remainingCredits <= 0) || rechargingUserId === item.userId || deductingUserId === item.userId || deletingUserId === item.userId}
                                    type="button"
                                    onClick={() => void handleRechargeUser(item)}
                                  >
                                    {rechargingUserId === item.userId ? '充值中...' : '充值'}
                                  </button>
                                  <button
                                    className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={isApiKeyUsage || item.remainingCredits <= 0 || rechargingUserId === item.userId || deductingUserId === item.userId || deletingUserId === item.userId}
                                    type="button"
                                    onClick={() => void handleDeductUser(item)}
                                  >
                                    {deductingUserId === item.userId ? '扣除中...' : '扣积分'}
                                  </button>
                                  <button
                                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1.5 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={isApiKeyUsage || rechargingUserId === item.userId || deductingUserId === item.userId || deletingUserId === item.userId}
                                    type="button"
                                    onClick={() => void handleDeleteUser(item)}
                                  >
                                    <Trash2 size={12} />
                                    {deletingUserId === item.userId ? '删除中...' : '删除'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                    <div className="mt-2 shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3 text-xs text-zinc-400">
                      <span>共 {usersPage.total || searchableUsers.length} 个用户，每页 10 条</span>
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40"
                          disabled={currentUserPage <= 1}
                          type="button"
                          onClick={() => setUserPage((current) => Math.max(1, current - 1))}
                        >
                          上一页
                        </button>
                        <span>{currentUserPage} / {userTotalPages}</span>
                        <button
                          className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40"
                          disabled={currentUserPage >= userTotalPages}
                          type="button"
                          onClick={() => setUserPage((current) => Math.min(userTotalPages, current + 1))}
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                    </>
                  ) : (
                    <div className="py-10 text-center text-sm text-zinc-500">暂无符合条件的用户</div>
                  )}
                </div>
              </div>
            ) : null}

            {section === 'records' ? (
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-white/8 bg-black/35 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-white">请求记录</h2>
                    <p className="mt-1 text-xs text-zinc-500">记录每一次实际上游调用；失败时可直接查看接口返回的报错。</p>
                  </div>
                  <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-5">
                    <input
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none"
                      placeholder="搜索用户"
                      value={recordUserFilterDraft}
                      onChange={(event) => setRecordUserFilterDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          commitRecordSearch();
                        }
                      }}
                    />
                    <select
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none"
                      value={recordModelFilter}
                      onChange={(event) => setRecordModelFilter(event.target.value)}
                    >
                      <option value="all">全部源头模型</option>
                      {modelOptions.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                    <select
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none"
                      value={recordResolutionFilter}
                      onChange={(event) => setRecordResolutionFilter(event.target.value)}
                    >
                      <option value="all">全部分辨率</option>
                      {resolutionOptions.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                    <select
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none"
                      value={recordRange}
                      onChange={(event) => setRecordRange(event.target.value as RecordRange)}
                    >
                      <option value="all">全部时间</option>
                      <option value="24h">近 24 小时</option>
                      <option value="7d">近 7 天</option>
                      <option value="30d">近 30 天</option>
                    </select>
                    <button
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-zinc-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={loading}
                      type="button"
                      onClick={() => void refreshCurrentSection()}
                    >
                      <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
                  {filteredRecords.length > 0 ? (
                    <>
                    <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
                    <table className="min-w-[1080px] w-full table-fixed text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-[#0a0a0a] text-zinc-500">
                        <tr className="border-b border-white/8">
                          <th className="w-24 px-3 py-2 font-medium">图片/视频</th>
                          <th className="px-3 py-2 font-medium">用户</th>
                          <th className="px-3 py-2 font-medium">请求结果</th>
                          <th className="px-3 py-2 font-medium">参考图类型</th>
                          <th className="px-3 py-2 font-medium">源头模型</th>
                          <th className="px-3 py-2 font-medium">比例 / 分辨率</th>
                          <th className="px-3 py-2 font-medium">积分消耗</th>
                          <th className="px-3 py-2 font-medium">接口耗时</th>
                          <th className="px-3 py-2 font-medium">提示词</th>
                          <th className="px-3 py-2 font-medium">时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/6">
                        {pagedRecords.map((item) => (
                          <tr key={item.id} className="align-top text-zinc-300">
                            <td className="px-3 py-3">
                              {item.imageUrl ? (
                                <button className="h-[72px] w-[72px] overflow-hidden rounded-2xl bg-black" type="button" onClick={() => onPreview(item)}>
                                  {isVideoAssetUrl(item.imageUrl) ? (
                                    <video className="h-full w-full object-cover transition hover:scale-105" src={item.imageUrl} muted preload="metadata" />
                                  ) : (
                                    <img alt={item.prompt} className="h-full w-full object-cover transition hover:scale-105" src={item.thumbnailUrl || item.imageUrl} onError={(event) => fallbackToOriginal(event, item.imageUrl)} />
                                  )}
                                </button>
                              ) : <span className="text-zinc-600">-</span>}
                            </td>
                            <td className="px-3 py-3 font-semibold text-white">{item.username}</td>
                            <td className={`max-w-[300px] break-words px-3 py-3 font-medium ${item.resultStatus === 'failed' ? 'text-rose-300' : 'text-emerald-300'}`} title={item.resultStatus === 'failed' ? (item.errorDetail || item.resultMessage || '请求失败') : ''}>
                              {item.resultStatus === 'failed' ? (item.errorDetail || item.resultMessage || '请求失败') : '成功'}
                            </td>
                            <td className="px-3 py-3 font-medium text-zinc-300" title={(item.referenceImageTypes || []).join(', ')}>
                              {item.referenceImageTypes && item.referenceImageTypes.length > 0 ? item.referenceImageTypes.map((type) => type.toUpperCase()).join(', ') : '-'}
                            </td>
                            <td className="px-3 py-3">{item.modelName}</td>
                            <td className="px-3 py-3">
                              {item.dimensions}
                              {item.imageSize ? ` / ${item.imageSize}` : ''}
                            </td>
                            <td className={`px-3 py-3 font-black ${getCreditsTone(item.creditsUsed)}`}>{item.creditsUsed}</td>
                            <td className="px-3 py-3 font-semibold text-emerald-200">{formatApiRequestTime(item.apiRequestMs)}</td>
                            <td className="max-w-[360px] px-3 py-3 leading-5" title={item.prompt}>{truncatePrompt(item.prompt)}</td>
                            <td className="px-3 py-3">{formatTime(item.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                    <div className="mt-2 shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3 text-xs text-zinc-400">
                      <span>共 {recordsPage.total || filteredRecords.length} 条记录，每页 10 条</span>
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40"
                          disabled={currentRecordPage <= 1}
                          type="button"
                          onClick={() => setRecordPage((current) => Math.max(1, current - 1))}
                        >
                          上一页
                        </button>
                        <span>{currentRecordPage} / {recordTotalPages}</span>
                        <button
                          className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40"
                          disabled={currentRecordPage >= recordTotalPages}
                          type="button"
                          onClick={() => setRecordPage((current) => Math.min(recordTotalPages, current + 1))}
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                    </>
                  ) : (
                    <div className="py-10 text-center text-sm text-zinc-500">当前筛选条件下暂无请求记录</div>
                  )}
                </div>
              </div>
            ) : null}

          </div>
        </div>
      </div>
      {generatedInviteCodes.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <button
            aria-label="Close generated invite codes dialog"
            className="absolute inset-0"
            type="button"
            onClick={() => setGeneratedInviteCodes([])}
          />
          <div className="relative w-full max-w-xl rounded-[28px] border border-white/10 bg-[#090909] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-white">{"\u6279\u91cf\u751f\u6210\u5b8c\u6210"}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {"\u5171"} {generatedInviteCodes.length} {"\u4e2a\u9080\u8bf7\u7801\uff0c\u4e00\u884c\u4e00\u4e2a\u3002"}
                </p>
              </div>
              <button
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-white/25 hover:text-white"
                type="button"
                onClick={() => setGeneratedInviteCodes([])}
              >
                {"\u5173\u95ed"}
              </button>
            </div>
            <textarea
              className="mt-4 h-56 w-full resize-none rounded-2xl border border-white/10 bg-black/45 p-4 font-mono text-sm leading-6 text-zinc-100 outline-none"
              readOnly
              value={generatedInviteCodes.join('\n')}
            />
            <button
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-black transition hover:bg-zinc-200"
              type="button"
              onClick={() => void handleCopyGeneratedInviteCodes()}
            >
              <Copy size={15} />
              {batchCopied ? '\u5df2\u590d\u5236' : '\u590d\u5236\u5168\u90e8'}
            </button>
          </div>
        </div>
      ) : null}
      {selectedProviderRisks.length > 0 ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <button aria-label="Close" className="absolute inset-0" type="button" onClick={() => setSelectedProviderRisks([])} />
          <div className="relative max-h-[82vh] w-full max-w-3xl overflow-hidden rounded-[26px] border border-white/10 bg-[#0d0f17] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-white">{'\u8ba1\u8d39\u98ce\u9669\u8be6\u60c5'}</h2>
                <p className="mt-1 text-xs text-zinc-500">{'\u8bf7\u4f7f\u7528\u8ffd\u8e2a ID \u5bf9\u7167\u4e24\u4e2a\u4e0a\u6e38\u7684\u8bf7\u6c42\u6216\u6d88\u8d39\u6d41\u6c34\u3002'}</p>
              </div>
              <button className="rounded-full border border-white/10 p-2 text-zinc-400 hover:text-white" type="button" onClick={() => setSelectedProviderRisks([])}><X size={16} /></button>
            </div>
            <div className="custom-scrollbar max-h-[65vh] space-y-3 overflow-y-auto p-5">
              {selectedProviderRisks.map((risk) => (
                <article key={risk.traceId} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-white">{risk.modelId} · {risk.configuration}</div>
                      <div className="mt-1 text-[11px] text-zinc-500">{new Date(risk.createdAt).toLocaleString('zh-CN')}</div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${risk.riskLevel === 'suspected_duplicate' ? 'border-rose-400/30 bg-rose-500/10 text-rose-200' : 'border-amber-400/30 bg-amber-500/10 text-amber-100'}`}>
                      {risk.riskLevel === 'suspected_duplicate' ? '\u7591\u4f3c\u91cd\u590d\u8ba1\u8d39' : '\u5f85\u6838\u5bf9'}
                    </span>
                  </div>
                  <code className="mt-3 block break-all rounded-lg bg-white/[0.04] px-3 py-2 text-[11px] text-sky-200">{risk.traceId}</code>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-violet-400/15 bg-violet-500/[0.06] p-3 text-xs text-zinc-300">
                      <div className="font-bold text-violet-200">Junliai</div>
                      <div className="mt-1">{risk.junliaiStatus} · {(risk.junliaiDurationMs / 1000).toFixed(1)} s</div>
                    </div>
                    <div className="rounded-xl border border-sky-400/15 bg-sky-500/[0.06] p-3 text-xs text-zinc-300">
                      <div className="font-bold text-sky-200">Visionary</div>
                      <div className="mt-1">{risk.visionaryStatus} · {(risk.visionaryDurationMs / 1000).toFixed(1)} s</div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-zinc-400">{risk.riskReason}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {rechargeUser ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={() => setRechargeUser(null)}>
          <div className="w-full max-w-md rounded-[24px] border border-white/12 bg-[#111119] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.65)]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-white">给 {rechargeUser.username} 充值积分</h2>
                <p className="mt-1 text-xs text-zinc-500">三种积分可同时充值；用户头像处仍显示合计积分。</p>
              </div>
              <button className="rounded-lg p-2 text-zinc-500 hover:bg-white/8 hover:text-white" type="button" onClick={() => setRechargeUser(null)}><X size={16} /></button>
            </div>
            <div className="mt-5 grid gap-3">
              {([
                ['gpt', 'GPT 积分', '只能用于 GPT 模型'],
                ['banana', 'Banana 积分', '只能用于 Banana 模型'],
                ['general', '通用积分', '可以用于所有模型、视频和聊天'],
              ] as const).map(([key, label, hint]) => (
                <label key={key} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <span className="flex items-center justify-between text-xs"><strong className="text-zinc-200">{label}</strong><span className="text-zinc-600">{hint}</span></span>
                  <input
                    className="input mt-2 w-full"
                    min={0}
                    step={1}
                    type="number"
                    value={rechargeAmounts[key]}
                    onChange={(event) => setRechargeAmounts((current) => ({ ...current, [key]: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))}
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-sky-500/8 px-3 py-2 text-xs">
              <span className="text-zinc-400">本次合计</span>
              <strong className="text-sky-200">{rechargeAmounts.gpt + rechargeAmounts.banana + rechargeAmounts.general} 积分</strong>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" type="button" onClick={() => setRechargeUser(null)}>取消</button>
              <button className="btn-primary" type="button" disabled={rechargingUserId === rechargeUser.userId} onClick={() => void submitUserRecharge()}>
                {rechargingUserId === rechargeUser.userId ? '充值中...' : '确认充值'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {redemptionUser ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <button
            aria-label="关闭积分兑换记录"
            className="absolute inset-0"
            type="button"
            onClick={() => setRedemptionUser(null)}
          />
          <div className="relative max-h-[82vh] w-full max-w-2xl overflow-hidden rounded-[26px] border border-white/10 bg-[#0d0f17] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-white">积分兑换记录</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {redemptionUser.username} · 用户 ID {redemptionUser.userId}
                </p>
              </div>
              <button
                className="rounded-full border border-white/10 p-2 text-zinc-400 hover:text-white"
                type="button"
                onClick={() => setRedemptionUser(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="border-b border-white/8 px-5 py-3 text-xs text-zinc-400">
              共 {redemptionRecords.length} 条，累计兑换{' '}
              <span className="font-bold text-sky-200">
                {redemptionRecords.reduce((sum, record) => sum + record.credits, 0)}
              </span>{' '}
              积分
            </div>
            <div className="custom-scrollbar max-h-[58vh] overflow-y-auto p-5">
              {redemptionLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-400">
                  <LoaderCircle className="animate-spin" size={18} />
                  正在加载兑换记录...
                </div>
              ) : redemptionError ? (
                <div className="app-alert app-alert-error">{redemptionError}</div>
              ) : redemptionRecords.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-white/8">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-black/35 text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">邀请码</th>
                        <th className="px-4 py-3 text-right font-medium">兑换积分</th>
                        <th className="px-4 py-3 text-right font-medium">兑换时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/6">
                      {redemptionRecords.map((record) => (
                        <tr key={`${record.code}-${record.redeemedAt}`} className="text-zinc-300">
                          <td className="break-all px-4 py-3 font-mono text-white">{record.code}</td>
                          <td className="px-4 py-3 text-right font-bold text-sky-200">+{record.credits}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-zinc-400">
                            {formatTime(record.redeemedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-zinc-500">该用户暂无积分兑换记录</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [creationMode, setCreationMode] = useState<'image' | 'video'>('image');
  const [models, setModels] = useState<ModelInfo[]>([...defaultModels].sort((left, right) => getModelSortOrder(left.id) - getModelSortOrder(right.id)));
  const [gptImagePricing, setGptImagePricing] = useState<GptImagePricing>(DEFAULT_GPT_IMAGE_PRICING);
  const [modelCreditPricing, setModelCreditPricing] = useState<ModelCreditPricing>(DEFAULT_MODEL_CREDIT_PRICING);
  const [providerRouting, setProviderRouting] = useState<ProviderRoutingConfig>(defaultProviderRouting);
  const [selectedModel, setSelectedModel] = useState('gpt-image-2');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [dimensions, setDimensions] = useState<DimensionOption>('1:1');
  const [imageSize, setImageSize] = useState<ImageSizeOption>('STANDARD');
  const [gptQuality, setGptQuality] = useState<GptQualityOption>('auto');
  const [optimizeChineseText, setOptimizeChineseText] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [autoPlace] = useState(true);
  const [draggingReferences, setDraggingReferences] = useState(false);
  const [references, setReferences] = useState<UploadPreview[]>([]);
  const [favorites, setFavorites] = useState<SavedImage[]>([]);
  const [backup, setBackup] = useState<SavedImage[]>([]);
  const [discarded, setDiscarded] = useState<SavedImage[]>([]);
  // 灶台只展示当前窗口自己的图片：用 sessionStorage 按标签页隔离持久化，
  // 避免多窗口共享服务端历史导致相互挤占（sessionStorage 每个标签页独立，不会跨窗口串扰）。
  const [currentImage, setCurrentImage] = useState<DisplayImage | null>(() =>
    readStageStorage<DisplayImage | null>('pixory:stage:current', null),
  );
  const [historyQueue, setHistoryQueue] = useState<DisplayImage[]>(() =>
    readStageStorage<DisplayImage[]>('pixory:stage:queue', []),
  );
  const [editVersions, setEditVersions] = useState<DisplayImage[]>([]);
  const [editInstruction, setEditInstruction] = useState('');
  const [editLocks, setEditLocks] = useState<Set<EditLock>>(() => new Set(['person', 'composition']));
  const [inFlightGeneratedImages, setInFlightGeneratedImages] = useState<DisplayImage[]>([]);
  const [historyRecords, setHistoryRecords] = useState<GenerationRecord[]>([]);
  const [adminOverview, setAdminOverview] = useState<AdminOverviewState>({
    users: [],
    usersPage: emptyPage,
    records: [],
    recordsPage: emptyPage,
    inviteCodes: [],
    inviteCodesPage: emptyPage,
    adminCredits: { totalCredits: 0, usedCredits: 0, remainingCredits: 0 },
    dashboardStats: emptyDashboardStats,
    providerMetrics: [],
    providerRisks: [],
    generationRanking: { today: [], total: [] },
    recordsStats: emptyRecordsStats,
    recordModelOptions: [],
    recordResolutionOptions: [],
  });
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    if (typeof window === 'undefined') return 'home';
    return getTabFromPath(window.location.pathname, Boolean(getStoredUser()?.isAdmin));
  });
  const [previewImage, setPreviewImage] = useState<DisplayImage | SavedImage | GenerationRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittingGeneration, setSubmittingGeneration] = useState(false);
  const [activeImageGenerations, setActiveImageGenerations] = useState<ActiveImageGeneration[]>([]);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [activityPreviewCount, setActivityPreviewCount] = useState(createActivityPreviewCount);
  const [pendingGenerationSlot, setPendingGenerationSlot] = useState(false);
  const [loadingUserData, setLoadingUserData] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [healthText, setHealthText] = useState('正在检查本地服务...');
  const [healthError, setHealthError] = useState('');
  const [notice, setNotice] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [wechatCopied, setWechatCopied] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'invite'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authForm, setAuthForm] = useState({ username: '', password: '', email: '', inviteCode: '' });
  const [redeemInviteOpen, setRedeemInviteOpen] = useState(false);
  const [redeemInviteValue, setRedeemInviteValue] = useState('');
  const [redeemInviteError, setRedeemInviteError] = useState('');
  const [redeemingInvite, setRedeemingInvite] = useState(false);
  const [promoCoupon, setPromoCoupon] = useState<PromoCouponInfo | null>(null);
  const [promoCouponOpen, setPromoCouponOpen] = useState(false);
  const [promoCouponClaiming, setPromoCouponClaiming] = useState(false);
  const [promoCouponNowMs, setPromoCouponNowMs] = useState(() => Date.now());
  const [notificationPayload, setNotificationPayload] = useState<NotificationPayload>({ notifications: [], unreadCount: 0, popup: null });
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [creditDetailsOpen, setCreditDetailsOpen] = useState(false);
  const shownNotificationIdsRef = useRef(new Set<string>());
  const hasVisitedCreateRef = useRef(false);
  const submittingGenerationRef = useRef(false);
  const currentImageRef = useRef<DisplayImage | null>(null);
  const downloadingRef = useRef(new Set<string>());
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

  const sideFavoriteItems = user ? favorites : [];
  const sideBackupItems = user ? backup : [];
  const sideDiscardedItems = user ? discarded : [];
  const isNanoBananaPro = selectedModel === 'Nano_Banana_Pro';
  const effectiveOptimizeChineseText = isNanoBananaPro && optimizeChineseText;
  const showGptQuality = selectedModel === 'gpt-image-2';
  const disableGptQuality = showGptQuality && imageSize === 'STANDARD';
  const selectedModelInfo = models.find((item) => item.id === selectedModel) || defaultModels.find((item) => item.id === selectedModel) || null;
  const selectedModelCredits = getModelCredits(selectedModelInfo, {
    imageSize,
    quality: gptQuality,
    optimizeChineseText: effectiveOptimizeChineseText,
    pricing: gptImagePricing,
    modelCreditPricing,
  });
  const selectedResolutionOptions = isNanoBananaPro ? imageSizeOptions : gptImageSizeOptions;
  const visibleResolutionOptions = selectedModel === 'Seedream_4'
    ? gptImageSizeOptions.filter((item) => item.value === '2K' || item.value === '4K')
    : selectedModel === 'Grok_Image'
      ? imageSizeOptions.filter((item) => item.value === '1K' || item.value === '2K')
      : selectedResolutionOptions;
  const visibleDimensionOptions = selectedModel === 'Grok_Image'
    ? dimensionOptions.filter((item) => item.value !== '21:9')
    : dimensionOptions;
  const selectedModelSuccessRate = getModelSuccessRate(selectedModel);
  const selectedCreditBucket = selectedModel === 'gpt-image-2' ? 'gpt' : selectedModel === 'Nano_Banana_Pro' ? 'banana' : 'general';
  const selectedAvailableCredits = getAvailableUserCredits(user, selectedCreditBucket);
  const hasEnoughCredits = user ? selectedAvailableCredits >= selectedModelCredits * batchCount : true;
  const promoCouponExpiresAtMs = new Date(promoCoupon?.expiresAt || '').getTime();
  const activePromoCoupon = promoCoupon?.active && Number.isFinite(promoCouponExpiresAtMs) && promoCouponExpiresAtMs > promoCouponNowMs
    ? promoCoupon
    : null;
  const promoCouponExpiresText = activePromoCoupon ? formatCouponTime(activePromoCoupon.expiresAt) : '';
  const promoCouponDiscountLabel = activePromoCoupon ? getPromoDiscountLabel(activePromoCoupon.discountPercent) : '';
  const promoCouponDiscountRate = activePromoCoupon ? getPromoDiscountRate(activePromoCoupon.discountPercent) : '';
  const promoCouponCountdown = activePromoCoupon
    ? formatPromoCouponCountdown(activePromoCoupon.expiresAt, promoCouponNowMs)
    : '00:00:00';

  useEffect(() => {
    if (!promoCoupon?.active || !Number.isFinite(promoCouponExpiresAtMs)) return;
    const couponId = promoCoupon.couponId;
    let expired = false;
    const refreshCountdown = () => {
      const currentTime = Date.now();
      setPromoCouponNowMs(currentTime);
      if (expired || currentTime < promoCouponExpiresAtMs) return;
      expired = true;
      setPromoCoupon((current) => current?.couponId === couponId
        ? { ...current, active: false, shouldPopup: false }
        : current);
      setPromoCouponOpen(false);
      void loadPromoCoupon();
    };

    refreshCountdown();
    const timer = window.setInterval(refreshCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [promoCoupon?.active, promoCoupon?.couponId, promoCoupon?.expiresAt, promoCouponExpiresAtMs]);

  useEffect(() => {
    currentImageRef.current = currentImage;
  }, [currentImage]);

  useEffect(() => {
    writeStageStorage('pixory:stage:current', currentImage);
    writeStageStorage('pixory:stage:queue', historyQueue);
  }, [currentImage, historyQueue]);

  useEffect(() => {
    if (!SHOW_CREATION_ACTIVITY || activeTab !== 'create' || creationMode !== 'image') return;
    const timer = window.setInterval(() => {
      setActivityPreviewCount((current) => {
        const { min, max } = getActivityPreviewRange();
        const boundedCurrent = current < min || current > max ? Math.round((min + max) / 2) : current;
        const change = Math.floor(Math.random() * 25) - 12;
        return Math.max(min, Math.min(max, boundedCurrent + change));
      });
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [activeTab, creationMode]);

  useEffect(() => {
    fetchHealth()
      .then(() => {
        setHealthText('服务正常');
      })
      .catch((error) => {
        setHealthError(error instanceof Error ? error.message : '服务未启动');
        setHealthText('本地服务不可用，请先启动后端');
      });

    const storedUser = getStoredUser();
    if (storedUser?.username === 'demo') {
      clearSession();
      setAuthInitialized(true);
    } else if (storedUser) {
      setUser(storedUser);
      void fetchMe()
        .then(setUser)
        .catch(() => undefined)
        .finally(() => setAuthInitialized(true));
    } else {
      setAuthInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (!authInitialized || activeTab !== 'create' || hasVisitedCreateRef.current) return;
    hasVisitedCreateRef.current = true;
    if (user) return;
    let cancelled = false;
    void claimInvitePopup()
      .then(({ shouldShow }) => {
        if (cancelled || !shouldShow) return;
        setAuthError('');
        setAuthMode('register');
        setAuthOpen(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeTab, authInitialized, user]);

  useEffect(() => {
    const handleSessionExpired = () => {
      hasVisitedCreateRef.current = true;
      setUser(null);
      setFavorites([]);
      setBackup([]);
      setDiscarded([]);
      setHistoryRecords([]);
      setPromoCoupon(null);
      setPromoCouponOpen(false);
      setAuthMode('login');
      setAuthError('登录状态已失效或已过期，请重新登录。');
      setAuthOpen(true);
    };
    window.addEventListener('pixory:session-expired', handleSessionExpired);
    return () => window.removeEventListener('pixory:session-expired', handleSessionExpired);
  }, []);

  useEffect(() => {
    if (!user) return;

    void loadPrivateData();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotificationPayload({ notifications: [], unreadCount: 0, popup: null });
      setNotificationOpen(false);
      shownNotificationIdsRef.current.clear();
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void fetchNotifications()
        .then((payload) => {
          if (!cancelled) setNotificationPayload(payload);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user?.id]);

  useEffect(() => {
    const item = notificationPayload.popup;
    if (!item || authOpen || promoCouponOpen || shownNotificationIdsRef.current.has(item.id)) return;
    shownNotificationIdsRef.current.add(item.id);
    setNotificationOpen(true);
    setNotificationPayload((current) => ({
      ...current,
      unreadCount: 0,
      popup: current.popup?.id === item.id ? null : current.popup,
      notifications: current.notifications.map((candidate) => ({
        ...candidate,
        read: true,
        popupShown: candidate.id === item.id ? true : candidate.popupShown,
      })),
    }));
    void markNotificationPopupShown(item.id).catch(() => {
      shownNotificationIdsRef.current.delete(item.id);
    });
  }, [authOpen, notificationPayload.popup, promoCouponOpen]);

  useEffect(() => {
    if (!user) return;

    const refreshPricing = () => {
      void fetchModels()
        .then((payload) => {
          setModels([...payload.models].sort((left, right) => getModelSortOrder(left.id) - getModelSortOrder(right.id)));
          setGptImagePricing(payload.gptImagePricing || DEFAULT_GPT_IMAGE_PRICING);
          setModelCreditPricing(payload.modelCreditPricing || DEFAULT_MODEL_CREDIT_PRICING);
          setProviderRouting(payload.providerRouting || defaultProviderRouting);
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refreshPricing, 15 * 1000);
    window.addEventListener('focus', refreshPricing);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshPricing);
    };
  }, [user]);

  useEffect(() => {
    if (!loading) return;

    const timer = window.setInterval(() => {
      setGenerationProgress((current) => {
        if (!current) return current;

        const elapsedSeconds = (Date.now() - current.startedAt) / 1000;
        const completedPercent = current.total > 0 ? (current.completed / current.total) * 100 : 0;
        const timeDrift = Math.min(32, elapsedSeconds * 2.8);
        const target = Math.min(94, Math.max(current.visual, completedPercent + timeDrift + 8));
        const nextVisual = current.visual + (target - current.visual) * 0.24;

        return {
          ...current,
          visual: Math.min(94, nextVisual),
        };
      });
    }, 700);

    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (!isImageResolutionEnabled(providerRouting, selectedModel, imageSize)) {
      const candidates: ImageSizeOption[] = selectedModel === 'Nano_Banana_Pro'
        ? ['1K', '2K', '4K']
        : selectedModel === 'Seedream_4'
          ? ['2K', '4K']
          : selectedModel === 'Grok_Image'
            ? ['1K', '2K']
            : ['STANDARD', '2K', '4K'];
      const next = candidates.find((candidate) => isImageResolutionEnabled(providerRouting, selectedModel, candidate));
      if (next) setImageSize(next);
    }
    if (!providerRouting.junliaiGeminiVeo31 && !providerRouting.junliaiFireflyVideo && !providerRouting.schatSeedance25 && creationMode === 'video') {
      setCreationMode('image');
    }
  }, [
    creationMode,
    imageSize,
    providerRouting.junliaiGeminiVeo31,
    providerRouting.junliaiFireflyVideo,
    providerRouting.schatSeedance25,
    providerRouting.image2Routes,
    providerRouting.bananaRoutes,
    providerRouting.seedreamRoutes,
    selectedModel,
  ]);

  useEffect(() => {
    if (activeTab === 'history') {
      void loadHistory();
    }
    if (activeTab === 'admin') {
      void loadAdminSection('dashboard');
    }
  }, [activeTab, user]);

  useEffect(() => {
    if (activeTab === 'admin' && user && !user.isAdmin) {
      setActiveTab('create');
    }
  }, [activeTab, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePopState = () => {
      const canAccessAdmin = Boolean(user?.isAdmin || getStoredUser()?.isAdmin);
      setActiveTab(getTabFromPath(window.location.pathname, canAccessAdmin));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const targetPath = getTabPath(activeTab);
    if (window.location.pathname === targetPath) return;
    window.history.replaceState({}, '', targetPath);
  }, [activeTab]);

  useEffect(() => {
    if (batchCount > MAX_BATCH_COUNT) {
      setBatchCount(MAX_BATCH_COUNT);
    }
  }, [batchCount]);

  function handleModelSelect(modelId: string) {
    setSelectedModel(modelId);
    if (modelId === 'gpt-image-2') {
      setImageSize('STANDARD');
      setGptQuality('auto');
      setOptimizeChineseText(false);
      return;
    }
    if (modelId === 'Seedream_4') {
      setImageSize('2K');
      setGptQuality('auto');
      setOptimizeChineseText(false);
      return;
    }
    if (modelId === 'Grok_Image') {
      setImageSize('1K');
      setGptQuality('auto');
      setOptimizeChineseText(false);
      setDimensions((current) => current === '21:9' ? '1:1' : current);
      return;
    }
    setImageSize((current) => {
      if (modelId === 'Nano_Banana_Pro') return '1K';
      return current === '2K' || current === '4K' ? current : 'STANDARD';
    });
  }

  async function appendReferenceFiles(files: File[]) {
    if (files.length === 0) return;

    const remaining = Math.max(0, getMaxReferences(selectedModel) - references.length);
    if (remaining === 0) {
      setNotice(`最多只能上传 ${getMaxReferences(selectedModel)} 张参考图`);
      return;
    }

    const maxRefMB = getMaxReferenceMB(selectedModel);
    const maxRefBytes = maxRefMB * 1024 * 1024;
    const next = await Promise.all(files.slice(0, remaining).map((file) => fileToBase64(file, maxRefBytes, maxRefMB)));
    setReferences((current) => [...current, ...next].slice(0, getMaxReferences(selectedModel)));
  }

  function commitGeneratedImages(nextImages: DisplayImage[]) {
    if (nextImages.length === 0) return;

    if (autoPlace) {
      const firstImage = nextImages[0];
      const followingImages = nextImages.slice(1);
      const previousCurrentImage = currentImageRef.current;
      setHistoryQueue((current) => {
        const candidates = [...followingImages, ...(previousCurrentImage ? [previousCurrentImage, ...current] : current)];
        return candidates.filter((item, index) => candidates.findIndex((candidate) => candidate.imageUrl === item.imageUrl) === index).slice(0, 7);
      });
      setCurrentImage(firstImage);
      currentImageRef.current = firstImage;
      return;
    }

    setHistoryQueue((current) => [...nextImages.slice().reverse(), ...current].slice(0, 7));
  }

  function startEditSession(image: DisplayImage) {
    const normalizedName = image.modelName.toLowerCase();
    const normalizedModel = normalizedName.includes('nano banana')
      ? 'Nano_Banana_Pro'
      : normalizedName.includes('seedream')
        ? 'Seedream_4'
        : 'gpt-image-2';
    setSelectedModel(normalizedModel);
    if (image.imageSize && ['STANDARD', '1K', '2K', '4K'].includes(image.imageSize)) {
      setImageSize(image.imageSize as ImageSizeOption);
    } else {
      setImageSize(normalizedModel === 'Nano_Banana_Pro' ? '1K' : normalizedModel === 'Seedream_4' ? '2K' : 'STANDARD');
    }
    if (dimensionOptions.some((item) => item.value === image.dimensions)) {
      setDimensions(image.dimensions as DimensionOption);
    }
    setBatchCount(1);
    setCurrentImage(image);
    setEditVersions([image]);
    setEditInstruction('');
    setEditLocks(new Set(['person', 'composition']));
    setGenerationError('');
    setNotice('');
  }

  function toggleEditLock(lock: EditLock) {
    setEditLocks((current) => {
      const next = new Set(current);
      if (next.has(lock)) next.delete(lock);
      else next.add(lock);
      return next;
    });
  }

  async function loadPrivateData() {
    setLoadingUserData(true);

    try {
      const [modelPayload, favoritePayload, backupPayload, discardedPayload, historyPayload] = await Promise.all([
        fetchModels(),
        fetchUserImages('favorite'),
        fetchUserImages('backup'),
        fetchUserImages('discarded'),
        fetchUserHistory(),
      ]);

      setModels([...modelPayload.models].sort((left, right) => getModelSortOrder(left.id) - getModelSortOrder(right.id)));
      setGptImagePricing(modelPayload.gptImagePricing || DEFAULT_GPT_IMAGE_PRICING);
      setModelCreditPricing(modelPayload.modelCreditPricing || DEFAULT_MODEL_CREDIT_PRICING);
      setProviderRouting(modelPayload.providerRouting || defaultProviderRouting);
      setSelectedModel((current) => {
        const exists = modelPayload.models.some((item) => item.id === current);
        if (exists) return current;
        const preferred = modelPayload.models.find((item) => item.id === 'gpt-image-2');
        return preferred?.id || modelPayload.models[0]?.id || 'gpt-image-2';
      });
      setFavorites(favoritePayload.images);
      setBackup(backupPayload.images);
      setDiscarded(discardedPayload.images);
      setHistoryRecords(historyPayload.history);
      void loadPromoCoupon({ allowPopup: true });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '登录状态已失效，请重新登录');
    } finally {
      setLoadingUserData(false);
    }
  }

  async function loadHistory() {
    if (!user) return;

    try {
      const payload = await fetchUserHistory();
      setHistoryRecords(payload.history);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '历史记录加载失败');
    }
  }

  async function loadPromoCoupon(options: { allowPopup?: boolean } = {}) {
    if (!getStoredUser() && !user) return null;

    try {
      const payload = await fetchPromoCoupon();
      setPromoCoupon(payload.coupon);
      if (options.allowPopup && payload.coupon.shouldPopup) {
        setPromoCouponOpen(true);
      }
      return payload.coupon;
    } catch {
      return null;
    }
  }

  async function loadAdminOverview() {
    if (!user?.isAdmin) return;

    setAdminLoading(true);
    try {
      const pageSize = 100;
      const firstPage = await fetchAdminOverview({
        recordsPage: 1,
        recordsPageSize: pageSize,
        inviteCodesPage: 1,
        inviteCodesPageSize: pageSize,
      });

      const extraRecordRequests = Array.from({ length: Math.max(0, firstPage.recordsPage.totalPages - 1) }, (_, index) =>
        fetchAdminOverview({
          recordsPage: index + 2,
          recordsPageSize: pageSize,
          inviteCodesPage: 1,
          inviteCodesPageSize: 1,
        }),
      );
      const extraInviteRequests = Array.from({ length: Math.max(0, firstPage.inviteCodesPage.totalPages - 1) }, (_, index) =>
        fetchAdminOverview({
          recordsPage: 1,
          recordsPageSize: 1,
          inviteCodesPage: index + 2,
          inviteCodesPageSize: pageSize,
        }),
      );

      const [recordPages, invitePages] = await Promise.all([
        Promise.all(extraRecordRequests),
        Promise.all(extraInviteRequests),
      ]);

      const mergedRecords = [firstPage.records, ...recordPages.map((item) => item.records)].flat();
      const mergedInviteCodes = [firstPage.inviteCodes, ...invitePages.map((item) => item.inviteCodes)].flat();

      setAdminOverview({
        ...firstPage,
        records: mergedRecords,
        recordsPage: {
          page: 1,
          pageSize,
          total: mergedRecords.length,
          totalPages: Math.max(1, Math.ceil(mergedRecords.length / pageSize)),
        },
        inviteCodes: mergedInviteCodes,
        inviteCodesPage: {
          page: 1,
          pageSize,
          total: mergedInviteCodes.length,
          totalPages: Math.max(1, Math.ceil(mergedInviteCodes.length / pageSize)),
        },
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '后台数据加载失败');
    } finally {
      setAdminLoading(false);
    }
  }

  async function loadAdminSection(
    section: AdminSection,
    params: {
      page?: number;
      pageSize?: number;
      status?: string;
      sort?: string;
      search?: string;
      model?: string;
      resolution?: string;
      range?: string;
    } = {},
  ) {
    if (!user?.isAdmin) return;

    setAdminLoading(true);
    try {
      if (section === 'apiKeys') {
        return;
      }

      if (section === 'modelCredits') {
        const payload = await fetchModels();
        setModelCreditPricing(payload.modelCreditPricing || DEFAULT_MODEL_CREDIT_PRICING);
        setGptImagePricing(payload.gptImagePricing || DEFAULT_GPT_IMAGE_PRICING);
        return;
      }

      if (section === 'dashboard') {
        const [payload, rankingPayload] = await Promise.all([
          fetchAdminDashboard(),
          fetchAdminGenerationRanking().catch(() => null),
        ]);
        setProviderRouting(payload.providerRouting || defaultProviderRouting);
        setAdminOverview((current) => ({
          ...current,
          dashboardStats: payload.stats,
          providerMetrics: payload.providerMetrics || [],
          providerRisks: payload.providerRisks || [],
          adminCredits: payload.adminCredits,
          generationRanking: rankingPayload || { today: [], total: [] },
        }));
        return;
      }

      if (section === 'invites') {
        const payload = await fetchAdminInviteCodes({
          page: params.page || 1,
          pageSize: params.pageSize || 10,
          status: params.status,
          sort: params.sort,
          search: params.search,
        });
        setAdminOverview((current) => ({
          ...current,
          inviteCodes: payload.inviteCodes,
          inviteCodesPage: payload.inviteCodesPage,
          adminCredits: payload.adminCredits,
        }));
        return;
      }

      if (section === 'users') {
        const payload = await fetchAdminUsers({
          page: params.page || 1,
          pageSize: params.pageSize || 10,
          search: params.search,
          sort: params.sort,
        });
        setAdminOverview((current) => ({
          ...current,
          users: payload.users,
          usersPage: payload.usersPage,
        }));
        return;
      }

      const payload = await fetchAdminRecords({
        page: params.page || 1,
        pageSize: params.pageSize || 10,
        search: params.search,
        model: params.model,
        resolution: params.resolution,
        range: params.range,
      });
      setAdminOverview((current) => ({
        ...current,
        records: payload.records,
        recordsPage: payload.recordsPage,
        recordsStats: payload.stats,
        recordModelOptions: payload.modelOptions,
        recordResolutionOptions: payload.resolutionOptions,
      }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '后台数据加载失败');
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleCreateInviteCode(
    credits: number,
    options: { quiet?: boolean; refresh?: boolean } = {},
  ) {
    try {
      const payload = await createInviteCode({ credits });
      setAdminOverview((current) => ({
        ...current,
        inviteCodes: payload.inviteCode ? [payload.inviteCode, ...current.inviteCodes] : current.inviteCodes,
        adminCredits: payload.adminCredits,
      }));
      if (!options.quiet) {
        setNotice(`已生成邀请码：${payload.inviteCode?.code || ''}`);
      }
      if (options.refresh !== false) {
        void fetchMe().then(setUser).catch(() => undefined);
        void loadAdminSection('invites', { page: 1, pageSize: 10 });
      }
      return payload.inviteCode || null;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '邀请码生成失败');
      return null;
    }
  }

  async function handleCreateInviteCodesBatch(credits: number, count: number) {
    try {
      const payload = await createInviteCodesBatch({ credits, count });
      setAdminOverview((current) => ({
        ...current,
        inviteCodes: [...payload.inviteCodes, ...current.inviteCodes],
        inviteCodesPage: {
          ...current.inviteCodesPage,
          total: current.inviteCodesPage.total + payload.inviteCodes.length,
        },
        adminCredits: payload.adminCredits,
      }));
      setNotice(`已生成 ${payload.inviteCodes.length} 个邀请码`);
      void fetchMe().then(setUser).catch(() => undefined);
      void loadAdminSection('invites', { page: 1, pageSize: 10 });
      return payload.inviteCodes;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '邀请码批量生成失败');
      return [];
    }
  }

  async function handleDeleteInviteCode(code: string) {
    try {
      const payload = await deleteInviteCodeRequest(code);
      setAdminOverview((current) => ({
        ...current,
        inviteCodes: current.inviteCodes.filter((item) => item.code !== code),
        inviteCodesPage: {
          ...current.inviteCodesPage,
          total: Math.max(0, current.inviteCodesPage.total - 1),
        },
        adminCredits: payload.adminCredits,
      }));
      setNotice(`已删除邀请码 ${code}，并将积分退回给 admin。`);
      void fetchMe().then(setUser).catch(() => undefined);
      void loadAdminSection('invites', { page: 1, pageSize: 10 });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除邀请码失败');
    }
  }

  async function handleDeleteInviteCodesBatch(codes: string[]) {
    try {
      const payload = await deleteInviteCodesBatch(codes);
      const deletedCodeSet = new Set(payload.deletedCodes);
      setAdminOverview((current) => ({
        ...current,
        inviteCodes: current.inviteCodes.filter((item) => !deletedCodeSet.has(item.code)),
        inviteCodesPage: {
          ...current.inviteCodesPage,
          total: Math.max(0, current.inviteCodesPage.total - payload.deletedCodes.length),
        },
        adminCredits: payload.adminCredits,
      }));
      setNotice(`已批量删除 ${payload.deletedCodes.length} 个邀请码，并将积分退回给 admin。`);
      void fetchMe().then(setUser).catch(() => undefined);
      void loadAdminSection('invites', { page: 1, pageSize: 10 });
      return payload.deletedCodes;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '邀请码批量删除失败');
      return [];
    }
  }

  async function handleRechargeInviteCode(code: string, credits: number) {
    try {
      const payload = await rechargeInviteCodeCreditsRequest(code, credits);
      setAdminOverview((current) => ({
        ...current,
        adminCredits: payload.adminCredits,
      }));
      setNotice(`已给邀请码 ${code} 充值 ${credits} 积分`);
      void fetchMe().then(setUser).catch(() => undefined);
      void loadAdminSection('invites', { page: 1, pageSize: 10 });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '邀请码充值失败');
    }
  }

  async function handleRechargeUserCredits(user: AdminUserSummary, credits: CreditBalances) {
    try {
      const payload = await rechargeAdminUserCredits(user.userId, credits);
      setAdminOverview((current) => ({
        ...current,
        users: current.users.map((item) => item.userId === user.userId
          ? {
              ...item,
              totalCredits: payload.credits.totalCredits,
              usedCredits: payload.credits.usedCredits,
              remainingCredits: payload.credits.remainingCredits,
              creditBalances: payload.credits.creditBalances,
            }
          : item),
        adminCredits: payload.adminCredits,
      }));
      setNotice(`\u5df2\u7ed9\u7528\u6237 ${user.username} \u5145\u503c ${payload.rechargedCredits} \u79ef\u5206`);
      void fetchMe().then(setUser).catch(() => undefined);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '\u7528\u6237\u5145\u503c\u5931\u8d25');
      throw error;
    }
  }

  async function handleDeductUserCredits(user: AdminUserSummary, credits: number) {
    try {
      const payload = await deductAdminUserCredits(user.userId, credits);
      setAdminOverview((current) => ({
        ...current,
        users: current.users.map((item) => item.userId === user.userId
          ? {
              ...item,
              totalCredits: payload.credits.totalCredits,
              usedCredits: payload.credits.usedCredits,
              remainingCredits: payload.credits.remainingCredits,
              creditBalances: payload.credits.creditBalances,
            }
          : item),
        adminCredits: payload.adminCredits,
      }));
      setNotice(`已从用户 ${user.username} 扣除 ${payload.deductedCredits} 积分（总积分不变）`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '用户积分扣除失败');
      throw error;
    }
  }

  async function handleDeleteAdminUser(user: AdminUserSummary) {
    try {
      const payload = await deleteAdminUser(user.userId);
      setAdminOverview((current) => ({
        ...current,
        users: current.users.filter((item) => item.userId !== user.userId),
        usersPage: {
          ...current.usersPage,
          total: Math.max(0, current.usersPage.total - 1),
        },
        inviteCodes: current.inviteCodes.filter((item) => !payload.deletedInviteCodes.includes(item.code)),
        inviteCodesPage: {
          ...current.inviteCodesPage,
          total: Math.max(0, current.inviteCodesPage.total - payload.deletedInviteCodes.length),
        },
        adminCredits: payload.adminCredits,
      }));
      setNotice(
        `已删除用户 ${user.username}，同步删除 ${payload.deletedInviteCodes.length} 个邀请码，退回 ${payload.returnedCredits} 积分`,
      );
      void loadAdminSection('users', { page: 1, pageSize: 10 });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除用户失败');
      throw error;
    }
  }

  async function handleReclaimInviteCode(code: string, credits: number) {
    try {
      const payload = await reclaimInviteCodeCreditsRequest(code, credits);
      setAdminOverview((current) => ({
        ...current,
        adminCredits: payload.adminCredits,
      }));
      setNotice(`已从邀请码 ${code} 回收 ${credits} 积分到 admin 总池`);
      void fetchMe().then(setUser).catch(() => undefined);
      void loadAdminSection('invites', { page: 1, pageSize: 10 });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '邀请码积分回收失败');
    }
  }

  async function handleUpdateProviderRouting(
    patch: Partial<ProviderRoutingConfig>,
    notice?: string,
  ) {
    const previous = providerRouting;
    setProviderRouting((current) => ({ ...current, ...patch }));
    try {
      const payload = await updateAdminProviderRouting(patch);
      setProviderRouting(payload.providerRouting);
    } catch (error) {
      setProviderRouting(previous);
      throw error;
    }
  }

  async function handleUpdateModelCreditPricing(pricing: ModelCreditPricing) {
    const payload = await updateAdminModelCreditPricing(pricing);
    setModelCreditPricing(payload.modelCreditPricing);
    setGptImagePricing(payload.modelCreditPricing.gptImage2);
  }

  async function handleReferenceUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []) as File[];
    if (files.length === 0) return;

    try {
      await appendReferenceFiles(files);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '参考图片读取失败');
    } finally {
      event.target.value = '';
    }
  }

  async function handleReferenceDrop(files: File[]) {
    try {
      await appendReferenceFiles(files);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '参考图读取失败');
    } finally {
      setDraggingReferences(false);
    }
  }

  function removeReference(id: string) {
    setReferences((current) => current.filter((item) => item.id !== id));
  }

  function openPurchaseDestination() {
    window.open(activePromoCoupon?.purchaseUrl || 'https://pay.ldxp.cn/shop/RHPYAKWG', '_blank', 'noopener,noreferrer');
  }

  function openPurchasePage() {
    if (activePromoCoupon) {
      setPromoCouponOpen(true);
      return;
    }

    openPurchaseDestination();
  }

  async function openPromoCouponFromHeader() {
    if (activePromoCoupon) {
      setPromoCouponOpen(true);
      return;
    }

    const refreshedCoupon = await loadPromoCoupon();
    const refreshedExpiresAt = new Date(refreshedCoupon?.expiresAt || '').getTime();
    if (refreshedCoupon?.active && Number.isFinite(refreshedExpiresAt) && refreshedExpiresAt > Date.now()) {
      setPromoCouponNowMs(Date.now());
      setPromoCouponOpen(true);
      return;
    }

    setNotice('暂无可用优惠券，获得新券时会自动提醒你');
  }

  async function closePromoCoupon() {
    setPromoCouponOpen(false);
    if (!promoCoupon?.active) return;

    try {
      const payload = await acknowledgePromoCoupon();
      setPromoCoupon(payload.coupon);
    } catch {
      // Closing the modal should never block the user's purchase flow.
    }
  }

  async function openPromoPurchasePage() {
    if (!activePromoCoupon || promoCouponClaiming) return;

    const purchaseWindow = window.open('about:blank', '_blank');
    if (purchaseWindow) purchaseWindow.opener = null;
    setPromoCouponClaiming(true);

    try {
      const coupon = activePromoCoupon.redemptionCode
        ? activePromoCoupon
        : (await claimPromoCoupon()).coupon;
      if (!coupon.active || !coupon.redemptionCode) {
        throw new Error('优惠券已失效，请刷新后重试');
      }

      setPromoCoupon(coupon);
      let copied = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(coupon.redemptionCode);
          copied = true;
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = coupon.redemptionCode;
          textarea.setAttribute('readonly', 'true');
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          copied = document.execCommand('copy');
          document.body.removeChild(textarea);
        }
      } catch {
        copied = false;
      }

      if (purchaseWindow) {
        purchaseWindow.location.replace(coupon.purchaseUrl);
      } else {
        window.open(coupon.purchaseUrl, '_blank', 'noopener,noreferrer');
      }

      if (copied) {
        setNotice(`优惠码 ${coupon.redemptionCode} 已复制，请在小铺结算时使用`);
        void closePromoCoupon();
      } else {
        setNotice('优惠券已领取，请手动复制弹窗中的优惠码');
      }
    } catch (error) {
      purchaseWindow?.close();
      setNotice(error instanceof Error ? error.message : '优惠券领取失败，请稍后再试');
    } finally {
      setPromoCouponClaiming(false);
    }
  }

  async function copyPromoCouponCode() {
    const redemptionCode = activePromoCoupon?.redemptionCode;
    if (!redemptionCode) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(redemptionCode);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = redemptionCode;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) throw new Error('copy_failed');
      }
      setNotice(`优惠码 ${redemptionCode} 已复制`);
    } catch {
      setNotice('复制失败，请手动选择优惠码复制');
    }
  }

  async function handleCopyWechat() {
    const wechatId = 'lzp983813676';

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(wechatId);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = wechatId;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error('copy_failed');
        }
      }

      setWechatCopied(false);
      window.setTimeout(() => setWechatCopied(true), 10);
      window.setTimeout(() => setWechatCopied(false), 1800);
      setNotice(`已复制客服微信：${wechatId}`);
    } catch {
      setNotice(`复制失败，请手动添加微信：${wechatId}`);
    }
  }

  async function waitForGenerationJob(
    jobId: string,
    batchIndex: number,
    total: number,
    fallbackStartedAt: number,
    onProgress?: (completed: number, visual: number) => void,
  ) {
    const deadlineMs = Date.now() + GENERATION_JOB_POLL_MAX_MS;

    while (true) {
      let job: GenerationJobInfo;
      try {
        ({ job } = await fetchGenerateImageJob(jobId));
      } catch (error) {
        // 网络/网关抖动不意味着任务失败：生成在服务端异步继续，稍后重试轮询即可。
        if (Date.now() > deadlineMs) {
          throw error;
        }
        const fallbackPercent = getFriendlyJobProgress(
          {
            id: jobId,
            status: 'processing',
            progress: 0,
            createdAt: new Date(fallbackStartedAt).toISOString(),
            updatedAt: new Date().toISOString(),
          },
          fallbackStartedAt,
        );
        const visual = getBatchVisualProgress(batchIndex, total, fallbackPercent);
        if (onProgress) onProgress(batchIndex, visual);
        else setGenerationProgress((current) => current ? { ...current, completed: batchIndex, visual: Math.max(current.visual, visual) } : current);
        await sleep(GENERATION_JOB_POLL_INTERVAL_MS);
        continue;
      }

      const jobPercent = getFriendlyJobProgress(job, fallbackStartedAt);
      const visual = getBatchVisualProgress(batchIndex, total, jobPercent);
      if (onProgress) onProgress(batchIndex, visual);
      else setGenerationProgress((current) => current ? { ...current, completed: batchIndex, visual: Math.max(current.visual, visual) } : current);

      if (job.status === 'succeeded') {
        if (!job.image) throw new Error('生成完成但没有返回图片');
        return job.image;
      }
      if (job.status === 'failed') {
        throw new Error(job.error || '生成失败');
      }
      if (Date.now() > deadlineMs) {
        throw new Error('生成超时，请稍后重试');
      }

      await sleep(GENERATION_JOB_POLL_INTERVAL_MS);
    }
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingGenerationRef.current) return;

    if (!user) {
      setNotice('\u8bf7\u5148\u767b\u5f55\u540e\u518d\u751f\u6210\u56fe\u7247');
      setAuthMode('login');
      setAuthOpen(true);
      return;
    }

    if (!prompt.trim()) {
      setNotice('\u8bf7\u8f93\u5165\u63d0\u793a\u8bcd');
      return;
    }

    if (!hasEnoughCredits) {
      setGenerationError(`\u5f53\u524d\u6a21\u578b\u79ef\u5206\u4e0d\u8db3\uff0c\u9700\u8981 ${selectedModelCredits * batchCount} \u79ef\u5206\uff0c\u53ef\u7528 ${selectedAvailableCredits} \u79ef\u5206`);
      return;
    }

    const generationId = globalThis.crypto?.randomUUID?.() || `generation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const generationPrompt = prompt;
    const generationModel = selectedModel;
    const generationDimensions = dimensions;
    const generationImageSize = imageSize;
    const generationQuality = gptQuality;
    const generationOptimizeChineseText = optimizeChineseText;
    const generationBatchCount = batchCount;
    const generationIsNanoBananaPro = isNanoBananaPro;
    const generationShowGptQuality = showGptQuality;
    const generationReferences: ReferenceUploadInput[] = references.map((item) => ({
      name: item.name,
      mimeType: item.mimeType,
      data: item.data,
    }));
    const initialProgress: GenerationProgress = {
      completed: 0,
      total: generationBatchCount,
      visual: 6,
      startedAt: Date.now(),
    };

    submittingGenerationRef.current = true;
    setSubmittingGeneration(true);
    setActiveImageGenerations((current) => [...current, { id: generationId, progress: initialProgress, images: [] }]);
    setNotice('');
    setGenerationError('');
    setEditVersions([]);
    setEditInstruction('');
    const generatedImages: DisplayImage[] = [];
    let submissionReleased = false;
    const releaseSubmission = () => {
      if (submissionReleased) return;
      submissionReleased = true;
      submittingGenerationRef.current = false;
      setSubmittingGeneration(false);
    };
    const updateGeneration = (completed: number, visual: number, images = generatedImages) => {
      setActiveImageGenerations((current) => current.map((item) => item.id === generationId
        ? {
            ...item,
            images: [...images],
            progress: { ...item.progress, completed, visual: Math.max(item.progress.visual, visual) },
          }
        : item));
    };

    try {
      if (generationIsNanoBananaPro) {
        const latestModels = await fetchModels();
        const latestRouting = latestModels.providerRouting || defaultProviderRouting;
        setProviderRouting(latestRouting);
      }

      for (let index = 0; index < generationBatchCount; index += 1) {
        updateGeneration(index, Math.min(88, (index / generationBatchCount) * 100 + 8));

        const jobStartedAt = Date.now();
        const { job } = await startGenerateImageJob({
          submissionId: `${generationId}:${index}`,
          prompt: generationPrompt,
          model: generationModel,
          dimensions: generationDimensions,
          imageSize: generationImageSize,
          quality: generationShowGptQuality ? generationQuality : undefined,
          ...getAiEnhancementRequestFlags(generationIsNanoBananaPro ? generationOptimizeChineseText : false),
          reference_images: generationReferences,
        });
        if (index === 0) releaseSubmission();
        const image = job.status === 'succeeded' && job.image
          ? job.image
          : await waitForGenerationJob(job.id, index, generationBatchCount, jobStartedAt, updateGeneration);

        generatedImages.push(toDisplayImage(image));
        updateGeneration(index + 1, Math.min(96, ((index + 1) / generationBatchCount) * 100));
      }

      commitGeneratedImages(generatedImages);
      if (generatedImages[0]) {
        setEditVersions([generatedImages[0]]);
        setEditLocks(new Set(['person', 'composition']));
      }
      if (generationBatchCount > 1) {
        setNotice(`\u5df2\u751f\u6210 ${generatedImages.length} \u5f20\u56fe\u7247`);
      }

      void fetchMe().then(setUser).catch(() => undefined);
      void loadHistory();
      if (user?.isAdmin) {
        void loadAdminSection('dashboard');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '\u751f\u6210\u5931\u8d25';
      const noticeMessage =
        generatedImages.length > 0
          ? `已成功生成 ${generatedImages.length} 张图片（已扣除对应积分），后续请求失败：${errorMessage}`
          : `${errorMessage}（本次未扣除积分）`;

      if (generatedImages.length > 0) {
        commitGeneratedImages(generatedImages);
        setEditVersions([generatedImages[0]]);
      }
      setNotice('');
      setGenerationError(noticeMessage);
    } finally {
      releaseSubmission();
      setActiveImageGenerations((current) => current.filter((item) => item.id !== generationId));
    }
  }

  async function handleContinueEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sourceImage = currentImage;
    const requestedChange = editInstruction.trim();
    if (!user || !sourceImage || editVersions.length === 0) return;
    if (!requestedChange) {
      setGenerationError('请先描述想修改的内容');
      return;
    }

    if (selectedAvailableCredits < selectedModelCredits) {
      setGenerationError(`当前模型积分不足，需要 ${selectedModelCredits} 积分，可用 ${selectedAvailableCredits} 积分`);
      return;
    }

    const effectivePrompt = buildImageEditPrompt(requestedChange, editLocks);

    setLoading(true);
    setPendingGenerationSlot(true);
    setInFlightGeneratedImages([]);
    setGenerationProgress({ completed: 0, total: 1, visual: 6, startedAt: Date.now() });
    setGenerationError('');
    setNotice('');

    try {
      if (selectedModel === 'Nano_Banana_Pro') {
        const latestModels = await fetchModels();
        setProviderRouting(latestModels.providerRouting || defaultProviderRouting);
      }
      const sourceReference = await imageToReferenceInput(sourceImage);
      const jobStartedAt = Date.now();
      const { job } = await startGenerateImageJob({
        prompt: effectivePrompt,
        model: selectedModel,
        dimensions,
        imageSize,
        quality: showGptQuality ? gptQuality : undefined,
        ...getAiEnhancementRequestFlags(selectedModel === 'Nano_Banana_Pro' ? optimizeChineseText : false),
        reference_images: [sourceReference],
      });
      const image = job.status === 'succeeded' && job.image
        ? job.image
        : await waitForGenerationJob(job.id, 0, 1, jobStartedAt);
      const editedImage: DisplayImage = {
        ...toDisplayImage(image),
        prompt: requestedChange,
        editInstruction: requestedChange,
      };

      commitGeneratedImages([editedImage]);
      setEditVersions((current) => [...current, editedImage]);
      setEditInstruction('');
      setNotice(`已生成版本 V${editVersions.length + 1}`);
      void fetchMe().then(setUser).catch(() => undefined);
      void loadHistory();
      if (user.isAdmin) void loadAdminSection('dashboard');
    } catch (error) {
      setGenerationError(`${error instanceof Error ? error.message : '连续编辑失败'}（本次未扣除积分）`);
    } finally {
      setLoading(false);
      setGenerationProgress(null);
      setPendingGenerationSlot(false);
      setInFlightGeneratedImages([]);
    }
  }

  async function saveDisplayImage(targetImage: DisplayImage, category: ImageCategory) {
    if (!user) return;

    try {
      const response = targetImage.savedImageId
        ? await moveImage({ imageId: targetImage.savedImageId, category })
        : await moveImage({
            image: {
              prompt: targetImage.prompt,
              modelName: targetImage.modelName,
              dimensions: targetImage.dimensions,
              imageSize: targetImage.imageSize,
              imagePath: targetImage.imagePath,
              referenceImages: targetImage.referenceImages,
              createdAt: targetImage.createdAt,
            },
            category,
          });

      if (!response.image) return;

      setCurrentImage((current) =>
        current && current.imageUrl === targetImage.imageUrl
          ? {
              ...current,
              savedImageId: response.image?.id,
              category,
            }
          : current,
      );
      setHistoryQueue((current) =>
        current.map((item) =>
          item.imageUrl === targetImage.imageUrl
            ? {
                ...item,
                savedImageId: response.image?.id,
                category,
              }
            : item,
        ),
      );

      setFavorites((current) =>
        category === 'favorite'
          ? [response.image, ...current.filter((item) => item.id !== response.image!.id)]
          : current.filter((item) => item.id !== response.image!.id),
      );
      setBackup((current) =>
        category === 'backup'
          ? [response.image, ...current.filter((item) => item.id !== response.image!.id)]
          : current.filter((item) => item.id !== response.image!.id),
      );
      setDiscarded((current) =>
        category === 'discarded'
          ? [response.image, ...current.filter((item) => item.id !== response.image!.id)]
          : current.filter((item) => item.id !== response.image!.id),
      );

      setNotice(
        category === 'favorite'
          ? '已加入收藏区'
          : category === 'backup'
            ? '已移入备份区'
            : '已移入丢弃区',
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '图片保存失败');
    }
  }

  async function saveCurrentImage(category: ImageCategory) {
    if (!currentImage) return;
    await saveDisplayImage(currentImage, category);
  }

  async function moveSavedImageToMain(item: SavedImage) {
    setCurrentImage({
      prompt: item.prompt,
      modelName: item.modelName,
      dimensions: item.dimensions,
      imageSize: item.imageSize,
      imagePath: item.imageUrl,
      imageUrl: item.imageUrl,
      thumbnailPath: item.thumbnailUrl,
      thumbnailUrl: item.thumbnailUrl,
      referenceImages: item.referenceImages,
      createdAt: item.createdAt,
      savedImageId: item.id,
      category: item.category,
    });
  }

  async function deleteSavedImage(item: SavedImage) {
    if (!user) return;

    try {
      await deleteImage(item.id);
      setFavorites((current) => current.filter((entry) => entry.id !== item.id));
      setBackup((current) => current.filter((entry) => entry.id !== item.id));
      setDiscarded((current) => current.filter((entry) => entry.id !== item.id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除失败');
    }
  }

  async function clearCategory(category: ImageCategory) {
    const target = category === 'backup' ? backup : discarded;
    if (!user || target.length === 0) return;

    try {
      await Promise.all(target.map((item) => deleteImage(item.id)));

      if (category === 'backup') {
        setBackup([]);
      } else {
        setDiscarded([]);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '清空失败');
    }
  }

  async function runDownload(url: string) {
    if (!url) return;
    if (downloadingRef.current.has(url)) return; // 同一张图正在下载时忽略重复点击，避免重复下载
    downloadingRef.current.add(url);
    setDownloadingUrl(url);
    try {
      await downloadAsset(url, `pixory-${Date.now()}`);
    } catch (downloadError) {
      console.error('[downloadDisplayImage] 下载失败:', downloadError);
      setNotice(downloadError instanceof Error ? downloadError.message : '下载失败');
    } finally {
      downloadingRef.current.delete(url);
      setDownloadingUrl((current) => (current === url ? null : current));
    }
  }

  function downloadCurrentImage() {
    if (currentImage) void runDownload(currentImage.imageUrl);
  }

  function downloadDisplayImage(item: DisplayImage | SavedImage | GenerationRecord) {
    void runDownload(item.imageUrl);
  }

  async function deleteCurrentImage() {
    if (!currentImage) return;

    try {
      if (currentImage.savedImageId && user) {
        await deleteSavedImage({
          id: currentImage.savedImageId,
          prompt: currentImage.prompt,
        modelName: currentImage.modelName,
        dimensions: currentImage.dimensions,
        imageSize: currentImage.imageSize,
        imageUrl: currentImage.imageUrl,
          category: currentImage.category || 'discarded',
          referenceImages: currentImage.referenceImages,
          createdAt: currentImage.createdAt,
        });
      }

      setCurrentImage(historyQueue[0] || null);
      setHistoryQueue((current) => current.slice(1));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除失败');
    }
  }

  async function deleteStageImage(_index: number, item: DisplayImage) {
    try {
      if (item.savedImageId && user) {
        await deleteSavedImage({
          id: item.savedImageId,
          prompt: item.prompt,
          modelName: item.modelName,
          dimensions: item.dimensions,
          imageSize: item.imageSize,
          imageUrl: item.imageUrl,
          category: item.category || 'discarded',
          referenceImages: item.referenceImages,
          createdAt: item.createdAt,
        });
      }

      if (currentImage && item.imageUrl === currentImage.imageUrl) {
        setCurrentImage(historyQueue[0] || null);
        setHistoryQueue((current) => current.slice(1));
      } else {
        setHistoryQueue((current) => current.filter((queuedItem) => queuedItem.imageUrl !== item.imageUrl));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除失败');
    }
  }

  function handleMergeAll() {
    const merged = [...backup, ...discarded];
    window.alert(
      merged.length
        ? `共 ${merged.length} 张图片：\n\n${merged.map((item, index) => `${index + 1}. ${item.prompt}`).join('\n')}`
        : '备份区和丢弃区当前没有图片可合并。',
    );
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      const nextUser =
        authMode === 'invite'
          ? await loginWithInvite({ code: authForm.inviteCode })
          : authMode === 'login'
          ? await login({ username: authForm.username, password: authForm.password })
          : await register({
              username: authForm.username,
              password: authForm.password,
              email: authForm.email,
            });

      setUser(nextUser);
      setAuthOpen(false);
      void fetchPromoCoupon()
        .then((payload) => {
          setPromoCoupon(payload.coupon);
          if (payload.coupon.shouldPopup) {
            setPromoCouponOpen(true);
          }
        })
        .catch(() => undefined);
      setNotice(`欢迎回来，${nextUser.username}`);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '登录失败');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRedeemInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || user.canRedeemInvite === false || user.username.toLowerCase().startsWith('invite-')) {
      setRedeemInviteOpen(false);
      setRedeemInviteError('');
      return;
    }
    if (!redeemInviteValue.trim()) {
      setRedeemInviteError('\u8bf7\u8f93\u5165\u9080\u8bf7\u7801');
      return;
    }

    setRedeemingInvite(true);
    setRedeemInviteError('');
    try {
      const payload = await redeemInviteCode({ code: redeemInviteValue.trim().toUpperCase() });
      setUser(payload.user);
      setRedeemInviteOpen(false);
      setRedeemInviteValue('');
      setNotice(`\u9080\u8bf7\u7801\u5151\u6362\u6210\u529f\uff0c\u5df2\u5145\u503c ${payload.redeemedCredits} \u79ef\u5206`);
    } catch (error) {
      setRedeemInviteError(error instanceof Error ? error.message : '\u5151\u6362\u79ef\u5206\u5931\u8d25');
    } finally {
      setRedeemingInvite(false);
    }
  }

  function setNotificationReadLocally(id: string) {
    setNotificationPayload((current) => ({
      ...current,
      unreadCount: Math.max(0, current.unreadCount - (current.notifications.some((item) => item.id === id && !item.read) ? 1 : 0)),
      notifications: current.notifications.map((item) => item.id === id ? { ...item, read: true } : item),
    }));
  }

  async function handleReadNotification(id: string) {
    setNotificationReadLocally(id);
    try {
      await markNotificationRead(id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '\u66f4\u65b0\u901a\u77e5\u5931\u8d25');
    }
  }

  async function handleReadAllNotifications() {
    setNotificationPayload((current) => ({
      ...current,
      unreadCount: 0,
      notifications: current.notifications.map((item) => ({ ...item, read: true })),
    }));
    try {
      await markAllNotificationsRead();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '\u66f4\u65b0\u901a\u77e5\u5931\u8d25');
    }
  }

  function logout() {
    hasVisitedCreateRef.current = true;
    clearSession();
    setUser(null);
    setFavorites([]);
    setBackup([]);
    setDiscarded([]);
    setHistoryRecords([]);
    setPromoCoupon(null);
    setPromoCouponOpen(false);
    setNotificationPayload({ notifications: [], unreadCount: 0, popup: null });
    setNotificationOpen(false);
    setAdminOverview({
      users: [],
      usersPage: emptyPage,
      records: [],
      recordsPage: emptyPage,
      inviteCodes: [],
      inviteCodesPage: emptyPage,
      adminCredits: { totalCredits: 0, usedCredits: 0, remainingCredits: 0 },
      dashboardStats: emptyDashboardStats,
      providerMetrics: [],
      providerRisks: [],
      generationRanking: { today: [], total: [] },
      recordsStats: emptyRecordsStats,
      recordModelOptions: [],
      recordResolutionOptions: [],
    });
    setActiveTab('create');
    setCurrentImage(null);
    setHistoryQueue([]);
    setNotice('');
  }

  // 灶台只展示当前窗口本次会话生成的图片，不再用服务端历史补齐。
  // 这样每个窗口只占用自己的灶台数量，不会被其他窗口的生成挤掉；删除后也不会因历史回填而"没反应"。
  const stageSourceCards = (currentImage ? [currentImage, ...historyQueue] : historyQueue)
    .filter((item, index, array) => index === array.findIndex((candidate) => candidate.imageUrl === item.imageUrl));
  const activeGenerationStageEntries = activeImageGenerations.flatMap((generation) => [
    ...generation.images.map((image) => ({ image, generation: null as ActiveImageGeneration | null })),
    { image: null, generation },
  ]);
  const activeGenerationStageIndexes = activeGenerationStageEntries.flatMap((entry, index) => entry.generation ? [index] : []);
  const activeGenerationStageIndex = activeGenerationStageIndexes[0] ?? (pendingGenerationSlot ? inFlightGeneratedImages.length : -1);
  const visibleStageCards = activeImageGenerations.length > 0
    ? [...activeGenerationStageEntries.map((entry) => entry.image), ...stageSourceCards]
    : pendingGenerationSlot
      ? [...inFlightGeneratedImages, null, ...stageSourceCards]
      : stageSourceCards;
  const stageCards = Array.from({ length: MAX_BATCH_COUNT }, (_, index) => visibleStageCards[index] || null);
  const activityStageIndex = findCreationActivityStageIndex(stageCards, {
    batchCount,
    loading: activeImageGenerations.length > 0 || loading,
    activeGenerationStageIndex,
    activeGenerationStageIndexes,
  });

  function handleTabChange(nextTab: AppTab) {
    if (typeof window !== 'undefined') {
      const nextPath = getTabPath(nextTab);
      if (window.location.pathname !== nextPath) {
        window.history.pushState({}, '', nextPath);
      }
    }

    setActiveTab(nextTab);
  }

  const tabs: Array<{ id: AppTab; label: string; icon: ReactNode; hidden?: boolean }> = [
    { id: 'home', label: '首页', icon: <Home size={15} /> },
    { id: 'create', label: '创作', icon: <Sparkles size={15} /> },
    { id: 'batchCreate', label: '批量生图', icon: <Layers3 size={15} /> },
    { id: 'history', label: '历史记录', icon: <Clock3 size={15} /> },
    { id: 'apiDocs', label: 'API 文档', icon: <BookOpen size={15} /> },
    { id: 'admin', label: '后台管理', icon: <ShieldCheck size={15} />, hidden: !user?.isAdmin },
  ];

  const createView = (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[2fr_3fr_2fr]">
      <aside className="h-full overflow-hidden border-r border-white/8 p-4">
        <form className="custom-scrollbar flex h-full min-h-0 flex-col gap-5 overflow-auto pr-1" onSubmit={handleGenerate}>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">模型</span>
              <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] font-semibold text-violet-300">
                v2.4
              </span>
            </div>
            <div className="relative">
              <select
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 pr-28 text-sm text-zinc-200 outline-none transition focus:border-violet-500/40"
                value={selectedModel}
                onChange={(event) => handleModelSelect(event.target.value)}
              >
                {models.map((item) => (
                  <option key={item.id} value={item.id} className="bg-[#111111]">
                    {item.name}
                  </option>
                ))}
              </select>
              {selectedModelSuccessRate ? (
                <span className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 rounded-full bg-emerald-950/80 px-2 py-0.5 text-[11px] font-black leading-4 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.16)]">
                  {selectedModelSuccessRate}
                </span>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">参考图片</span>
              <span className="text-xs text-zinc-500">{references.length} / 3</span>
            </div>

            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-500 transition hover:border-violet-500/30 hover:text-white">
              <input className="hidden" type="file" accept="image/*" multiple onChange={handleReferenceUpload} />
              <ImagePlus size={18} />
              <span className="mt-2 text-xs">添加</span>
            </label>

            {references.length > 0 ? (
              <div className="grid gap-2">
                {references.map((item) => (
                  <button
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-2 text-left"
                    type="button"
                    onClick={() => removeReference(item.id)}
                  >
                    <img alt={item.name} className="h-10 w-10 rounded-lg object-cover" src={item.previewUrl} />
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{item.name}</span>
                    <X size={14} className="text-zinc-500" />
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">提示词</span>
              <span className="text-xs text-zinc-500">{prompt.length} / 3000</span>
            </div>
            <textarea
              className="min-h-[156px] w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-4 text-sm leading-7 text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/40"
              placeholder="描述你想看到的画面..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value.slice(0, 3000))}
            />
          </section>

          <section className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">画面比例</span>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
              {dimensionOptions.map(({ value, label }) => {
                const active = value === dimensions;

                return (
                  <button
                    key={value}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                      active
                        ? 'border-white bg-white text-black'
                        : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20 hover:text-white'
                    }`}
                    type="button"
                    onClick={() => setDimensions(value)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          {isNanoBananaPro ? (
            <section className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">输出分辨率</span>
              <div className="grid grid-cols-2 gap-2">
                {imageSizeOptions.map((item) => {
                  const active = imageSize === item.value;
                  const enabled = isImageResolutionEnabled(providerRouting, selectedModel, item.value);

                  return (
                    <button
                      key={item.value}
                      className={`rounded-xl border px-4 py-2 text-center transition ${
                        active
                          ? 'border-white bg-white text-black'
                          : enabled
                            ? 'border-white/10 bg-white/[0.04] text-white hover:border-white/20'
                            : 'cursor-not-allowed border-white/5 bg-white/[0.02] text-zinc-700'
                      }`}
                      type="button"
                      disabled={!enabled}
                      onClick={() => setImageSize(item.value)}
                    >
                      <span className="block text-sm font-black leading-none">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className="mt-auto space-y-4">
            <div className="text-xs leading-6 text-zinc-500">
              {user ? (
                <p>
                  当前账号：{user.username}
                  {typeof user.creditsRemaining === 'number' ? `，剩余积分 ${user.creditsRemaining}` : ''}。
                </p>
              ) : (
                <>
                  <p>匿名访客只能浏览公开内容，不能生成图片。</p>
                  <p>
                    请先登录或填写内测邀请码。
                    <button
                      className="ml-2 font-semibold text-sky-400 transition hover:text-sky-300"
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setAuthOpen(true);
                      }}
                    >
                      去登录
                    </button>
                  </p>
                  <button
                    className="font-semibold text-sky-400 transition hover:text-sky-300"
                    type="button"
                    onClick={() => {
                      setAuthMode('invite');
                      setAuthOpen(true);
                    }}
                  >
                    填写邀请码
                  </button>
                </>
              )}
              <p className="mt-1 text-zinc-400">{healthText}</p>
              {loadingUserData ? <p className="mt-1 text-zinc-400">正在同步你的图片数据...</p> : null}
            </div>

            {generationError ? (
              <div className="app-alert app-alert-error">
                {generationError}
              </div>
            ) : null}
            {notice ? (
              <div className="app-alert">
                {notice}
              </div>
            ) : null}
            <CreditsSummary
              selectedModel={selectedModelInfo}
              user={user}
              creditsCost={selectedModelCredits}
              creditsRemaining={selectedAvailableCredits}
              onOpenPurchase={openPurchasePage}
            />

            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,#6623ff_0%,#8d46ff_50%,#7a3cff_100%)] px-4 py-4 text-base font-semibold text-white shadow-[0_12px_36px_rgba(110,49,255,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submittingGeneration || activeImageGenerations.length > 0 || !!healthError || !user || !hasEnoughCredits}
              type="submit"
            >
              {submittingGeneration ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
              {submittingGeneration ? '正在提交...' : activeImageGenerations.length > 0 ? `生成中 · ${activeImageGenerations.length} 个进行中` : user ? '生成' : '登录后生成'}
            </button>
          </div>
        </form>
      </aside>

      <section className="min-h-0 border-r border-white/8 px-5 py-4">
        <div className="custom-scrollbar grid h-full auto-rows-[140px] gap-3 overflow-auto pr-1">
          {stageCards.map((item, index) => (
            <div key={index}>
              <StageCard
                item={item}
                loading={activeGenerationStageIndexes.includes(index) || (index === 0 && loading)}
                progress={activeGenerationStageEntries[index]?.generation?.progress || (index === 0 && loading ? generationProgress : null)}
                showActions={Boolean(item && !activeGenerationStageIndexes.includes(index) && !(index === 0 && loading) && user)}
                downloading={downloadingUrl === (item?.imageUrl ?? null)}
                onDownload={item ? () => downloadDisplayImage(item) : downloadCurrentImage}
                onSave={item ? (category) => void saveDisplayImage(item, category) : saveCurrentImage}
                onDelete={item ? () => void deleteStageImage(index, item) : () => void deleteCurrentImage()}
                onPreview={(target) => setPreviewImage(target)}
              />
            </div>
          ))}
        </div>
      </section>

      <aside className="h-full overflow-hidden p-4">
        <div className="grid h-full content-start gap-5">
          <SidePanel
            title="收藏区"
            count={sideFavoriteItems.length}
            icon={<Star size={14} className="text-violet-300" />}
            actionLabel="下载"
            onAction={() => {
              const target = sideFavoriteItems[0];
              if (target) {
                void downloadDisplayImage(target);
              }
            }}
            items={sideFavoriteItems}
            emptyText="看到满意的图，就把它放进这里。"
            onMove={moveSavedImageToMain}
            onDelete={deleteSavedImage}
            loggedIn={Boolean(user)}
          />

          <SidePanel
            title="备份区"
            count={sideBackupItems.length}
            icon={<Bookmark size={14} className="text-pink-300" />}
            actionLabel="全部合并"
            onAction={handleMergeAll}
            items={sideBackupItems}
            emptyText="暂时拿不准的图，先放这里备用。"
            onMove={moveSavedImageToMain}
            onDelete={deleteSavedImage}
            loggedIn={Boolean(user)}
          />

          <SidePanel
            title="丢弃区"
            count={sideDiscardedItems.length}
            icon={<Trash2 size={14} className="text-zinc-400" />}
            actionLabel="清空"
            onAction={() => {
              if (user) {
                void clearCategory('discarded');
              }
            }}
            items={sideDiscardedItems}
            emptyText="不满意的图先放这里，后面统一复盘。"
            onMove={moveSavedImageToMain}
            onDelete={deleteSavedImage}
            loggedIn={Boolean(user)}
          />

          {user ? (
            <button
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white"
              type="button"
              onClick={() => void clearCategory('backup')}
            >
              清空备份区
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  );

  return (
    <main className="dark-ai-app lg:h-[100dvh] lg:overflow-hidden">
      <div className="flex min-h-[100dvh] flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.025)_0%,rgba(255,255,255,0)_18%)] lg:h-[100dvh] lg:overflow-hidden">
        <header className="app-header shrink-0 flex flex-wrap items-center justify-between gap-4 px-3 py-2.5 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="brand-mark h-9 w-9" />
            <span className="text-[26px] font-semibold leading-none tracking-[-0.025em] text-zinc-100">PIXORY</span>
          </div>

          <nav className="nav-shell order-3 flex w-full overflow-x-auto p-1 sm:order-none sm:w-auto">
            {tabs
              .filter((item) => !item.hidden)
              .map((item) => {
                const active = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    className={`btn-ghost inline-flex min-h-0 items-center px-4 py-2 text-sm transition ${
                      active ? 'nav-tab-active' : ''
                    }`}
                    type="button"
                    onClick={() => handleTabChange(item.id)}
                  >
                    {item.label}
                  </button>
                );
              })}
          </nav>

          <div className="flex w-full items-center justify-between gap-0.5 sm:w-auto sm:justify-end">
            <button
              className="group hidden min-h-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold text-zinc-400 transition hover:bg-sky-400/10 hover:text-sky-200 md:inline-flex"
              type="button"
              title="复制客服微信 lzp983813676"
              onClick={() => void handleCopyWechat()}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-400/10 text-sky-300 transition group-hover:bg-sky-400/20">
                <MessageCircle size={10} strokeWidth={2.1} />
              </span>
              {wechatCopied ? '\u5df2\u590d\u5236\u5fae\u4fe1' : '\u5ba2\u670d'}
            </button>
            {/* 购买积分按钮 - 头部导航栏 */}
            <button
              className="hidden min-h-0 items-center rounded-md px-1.5 py-1 text-[11px] font-black text-orange-300 transition hover:bg-orange-400/10 hover:text-orange-200 md:inline-flex"
              type="button"
              onClick={openPurchasePage}
            >
              购买积分
            </button>
            {user && user.canRedeemInvite !== false && !user.username.toLowerCase().startsWith('invite-') ? (
              <button
                className="inline-flex min-h-0 items-center rounded-md px-1.5 py-1 text-[11px] font-black text-amber-200 transition hover:bg-amber-400/10 hover:text-amber-100"
                type="button"
                onClick={() => {
                  setRedeemInviteError('');
                  setRedeemInviteOpen(true);
                }}
              >
                {'\u5151\u6362\u79ef\u5206'}
              </button>
            ) : null}
            {SHOW_PROMO_COUPON_HEADER_ENTRY && user ? (
              <button
                className={`inline-flex min-h-0 items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-black transition ${activePromoCoupon ? 'border-orange-300/35 bg-orange-400/10 text-orange-200 hover:bg-orange-400/20' : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/20 hover:text-zinc-300'}`}
                type="button"
                title={activePromoCoupon ? `打开${promoCouponDiscountLabel}优惠券` : '暂无可用优惠券'}
                onClick={() => void openPromoCouponFromHeader()}
              >
                <TicketPercent size={13} strokeWidth={2.2} />
                <span>优惠券</span>
                <span className={`inline-flex min-w-4 items-center justify-center rounded-full border px-1 py-0.5 text-[9px] leading-none ${activePromoCoupon ? 'border-orange-200/35 bg-orange-300/15 text-orange-100' : 'border-white/10 bg-black/20 text-zinc-500'}`}>
                  {activePromoCoupon ? 1 : 0}
                </span>
              </button>
            ) : null}
            <div
              className="hidden"
              title={healthError || healthText}
            >
              <span className={healthError ? 'h-2.5 w-2.5 rounded-full bg-rose-400' : 'h-2.5 w-2.5 rounded-full bg-emerald-400'} />
            </div>
            {user ? (
              <button
                className="relative inline-flex min-h-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-black text-rose-200 transition hover:bg-rose-400/10 hover:text-rose-100"
                type="button"
                aria-label={'\u6253\u5f00\u901a\u77e5'}
                onClick={() => {
                  if (notificationOpen) {
                    setNotificationOpen(false);
                    return;
                  }
                  setNotificationOpen(true);
                  if (notificationPayload.unreadCount > 0) void handleReadAllNotifications();
                }}
              >
                <Bell size={14} strokeWidth={2.2} />
                <span className={`inline-flex min-w-5 items-center justify-center rounded-full border px-1 py-0.5 text-[9px] leading-none ${notificationPayload.unreadCount > 0 ? 'border-rose-300/35 bg-rose-500/20 text-rose-100' : 'border-white/10 bg-white/[0.04] text-zinc-500'}`}>
                  {notificationPayload.unreadCount > 99 ? '99+' : notificationPayload.unreadCount}
                </span>
              </button>
            ) : null}
            {user ? (
              <div className="relative flex min-w-0 items-center gap-2 border-l border-white/10 pl-2">
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-[linear-gradient(145deg,#2d2d3b,#17171f)] text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_5px_14px_rgba(0,0,0,0.25)]">
                  <div className="absolute inset-x-1 bottom-0 h-3 rounded-t-full bg-[var(--primary)]/45" />
                  <UserRound className="relative z-10" size={18} strokeWidth={1.8} />
                </div>
                <button
                  className="min-w-0 text-left leading-tight"
                  type="button"
                  onClick={() => setCreditDetailsOpen((current) => !current)}
                >
                  <p className="max-w-24 truncate text-[13px] font-semibold text-zinc-100">{user.username}</p>
                  <p className="mt-0.5 whitespace-nowrap text-[10px] font-medium text-zinc-500">
                    {user.isAdmin ? '管理员' : '正式用户'} <span className="px-0.5">•</span> 积分{user.creditsRemaining ?? 0}
                  </p>
                </button>
                {creditDetailsOpen ? (
                  <div className="absolute right-8 top-10 z-[80] w-56 rounded-2xl border border-white/12 bg-[#11111a] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-white">积分明细</span>
                      <span className="text-xs font-black text-sky-200">合计 {user.creditsRemaining ?? 0}</span>
                    </div>
                    <div className="mt-3 space-y-2 text-xs">
                      <div className="flex justify-between rounded-xl bg-white/[0.04] px-3 py-2"><span className="text-zinc-400">GPT 积分</span><strong className="text-white">{user.creditBalances?.gpt ?? 0}</strong></div>
                      <div className="flex justify-between rounded-xl bg-white/[0.04] px-3 py-2"><span className="text-zinc-400">Banana 积分</span><strong className="text-white">{user.creditBalances?.banana ?? 0}</strong></div>
                      <div className="flex justify-between rounded-xl bg-white/[0.04] px-3 py-2"><span className="text-zinc-400">通用积分</span><strong className="text-white">{user.creditBalances?.general ?? user.creditsRemaining ?? 0}</strong></div>
                    </div>
                    <p className="mt-3 text-[10px] leading-4 text-zinc-500">专用积分仅用于对应模型；专用积分不足时会自动使用通用积分。</p>
                  </div>
                ) : null}
                <button
                  className="btn-ghost min-h-0 shrink-0 px-1.5 py-1.5 text-zinc-500 hover:text-white"
                  type="button"
                  title="退出登录"
                  aria-label="退出登录"
                  onClick={logout}
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button
                className="btn-secondary px-4 py-2 text-sm"
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthOpen(true);
                }}
              >
                <LogIn size={14} />
                登录
              </button>
            )}
          </div>
        </header>

        <div
          className={
            activeTab === 'create'
              ? 'min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 lg:grid lg:grid-cols-[2fr_3fr_2fr] lg:space-y-0 lg:overflow-hidden lg:px-0 lg:py-0'
              : 'min-h-0 flex-1 overflow-auto lg:overflow-hidden'
          }
        >
          {activeTab === 'create' && creationMode === 'video' ? (
            <VideoCreateView
              user={user}
              providerRouting={providerRouting}
              modelCreditPricing={modelCreditPricing}
              onSwitchImage={() => setCreationMode('image')}
              onLogin={() => {
                setAuthMode('login');
                setAuthOpen(true);
              }}
              onPurchase={openPurchasePage}
              onCreditsChange={(creditsRemaining) => {
                setUser((current) => current ? { ...current, creditsRemaining } : current);
                void fetchMe().then(setUser).catch(() => undefined);
              }}
            />
          ) : null}

          <aside className={activeTab === 'create' && creationMode === 'image' ? 'app-panel custom-scrollbar overflow-visible px-3 pb-4 pt-3 lg:h-full lg:overflow-y-auto lg:rounded-none lg:border-0 lg:border-r lg:pb-[calc(env(safe-area-inset-bottom)+16px)] lg:pt-2' : 'hidden'}>
            <form className="flex min-h-0 flex-col gap-2 pr-0 lg:min-h-full lg:pr-1" onSubmit={handleGenerate}>
              <div className="grid grid-cols-2 rounded-xl border border-white/8 bg-white/[0.035] p-0.5">
                <button
                  className="flex min-h-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.1] px-2.5 py-1.5 text-[12px] font-black text-white shadow-[0_6px_16px_rgba(0,0,0,0.2)]"
                  type="button"
                >
                  <ImagePlus size={13} />
                  生图
                </button>
                <button
                  className={`flex min-h-0 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-black transition ${
                    providerRouting.junliaiGeminiVeo31 || providerRouting.junliaiFireflyVideo || providerRouting.schatSeedance25
                      ? 'text-zinc-500 hover:text-zinc-200'
                      : 'cursor-not-allowed text-zinc-700'
                  }`}
                  type="button"
                  disabled={!providerRouting.junliaiGeminiVeo31 && !providerRouting.junliaiFireflyVideo && !providerRouting.schatSeedance25}
                  title={providerRouting.junliaiGeminiVeo31 || providerRouting.junliaiFireflyVideo || providerRouting.schatSeedance25 ? undefined : '管理员已关闭全部视频接口'}
                  onClick={() => setCreationMode('video')}
                >
                  <Film size={13} />
                  生视频
                </button>
              </div>

              <section className="space-y-1.5">
                <div className="px-0.5 text-[11px] font-extrabold text-zinc-400">{'\u6a21\u578b\u9009\u62e9'}</div>
                <div
                  className="relative"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setModelMenuOpen(false);
                  }}
                >
                  <button
                    className="input flex min-h-[40px] w-full items-center py-2 pl-3 pr-28 text-left"
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={modelMenuOpen}
                    onClick={() => setModelMenuOpen((current) => !current)}
                  >
                    <span className="text-[12px] font-semibold text-zinc-100">{selectedModelInfo?.name}</span>
                    <span className="ml-2 text-[9px] font-medium text-zinc-500">{selectedModelInfo?.description}</span>
                    <ChevronDown
                      size={15}
                      className={`absolute right-3 text-zinc-400 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {selectedModelSuccessRate ? (
                    <span className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 rounded-full bg-emerald-950/80 px-2 py-0.5 text-[11px] font-black leading-4 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.16)]">
                      {selectedModelSuccessRate}
                    </span>
                  ) : null}
                  {modelMenuOpen ? (
                    <div className="absolute inset-x-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-white/10 bg-[#111111] p-1 shadow-2xl" role="listbox">
                      {models.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={selectedModel === item.id}
                          className={`flex w-full items-center rounded-lg px-3 py-2.5 text-left transition ${
                            selectedModel === item.id ? 'bg-white/10' : 'hover:bg-white/[0.06]'
                          }`}
                          onClick={() => {
                            handleModelSelect(item.id);
                            setModelMenuOpen(false);
                          }}
                        >
                          <span className="text-[13px] font-semibold text-zinc-100">{item.name}</span>
                          <span className="ml-2 text-[10px] font-medium text-zinc-500">{item.description}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-[11px] font-extrabold text-zinc-400">
                  <span>{'\u4e0a\u4f20\u53c2\u8003\u56fe\uff08\u53ef\u9009\uff09'}</span>
                  <span className="shrink-0 text-[10px] text-zinc-500">{references.length} / {getMaxReferences(selectedModel)} · 单张 ≤{getMaxReferenceMB(selectedModel)}MB</span>
                </div>
                <div
                  className={
                    draggingReferences
                      ? 'card p-1.5 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.18)]'
                      : 'card p-1.5'
                  }
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDraggingReferences(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDraggingReferences(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    if (event.currentTarget === event.target) {
                      setDraggingReferences(false);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleReferenceDrop(Array.from(event.dataTransfer.files || []));
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    <label className="btn-secondary flex h-[48px] w-[48px] cursor-pointer flex-col items-center justify-center rounded-xl border-dashed p-0 text-zinc-500 hover:text-white">
                      <input className="hidden" type="file" accept="image/*" multiple onChange={handleReferenceUpload} />
                      <ImagePlus size={15} />
                      <span className="mt-0.5 text-[9px] font-bold">{'\u6dfb\u52a0'}</span>
                    </label>

                    {references.map((item) => (
                      <button
                        key={item.id}
                        className="group relative h-[48px] w-[48px] overflow-hidden rounded-xl border border-white/10 bg-[#101010]"
                        type="button"
                        onClick={() => removeReference(item.id)}
                      >
                        <img alt={item.name} className="h-full w-full object-cover transition duration-200 group-hover:scale-105 group-hover:opacity-75" src={item.previewUrl} />
                        <div className="absolute inset-x-1.5 bottom-1.5 rounded-full bg-black/65 px-2 py-0.5 text-center text-[10px] font-semibold text-white/80 backdrop-blur">
                          {'\u5220\u9664'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-extrabold text-zinc-400">
                  <span>{'\u56fe\u50cf\u63d0\u793a\u8bcd'}</span>
                  <span className="text-[10px] text-zinc-500">{prompt.length} / {MAX_PROMPT_LENGTH}</span>
                </div>
                <div>
                  <textarea
                    className="input h-[82px] resize-none px-3 py-2.5 text-[12px] leading-5 placeholder:text-zinc-600"
                    placeholder="请详细描述您想生成的画面..."
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value.slice(0, MAX_PROMPT_LENGTH))}
                  />
                </div>
              </section>

              <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(180px,0.82fr)]">
                <section className="space-y-1.5">
                  <div className="text-[11px] font-extrabold text-zinc-400">{'\u6e05\u6670\u5ea6'}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {visibleResolutionOptions.map((item) => {
                      const active = imageSize === item.value;
                      const enabled = isImageResolutionEnabled(providerRouting, selectedModel, item.value);

                      return (
                        <button
                          key={item.value}
                          className={
                            active
                              ? 'relative inline-flex h-10 min-h-0 items-center justify-center overflow-visible whitespace-nowrap rounded-lg border border-white bg-white px-2 py-0 text-[13px] font-black text-black transition'
                              : enabled
                                ? 'btn-secondary relative h-10 min-h-0 overflow-visible whitespace-nowrap rounded-lg px-2 py-0 text-[13px] font-black text-zinc-400'
                                : 'relative h-10 min-h-0 cursor-not-allowed overflow-visible whitespace-nowrap rounded-lg border border-white/5 bg-white/[0.02] px-2 py-0 text-[13px] font-black text-zinc-700'
                          }
                          type="button"
                          disabled={!enabled}
                          onClick={() => {
                            setImageSize(item.value);
                            if (selectedModel === 'gpt-image-2' && item.value === 'STANDARD') {
                              setGptQuality('auto');
                            }
                          }}
                        >
                          <span className="block whitespace-nowrap leading-none">{item.label}</span>
                          {item.value === 'STANDARD' ? (
                            <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-20 rounded-full border border-emerald-400/80 bg-[linear-gradient(180deg,#087f5b_0%,#056044_100%)] px-1.5 py-0 text-[9px] font-black leading-4 text-emerald-100 shadow-[0_3px_10px_rgba(5,150,105,0.3)]">
                              {'\u5feb\u901f'}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {showGptQuality ? (
                  <section className="space-y-1.5">
                    <div className="text-[11px] font-extrabold text-zinc-400">{'\u8d28\u91cf'}</div>
                    <div className="grid grid-cols-4 gap-2 overflow-visible">
                      {gptQualityOptions.map((item) => {
                        const active = gptQuality === item.value;
                        const isHighQuality = item.value === 'high';

                        return (
                          <button
                            key={item.value}
                            className={`group relative flex h-10 min-h-0 items-center justify-center overflow-visible whitespace-nowrap px-2 py-0 text-[13px] font-black ${
                              active ? 'rounded-xl border border-white bg-white text-black' : 'btn-secondary text-zinc-400'
                            } ${disableGptQuality ? 'cursor-not-allowed opacity-45' : ''}`}
                            type="button"
                            disabled={disableGptQuality}
                            aria-describedby={isHighQuality ? 'gpt-high-quality-tip' : undefined}
                            onClick={() => setGptQuality(item.value)}
                          >
                            <span className="block whitespace-nowrap leading-none">{item.label}</span>
                            {isHighQuality ? (
                              <>
                                <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-20 rounded-full border border-orange-400/80 bg-[linear-gradient(180deg,#b94f16_0%,#8f2f0c_100%)] px-1.5 py-0 text-[9px] font-black leading-4 text-orange-100 shadow-[0_3px_10px_rgba(194,65,12,0.32)]">
                                  {'\u9ad8\u8d28'}
                                </span>
                                <span
                                  id="gpt-high-quality-tip"
                                  role="tooltip"
                                  className="pointer-events-none absolute -right-3 bottom-full z-[90] mb-3 hidden w-[188px] rounded-xl border border-white/15 bg-[#090909]/98 py-3 pl-9 pr-3 text-left text-[10px] font-black leading-[1.5] text-white shadow-[0_18px_46px_rgba(0,0,0,0.72)] group-hover:block group-focus:block"
                                >
                                  {gptHighQualityTips.map((tip) => (
                                    <span className="block" key={tip}>{tip}</span>
                                  ))}
                                  <span className="absolute -bottom-1.5 right-7 h-3 w-3 rotate-45 border-b border-r border-white/15 bg-[#090909]" />
                                </span>
                              </>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                {isNanoBananaPro ? (
                  <section className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-zinc-400">
                      <span>{'AI\u589e\u5f3a'}</span>
                      <Info size={13} className="text-zinc-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className={
                          optimizeChineseText
                            ? 'btn-secondary h-10 min-h-0 whitespace-nowrap rounded-lg px-2 py-0 text-[13px] font-black text-zinc-400'
                            : 'inline-flex h-10 min-h-0 items-center justify-center whitespace-nowrap rounded-lg border border-white bg-white px-2 py-0 text-[13px] font-black text-black transition'
                        }
                        type="button"
                        onClick={() => setOptimizeChineseText(false)}
                      >
                          <span className="block whitespace-nowrap leading-none">{'\u5173'}</span>
                      </button>
                      <button
                        className={
                          optimizeChineseText
                            ? 'inline-flex h-10 min-h-0 items-center justify-center whitespace-nowrap rounded-lg border border-white bg-white px-2 py-0 text-[13px] font-black text-black transition'
                            : 'btn-secondary h-10 min-h-0 whitespace-nowrap rounded-lg px-2 py-0 text-[13px] font-black text-zinc-400'
                        }
                        type="button"
                        onClick={() => setOptimizeChineseText(true)}
                      >
                          <span className="block whitespace-nowrap leading-none">{'\u5f00'}</span>
                      </button>
                    </div>
                  </section>
                ) : null}
              </div>

              <section className="space-y-1.5">
                <div className="text-[11px] font-extrabold text-zinc-400">{'\u753b\u9762\u6bd4\u4f8b'}</div>
                <div className="grid grid-cols-4 gap-1.5 md:grid-cols-8">
                  {visibleDimensionOptions.map(({ value, label }) => {
                    const active = value === dimensions;

                    return (
                      <button
                        key={value}
                          className={
                            active
                              ? 'inline-flex min-h-0 items-center justify-center rounded-lg border border-white bg-white px-2 py-1.5 text-[11px] font-black text-black transition'
                              : 'btn-secondary min-h-0 rounded-lg px-2 py-1.5 text-[11px] font-black text-zinc-400'
                          }
                        type="button"
                        onClick={() => setDimensions(value)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-extrabold text-zinc-400">
                  <span>
                    {'\u4f7f\u7528\u79ef\u5206\uff1a'}<span className="text-white">{selectedModelCredits * batchCount}</span>/<span className="text-white">{selectedAvailableCredits}</span>
                  </span>
                  <button
                    className="min-h-0 p-0 text-[11px] font-black text-cyan-400 transition hover:text-cyan-300"
                    type="button"
                    onClick={openPurchasePage}
                  >
                    点击在线购买积分(25%优惠)
                  </button>
                </div>
                {user && activePromoCoupon ? (
                  <button
                    className="btn-secondary inline-flex min-h-0 max-w-full px-3 py-2 text-left text-[12px] font-bold"
                    type="button"
                    onClick={() => setPromoCouponOpen(true)}
                  >
                    <Sparkles size={14} className="shrink-0 text-[#ffb7df]" />
                    <span className="truncate">限时 {promoCouponDiscountLabel}优惠券，{promoCouponExpiresText || '12 小时后'}失效</span>
                  </button>
                ) : null}
                {!user ? (
                  <button
                    className="btn-secondary group mt-1.5 h-9 min-w-[150px] px-3.5 text-[15px] font-black"
                    type="button"
                    onClick={() => {
                      setAuthMode('invite');
                      setAuthOpen(true);
                    }}
                  >
                    <KeyRound size={15} className="text-[#ffb7df] transition group-hover:text-white" />
                    {'\u586b\u5199\u9080\u8bf7\u7801'}
                  </button>
                ) : null}
              </div>

              {generationError ? (
                <div className="app-alert app-alert-error">{generationError}</div>
              ) : null}

              {notice ? (
                <div className="app-alert">{notice}</div>
              ) : null}

              <div className="grid gap-2 pt-0.5 xl:mt-auto xl:grid-cols-[180px_minmax(0,1fr)]">
                <div className="card p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-white">{'\u6570\u91cf'}</span>
                    <div className="flex items-center overflow-hidden rounded-lg border border-[#db5ca8] bg-[#341625]">
                      <button
                        className="flex h-8 w-8 items-center justify-center text-[#ffd9ef] transition hover:bg-white/5 disabled:opacity-40"
                        type="button"
                        disabled={batchCount <= 1}
                        onClick={() => setBatchCount((current) => Math.max(1, current - 1))}
                      >
                        <Minus size={15} />
                      </button>
                      <span className="flex h-8 w-9 items-center justify-center border-x border-[#db5ca8] text-[12px] font-black text-white">{batchCount}</span>
                      <button
                        className="flex h-8 w-8 items-center justify-center text-[#ffd9ef] transition hover:bg-white/5 disabled:opacity-40"
                        type="button"
                        disabled={batchCount >= MAX_BATCH_COUNT}
                        onClick={() => setBatchCount((current) => Math.min(MAX_BATCH_COUNT, current + 1))}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  className="btn-primary flex min-h-[56px] items-center justify-center gap-2 px-4 py-3 text-[14px] font-black disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={submittingGeneration || activeImageGenerations.length > 0 || !!healthError || !user || !hasEnoughCredits}
                  type="submit"
                >
                  {submittingGeneration ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
                  {submittingGeneration ? '\u6b63\u5728\u63d0\u4ea4...' : activeImageGenerations.length > 0 ? `\u751f\u6210\u4e2d \u00b7 ${activeImageGenerations.length} \u4e2a\u8fdb\u884c\u4e2d` : user ? '\u4e0b\u5355' : '\u767b\u5f55\u540e\u4e0b\u5355'}
                </button>
              </div>
            </form>
          </aside>

          {activeTab === 'create' && creationMode === 'video' ? null : activeTab === 'home' ? (
            <HomeView
              onNavigate={handleTabChange}
              onStartImage={() => {
                setCreationMode('image');
                handleTabChange('create');
              }}
              onStartVideo={() => {
                setCreationMode('video');
                handleTabChange('create');
              }}
            />
          ) : activeTab === 'create' ? (
            <section className="overflow-visible rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.01)_0%,rgba(255,255,255,0)_100%)] px-3 py-3 sm:px-5 sm:pt-4 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:rounded-none lg:border-y-0 lg:border-l-0 lg:border-r lg:pb-[calc(env(safe-area-inset-bottom)+12px)]">
              {/* 图片保留时限提示 */}
              <div className="mb-3 flex shrink-0 items-center gap-2 rounded-xl border border-amber-500/10 bg-amber-500/[0.04] px-3 py-2">
                <Clock3 size={13} className="shrink-0 text-amber-400/80" />
                <span className="text-[11px] leading-tight text-amber-400/80">图片仅保存 48 小时，超时自动清理，请及时下载</span>
              </div>
              <div className="custom-scrollbar grid auto-rows-auto gap-3 pr-0 lg:flex-1 lg:min-h-0 lg:auto-rows-[108px] lg:overflow-y-auto lg:pr-1">
                {stageCards.map((item, index) => (
                  <div key={index}>
                    <StageCard
                      item={item}
                      loading={activeGenerationStageIndexes.includes(index) || (index === activeGenerationStageIndex && loading)}
                      progress={activeGenerationStageEntries[index]?.generation?.progress || (index === activeGenerationStageIndex && loading ? generationProgress : null)}
                      showActions={Boolean(item && !activeGenerationStageIndexes.includes(index) && !(index === activeGenerationStageIndex && loading) && user)}
                      showActivity={SHOW_CREATION_ACTIVITY && index === activityStageIndex}
                      activityPreviewCount={activityPreviewCount}
                      downloading={downloadingUrl === (item?.imageUrl ?? null)}
                      onDownload={item ? () => downloadDisplayImage(item) : downloadCurrentImage}
                      onSave={item ? (category) => void saveDisplayImage(item, category) : saveCurrentImage}
                      onDelete={item ? () => void deleteStageImage(index, item) : () => void deleteCurrentImage()}
                      onPreview={(target) => setPreviewImage(target)}
                      onEdit={item ? startEditSession : undefined}
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : activeTab === 'batchCreate' ? (
            <BatchCreateView
              user={user}
              models={models}
              gptImagePricing={gptImagePricing}
              modelCreditPricing={modelCreditPricing}
              providerRouting={providerRouting}
              onLogin={() => {
                setAuthMode('login');
                setAuthOpen(true);
              }}
              onPurchase={openPurchasePage}
              onCreditsChange={(creditsRemaining) => {
                setUser((current) => current ? { ...current, creditsRemaining } : current);
                void fetchMe().then(setUser).catch(() => undefined);
              }}
              onGenerationComplete={() => {
                void loadHistory();
                if (user?.isAdmin) void loadAdminSection('dashboard');
              }}
            />
          ) : activeTab === 'history' ? (
            <HistoryView records={historyRecords} onPreview={setPreviewImage} />
          ) : activeTab === 'chat' ? (
            <ChatView
              loggedIn={Boolean(user)}
              username={user?.username}
              creditsRemaining={getAvailableUserCredits(user, 'general')}
              onCreditsChange={(creditsRemaining) => {
                setUser((current) => current ? { ...current, creditsRemaining } : current);
                void fetchMe().then(setUser).catch(() => undefined);
              }}
              onLogin={() => {
                setAuthMode('login');
                setAuthOpen(true);
              }}
            />
          ) : activeTab === 'apiDocs' ? (
            <ApiDocsView
              onNotice={setNotice}
              gptImagePricing={gptImagePricing}
              user={user}
              onRequireLogin={() => {
                setAuthMode('login');
                setAuthOpen(true);
              }}
            />
          ) : (
            <AdminView
              users={adminOverview.users}
              usersPage={adminOverview.usersPage}
              records={adminOverview.records}
              recordsPage={adminOverview.recordsPage}
              inviteCodes={adminOverview.inviteCodes}
              inviteCodesPage={adminOverview.inviteCodesPage}
              adminCredits={adminOverview.adminCredits}
              dashboardStats={adminOverview.dashboardStats}
              providerMetrics={adminOverview.providerMetrics}
              providerRisks={adminOverview.providerRisks}
              generationRanking={adminOverview.generationRanking}
              providerRouting={providerRouting}
              modelCreditPricing={modelCreditPricing}
              recordsStats={adminOverview.recordsStats}
              recordModelOptions={adminOverview.recordModelOptions}
              recordResolutionOptions={adminOverview.recordResolutionOptions}
              loading={adminLoading}
              onCreateInviteCode={handleCreateInviteCode}
              onCreateInviteCodesBatch={handleCreateInviteCodesBatch}
              onDeleteInviteCode={handleDeleteInviteCode}
              onDeleteInviteCodesBatch={handleDeleteInviteCodesBatch}
              onRechargeInviteCode={handleRechargeInviteCode}
              onReclaimInviteCode={handleReclaimInviteCode}
              onRechargeUser={handleRechargeUserCredits}
              onDeductUser={handleDeductUserCredits}
              onDeleteUser={handleDeleteAdminUser}
              onUpdateProviderRouting={handleUpdateProviderRouting}
              onUpdateModelCreditPricing={handleUpdateModelCreditPricing}
              onLoadSection={loadAdminSection}
              onPreview={setPreviewImage}
              onNotice={setNotice}
            />
          )}

          <aside className={activeTab === 'create' && creationMode === 'image' ? 'overflow-visible rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.012)_0%,rgba(255,255,255,0)_100%)] px-3 py-3 sm:px-4 sm:pt-4 lg:h-full lg:overflow-hidden lg:rounded-none lg:border-0 lg:pb-[calc(env(safe-area-inset-bottom)+12px)]' : 'hidden'}>
            {editVersions.length > 0 && currentImage ? (
              <ContinuousEditPanel
                versions={editVersions}
                currentImage={currentImage}
                instruction={editInstruction}
                locks={editLocks}
                loading={loading}
                creditsCost={selectedModelCredits}
                creditsRemaining={selectedAvailableCredits}
                onInstructionChange={(value) => setEditInstruction(value.slice(0, MAX_PROMPT_LENGTH))}
                onToggleLock={toggleEditLock}
                onSelectVersion={(image) => {
                  setCurrentImage(image);
                  setGenerationError('');
                }}
                onSubmit={(event) => void handleContinueEdit(event)}
                onClose={() => {
                  setEditVersions([]);
                  setEditInstruction('');
                }}
              />
            ) : (
            <div className="grid content-start gap-5 lg:h-full">
            <SidePanel
              title="收藏区"
              count={sideFavoriteItems.length}
              icon={<Star size={14} className="text-violet-300" />}
              actionLabel="下载"
              onAction={() => {
                const target = sideFavoriteItems[0];
                if (target) {
                  void downloadDisplayImage(target);
                }
              }}
              items={sideFavoriteItems}
              emptyText="看到满意的图，就把它放进这里。"
              onMove={moveSavedImageToMain}
              onDelete={deleteSavedImage}
              loggedIn={Boolean(user)}
            />

            <SidePanel
              title="备份区"
              count={sideBackupItems.length}
              icon={<Bookmark size={14} className="text-pink-300" />}
              actionLabel="全部合并"
              onAction={handleMergeAll}
              items={sideBackupItems}
              emptyText="暂时拿不准的图，先放这里备用。"
              onMove={moveSavedImageToMain}
              onDelete={deleteSavedImage}
              loggedIn={Boolean(user)}
            />

            <SidePanel
              title="丢弃区"
              count={sideDiscardedItems.length}
              icon={<Trash2 size={14} className="text-zinc-400" />}
              actionLabel="清空"
              onAction={() => {
                if (user) {
                  void clearCategory('discarded');
                }
              }}
              items={sideDiscardedItems}
              emptyText="不满意的图先放这里，后面统一复盘。"
              onMove={moveSavedImageToMain}
              onDelete={deleteSavedImage}
              loggedIn={Boolean(user)}
            />

            {user ? (
              <button
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white"
                type="button"
                onClick={() => void clearCategory('backup')}
              >
                清空备份区
              </button>
            ) : null}
            </div>
            )}
          </aside>
        </div>
      </div>

      {notificationOpen && user ? (
        <section
          className="fixed right-3 top-[62px] z-[60] flex h-[min(380px,calc(100dvh-76px))] w-[min(320px,calc(100vw-24px))] flex-col overflow-hidden rounded-[17px] border border-[#2a2a2d] bg-[#090909]/[0.99] shadow-[0_18px_48px_rgba(0,0,0,0.56)] sm:right-5 sm:top-[58px]"
          style={{ fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif' }}
        >
          <header className="flex h-[54px] shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="tracking-[-0.01em]"
                style={{ color: '#ff5966', fontSize: 15, fontWeight: 800, lineHeight: '20px' }}
              >
                {'\u901a\u77e5'}
              </div>
              {notificationPayload.unreadCount > 0 ? <span className="rounded-full border border-[#ff5966]/30 bg-[#ff5966]/10 px-1.5 py-0.5 text-[9px] font-extrabold text-[#ff8992]">{`${notificationPayload.unreadCount} \u6761\u672a\u8bfb`}</span> : null}
            </div>
            <div className="flex items-center gap-2">
              {notificationPayload.unreadCount > 0 ? <button className="inline-flex min-h-0 items-center gap-1 px-1.5 py-1 text-[10px] font-semibold text-[#6f7079] transition hover:text-[#d4d4d8]" type="button" onClick={() => void handleReadAllNotifications()}><CheckCheck size={12} />{'\u5168\u90e8\u5df2\u8bfb'}</button> : null}
              <button className="flex h-8 w-8 items-center justify-center rounded-full border border-[#2b2b2e] text-[#696a73] transition hover:border-[#444449] hover:text-[#f4f4f5]" type="button" aria-label={'\u5173\u95ed\u901a\u77e5\u4e2d\u5fc3'} onClick={() => setNotificationOpen(false)}><X size={16} /></button>
            </div>
          </header>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
            {notificationPayload.notifications.length ? notificationPayload.notifications.map((item) => (
              <button
                className="block w-full border-b border-[#202023] px-3.5 py-4 text-left transition last:border-b-0 hover:bg-white/[0.035]"
                key={item.id}
                type="button"
                onClick={() => { if (!item.read) void handleReadNotification(item.id); }}
              >
                <span className="block min-w-0">
                  <span className="block whitespace-pre-wrap break-words tracking-[-0.01em]" style={{ color: '#f2f2f5', fontSize: 14, fontWeight: 800, lineHeight: '23px' }}>
                    {'\u901a\u77e5\uff1a'}{item.content || item.title}
                  </span>
                  <span className="mt-2 block" style={{ color: '#666873', fontSize: 11, fontWeight: 500, lineHeight: '16px' }}>{formatNotificationTime(item.publishedAt || item.createdAt)}</span>
                </span>
              </button>
            )) : <div className="flex h-full min-h-52 flex-col items-center justify-center px-5 text-center"><Bell className="text-[#45464e]" size={25} /><p className="mt-3 text-xs font-semibold text-[#686a74]">{'\u6682\u65f6\u6ca1\u6709\u901a\u77e5'}</p></div>}
          </div>
        </section>
      ) : null}

      {previewImage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-3 py-3 sm:px-4 sm:py-6">
          <button className="absolute inset-0 cursor-zoom-out" type="button" onClick={() => setPreviewImage(null)} />
          <div className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#090909] shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{previewImage.prompt}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {displayModelName(previewImage.modelName)} / {previewImage.dimensions}
                  {previewImage.imageSize ? ` / ${previewImage.imageSize}` : ''}
                </p>
              </div>
              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  type="button"
                  disabled={isOriginalImageExpired(previewImage.createdAt)}
                  onClick={() => {
                    if (!isOriginalImageExpired(previewImage.createdAt)) {
                      void downloadDisplayImage(previewImage);
                    }
                  }}
                >
                  <Download size={14} />
                  {isOriginalImageExpired(previewImage.createdAt) ? '原图已过期' : '原图'}
                </button>
                <button
                  className="rounded-xl border border-white/10 p-2 text-zinc-400 transition hover:text-white"
                  type="button"
                  onClick={() => setPreviewImage(null)}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3 sm:p-4">
              {isVideoAssetUrl(previewImage.imageUrl) ? (
                <video
                  className="max-h-[calc(100dvh-11rem)] max-w-full object-contain sm:max-h-[78vh]"
                  src={previewImage.imageUrl}
                  controls
                  autoPlay
                  playsInline
                />
              ) : (
                <img
                  alt={previewImage.prompt}
                  className="max-h-[calc(100dvh-11rem)] max-w-full object-contain sm:max-h-[78vh]"
                  src={isOriginalImageExpired(previewImage.createdAt) ? previewImage.thumbnailUrl || previewImage.imageUrl : previewImage.imageUrl}
                  onError={(event) => fallbackToThumbnail(event, previewImage.thumbnailUrl)}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {promoCouponOpen && activePromoCoupon ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-4 backdrop-blur-sm">
          <button className="absolute inset-0" type="button" onClick={() => void closePromoCoupon()} aria-label="关闭优惠券弹窗" />
          <div className="relative z-10 w-full max-w-[440px] overflow-hidden rounded-[30px] border border-[#ff8fcd]/30 bg-[#0c080b] shadow-[0_28px_90px_rgba(219,92,168,0.28)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_0%,rgba(255,143,205,0.34),transparent_34%),radial-gradient(circle_at_100%_22%,rgba(219,92,168,0.18),transparent_38%)]" />
            <div className="relative p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[12px] font-black uppercase tracking-[0.24em] text-[#ffb7df]">PIXORY COUPON</p>
                  <h2 className="mt-2 text-2xl font-black text-white">今日专属 {promoCouponDiscountLabel}券</h2>
                </div>
                <button
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-zinc-400 transition hover:border-[#ff8fcd]/40 hover:text-white"
                  type="button"
                  onClick={() => void closePromoCoupon()}
                  aria-label="关闭"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="mt-5 rounded-[24px] border border-[#ff8fcd]/30 bg-[#23101a]/80 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-[#ffd9ef]">购买积分可用</p>
                  </div>
                  <div className="text-right">
                    <p className="text-5xl font-black leading-none text-white">{promoCouponDiscountRate}</p>
                    <p className="text-sm font-black text-[#ffb7df]">折优惠</p>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-white/8 bg-black/25 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#ffd9ef]">
                      <Clock3 size={14} />
                      距离失效
                    </span>
                    <span className="font-mono text-lg font-black tabular-nums tracking-[0.08em] text-white">
                      {promoCouponCountdown}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">有效期至 {promoCouponExpiresText || '12 小时后'}</p>
                </div>
                {activePromoCoupon.redemptionCode ? (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/25 px-3 py-2 text-[13px] text-zinc-300">
                    <span className="min-w-0 truncate">
                      结算优惠码：<span className="font-black tracking-[0.08em] text-white">{activePromoCoupon.redemptionCode}</span>
                    </span>
                    <button
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-zinc-400 transition hover:border-[#ff8fcd]/40 hover:bg-[#ff8fcd]/10 hover:text-[#ffd9ef]"
                      type="button"
                      title="复制优惠码"
                      aria-label="复制优惠码"
                      onClick={() => void copyPromoCouponCode()}
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
                <button
                  className="rounded-2xl border border-pink-300/30 bg-[linear-gradient(90deg,#ff8fcd_0%,#db5ca8_100%)] px-4 py-3 text-sm font-black text-white shadow-[0_16px_34px_rgba(219,92,168,0.24)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
                  type="button"
                  onClick={() => void openPromoPurchasePage()}
                  disabled={promoCouponClaiming}
                  aria-busy={promoCouponClaiming}
                >
                  {promoCouponClaiming
                    ? '正在领取优惠券...'
                    : activePromoCoupon.redemptionCode
                      ? '复制优惠码并去购买'
                      : '立即使用优惠券'}
                </button>
                <button
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-400 transition hover:border-white/20 hover:text-white"
                  type="button"
                  onClick={() => void closePromoCoupon()}
                >
                  稍后再说
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {redeemInviteOpen && user && user.canRedeemInvite !== false && !user.username.toLowerCase().startsWith('invite-') ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-4 backdrop-blur-sm">
          <div className="card w-full max-w-md p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">{'\u79ef\u5206\u5145\u503c'}</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{'\u5151\u6362\u79ef\u5206'}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  {'\u5151\u6362\u540e\uff0c\u9080\u8bf7\u7801\u4e2d\u7684\u5168\u90e8\u79ef\u5206\u5c06\u8f6c\u5165\u5f53\u524d\u8d26\u53f7\uff0c\u8be5\u9080\u8bf7\u7801\u968f\u5373\u5931\u6548\u3002'}
                </p>
              </div>
              <button
                className="btn-secondary min-h-0 p-2"
                type="button"
                aria-label="Close redeem invite dialog"
                onClick={() => setRedeemInviteOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <form className="mt-6 grid gap-4" onSubmit={handleRedeemInvite}>
              <label className="grid gap-2 text-sm text-zinc-300">
                <span>{'\u9080\u8bf7\u7801'}</span>
                <div className="input flex items-center gap-3">
                  <Sparkles size={16} className="text-violet-300" />
                  <input
                    autoFocus
                    className="w-full bg-transparent uppercase tracking-[0.18em] outline-none placeholder:normal-case placeholder:tracking-normal"
                    placeholder={'\u8bf7\u8f93\u5165\u8d2d\u4e70\u7684\u9080\u8bf7\u7801'}
                    value={redeemInviteValue}
                    onChange={(event) => setRedeemInviteValue(event.target.value.trim().toUpperCase())}
                  />
                </div>
              </label>
              {redeemInviteError ? <div className="app-alert app-alert-error">{redeemInviteError}</div> : null}
              <button
                className="btn-primary px-4 py-3 text-sm font-black disabled:opacity-60"
                disabled={redeemingInvite}
                type="submit"
              >
                {redeemingInvite ? '\u5151\u6362\u4e2d...' : '\u786e\u8ba4\u5151\u6362'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {authOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-4 backdrop-blur-sm">
          <div className="card auth-card max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                  {authMode === 'invite' ? '邀请码' : authMode === 'login' ? '登录' : '注册'}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {authMode === 'invite' ? '填写内测邀请码' : authMode === 'login' ? '进入工作台' : '创建账号'}
                </h2>
              </div>
              <button
                className="btn-secondary min-h-0 p-2"
                type="button"
                onClick={() => setAuthOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form className="mt-6 grid gap-4" onSubmit={handleAuthSubmit}>
              {authMode === 'invite' ? (
                <label className="grid gap-2 text-sm text-zinc-300">
                  <span>邀请码</span>
                  <div className="input flex items-center gap-3">
                    <Sparkles size={16} className="text-zinc-500" />
                    <input
                      className="w-full bg-transparent uppercase tracking-[0.18em] outline-none placeholder:normal-case placeholder:tracking-normal"
                      placeholder="请输入邀请码"
                      value={authForm.inviteCode}
                      onChange={(event) =>
                        setAuthForm((current) => ({ ...current, inviteCode: event.target.value.trim().toUpperCase() }))
                      }
                    />
                  </div>
                </label>
              ) : (
                <>
                  <label className="grid gap-2 text-sm text-zinc-300">
                    <span>用户名</span>
                    <div className="input flex items-center gap-3">
                      <UserRound size={16} className="text-zinc-500" />
                      <input
                        className="w-full bg-transparent outline-none"
                        value={authForm.username}
                        onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
                      />
                    </div>
                  </label>

                  <label className="grid gap-2 text-sm text-zinc-300">
                    <span>密码</span>
                    <input
                      className="input"
                      type="password"
                      value={authForm.password}
                      onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                    />
                  </label>

                  {authMode === 'register' ? (
                    <label className="grid gap-2 text-sm text-zinc-300">
                      <span>邮箱（可选）</span>
                      <input
                        className="input"
                        value={authForm.email}
                        onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                      />
                    </label>
                  ) : null}
                </>
              )}

              {authError ? (
                <div className="app-alert app-alert-error">
                  {authError}
                </div>
              ) : null}

              <button
                className="btn-primary px-4 py-3 text-sm font-black disabled:opacity-60"
                disabled={authLoading}
                type="submit"
              >
                {authLoading ? '提交中...' : authMode === 'invite' ? '进入体验' : authMode === 'login' ? '登录' : '注册'}
              </button>
            </form>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
              <button
                className="btn-ghost min-h-0 px-0 py-0 text-sm"
                type="button"
                onClick={() => setAuthMode((current) => (current === 'register' ? 'login' : 'register'))}
              >
                {authMode === 'register' ? '已有账号？去登录' : '没有账号？去注册'}
              </button>
              <button className="btn-ghost min-h-0 px-0 py-0 text-sm" type="button" onClick={() => setAuthMode('invite')}>
                填写邀请码
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
