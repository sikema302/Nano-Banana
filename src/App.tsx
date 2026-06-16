import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  Clock3,
  Code2 as CodeIcon,
  Copy,
  Download,
  ImagePlus,
  Info,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  Minus,
  Plus,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import {
  clearSession,
  createPublicApiKey,
  createInviteCode,
  deletePublicApiKey,
  deleteInviteCode as deleteInviteCodeRequest,
  fetchAdminDashboard,
  fetchAdminInviteCodes,
  fetchAdminOverview,
  fetchAdminRecords,
  fetchAdminUsers,
  fetchPublicApiKeys,
  deleteImage,
  fetchHealth,
  fetchMe,
  fetchModels,
  fetchUserHistory,
  fetchUserImages,
  generateImage,
  getStoredUser,
  login,
  loginWithInvite,
  moveImage,
  reclaimInviteCodeCredits as reclaimInviteCodeCreditsRequest,
  register,
  revokePublicApiKey,
  type AdminDashboardStats,
  type AdminRecordsStats,
  type AdminUserSummary,
  type CreditSummary,
  type GeneratedImagePayload,
  type GenerationRecord,
  type ImageCategory,
  type InviteCodeInfo,
  type ModelInfo,
  type PaginationInfo,
  type PublicApiKeyInfo,
  type ReferenceUploadInput,
  type SavedImage,
  type UserInfo,
} from './lib/api';

interface UploadPreview {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  previewUrl: string;
}

interface DisplayImage extends GeneratedImagePayload {
  imageUrl: string;
  savedImageId?: number;
  category?: ImageCategory;
}

const defaultModels: ModelInfo[] = [
  { id: 'gpt-image-2', name: 'GPT Image 2', description: 'OpenAI\u6700\u5f3a\u751f\u56fe\u6a21\u578b\uff01' },
  { id: 'Nano_Banana_Pro', name: 'Nano Banana Pro', description: '\u8c37\u6b4c\u6700\u5f3a\u751f\u56fe\u6a21\u578b\uff01' },
];

type DimensionOption = '1:1' | '3:2' | '16:9' | '4:3' | '9:16' | '3:4' | '2:3' | '21:9';
type ImageSizeOption = 'STANDARD' | '2K' | '4K';
type GptQualityOption = 'low' | 'medium' | 'high';
type AppTab = 'create' | 'history' | 'apiDocs' | 'admin';
type AdminSection = 'dashboard' | 'invites' | 'users' | 'records' | 'apiKeys';

const APP_TAB_PATHS: Record<AppTab, string> = {
  create: '/',
  history: '/history',
  apiDocs: '/apidoc',
  admin: '/manage',
};

function getTabPath(tab: AppTab) {
  return APP_TAB_PATHS[tab] || '/';
}

function getTabFromPath(pathname: string, canAccessAdmin: boolean) {
  if (pathname === '/history') return 'history';
  if (pathname === '/apidoc') return 'apiDocs';
  if (pathname === '/manage') return canAccessAdmin ? 'admin' : 'create';
  return 'create';
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

const emptyRecordsStats: AdminRecordsStats = {
  todayCreditsUsed: 0,
  todayRecordCount: 0,
  totalCreditsUsed: 0,
  mostUsedModel: '',
  mostActiveHour: '',
};

const MAX_REFERENCES = 9;
const MAX_PROMPT_LENGTH = 8000;
const MAX_BATCH_COUNT = 5;
const ADMIN_STATS_TIME_ZONE = 'Asia/Shanghai';

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
  { value: 'low', label: '\u4f4e' },
  { value: 'medium', label: '\u4e2d' },
  { value: 'high', label: '\u9ad8' },
];

const imageSizeOptions: Array<{ value: ImageSizeOption; label: string; hint: string }> = [
  { value: '2K', label: '2K', hint: '\u7a33\u5b9a\u9ad8\u6e05\u8f93\u51fa' },
  { value: '4K', label: '4K', hint: '\u8d85\u6e05\u8f93\u51fa\uff0c\u7ec6\u8282\u66f4\u5f3a' },
];

function fileToBase64(file: File) {

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

function toDisplayImage(payload: GeneratedImagePayload): DisplayImage {
  return {
    ...payload,
    imageUrl: payload.imagePath,
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

function getModelCredits(
  model: Pick<ModelInfo, 'id' | 'creditsCost'> | null,
  options?: {
    imageSize?: ImageSizeOption;
    optimizeChineseText?: boolean;
  },
) {
  if (!model) return 0;
  if (model.id === 'gpt-image-2') {
    if (options?.imageSize === '4K') return 36;
    if (options?.imageSize === '2K') return 28;
    return 20;
  }
  if (model.id === 'Nano_Banana_Pro') {
    const baseCredits = typeof model.creditsCost === 'number' ? model.creditsCost : 24;
    return baseCredits + (options?.optimizeChineseText ? 8 : 0);
  }
  if (typeof model.creditsCost === 'number') return model.creditsCost;
  return 1;
}

function getModelSortOrder(modelId: string) {
  if (modelId === 'gpt-image-2') return 0;
  if (modelId === 'Nano_Banana_Pro') return 1;
  return 99;
}

function getModelSuccessRate(modelId: string) {
  if (modelId === 'gpt-image-2') return '成功率 99%';
  return '';
}

function CreditsSummary({
  user,
  selectedModel,
  onOpenPurchase,
}: {
  user: UserInfo | null;
  selectedModel: ModelInfo | null;
  onOpenPurchase: () => void;
}) {
  const creditsRemaining = typeof user?.creditsRemaining === 'number' ? user.creditsRemaining : null;
  const creditsCost = getModelCredits(selectedModel);
  const insufficientCredits = creditsRemaining !== null && creditsRemaining < creditsCost;

  return (
    <div className="space-y-1 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-zinc-300">
          使用积分: <span className="text-white">{creditsCost}</span>/<span className="text-white">{creditsRemaining ?? '--'}</span>
        </span>
        <button
          className="font-semibold text-sky-400 transition hover:text-sky-300"
          type="button"
          onClick={onOpenPurchase}
        >
          在线购买积分(20%优惠)
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
  showActions,
  onDownload,
  onSave,
  onDelete,
  onPreview,
}: {
  item: DisplayImage | null;
  loading?: boolean;
  showActions?: boolean;
  onDownload?: () => void;
  onSave?: (category: ImageCategory) => void;
  onDelete?: () => void;
  onPreview?: (item: DisplayImage) => void;
}) {
  return (
    <article className="stage-card relative flex min-h-[118px] flex-col overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,12,14,0.98)_0%,rgba(8,8,10,0.98)_100%)] p-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)] sm:h-[118px] sm:flex-row sm:p-3">
      <div
        className={`relative h-40 w-full shrink-0 overflow-hidden rounded-[18px] border sm:h-full sm:w-[112px] ${
          loading ? 'border-pink-300/25 bg-pink-300/10' : 'border-white/8 bg-black/45'
        }`}
      >
        {loading ? (
          <div className="generation-orbit flex h-full w-full items-center justify-center">
            <Sparkles size={18} className="text-pink-100" />
          </div>
        ) : item ? (
          <button className="h-full w-full" type="button" onClick={() => onPreview?.(item)}>
            <img alt={item.prompt} className="h-full w-full object-cover" src={item.imageUrl} />
          </button>
        ) : (
          <div className="flex h-full w-full items-center justify-center border border-dashed border-white/10 text-[11px] font-semibold text-zinc-400">
            Empty
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex min-w-0 flex-1 flex-col justify-center rounded-[18px] border border-white/6 bg-black/35 px-4 py-3 sm:ml-3 sm:py-0">
          <div className="flex items-center gap-3 text-sm font-semibold text-white">
            <LoaderCircle className="animate-spin text-pink-200" size={16} />
            Preparing your canvas...
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="generation-scan h-full w-1/2 rounded-full bg-[linear-gradient(90deg,transparent,#ff8fcd,#fff1f8,transparent)]" />
          </div>
        </div>
      ) : item ? (
        <div className="flex min-w-0 flex-1 flex-col justify-between rounded-[18px] border border-white/6 bg-black/35 px-4 py-3 sm:ml-3">
          <div className="min-w-0">
            <button
              className="block max-w-full truncate text-left text-sm font-semibold text-white hover:text-pink-200"
              type="button"
              onClick={() => onPreview?.(item)}
            >
              {item.prompt}
            </button>
            <p className="mt-1 text-xs text-zinc-500">
              {item.modelName} / {item.dimensions}
              {item.imageSize ? ` / ${item.imageSize}` : ''}
            </p>
          </div>
          {showActions ? (
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-100 transition hover:bg-emerald-500/20"
                type="button"
                onClick={() => onSave?.('favorite')}
              >
                <Star size={13} />
                满意
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-pink-400/25 bg-pink-500/10 px-2.5 py-1.5 text-xs text-pink-100 transition hover:bg-pink-500/20"
                type="button"
                onClick={() => onSave?.('backup')}
              >
                <Bookmark size={13} />
                备份
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-xs text-zinc-200 transition hover:border-white/20 hover:text-white"
                type="button"
                onClick={onDownload}
              >
                <Download size={13} />
                下载
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/25 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-100 transition hover:bg-rose-500/20"
                type="button"
                onClick={onDelete}
              >
                <Trash2 size={13} />
                删除
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center rounded-[18px] border border-pink-300/10 bg-[linear-gradient(180deg,rgba(255,143,205,0.08)_0%,rgba(0,0,0,0.16)_100%)] px-4 py-3 text-sm font-semibold text-pink-100 sm:ml-3 sm:py-0">
          Ready for your next prompt
        </div>
      )}
    </article>
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
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-white/20 hover:text-white"
            type="button"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>

      <div className="min-h-[138px] rounded-2xl border border-white/8 bg-black/40 p-3">
        {items.length > 0 ? (
          <div className="custom-scrollbar flex max-w-full gap-3 overflow-x-auto overflow-y-hidden pb-1">
            {items.map((item) => (
              <article key={item.id} className="w-36 shrink-0 rounded-2xl border border-white/8 bg-white/[0.03] p-2.5">
                <img alt={item.prompt} className="h-20 w-full rounded-xl object-cover" src={item.imageUrl} />
                <p className="mt-2 text-xs leading-5 text-zinc-300">{item.prompt}</p>
                <p className="mt-2 text-[11px] text-zinc-500">{formatTime(item.createdAt)}</p>

                {loggedIn ? (
                  <div className="mt-2 flex gap-2">
                    {onMove ? (
                      <button
                        className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-300 transition hover:border-white/20 hover:text-white"
                        type="button"
                        onClick={() => onMove(item)}
                      >
                        移回主区
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-300 transition hover:border-white/20 hover:text-white"
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
    <section className="min-h-0 overflow-auto px-3 py-3 sm:px-5 sm:py-4 lg:h-full lg:overflow-hidden">
      <div className="flex min-h-[420px] flex-col rounded-[20px] border border-white/8 bg-black/35 lg:h-full lg:min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">历史记录</h2>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>排序</span>
            <select
              className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 outline-none"
              value={sortKey}
              onChange={(event) => {
                setSortKey(event.target.value as 'createdAt' | 'creditsUsed' | 'modelName');
                setPage(1);
              }}
            >
              <option className="bg-[#111]" value="createdAt">时间最新</option>
              <option className="bg-[#111]" value="creditsUsed">积分消耗</option>
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
                <th className="px-4 py-2 font-medium">积分</th>
                <th className="px-4 py-2 font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {pageRecords.map((item) => (
                <tr key={item.id} className="h-14 text-zinc-300">
                  <td className="px-4 py-2">
                    <button className="h-10 w-10 overflow-hidden rounded-lg bg-black" type="button" onClick={() => onPreview(item)}>
                      <img alt={item.prompt} className="h-full w-full object-cover" src={item.imageUrl} />
                    </button>
                  </td>
                  <td className="max-w-[520px] truncate px-4 py-2 text-white">{item.prompt}</td>
                  <td className="px-4 py-2">{item.modelName}</td>
                  <td className="px-4 py-2">
                    {item.dimensions}
                    {item.imageSize ? ` / ${item.imageSize}` : ''}
                  </td>
                  <td className="px-4 py-2 text-sky-200">{item.creditsUsed}</td>
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

function ApiDocsView({ onNotice }: { onNotice: (message: string) => void }) {
  const [copiedText, setCopiedText] = useState('');
  const baseUrl = typeof window === 'undefined' ? 'https://pixory.top' : window.location.origin;
  const apiKeyPlaceholder = 'px_your_api_key';
  const requestExample = JSON.stringify(
    {
      model: 'nano-banana-pro',
      prompt: '将两张参考图融合成一张高级感产品海报，保留主体轮廓和品牌色',
      images: ['https://example.com/reference-1.png', 'https://example.com/reference-2.png'],
      aspectRatio: '1:1',
      imageSize: '2K',
      optimizeChineseText: true,
      replyType: 'json',
    },
    null,
    2,
  );
  const successExample = `{
  "image": {
    "prompt": "...",
    "modelName": "Nano Banana Pro",
    "dimensions": "1:1",
    "imageSize": "2K",
    "imagePath": "https://pixory.top/uploads/generated/xxx.png",
    "referenceImages": ["https://example.com/reference-1.png"],
    "createdAt": "2026-06-15T00:00:00.000Z"
  },
  "usage": {
    "creditsUsed": 32,
    "remainingCredits": 968
  }
}`;
  const errorExample = `{
  "error": "API Key 额度不足，需要 32，剩余 12"
}`;
  const requestRows = [
    ['model', 'string', '是', '支持 gpt-image-2、Nano_Banana_Pro；也兼容 nano-banana-pro 写法。'],
    ['prompt', 'string', '是', '图像提示词。建议写清主体、画面、风格、尺寸用途和需要避免的内容。'],
    ['images', 'string[]', '否', '参考图 URL 数组，最多 9 张。也兼容旧字段 reference_images。'],
    ['aspectRatio', 'string', '否', '比例或常见像素值，例如 1:1、16:9、2048x2048。也兼容旧字段 dimensions。'],
    ['imageSize', 'string', '否', 'STANDARD、2K、4K。Nano Banana Pro 默认 2K，GPT Image 2 默认 STANDARD。'],
    ['quality', 'string', '否', 'GPT Image 2 可传 low、medium、high；不传会自动匹配。'],
    ['optimizeChineseText', 'boolean', '否', 'Nano Banana Pro 中文增强，开启后额外消耗 8 积分。'],
    ['replyType', 'string', '否', '当前推荐传 json；字段会保留兼容，不影响返回结构。'],
  ];
  const modelRows = [
    { model: 'gpt-image-2', name: 'GPT Image 2', cost: 'STANDARD 20 / 2K 28 / 4K 36', note: '适合高质量通用生图，支持 quality 参数。' },
    { model: 'nano-banana-pro', name: 'Nano Banana Pro', cost: '2K 24 / 4K 24，中文增强 +8', note: '适合参考图重绘、融合、商品图和中文场景增强。' },
  ];
  const ratioRows = [
    ['1:1', '1024x1024 / 2048x2048 / 2880x2880'],
    ['16:9', '1280x720 / 2048x1152 / 3840x2160'],
    ['9:16', '720x1280 / 1152x2048 / 2160x3840'],
    ['4:3', '1152x864 / 2048x1536 / 3264x2448'],
    ['3:4', '864x1152 / 1536x2048 / 2448x3264'],
    ['3:2', '1536x1024 / 2016x1344 / 3504x2336'],
    ['2:3', '1024x1536 / 1344x2016 / 2336x3504'],
    ['21:9', '1456x624 / 3024x1296 / 3696x1584'],
  ];
  const endpointSections = [
    {
      id: 'gpt-image-2',
      label: 'gpt-image-2 接口',
      title: 'gpt-image-2 接口',
      subtitle: '适合通用高质量生图。通过同一个 PIXORY 入口调用，model 固定传 gpt-image-2。',
      model: 'gpt-image-2',
      endpointPath: '/v1/api/generate',
      compatiblePaths: ['/api/v1/generate', '/v1/api/generate', '/v1/images/generations', '/openapi/v1/images/generations', '/v1/chat/completions'],
      request: JSON.stringify(
        {
          model: 'gpt-image-2',
          prompt: '生成一张高级感黑金香水产品图，摄影棚布光，超清细节',
          images: [],
          aspectRatio: '2048x2048',
          quality: 'medium',
          replyType: 'json',
        },
        null,
        2,
      ),
      bullets: ['支持 1:1、16:9、9:16 等比例，也兼容常见像素值。', 'STANDARD / 2K / 4K 会按 imageSize 或像素值自动计费。'],
    },
    {
      id: 'nano-banana',
      label: 'nano-banana 接口',
      title: 'nano-banana 接口',
      subtitle: '适合参考图重绘、融合、商品图改版和中文场景增强。model 可传 nano-banana-pro。',
      model: 'nano-banana-pro',
      endpointPath: '/v1/api/nano-banana',
      compatiblePaths: ['/api/v1/generate', '/v1/api/nano-banana'],
      request: requestExample,
      bullets: ['参考图建议使用 HTTPS 图片 URL，最多 9 张。', '开启 optimizeChineseText 会额外消耗 8 积分。'],
    },
  ];

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

  return (
    <section className="custom-scrollbar h-full overflow-auto px-4 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto grid max-w-[1600px] gap-6">
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-white/10 bg-[#11131a] p-3 lg:sticky lg:top-24 lg:self-start">
            <p className="px-2 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">API 文档</p>
            <div className="mt-3 grid gap-1.5 text-sm">
              {[
                ['1', 'gpt-image-2 接口', '#gpt-image-2'],
                ['2', 'nano-banana 接口', '#nano-banana'],
                ['3', '价格说明', '#pricing'],
              ].map(([index, title, desc]) => (
                <a key={title} className="flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white" href={desc}>
                  <span className="font-mono text-xs font-black text-cyan-300">{index}</span>
                  {title}
                </a>
              ))}
            </div>
          </aside>

          <div className="space-y-8">
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
if (!response.ok) throw new Error(result.error || 'Generate failed');
console.log(result.image.imagePath);`;
              const sectionModels = modelRows.filter((item) =>
                section.id === 'gpt-image-2' ? item.model === 'gpt-image-2' : item.model === 'nano-banana-pro',
              );

              return (
                <div key={section.id} id={section.id} className="scroll-mt-28 space-y-5">
                  <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#11131a]">
                    <div className="border-b border-white/10 px-5 py-5">
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-orange-500/15 px-2.5 py-1 text-xs font-black text-orange-300">POST</span>
                        <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-black text-emerald-200">同步返回结果</span>
                      </div>
                      <h1 className="text-[1.7rem] font-black text-white">{section.title}</h1>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{section.subtitle}</p>
                    </div>
                    <div className="p-4">
                      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3 md:flex-row md:items-center">
                        <span className="flex-none rounded-md bg-orange-500/15 px-2.5 py-1 text-xs font-black text-orange-300">POST</span>
                        <code className="min-w-0 flex-1 break-all text-sm font-black text-sky-100">{baseUrl}</code>
                      </div>
                      <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3">
                        <div className="text-xs font-bold text-zinc-500">兼容路径</div>
                        <div className="mt-2 grid gap-2">
                          {section.compatiblePaths.map((path) => (
                            <code key={path} className="break-all rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-black text-zinc-100">{path}</code>
                          ))}
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
                            不要把 <code className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-sky-200">{apiKeyPlaceholder}</code> 写进网页前端代码，避免密钥泄露和额度被盗刷。
                          </p>
                        </div>
                      </div>
                    </article>
                    <article className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-start gap-3">
                        <KeyRound size={18} className="mt-0.5 text-sky-200" />
                        <div>
                          <h3 className="text-base font-black text-white">按 Key 扣额度</h3>
                          <p className="mt-1 text-sm leading-6 text-zinc-400">生成成功后按模型扣减额度，失败会自动退回预扣额度；额度不足会直接拒绝。</p>
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
                      <pre className="mt-3 overflow-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-xs leading-6 text-zinc-200">{`Authorization: Bearer ${apiKeyPlaceholder}
Content-Type: application/json`}</pre>
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
                        <h2 className="text-base font-black text-white">gpt-image-2 像素比例说明</h2>
                      </div>
                      <div className="grid gap-2 p-5 text-xs md:grid-cols-2 xl:grid-cols-4">
                        {ratioRows.map(([ratio, pixels]) => (
                          <div key={`${section.id}-${ratio}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <code className="font-mono font-black text-sky-200">{ratio}</code>
                            <p className="mt-2 leading-5 text-zinc-500">{pixels}</p>
                          </div>
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
                        <pre className="overflow-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-xs leading-6 text-zinc-200">{sectionCurl}</pre>
                      </div>
                      <div className="space-y-3 xl:col-span-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-black text-white">JavaScript</h3>
                          <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300" type="button" onClick={() => void copyText(sectionJs, `${section.id}-js`)}>
                            {copiedText === `${section.id}-js` ? '已复制' : '复制'}
                          </button>
                        </div>
                        <pre className="overflow-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-xs leading-6 text-zinc-200">{sectionJs}</pre>
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
                        <div className="flex items-center gap-2 text-sm font-black text-white"><span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">200</span>生成成功</div>
                        <pre className="overflow-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-xs leading-6 text-zinc-200">{successExample}</pre>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-black text-white"><span className="rounded-md bg-red-500/15 px-2 py-0.5 text-xs text-red-200">400 / 401 / 402 / 500</span>生成失败</div>
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

            <div className="grid gap-4 xl:grid-cols-2">
              <section id="pricing" className="scroll-mt-28 rounded-[24px] border border-white/10 bg-[#10131b] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black text-white">价格说明</h2>
                    <p className="mt-1 text-sm text-zinc-500">生成成功后按模型扣减 API Key 额度，失败会自动退回预扣额度。</p>
                  </div>
                  <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-black text-cyan-100">按张计费</span>
                </div>
                <div className="mt-4 grid gap-3">
                  {modelRows.map((item) => (
                    <article key={item.model} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-black text-white">{item.name}</h3>
                          <code className="mt-2 inline-flex rounded-lg border border-cyan-300/15 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">{item.model}</code>
                        </div>
                        <span className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-black text-amber-100">{item.cost}</span>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-zinc-500">{item.note}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-[22px] border border-white/8 bg-black/35 p-5">
                <h2 className="text-base font-black text-white">比例 / 像素别名</h2>
                <div className="mt-4 grid gap-2 text-xs">
                  {ratioRows.map(([ratio, pixels]) => (
                    <div key={ratio} className="grid gap-2 rounded-xl border border-white/8 bg-white/[0.03] p-3 sm:grid-cols-[72px_1fr]">
                      <code className="font-mono font-black text-cyan-100">{ratio}</code>
                      <span className="text-zinc-500">{pixels}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>

      </div>
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
        <table className="min-w-[760px] w-full text-left text-xs">
          <thead className="bg-white/[0.04] text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">名称</th>
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
                  <div>{item.keyPreview}</div>
                  {!item.copyable ? <div className="mt-1 text-[11px] text-amber-300/80">旧 Key 暂不可复制</div> : null}
                </td>
                <td className="px-3 py-3">
                  <span className="font-semibold text-sky-200">{item.remainingCredits}</span>
                  <span className="text-zinc-500"> / {item.totalCredits}</span>
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

function AdminView({
  users,
  usersPage,
  records,
  recordsPage,
  inviteCodes,
  inviteCodesPage,
  adminCredits,
  dashboardStats,
  recordsStats,
  recordModelOptions,
  recordResolutionOptions,
  loading,
  onCreateInviteCode,
  onDeleteInviteCode,
  onReclaimInviteCode,
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
  recordsStats: AdminRecordsStats;
  recordModelOptions: string[];
  recordResolutionOptions: string[];
  loading: boolean;
  onCreateInviteCode: (
    credits: number,
    options?: { quiet?: boolean; refresh?: boolean },
  ) => Promise<InviteCodeInfo | null | undefined>;
  onDeleteInviteCode: (code: string) => Promise<void>;
  onReclaimInviteCode: (code: string, credits: number) => Promise<void>;
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
  const [reclaimingCode, setReclaimingCode] = useState('');
  const [copiedCode, setCopiedCode] = useState('');
  const [inviteBatchCount, setInviteBatchCount] = useState(1);
  const [batchCopied, setBatchCopied] = useState(false);
  const [generatedInviteCodes, setGeneratedInviteCodes] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedInviteCodes, setSelectedInviteCodes] = useState<string[]>([]);
  const [inviteStatusFilter, setInviteStatusFilter] = useState<InviteStatusFilter>('all');
  const [inviteSortMode, setInviteSortMode] = useState<InviteSortMode>('created-desc');
  const [inviteSearch, setInviteSearch] = useState('');
  const [invitePage, setInvitePage] = useState(1);
  const [userSearch, setUserSearch] = useState('');
  const [userSortMode, setUserSortMode] = useState<UserSortMode>('recent-desc');
  const [userPage, setUserPage] = useState(1);
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
  const dashboardLowCreditUserCount = dashboardStats.lowCreditUserCount || lowCreditUsers.length;
  const dashboardUserCount = dashboardStats.userCount || usersPage.total || users.length;
  const dashboardInviteCodeCount = dashboardStats.inviteCodeCount || inviteCodesPage.total || inviteCodes.length;
  const dashboardRecordCount = dashboardStats.recordCount || recordsPage.total || records.length;
  const todayCreditsUsed = dashboardStats.todayCreditsUsed || todayRecords.reduce((sum, item) => sum + item.creditsUsed, 0);
  const totalInviteCodes = dashboardStats.inviteCodeCount || inviteCodesPage.total || inviteCodes.length;
  const usedInviteCodes = dashboardStats.usedInviteCodeCount || inviteCodes.filter((item) => Boolean(item.redeemedBy)).length;
  const currentInviteUsageRate = dashboardStats.inviteUsageRate || (totalInviteCodes > 0 ? Math.round((usedInviteCodes / totalInviteCodes) * 100) : 0);

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
  const hasAdminData = users.length > 0 || records.length > 0 || inviteCodes.length > 0;

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

  useEffect(() => {
    setInvitePage(1);
  }, [inviteStatusFilter, inviteSortMode, inviteSearch]);

  useEffect(() => {
    setRecordPage(1);
  }, [recordUserFilter, recordModelFilter, recordResolutionFilter, recordRange]);

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
      const nextCodes: string[] = [];
      for (let index = 0; index < normalizedInviteBatchCount; index += 1) {
        const inviteCode = await onCreateInviteCode(normalizedCredits, {
          quiet: true,
          refresh: index === normalizedInviteBatchCount - 1,
        });
        if (!inviteCode?.code) {
          throw new Error('\u9080\u8bf7\u7801\u751f\u6210\u5931\u8d25');
        }
        nextCodes.push(inviteCode.code);
      }
      setCredits(100);
      setInviteBatchCount(1);
      if (nextCodes.length > 0) {
        setGeneratedInviteCodes(nextCodes);
        setBatchCopied(false);
        onNotice(`\u5df2\u751f\u6210 ${nextCodes.length} \u4e2a\u9080\u8bf7\u7801`);
      }
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
      for (const code of availableCodes) {
        await onDeleteInviteCode(code);
      }
      setSelectedInviteCodes([]);
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

  const menuItems: Array<{ id: AdminSection; label: string; hint: string }> = [
    { id: 'dashboard', label: '看板', hint: '今日概览' },
    { id: 'invites', label: '邀请码', hint: '发码与回收' },
    { id: 'apiKeys', label: 'API Key', hint: '发放与停用' },
    { id: 'users', label: '用户', hint: '余额与活跃' },
    { id: 'records', label: '生图记录', hint: '模型与消耗' },
  ];

  return (
    <section className="flex min-h-0 flex-col overflow-auto px-3 py-3 sm:px-4 sm:py-4 lg:h-full lg:overflow-hidden lg:px-5">
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="flex flex-col rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.02)_100%)] p-3">
          <div className="mb-4 rounded-[18px] border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Admin Console</p>
            <p className="mt-2 text-lg font-black text-white">后台管理</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">邀请码、用户、记录和运行状态集中处理。</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {menuItems.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  className={
                    active
                      ? 'rounded-[18px] border border-sky-400/30 bg-sky-400/12 px-4 py-3 text-left'
                      : 'rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-left transition hover:border-white/15 hover:bg-white/[0.05]'
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
                  <span className={active ? 'mt-1 block text-[11px] text-sky-100/80' : 'mt-1 block text-[11px] text-zinc-500'}>{item.hint}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex min-h-0 flex-col overflow-visible pr-0 lg:overflow-hidden lg:pr-1">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-visible lg:overflow-hidden">
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
            <div className="rounded-[22px] border border-white/8 bg-black/35 p-4">
              <h2 className="text-base font-black text-white">数据概览</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-xs text-zinc-500">用户总数</p>
                  <p className="mt-2 text-2xl font-black text-white">{dashboardUserCount}</p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-xs text-zinc-500">邀请码总数</p>
                  <p className="mt-2 text-2xl font-black text-white">{dashboardInviteCodeCount}</p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-xs text-zinc-500">生图记录总数</p>
                  <p className="mt-2 text-2xl font-black text-white">{dashboardRecordCount}</p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-xs text-zinc-500">低积分提醒</p>
                  <p className="mt-2 text-2xl font-black text-amber-200">{dashboardLowCreditUserCount}</p>
                </div>
              </div>
            </div>
            </>
            ) : null}

            {loading && !hasAdminData ? (
              <div className="grid gap-4">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="rounded-[22px] border border-white/8 bg-black/35 p-4">
                    <div className="h-5 w-40 animate-pulse rounded-full bg-white/10" />
                    <div className="mt-4 space-y-3">
                      {[0, 1, 2, 3].map((row) => (
                        <div key={row} className="h-12 animate-pulse rounded-2xl bg-white/[0.05]" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {section === 'invites' ? (
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-white/8 bg-black/35 p-4">
                {loading && hasAdminData ? (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[22px] bg-black/40 backdrop-blur-[1px]">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-sm text-zinc-200">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      刷新中...
                    </div>
                  </div>
                ) : null}
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
                      value={inviteSearch}
                      onChange={(event) => setInviteSearch(event.target.value)}
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
                          className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40"
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
                {loading && hasAdminData ? (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[22px] bg-black/40 backdrop-blur-[1px]">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-sm text-zinc-200">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      刷新中...
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-white">用户信息与 Key 使用页</h2>
                    <p className="mt-1 text-xs text-zinc-500">支持按用户 ID / 邀请码前缀搜索，点击最近生成可切换活跃排序。</p>
                  </div>
                  <div className="flex w-full items-center gap-2 md:w-auto">
                    <input
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none md:w-72"
                      placeholder="搜索用户 ID、用户名、invite-/admin/credit-"
                      value={userSearch}
                      onChange={(event) => {
                        setUserSearch(event.target.value);
                        setUserPage(1);
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
                    <table className="min-w-[1040px] w-full table-fixed text-left text-xs">
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
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/6">
                        {pagedUsers.map((item) => {
                          const usageRate = item.totalCredits > 0 ? (item.usedCredits / item.totalCredits) * 100 : 0;
                          const trend = item.usageTrend || usageTrendByUserId[item.userId] || Array.from({ length: 7 }, () => 0);
                          const inviteCode = item.inviteCode || invitePrefixesByUserId[item.userId]?.[0] || '';
                          return (
                            <tr key={item.userId} className="text-zinc-300">
                              <td className="px-3 py-3 font-semibold text-white">{item.username}</td>
                              <td className="max-w-[240px] truncate px-3 py-3 text-zinc-500">{item.userId}</td>
                              <td className="max-w-[180px] truncate px-3 py-3 font-mono text-zinc-400">{inviteCode || '-'}</td>
                              <td className="px-3 py-3">{item.generations}</td>
                              <td className="px-3 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-semibold text-white">{item.remainingCredits}</span>
                                  <span className="text-zinc-500">/ {item.totalCredits}</span>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#22d3ee_100%)]" style={{ width: `${100 - usageRate}%` }} />
                                </div>
                                <div className="mt-1 text-[11px] text-zinc-500">使用率 {formatPercent(usageRate)}</div>
                              </td>
                              <td className="px-3 py-3">
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
                              <td className="px-3 py-3">{item.lastGeneratedAt ? formatTime(item.lastGeneratedAt) : '暂无'}</td>
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
                {loading && hasAdminData ? (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[22px] bg-black/40 backdrop-blur-[1px]">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-sm text-zinc-200">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      刷新中...
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-white">生图记录页</h2>
                    <p className="mt-1 text-xs text-zinc-500">按模型、时间、用户和分辨率筛选，快速找出高消耗和高活跃记录。</p>
                  </div>
                  <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-5">
                    <input
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none"
                      placeholder="搜索用户 / 邀请码 / 提示词"
                      value={recordUserFilter}
                      onChange={(event) => setRecordUserFilter(event.target.value)}
                    />
                    <select
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none"
                      value={recordModelFilter}
                      onChange={(event) => setRecordModelFilter(event.target.value)}
                    >
                      <option value="all">全部模型</option>
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

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs text-zinc-500">当日消耗积分</p>
                    <p className="mt-2 text-2xl font-black text-sky-200">{filteredTodayRecordCredits}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs text-zinc-500">当日生成图片数量</p>
                    <p className="mt-2 text-2xl font-black text-violet-200">{filteredTodayRecordCount}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs text-zinc-500">总消耗积分</p>
                    <p className="mt-2 text-2xl font-black text-white">{filteredRecordCredits}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs text-zinc-500">最常用模型</p>
                    <p className="mt-2 text-2xl font-black text-amber-200">{displayMostUsedModel}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs text-zinc-500">最活跃时段</p>
                    <p className="mt-2 text-2xl font-black text-emerald-200">{displayMostActiveHour ? `${displayMostActiveHour}:00` : '暂无'}</p>
                  </div>
                </div>

                <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
                  {filteredRecords.length > 0 ? (
                    <>
                    <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
                    <table className="min-w-[1100px] w-full table-fixed text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-[#0a0a0a] text-zinc-500">
                        <tr className="border-b border-white/8">
                          <th className="w-24 px-3 py-2 font-medium">图片</th>
                          <th className="px-3 py-2 font-medium">用户</th>
                          <th className="px-3 py-2 font-medium">邀请码</th>
                          <th className="px-3 py-2 font-medium">模型</th>
                          <th className="px-3 py-2 font-medium">比例 / 分辨率</th>
                          <th className="px-3 py-2 font-medium">积分消耗</th>
                          <th className="px-3 py-2 font-medium">提示词</th>
                          <th className="px-3 py-2 font-medium">时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/6">
                        {pagedRecords.map((item) => (
                          <tr key={item.id} className="align-top text-zinc-300">
                            <td className="px-3 py-3">
                              <button className="h-[72px] w-[72px] overflow-hidden rounded-2xl bg-black" type="button" onClick={() => onPreview(item)}>
                                <img alt={item.prompt} className="h-full w-full object-cover transition hover:scale-105" src={item.imageUrl} />
                              </button>
                            </td>
                            <td className="px-3 py-3 font-semibold text-white">{item.username}</td>
                            <td className="max-w-[180px] truncate px-3 py-3 font-mono text-zinc-500">{item.inviteCode || '-'}</td>
                            <td className="px-3 py-3">{item.modelName}</td>
                            <td className="px-3 py-3">
                              {item.dimensions}
                              {item.imageSize ? ` / ${item.imageSize}` : ''}
                            </td>
                            <td className={`px-3 py-3 font-black ${getCreditsTone(item.creditsUsed)}`}>{item.creditsUsed}</td>
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
                    <div className="py-10 text-center text-sm text-zinc-500">当前筛选条件下暂无生图记录</div>
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
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([...defaultModels].sort((left, right) => getModelSortOrder(left.id) - getModelSortOrder(right.id)));
  const [selectedModel, setSelectedModel] = useState('gpt-image-2');
  const [prompt, setPrompt] = useState('');
  const [dimensions, setDimensions] = useState<DimensionOption>('1:1');
  const [imageSize, setImageSize] = useState<ImageSizeOption>('STANDARD');
  const [gptQuality, setGptQuality] = useState<GptQualityOption>('medium');
  const [optimizeChineseText, setOptimizeChineseText] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [autoPlace] = useState(true);
  const [draggingReferences, setDraggingReferences] = useState(false);
  const [references, setReferences] = useState<UploadPreview[]>([]);
  const [favorites, setFavorites] = useState<SavedImage[]>([]);
  const [backup, setBackup] = useState<SavedImage[]>([]);
  const [discarded, setDiscarded] = useState<SavedImage[]>([]);
  const [currentImage, setCurrentImage] = useState<DisplayImage | null>(null);
  const [historyQueue, setHistoryQueue] = useState<DisplayImage[]>([]);
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
    recordsStats: emptyRecordsStats,
    recordModelOptions: [],
    recordResolutionOptions: [],
  });
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    if (typeof window === 'undefined') return 'create';
    return getTabFromPath(window.location.pathname, Boolean(getStoredUser()?.isAdmin));
  });
  const [previewImage, setPreviewImage] = useState<DisplayImage | SavedImage | GenerationRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingUserData, setLoadingUserData] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [healthText, setHealthText] = useState('正在检查本地服务...');
  const [healthError, setHealthError] = useState('');
  const [notice, setNotice] = useState('');
  const [wechatCopied, setWechatCopied] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'invite'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authForm, setAuthForm] = useState({ username: '', password: '', email: '', inviteCode: '' });

  const sideFavoriteItems = user ? favorites : [];
  const sideBackupItems = user ? backup : [];
  const sideDiscardedItems = user ? discarded : [];
  const isNanoBananaPro = selectedModel === 'Nano_Banana_Pro';
  const showGptQuality = selectedModel === 'gpt-image-2' && (imageSize === '2K' || imageSize === '4K');
  const selectedModelInfo = models.find((item) => item.id === selectedModel) || defaultModels.find((item) => item.id === selectedModel) || null;
  const selectedModelCredits = getModelCredits(selectedModelInfo, { imageSize, optimizeChineseText });
  const selectedResolutionOptions = isNanoBananaPro ? imageSizeOptions : gptImageSizeOptions;
  const selectedModelSuccessRate = getModelSuccessRate(selectedModel);
  const hasEnoughCredits =
    typeof user?.creditsRemaining === 'number' ? user.creditsRemaining >= selectedModelCredits * batchCount : true;

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
    } else if (storedUser) {
      setUser(storedUser);
      void fetchMe()
        .then(setUser)
        .catch(() => {
          clearSession();
          setUser(null);
        });
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    void loadPrivateData();
  }, [user]);

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
    setImageSize((current) => {
      if (modelId === 'Nano_Banana_Pro') {
        return current === '4K' ? '4K' : '2K';
      }
      return current === '2K' || current === '4K' ? current : 'STANDARD';
    });
    setGptQuality((current) => {
      if (modelId !== 'gpt-image-2') return current;
      if (imageSize === '4K') return 'high';
      if (imageSize === '2K') return current === 'low' || current === 'medium' || current === 'high' ? current : 'medium';
      return 'medium';
    });
    if (modelId !== 'Nano_Banana_Pro') {
      setOptimizeChineseText(false);
    }
  }

  async function appendReferenceFiles(files: File[]) {
    if (files.length === 0) return;

    const remaining = Math.max(0, MAX_REFERENCES - references.length);
    if (remaining === 0) {
      setNotice(`最多只能上传 ${MAX_REFERENCES} 张参考图`);
      return;
    }

    const next = await Promise.all(files.slice(0, remaining).map((file) => fileToBase64(file)));
    setReferences((current) => [...current, ...next].slice(0, MAX_REFERENCES));
  }

  function commitGeneratedImages(nextImages: DisplayImage[]) {
    if (nextImages.length === 0) return;

    if (autoPlace) {
      const latestImage = nextImages[nextImages.length - 1];
      const earlierImages = nextImages.slice(0, -1).reverse();
      setHistoryQueue((current) => [...earlierImages, ...(currentImage ? [currentImage, ...current] : current)].slice(0, 7));
      setCurrentImage(latestImage);
      return;
    }

    setHistoryQueue((current) => [...nextImages.slice().reverse(), ...current].slice(0, 7));
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
    } catch (error) {
      clearSession();
      setUser(null);
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

      if (section === 'dashboard') {
        const payload = await fetchAdminDashboard();
        setAdminOverview((current) => ({
          ...current,
          dashboardStats: payload.stats,
          adminCredits: payload.adminCredits,
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

  function openPurchasePage() {
    window.open('https://pay.ldxp.cn/shop/RHPYAKWG', '_blank', 'noopener,noreferrer');
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

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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

    setLoading(true);
    setNotice('');
    const generatedImages: DisplayImage[] = [];

    try {
      const referenceImages: ReferenceUploadInput[] = references.map((item) => ({
        name: item.name,
        mimeType: item.mimeType,
        data: item.data,
      }));

      for (let index = 0; index < batchCount; index += 1) {
        const response = await generateImage({
          prompt,
          model: selectedModel,
          dimensions,
          imageSize,
          quality: showGptQuality ? gptQuality : undefined,
          optimizeChineseText: isNanoBananaPro ? optimizeChineseText : false,
          reference_images: referenceImages,
        });

        generatedImages.push(toDisplayImage(response.image));
      }

      commitGeneratedImages(generatedImages);
      if (batchCount > 1) {
        setNotice(`\u5df2\u751f\u6210 ${generatedImages.length} \u5f20\u56fe\u7247`);
      }

      void fetchMe().then(setUser).catch(() => undefined);
      void loadHistory();
      if (user?.isAdmin) {
        void loadAdminSection('dashboard');
      }
    } catch (error) {
      if (generatedImages.length > 0) {
        commitGeneratedImages(generatedImages);
        setNotice(`\u5df2\u6210\u529f\u751f\u6210 ${generatedImages.length} \u5f20\u56fe\u7247\uff0c\u540e\u7eed\u8bf7\u6c42\u5931\u8d25\uff1a${error instanceof Error ? error.message : '\u751f\u6210\u5931\u8d25'}`);
      } else {
        setNotice(error instanceof Error ? error.message : '\u751f\u6210\u5931\u8d25');
      }
    } finally {
      setLoading(false);
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

  function downloadCurrentImage() {
    if (!currentImage) return;
    window.open(currentImage.imageUrl, '_blank', 'noopener,noreferrer');
  }

  function downloadDisplayImage(item: DisplayImage) {
    window.open(item.imageUrl, '_blank', 'noopener,noreferrer');
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

  async function deleteStageImage(index: number, item: DisplayImage) {
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

      if (index === 0) {
        setCurrentImage(historyQueue[0] || null);
        setHistoryQueue((current) => current.slice(1));
      } else {
        setHistoryQueue((current) => current.filter((_, queueIndex) => queueIndex !== index - 1));
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
      setNotice(`欢迎回来，${nextUser.username}`);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '登录失败');
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    clearSession();
    setUser(null);
    setFavorites([]);
    setBackup([]);
    setDiscarded([]);
    setHistoryRecords([]);
    setAdminOverview({
      users: [],
      records: [],
      recordsPage: emptyPage,
      inviteCodes: [],
      inviteCodesPage: emptyPage,
      adminCredits: { totalCredits: 0, usedCredits: 0, remainingCredits: 0 },
    });
    setActiveTab('create');
    setCurrentImage(null);
    setHistoryQueue([]);
    setNotice('已退出登录');
  }

  const stageCards = Array.from({ length: MAX_BATCH_COUNT }, (_, index) =>
    index === 0 ? currentImage : historyQueue[index - 1] || null,
  );

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
    { id: 'create', label: '创作', icon: <Sparkles size={15} /> },
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
                <span className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-zinc-500">
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

                  return (
                    <button
                      key={item.value}
                      className={`rounded-2xl border px-4 py-5 text-left transition ${
                        active
                          ? 'border-white bg-white text-black'
                          : 'border-white/10 bg-white/[0.04] text-white hover:border-white/20'
                      }`}
                      type="button"
                      onClick={() => setImageSize(item.value)}
                    >
                      <span className="block text-4xl font-black leading-none">{item.label}</span>
                      <span className={`mt-2 block text-xs font-semibold leading-5 ${active ? 'text-emerald-600' : 'text-emerald-300'}`}>
                        {item.hint}
                      </span>
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

            {notice ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-100">
                {notice}
              </div>
            ) : null}
            {healthError ? (
              <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {healthError}
              </div>
            ) : null}
            <CreditsSummary selectedModel={selectedModelInfo} user={user} onOpenPurchase={openPurchasePage} />

            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,#6623ff_0%,#8d46ff_50%,#7a3cff_100%)] px-4 py-4 text-base font-semibold text-white shadow-[0_12px_36px_rgba(110,49,255,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading || !!healthError || !user || !hasEnoughCredits}
              type="submit"
            >
              {loading ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
              {loading ? '生成中...' : user ? '生成' : '登录后生成'}
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
                loading={index === 0 && loading}
                showActions={Boolean(index === 0 && item && !loading && user)}
                onDownload={downloadCurrentImage}
                onSave={saveCurrentImage}
                onDelete={() => void deleteCurrentImage()}
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
                window.open(target.imageUrl, '_blank', 'noopener,noreferrer');
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
    <main className="min-h-[100dvh] overflow-x-hidden overflow-y-auto bg-[#060606] text-white lg:h-[100dvh] lg:overflow-hidden">
      <div className="flex min-h-[100dvh] flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.025)_0%,rgba(255,255,255,0)_18%)] lg:h-[100dvh] lg:overflow-hidden">
        <header className="shrink-0 flex flex-wrap items-center justify-between gap-4 border-b border-white/8 px-3 py-2.5 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl border border-pink-300/25 bg-[linear-gradient(135deg,#ffb3da_0%,#ff8fcd_45%,#db5ca8_100%)] shadow-[0_0_24px_rgba(255,143,205,0.32)]" />
            <span className="text-[30px] font-extrabold leading-none tracking-tight text-white">PIXORY</span>
          </div>

          <nav className="order-3 flex w-full overflow-x-auto rounded-xl border border-white/10 bg-white/[0.04] p-1 sm:order-none sm:w-auto">
            {tabs
              .filter((item) => !item.hidden)
              .map((item) => {
                const active = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                      active ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                    }`}
                    type="button"
                    onClick={() => handleTabChange(item.id)}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
          </nav>

          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
            <div className="hidden items-center gap-2 rounded-xl border border-pink-300/20 bg-[linear-gradient(135deg,rgba(255,143,205,0.12)_0%,rgba(219,92,168,0.06)_100%)] px-2 py-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] md:inline-flex">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white">微信</span>
                <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[12px] font-bold tracking-[0.04em] text-pink-50">lzp983813676</span>
                <button
                  className={
                    wechatCopied
                      ? 'inline-flex items-center gap-1 rounded-lg border border-emerald-300/20 bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-100 transition'
                      : 'inline-flex items-center gap-1 rounded-lg border border-pink-300/20 bg-pink-500/10 px-2 py-1 text-[11px] font-bold text-pink-100 transition hover:bg-pink-500/20'
                  }
                  type="button"
                  onClick={() => void handleCopyWechat()}
                >
                  <Copy size={11} />
                  {wechatCopied ? '已复制' : '复制'}
                </button>
              </div>
            </div>
            {/* 购买积分按钮 - 头部导航栏 */}
            <button
              className="hidden rounded-xl border border-pink-300/35 bg-[linear-gradient(135deg,#ff8fcd_0%,#db5ca8_100%)] px-3.5 py-2 text-xs font-black text-white shadow-[0_10px_22px_rgba(219,92,168,0.24)] transition hover:brightness-110 md:block"
              type="button"
              onClick={openPurchasePage}
            >
              购买积分
            </button>
            <div
              className="hidden"
              title={healthError || healthText}
            >
              <span className={healthError ? 'h-2.5 w-2.5 rounded-full bg-rose-400' : 'h-2.5 w-2.5 rounded-full bg-emerald-400'} />
            </div>
            {user ? (
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white"
                type="button"
                onClick={logout}
              >
                <LogOut size={14} />
                退出
              </button>
            ) : (
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white"
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
          <aside className={activeTab === 'create' ? 'overflow-visible rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.015)_0%,rgba(255,255,255,0)_100%)] px-3 pb-4 pt-3 lg:h-full lg:overflow-hidden lg:rounded-none lg:border-0 lg:border-r lg:pb-[calc(env(safe-area-inset-bottom)+8px)] lg:pt-2' : 'hidden'}>
            <form className="flex min-h-0 flex-col gap-2.5 pr-0 lg:h-full lg:overflow-hidden lg:pr-1" onSubmit={handleGenerate}>
              <section className="space-y-2">
                <div className="px-0.5 text-[13px] font-extrabold text-zinc-400">{'\u6a21\u578b\u9009\u62e9'}</div>
                <div className="relative">
                  <select
                    className="w-full rounded-2xl border border-white/12 bg-[#080808] px-4 py-2.5 pr-28 text-[13px] font-semibold text-white outline-none transition focus:border-[#ff8fcd]/45"
                    value={selectedModel}
                    onChange={(event) => handleModelSelect(event.target.value)}
                  >
                    {models.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  {selectedModelSuccessRate ? (
                    <span className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-zinc-500">
                      {selectedModelSuccessRate}
                    </span>
                  ) : null}
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-[12px] font-extrabold text-zinc-400">
                  <span>{'\u4e0a\u4f20\u53c2\u8003\u56fe\uff08\u53ef\u9009\uff09\uff08\u53ef\u4ece\u6587\u4ef6\u5939\u62d6\u62fd\u5230\u6b64\u533a\u57df\uff09'}</span>
                  <span className="shrink-0 text-[11px] text-zinc-500">{references.length} / {MAX_REFERENCES}</span>
                </div>
                <div
                  className={
                    draggingReferences
                      ? 'rounded-2xl border border-[#ff8fcd]/45 bg-[#130a12] p-2 shadow-[inset_0_0_0_1px_rgba(255,143,205,0.14)]'
                      : 'rounded-2xl border border-white/8 bg-[#050505] p-2'
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
                    <label className="flex h-[56px] w-[56px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/16 bg-[#080808] text-zinc-500 transition hover:border-[#ff8fcd]/45 hover:text-white">
                      <input className="hidden" type="file" accept="image/*" multiple onChange={handleReferenceUpload} />
                      <ImagePlus size={18} />
                      <span className="mt-1 text-[11px] font-bold">{'\u6dfb\u52a0'}</span>
                    </label>

                    {references.map((item) => (
                      <button
                        key={item.id}
                        className="group relative h-[56px] w-[56px] overflow-hidden rounded-2xl border border-white/10 bg-[#101010]"
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

              <section className="space-y-2">
                <div className="flex items-center justify-between text-[12px] font-extrabold text-zinc-400">
                  <span>{'\u56fe\u50cf\u63d0\u793a\u8bcd'}</span>
                  <span className="text-[11px] text-zinc-500">{prompt.length} / {MAX_PROMPT_LENGTH}</span>
                </div>
                <div>
                  <textarea
                    className="h-[96px] w-full resize-none rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-[13px] leading-5 text-white outline-none transition placeholder:text-zinc-600 focus:border-[#ff8fcd]/45"
                    placeholder="请详细描述您想生成的画面..."
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value.slice(0, MAX_PROMPT_LENGTH))}
                  />
                </div>
              </section>

              <div className={isNanoBananaPro ? 'grid gap-2 xl:grid-cols-[1.15fr_1fr]' : 'space-y-2'}>
                <section className="space-y-2">
                  <div className="text-[12px] font-extrabold text-zinc-400">{'\u6e05\u6670\u5ea6'}</div>
                  <div className={isNanoBananaPro ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-3 gap-2'}>
                    {selectedResolutionOptions.map((item) => {
                      const active = imageSize === item.value;

                      return (
                        <button
                          key={item.value}
                          className={
                            active
                              ? 'rounded-xl bg-[#ffd9ef] px-3 py-2 text-[#341425] shadow-[0_10px_22px_rgba(255,217,239,0.08)]'
                              : 'rounded-xl border border-white/10 bg-[#0b0b0b] px-3 py-2 text-zinc-400 transition hover:border-white/20 hover:text-white'
                          }
                          type="button"
                          onClick={() => {
                            setImageSize(item.value);
                            if (selectedModel === 'gpt-image-2') {
                              if (item.value === '4K') {
                                setGptQuality('high');
                              } else if (item.value === '2K') {
                                setGptQuality('medium');
                              }
                            }
                          }}
                        >
                          <span className="block text-[13px] font-black leading-none">{item.label}</span>
                          {item.hint ? (
                            <span className={active ? 'mt-1 block truncate text-[10px] font-semibold text-[#744960]' : 'mt-1 block truncate text-[10px] font-semibold text-zinc-500'}>
                              {item.hint}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {showGptQuality ? (
                  <section className="space-y-2">
                    <div className="text-[12px] font-extrabold text-zinc-400">{'\u8d28\u91cf'}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {gptQualityOptions.map((item) => {
                        const active = gptQuality === item.value;

                        return (
                          <button
                            key={item.value}
                          className={
                            active
                                ? 'rounded-xl bg-[#ffd9ef] px-3 py-2 text-[#341425] shadow-[0_10px_22px_rgba(255,217,239,0.08)]'
                                : 'rounded-xl border border-white/10 bg-[#0b0b0b] px-3 py-2 text-zinc-400 transition hover:border-white/20 hover:text-white'
                          }
                          type="button"
                          onClick={() => setGptQuality(item.value)}
                        >
                          <span className="block text-[13px] font-black leading-none">{item.label}</span>
                        </button>
                      );
                    })}
                    </div>
                  </section>
                ) : null}

                {isNanoBananaPro ? (
                  <section className="space-y-2">
                    <div className="flex items-center gap-1.5 text-[12px] font-extrabold text-zinc-400">
                      <span>{'AI\u589e\u5f3a'}</span>
                      <Info size={13} className="text-zinc-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className={
                          optimizeChineseText
                            ? 'rounded-xl border border-white/10 bg-[#0b0b0b] px-3 py-2 text-zinc-400 transition hover:border-white/20 hover:text-white'
                            : 'rounded-xl bg-[#ffd9ef] px-3 py-2 text-[#341425] shadow-[0_10px_22px_rgba(255,217,239,0.08)]'
                        }
                        type="button"
                        onClick={() => setOptimizeChineseText(false)}
                      >
                          <span className="block text-[13px] font-black leading-none">{'\u5173'}</span>
                      </button>
                      <button
                        className={
                          optimizeChineseText
                            ? 'rounded-xl bg-[#ffd9ef] px-3 py-2 text-[#341425] shadow-[0_10px_22px_rgba(255,217,239,0.08)]'
                            : 'rounded-xl border border-white/10 bg-[#0b0b0b] px-3 py-2 text-zinc-400 transition hover:border-white/20 hover:text-white'
                        }
                        type="button"
                        onClick={() => setOptimizeChineseText(true)}
                      >
                          <span className="block text-[13px] font-black leading-none">{'\u5f00'}</span>
                      </button>
                    </div>
                  </section>
                ) : null}
              </div>

              <section className="space-y-2">
                <div className="text-[12px] font-extrabold text-zinc-400">{'\u753b\u9762\u6bd4\u4f8b'}</div>
                <div className="grid grid-cols-4 gap-1.5 md:grid-cols-8">
                  {dimensionOptions.map(({ value, label }) => {
                    const active = value === dimensions;

                    return (
                      <button
                        key={value}
                          className={
                            active
                              ? 'rounded-xl bg-[#ffd9ef] px-2.5 py-2 text-[12px] font-black text-[#341425] shadow-[0_8px_18px_rgba(255,217,239,0.08)]'
                              : 'rounded-xl border border-white/10 bg-[#0b0b0b] px-2.5 py-2 text-[12px] font-black text-zinc-400 transition hover:border-white/20 hover:text-white'
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
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] font-extrabold text-zinc-400">
                  <span>
                    {'\u4f7f\u7528\u79ef\u5206\uff1a'}<span className="text-white">{selectedModelCredits * batchCount}</span>/<span className="text-white">{user?.creditsRemaining ?? 0}</span>
                  </span>
                  <button className="text-[#ff8fcd] transition hover:text-[#ffb0dd]" type="button" onClick={openPurchasePage}>
                    {'\u5728\u7ebf\u8d2d\u4e70\u79ef\u5206(20%\u4f18\u60e0)'}
                  </button>
                </div>
                {!user ? (
                  <button
                    className="group mt-1.5 inline-flex h-9 min-w-[150px] items-center justify-center gap-1.5 rounded-lg border border-[#ff8fcd]/45 bg-[linear-gradient(180deg,rgba(255,143,205,0.12)_0%,rgba(219,92,168,0.06)_100%)] px-3.5 text-[15px] font-black text-[#ffd9ef] shadow-[0_10px_22px_rgba(219,92,168,0.14),inset_0_0_0_1px_rgba(255,255,255,0.03)] transition hover:-translate-y-0.5 hover:border-[#ffd1ea] hover:bg-[linear-gradient(180deg,rgba(255,143,205,0.2)_0%,rgba(219,92,168,0.09)_100%)] hover:text-white"
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

              {healthError ? (
                <div className="rounded-[20px] border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-[12px] text-rose-100">{healthError}</div>
              ) : null}

              <div className="grid gap-2.5 pt-1 xl:mt-auto xl:grid-cols-[200px_minmax(0,1fr)]">
                <div className="rounded-2xl border border-white/10 bg-[#0b0b0b] p-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-black text-white">{'\u6570\u91cf'}</span>
                    <div className="flex items-center overflow-hidden rounded-xl border border-[#db5ca8] bg-[#341625]">
                      <button
                        className="flex h-9 w-9 items-center justify-center text-[#ffd9ef] transition hover:bg-white/5 disabled:opacity-40"
                        type="button"
                        disabled={batchCount <= 1}
                        onClick={() => setBatchCount((current) => Math.max(1, current - 1))}
                      >
                        <Minus size={15} />
                      </button>
                      <span className="flex h-9 w-10 items-center justify-center border-x border-[#db5ca8] text-[14px] font-black text-white">{batchCount}</span>
                      <button
                        className="flex h-9 w-9 items-center justify-center text-[#ffd9ef] transition hover:bg-white/5 disabled:opacity-40"
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
                  className="flex min-h-[76px] items-center justify-center gap-2.5 rounded-2xl bg-[linear-gradient(90deg,#ff8fcd_0%,#db5ca8_100%)] px-5 py-3.5 text-[16px] font-black text-white shadow-[0_16px_30px_rgba(219,92,168,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading || !!healthError || !user || !hasEnoughCredits}
                  type="submit"
                >
                  {loading ? <LoaderCircle className="animate-spin" size={20} /> : <Sparkles size={19} />}
                  {loading ? '\u4e0b\u5355\u4e2d...' : user ? '\u4e0b\u5355' : '\u767b\u5f55\u540e\u4e0b\u5355'}
                </button>
              </div>
            </form>
          </aside>

          {activeTab === 'create' ? (
            <section className="overflow-visible rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.01)_0%,rgba(255,255,255,0)_100%)] px-3 py-3 sm:px-5 sm:pt-4 lg:min-h-0 lg:overflow-hidden lg:rounded-none lg:border-y-0 lg:border-l-0 lg:border-r lg:pb-[calc(env(safe-area-inset-bottom)+12px)]">
              <div className="grid auto-rows-auto gap-3 pr-0 lg:h-full lg:auto-rows-[118px] lg:overflow-hidden lg:pr-1">
                {stageCards.map((item, index) => (
                  <div key={index}>
                    <StageCard
                      item={item}
                      loading={index === 0 && loading}
                      showActions={Boolean(item && !(index === 0 && loading) && user)}
                      onDownload={item ? () => downloadDisplayImage(item) : downloadCurrentImage}
                      onSave={item ? (category) => void saveDisplayImage(item, category) : saveCurrentImage}
                      onDelete={item ? () => void deleteStageImage(index, item) : () => void deleteCurrentImage()}
                      onPreview={(target) => setPreviewImage(target)}
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : activeTab === 'history' ? (
            <HistoryView records={historyRecords} onPreview={setPreviewImage} />
          ) : activeTab === 'apiDocs' ? (
            <ApiDocsView onNotice={setNotice} />
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
              recordsStats={adminOverview.recordsStats}
              recordModelOptions={adminOverview.recordModelOptions}
              recordResolutionOptions={adminOverview.recordResolutionOptions}
              loading={adminLoading}
              onCreateInviteCode={handleCreateInviteCode}
              onDeleteInviteCode={handleDeleteInviteCode}
              onReclaimInviteCode={handleReclaimInviteCode}
              onLoadSection={loadAdminSection}
              onPreview={setPreviewImage}
              onNotice={setNotice}
            />
          )}

          <aside className={activeTab === 'create' ? 'overflow-visible rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.012)_0%,rgba(255,255,255,0)_100%)] px-3 py-3 sm:px-4 sm:pt-4 lg:h-full lg:overflow-hidden lg:rounded-none lg:border-0 lg:pb-[calc(env(safe-area-inset-bottom)+12px)]' : 'hidden'}>
            <div className="grid content-start gap-5 lg:h-full">
            <SidePanel
              title="收藏区"
              count={sideFavoriteItems.length}
              icon={<Star size={14} className="text-violet-300" />}
              actionLabel="下载"
              onAction={() => {
                const target = sideFavoriteItems[0];
                if (target) {
                  window.open(target.imageUrl, '_blank', 'noopener,noreferrer');
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
      </div>

      {previewImage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-3 py-3 sm:px-4 sm:py-6">
          <button className="absolute inset-0 cursor-zoom-out" type="button" onClick={() => setPreviewImage(null)} />
          <div className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#090909] shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{previewImage.prompt}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {previewImage.modelName} / {previewImage.dimensions}
                  {previewImage.imageSize ? ` / ${previewImage.imageSize}` : ''}
                </p>
              </div>
              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:text-white"
                  type="button"
                  onClick={() => window.open(previewImage.imageUrl, '_blank', 'noopener,noreferrer')}
                >
                  <Download size={14} />
                  原图
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
              <img alt={previewImage.prompt} className="max-h-[calc(100dvh-11rem)] max-w-full object-contain sm:max-h-[78vh]" src={previewImage.imageUrl} />
            </div>
          </div>
        </div>
      ) : null}

      {authOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-4">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/10 bg-[#0b0b0c] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:p-6">
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
                className="rounded-xl border border-white/10 p-2 text-zinc-400 transition hover:border-white/20 hover:text-white"
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
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
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
                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
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
                      className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none"
                      type="password"
                      value={authForm.password}
                      onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                    />
                  </label>

                  {authMode === 'register' ? (
                    <label className="grid gap-2 text-sm text-zinc-300">
                      <span>邮箱（可选）</span>
                      <input
                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none"
                        value={authForm.email}
                        onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                      />
                    </label>
                  ) : null}
                </>
              )}

              {authError ? (
                <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {authError}
                </div>
              ) : null}

              <button
                className="rounded-2xl border border-pink-300/30 bg-[linear-gradient(90deg,#ff8fcd_0%,#db5ca8_100%)] px-4 py-3 text-sm font-black text-white shadow-[0_16px_34px_rgba(219,92,168,0.24)] transition hover:brightness-110 disabled:opacity-60"
                disabled={authLoading}
                type="submit"
              >
                {authLoading ? '提交中...' : authMode === 'invite' ? '进入体验' : authMode === 'login' ? '登录' : '注册'}
              </button>
            </form>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
              <button
                className="transition hover:text-white"
                type="button"
                onClick={() => setAuthMode((current) => (current === 'register' ? 'login' : 'register'))}
              >
                {authMode === 'register' ? '已有账号？去登录' : '没有账号？去注册'}
              </button>
              <button className="transition hover:text-white" type="button" onClick={() => setAuthMode('invite')}>
                填写邀请码
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
