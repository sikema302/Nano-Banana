import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useState } from 'react';
import {
  Bookmark,
  Clock3,
  Copy,
  Download,
  ImagePlus,
  Info,
  LoaderCircle,
  LogIn,
  LogOut,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import {
  clearSession,
  createInviteCode,
  deleteInviteCode as deleteInviteCodeRequest,
  fetchAdminOverview,
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
  type AdminUserSummary,
  type CreditSummary,
  type GeneratedImagePayload,
  type GenerationRecord,
  type ImageCategory,
  type InviteCodeInfo,
  type ModelInfo,
  type PaginationInfo,
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
type AppTab = 'create' | 'history' | 'admin';

interface AdminOverviewState {
  users: AdminUserSummary[];
  records: GenerationRecord[];
  recordsPage: PaginationInfo;
  inviteCodes: InviteCodeInfo[];
  inviteCodesPage: PaginationInfo;
  adminCredits: CreditSummary;
}

const emptyPage: PaginationInfo = {
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1,
};

const MAX_REFERENCES = 9;
const MAX_PROMPT_LENGTH = 8000;

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
  { value: 'STANDARD', label: '\u6807\u51c6', hint: '20 \u79ef\u5206' },
  { value: '2K', label: '2K', hint: '28 \u79ef\u5206' },
  { value: '4K', label: '4K', hint: '36 \u79ef\u5206' },
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

const promptTemplate = ['\u4e3b\u4f53\uff1a', '\u573a\u666f\uff1a', '\u98ce\u683c\uff1a', '\u955c\u5934\uff1a', '\u5149\u7ebf\uff1a', '\u7ec6\u8282\uff1a'].join('\n');

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
          在线购买积分(25%优惠)
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
    <article className="stage-card relative flex h-[140px] overflow-hidden rounded-[22px] border border-white/8 bg-[#080808] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)]">
      <div
        className={`relative h-full w-[112px] shrink-0 overflow-hidden rounded-[18px] border ${
          loading ? 'border-sky-400/25 bg-sky-400/10' : 'border-white/8 bg-black/45'
        }`}
      >
        {loading ? (
          <div className="generation-orbit flex h-full w-full items-center justify-center">
            <Sparkles size={18} className="text-sky-100" />
          </div>
        ) : item ? (
          <button className="h-full w-full" type="button" onClick={() => onPreview?.(item)}>
            <img alt={item.prompt} className="h-full w-full object-cover" src={item.imageUrl} />
          </button>
        ) : (
          <div className="flex h-full w-full items-center justify-center border border-dashed border-white/10 text-xs font-semibold text-zinc-400">
            灶台空闲中
          </div>
        )}
      </div>

      {loading ? (
        <div className="ml-3 flex min-w-0 flex-1 flex-col justify-center rounded-[18px] border border-white/6 bg-black/35 px-4">
          <div className="flex items-center gap-3 text-sm font-semibold text-white">
            <LoaderCircle className="animate-spin text-sky-200" size={16} />
            等待下单...
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="generation-scan h-full w-1/2 rounded-full bg-[linear-gradient(90deg,transparent,#38bdf8,#f8fafc,transparent)]" />
          </div>
        </div>
      ) : item ? (
        <div className="ml-3 flex min-w-0 flex-1 flex-col justify-between rounded-[18px] border border-white/6 bg-black/35 px-4 py-3">
          <div className="min-w-0">
            <button
              className="block max-w-full truncate text-left text-sm font-semibold text-white hover:text-sky-200"
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-400/25 bg-fuchsia-500/10 px-2.5 py-1.5 text-xs text-fuchsia-100 transition hover:bg-fuchsia-500/20"
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
        <div className="ml-3 flex min-w-0 flex-1 items-center rounded-[18px] border border-white/6 bg-black/35 px-4 text-sm font-semibold text-white">
          等待下单...
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
    <section className="h-full overflow-hidden px-5 py-4">
      <div className="flex h-full min-h-0 flex-col rounded-[20px] border border-white/8 bg-black/35">
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
          <table className="min-w-full text-left text-xs">
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
        <div className="flex items-center justify-between border-t border-white/8 px-4 py-3 text-xs text-zinc-400">
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

function AdminView({
  users,
  records,
  recordsPage,
  inviteCodes,
  inviteCodesPage,
  adminCredits,
  loading,
  onCreateInviteCode,
  onDeleteInviteCode,
  onReclaimInviteCode,
  onRecordsPageChange,
  onInviteCodesPageChange,
  onPreview,
}: {
  users: AdminUserSummary[];
  records: GenerationRecord[];
  recordsPage: PaginationInfo;
  inviteCodes: InviteCodeInfo[];
  inviteCodesPage: PaginationInfo;
  adminCredits: CreditSummary;
  loading: boolean;
  onCreateInviteCode: (credits: number) => Promise<void>;
  onDeleteInviteCode: (code: string) => Promise<void>;
  onReclaimInviteCode: (code: string, credits: number) => Promise<void>;
  onRecordsPageChange: (page: number) => void;
  onInviteCodesPageChange: (page: number) => void;
  onPreview: (item: GenerationRecord) => void;
}) {
  type AdminSection = 'dashboard' | 'invites' | 'users' | 'records' | 'settings';
  type InviteStatusFilter = 'all' | 'unused' | 'used';
  type InviteSortMode = 'created-desc' | 'created-asc' | 'credits-desc' | 'credits-asc';
  type UserSortMode = 'recent-desc' | 'recent-asc';
  type RecordRange = 'all' | '24h' | '7d' | '30d';

  const [section, setSection] = useState<AdminSection>('dashboard');
  const [credits, setCredits] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [deletingCode, setDeletingCode] = useState('');
  const [reclaimingCode, setReclaimingCode] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedInviteCodes, setSelectedInviteCodes] = useState<string[]>([]);
  const [inviteStatusFilter, setInviteStatusFilter] = useState<InviteStatusFilter>('all');
  const [inviteSortMode, setInviteSortMode] = useState<InviteSortMode>('created-desc');
  const [userSearch, setUserSearch] = useState('');
  const [userSortMode, setUserSortMode] = useState<UserSortMode>('recent-desc');
  const [userPage, setUserPage] = useState(1);
  const [recordUserFilter, setRecordUserFilter] = useState('');
  const [recordModelFilter, setRecordModelFilter] = useState('all');
  const [recordResolutionFilter, setRecordResolutionFilter] = useState('all');
  const [recordRange, setRecordRange] = useState<RecordRange>('all');
  const normalizedCredits = Math.max(0, Number(credits) || 0);
  const isInvalidCredits = normalizedCredits <= 0 || normalizedCredits > adminCredits.remainingCredits;
  const inviteCreditsTotal = normalizedCredits;
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const todayRecords = records.filter((item) => item.createdAt.slice(0, 10) === todayKey);
  const todayCreditsUsed = todayRecords.reduce((sum, item) => sum + item.creditsUsed, 0);
  const lowCreditUsers = users.filter((item) => item.remainingCredits <= 50);
  const totalInviteCodes = inviteCodes.length;
  const usedInviteCodes = inviteCodes.filter((item) => Boolean(item.redeemedBy)).length;
  const currentInviteUsageRate = totalInviteCodes > 0 ? Math.round((usedInviteCodes / totalInviteCodes) * 100) : 0;

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

  const filteredInviteCodes = [...inviteCodes]
    .filter((item) => {
      if (inviteStatusFilter === 'used') return Boolean(item.redeemedBy);
      if (inviteStatusFilter === 'unused') return !item.redeemedBy;
      return true;
    })
    .sort((left, right) => {
      if (inviteSortMode === 'credits-desc') return right.credits - left.credits;
      if (inviteSortMode === 'credits-asc') return left.credits - right.credits;
      if (inviteSortMode === 'created-asc') return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });

  const searchableUsers = [...users]
    .filter((item) => {
      const keyword = userSearch.trim().toLowerCase();
      if (!keyword) return true;
      const inviteText = (invitePrefixesByUserId[item.userId] || []).join(' ').toLowerCase();
      return (
        item.username.toLowerCase().includes(keyword) ||
        item.userId.toLowerCase().includes(keyword) ||
        inviteText.includes(keyword)
      );
    })
    .sort((left, right) => {
      const leftTime = left.lastGeneratedAt ? new Date(left.lastGeneratedAt).getTime() : 0;
      const rightTime = right.lastGeneratedAt ? new Date(right.lastGeneratedAt).getTime() : 0;
      return userSortMode === 'recent-asc' ? leftTime - rightTime : rightTime - leftTime;
    });

  const modelOptions = Array.from(new Set(records.map((item) => item.modelName))).sort();
  const resolutionOptions = Array.from(
    new Set(records.map((item) => (item.imageSize ? `${item.dimensions} / ${item.imageSize}` : item.dimensions))),
  ).sort();

  const filteredRecords = [...records].filter((item) => {
    if (recordModelFilter !== 'all' && item.modelName !== recordModelFilter) return false;

    const resolutionLabel = item.imageSize ? `${item.dimensions} / ${item.imageSize}` : item.dimensions;
    if (recordResolutionFilter !== 'all' && resolutionLabel !== recordResolutionFilter) return false;

    const keyword = recordUserFilter.trim().toLowerCase();
    if (
      keyword &&
      !item.username.toLowerCase().includes(keyword) &&
      !item.userId.toLowerCase().includes(keyword) &&
      !item.prompt.toLowerCase().includes(keyword) &&
      !(item.inviteCode || '').toLowerCase().includes(keyword)
    ) {
      return false;
    }

    if (recordRange !== 'all') {
      const diffHours = (today.getTime() - new Date(item.createdAt).getTime()) / (60 * 60 * 1000);
      if (recordRange === '24h' && diffHours > 24) return false;
      if (recordRange === '7d' && diffHours > 24 * 7) return false;
      if (recordRange === '30d' && diffHours > 24 * 30) return false;
    }

    return true;
  });

  const filteredRecordCredits = filteredRecords.reduce((sum, item) => sum + item.creditsUsed, 0);
  const userPageSize = 10;
  const userTotalPages = Math.max(1, Math.ceil(searchableUsers.length / userPageSize));
  const currentUserPage = Math.min(userPage, userTotalPages);
  const pagedUsers = searchableUsers.slice((currentUserPage - 1) * userPageSize, currentUserPage * userPageSize);
  const modelUsageCounter = filteredRecords.reduce<Record<string, number>>((accumulator, item) => {
    accumulator[item.modelName] = (accumulator[item.modelName] || 0) + 1;
    return accumulator;
  }, {});
  const mostUsedModel = Object.entries(modelUsageCounter).sort((left, right) => right[1] - left[1])[0]?.[0] || '暂无';
  const hourUsageCounter = filteredRecords.reduce<Record<string, number>>((accumulator, item) => {
    const hour = String(new Date(item.createdAt).getHours()).padStart(2, '0');
    accumulator[hour] = (accumulator[hour] || 0) + 1;
    return accumulator;
  }, {});
  const mostActiveHour = Object.entries(hourUsageCounter).sort((left, right) => right[1] - left[1])[0]?.[0];

  const canSelectInviteCodes = filteredInviteCodes.map((item) => item.code);
  const allSelectableChecked =
    canSelectInviteCodes.length > 0 && canSelectInviteCodes.every((code) => selectedInviteCodes.includes(code));

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
      await onCreateInviteCode(normalizedCredits);
      setCredits(100);
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

  const menuItems: Array<{ id: AdminSection; label: string; hint: string }> = [
    { id: 'dashboard', label: '看板', hint: '今日概览' },
    { id: 'invites', label: '邀请码', hint: '发码与回收' },
    { id: 'users', label: '用户', hint: '余额与活跃' },
    { id: 'records', label: '生图记录', hint: '模型与消耗' },
    { id: 'settings', label: '设置', hint: '运行状态' },
  ];

  return (
    <section className="h-full overflow-hidden px-4 py-4 lg:px-5">
      <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.02)_100%)] p-3">
          <div className="mb-4 rounded-[18px] border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Admin Console</p>
            <p className="mt-2 text-lg font-black text-white">后台管理</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">邀请码、用户、记录和运行状态集中处理。</p>
          </div>
          <div className="grid gap-2">
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
                  onClick={() => setSection(item.id)}
                >
                  <span className={active ? 'block text-sm font-black text-white' : 'block text-sm font-black text-zinc-200'}>{item.label}</span>
                  <span className={active ? 'mt-1 block text-[11px] text-sky-100/80' : 'mt-1 block text-[11px] text-zinc-500'}>{item.hint}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="custom-scrollbar min-h-0 overflow-y-auto overflow-x-hidden pr-1">
          <div className="grid gap-4">
            <div className="grid gap-3 xl:grid-cols-4">
              {[
                { label: '今日生成次数', value: String(todayRecords.length), hint: '按当前记录页统计' },
                { label: '今日消耗积分', value: String(todayCreditsUsed), hint: '统一积分池计费' },
                { label: '本页邀请码使用率', value: formatPercent(currentInviteUsageRate), hint: `${usedInviteCodes}/${Math.max(totalInviteCodes, 1)}` },
                { label: '低积分用户提醒', value: String(lowCreditUsers.length), hint: '剩余 <= 50 积分' },
              ].map((card) => (
                <div key={card.label} className="rounded-[22px] border border-white/8 bg-black/35 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-500">{card.label}</p>
                  <p className="mt-3 text-3xl font-black text-white">{card.value}</p>
                  <p className="mt-2 text-xs text-zinc-500">{card.hint}</p>
                </div>
              ))}
            </div>

            {loading ? (
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

            {!loading && (section === 'dashboard' || section === 'invites') ? (
              <div className="rounded-[22px] border border-white/8 bg-black/35 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-white">邀请码管理</h2>
                    <p className="mt-1 text-xs text-zinc-500">总池 / 已分配 / 剩余 一眼看清，支持筛选、排序和批量删除。</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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
                    <button
                      className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50"
                      disabled={submitting || isInvalidCredits}
                      type="button"
                      onClick={() => void handleCreateInviteCode()}
                    >
                      {submitting ? '生成中...' : '生成邀请码'}
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

                <div className="mt-4 overflow-hidden">
                  {filteredInviteCodes.length > 0 ? (
                    <table className="w-full table-fixed text-left text-xs">
                      <thead className="text-zinc-500">
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
                        {filteredInviteCodes.map((item) => {
                          const consumedAfterRedeem = item.redeemedBy ? usersById[item.redeemedBy]?.creditsUsed || 0 : 0;
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
                              <td className="px-3 py-3 text-right">
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
                  ) : (
                    <div className="py-10 text-center text-sm text-zinc-500">当前筛选条件下暂无邀请码</div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3 text-xs text-zinc-400">
                  <span>共 {inviteCodesPage.total} 条邀请码</span>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40"
                      disabled={inviteCodesPage.page <= 1}
                      type="button"
                      onClick={() => onInviteCodesPageChange(inviteCodesPage.page - 1)}
                    >
                      上一页
                    </button>
                    <span>{inviteCodesPage.page} / {inviteCodesPage.totalPages}</span>
                    <button
                      className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40"
                      disabled={inviteCodesPage.page >= inviteCodesPage.totalPages}
                      type="button"
                      onClick={() => onInviteCodesPageChange(inviteCodesPage.page + 1)}
                    >
                      下一页
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3 text-xs text-zinc-400">
                  <span>共 {searchableUsers.length} 个用户，每页 10 条</span>
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
              </div>
            ) : null}

            {!loading && (section === 'dashboard' || section === 'users') ? (
              <div className="rounded-[22px] border border-white/8 bg-black/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-white">用户信息与 Key 使用页</h2>
                    <p className="mt-1 text-xs text-zinc-500">支持按用户 ID / 邀请码前缀搜索，点击最近生成可切换活跃排序。</p>
                  </div>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none md:w-72"
                    placeholder="搜索用户 ID、用户名、invite-/admin/credit-"
                    value={userSearch}
                    onChange={(event) => {
                      setUserSearch(event.target.value);
                      setUserPage(1);
                    }}
                  />
                </div>

                <div className="mt-4 overflow-hidden">
                  {searchableUsers.length > 0 ? (
                    <table className="w-full table-fixed text-left text-xs">
                      <thead className="text-zinc-500">
                        <tr className="border-b border-white/8">
                          <th className="px-3 py-2 font-medium">用户</th>
                          <th className="px-3 py-2 font-medium">用户 ID</th>
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
                          const trend = usageTrendByUserId[item.userId] || Array.from({ length: 7 }, () => 0);
                          return (
                            <tr key={item.userId} className="text-zinc-300">
                              <td className="px-3 py-3 font-semibold text-white">{item.username}</td>
                              <td className="max-w-[240px] truncate px-3 py-3 text-zinc-500">{item.userId}</td>
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
                  ) : (
                    <div className="py-10 text-center text-sm text-zinc-500">暂无符合条件的用户</div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3 text-xs text-zinc-400">
                  <span>共 {searchableUsers.length} 个用户，每页 10 条</span>
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
              </div>
            ) : null}

            {!loading && (section === 'dashboard' || section === 'records') ? (
              <div className="rounded-[22px] border border-white/8 bg-black/35 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-white">生图记录页</h2>
                    <p className="mt-1 text-xs text-zinc-500">按模型、时间、用户和分辨率筛选，快速找出高消耗和高活跃记录。</p>
                  </div>
                  <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-4">
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
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs text-zinc-500">总消耗积分</p>
                    <p className="mt-2 text-2xl font-black text-white">{filteredRecordCredits}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs text-zinc-500">最常用模型</p>
                    <p className="mt-2 text-2xl font-black text-amber-200">{mostUsedModel}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs text-zinc-500">最活跃时段</p>
                    <p className="mt-2 text-2xl font-black text-emerald-200">{mostActiveHour ? `${mostActiveHour}:00` : '暂无'}</p>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden">
                  {filteredRecords.length > 0 ? (
                    <table className="w-full table-fixed text-left text-xs">
                      <thead className="text-zinc-500">
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
                        {filteredRecords.map((item) => (
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
                  ) : (
                    <div className="py-10 text-center text-sm text-zinc-500">当前筛选条件下暂无生图记录</div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3 text-xs text-zinc-400">
                  <span>第 {recordsPage.page} 页，每页 {recordsPage.pageSize} 条</span>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40"
                      disabled={recordsPage.page <= 1}
                      type="button"
                      onClick={() => onRecordsPageChange(recordsPage.page - 1)}
                    >
                      上一页
                    </button>
                    <span>{recordsPage.page} / {recordsPage.totalPages}</span>
                    <button
                      className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40"
                      disabled={recordsPage.page >= recordsPage.totalPages}
                      type="button"
                      onClick={() => onRecordsPageChange(recordsPage.page + 1)}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {!loading && section === 'settings' ? (
              <div className="rounded-[22px] border border-white/8 bg-black/35 p-4">
                <h2 className="text-base font-black text-white">设置</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs text-zinc-500">用户总数</p>
                    <p className="mt-2 text-2xl font-black text-white">{users.length}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs text-zinc-500">当前页邀请码</p>
                    <p className="mt-2 text-2xl font-black text-white">{inviteCodes.length}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs text-zinc-500">当前页记录</p>
                    <p className="mt-2 text-2xl font-black text-white">{records.length}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs text-zinc-500">低积分提醒</p>
                    <p className="mt-2 text-2xl font-black text-amber-200">{lowCreditUsers.length}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
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
  const [autoPlace, setAutoPlace] = useState(true);
  const [promptExpanded, setPromptExpanded] = useState(false);
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
    records: [],
    recordsPage: emptyPage,
    inviteCodes: [],
    inviteCodesPage: emptyPage,
    adminCredits: { totalCredits: 0, usedCredits: 0, remainingCredits: 0 },
  });
  const [adminRecordsPage, setAdminRecordsPage] = useState(1);
  const [adminInviteCodesPage, setAdminInviteCodesPage] = useState(1);
  const [activeTab, setActiveTab] = useState<AppTab>('create');
  const [previewImage, setPreviewImage] = useState<DisplayImage | SavedImage | GenerationRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingUserData, setLoadingUserData] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [healthText, setHealthText] = useState('正在检查本地服务...');
  const [healthError, setHealthError] = useState('');
  const [notice, setNotice] = useState('');
  const [creditsPurchaseOpen, setCreditsPurchaseOpen] = useState(false);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const [purchaseRedeemCode, setPurchaseRedeemCode] = useState('');
  const [purchaseRedeemLoading, setPurchaseRedeemLoading] = useState(false);
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
      void loadAdminOverview();
    }
  }, [activeTab, user, adminRecordsPage, adminInviteCodesPage]);

  useEffect(() => {
    if (activeTab === 'admin' && !user?.isAdmin) {
      setActiveTab('create');
    }
  }, [activeTab, user]);

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

  function applyPromptTemplate() {
    setPrompt((current) => (current.trim() ? `${current.trim()}\n\n${promptTemplate}` : promptTemplate));
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
      const payload = await fetchAdminOverview({
        recordsPage: adminRecordsPage,
        recordsPageSize: adminOverview.recordsPage.pageSize,
        inviteCodesPage: adminInviteCodesPage,
        inviteCodesPageSize: adminOverview.inviteCodesPage.pageSize,
      });
      setAdminOverview(payload);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '后台数据加载失败');
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleCreateInviteCode(credits: number) {
    try {
      const payload = await createInviteCode({ credits });
      setAdminOverview((current) => ({
        ...current,
        inviteCodes: payload.inviteCode ? [payload.inviteCode, ...current.inviteCodes] : current.inviteCodes,
        adminCredits: payload.adminCredits,
      }));
      setNotice(`已生成邀请码：${payload.inviteCode?.code || ''}`);
      void fetchMe().then(setUser).catch(() => undefined);
      void loadAdminOverview();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '邀请码生成失败');
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
      void loadAdminOverview();
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
      void loadAdminOverview();
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

  async function handleCopyWechat() {
    try {
      await navigator.clipboard.writeText('lzp983813676');
      setCopyToastVisible(false);
      window.setTimeout(() => setCopyToastVisible(true), 10);
      window.setTimeout(() => setCopyToastVisible(false), 2200);
    } catch {
      setNotice('复制失败，请手动添加微信：lzp983813676');
    }
  }

  async function handlePurchaseRedeem() {
    const code = purchaseRedeemCode.trim().toUpperCase();
    if (!code) {
      setNotice('请输入积分兑换码');
      return;
    }

    setPurchaseRedeemLoading(true);
    try {
      const nextUser = await loginWithInvite({ code });
      setUser(nextUser);
      setCreditsPurchaseOpen(false);
      setPurchaseRedeemCode('');
      setNotice(`兑换成功，欢迎回来：${nextUser.username}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '兑换失败');
    } finally {
      setPurchaseRedeemLoading(false);
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
        void loadAdminOverview();
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
    setAdminRecordsPage(1);
    setAdminInviteCodesPage(1);
    setActiveTab('create');
    setCurrentImage(null);
    setHistoryQueue([]);
    setNotice('已退出登录');
  }

  const stageCards = Array.from({ length: 8 }, (_, index) =>
    index === 0 ? currentImage : historyQueue[index - 1] || null,
  );
  const tabs: Array<{ id: AppTab; label: string; icon: ReactNode; hidden?: boolean }> = [
    { id: 'create', label: '创作', icon: <Sparkles size={15} /> },
    { id: 'history', label: '历史记录', icon: <Clock3 size={15} /> },
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
            <select
              className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-200 outline-none transition focus:border-violet-500/40"
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
            >
              {models.map((item) => (
                <option key={item.id} value={item.id} className="bg-[#111111]">
                  {item.name}
                </option>
              ))}
            </select>
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
            <CreditsSummary selectedModel={selectedModelInfo} user={user} onOpenPurchase={() => setCreditsPurchaseOpen(true)} />

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
    <main className="h-screen overflow-hidden bg-[#060606] text-white">
      <div className="flex h-screen flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.025)_0%,rgba(255,255,255,0)_18%)]">
        <header className="shrink-0 flex flex-wrap items-center justify-between gap-4 border-b border-white/8 px-3 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-[linear-gradient(135deg,#6d2fff_0%,#8a49ff_42%,#2ad4ff_100%)]" />
            <div className="flex items-end gap-2">
              <span className="text-[30px] font-extrabold leading-none tracking-tight text-white">PIXORY</span>
              <span className="pb-0.5 text-sm text-zinc-500">/ Studio</span>
            </div>
          </div>

          <nav className="flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
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
                    onClick={() => setActiveTab(item.id)}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
          </nav>

          <div className="flex items-center gap-3">
            {/* 购买积分按钮 - 头部导航栏 */}
            <button
              className="hidden rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400 transition hover:bg-rose-500/20 hover:text-rose-300 md:block"
              type="button"
              onClick={() => setCreditsPurchaseOpen(true)}
            >
              购买积分
            </button>
            <div
              className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 md:inline-flex"
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
              ? 'grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[2fr_3fr_2fr]'
              : 'min-h-0 flex-1 overflow-hidden'
          }
        >
          <aside className={activeTab === 'create' ? 'h-full overflow-hidden border-r border-white/8 p-3' : 'hidden'}>
            <form className="custom-scrollbar flex h-full min-h-0 flex-col gap-4 overflow-auto pr-1" onSubmit={handleGenerate}>
              <section className="space-y-2.5">
                <div className="px-0.5 text-[13px] font-extrabold text-zinc-400">{'\u6a21\u578b\u9009\u62e9'}</div>
                <div className="grid grid-cols-2 gap-2.5">
                  {models.map((item) => {
                    const active = selectedModel === item.id;

                    return (
                      <button
                        key={item.id}
                        className={
                          active
                            ? 'rounded-2xl border border-[#ff8b2f] bg-[linear-gradient(180deg,#ff7a12_0%,#f05f00_100%)] px-3 py-3.5 text-white shadow-[0_10px_24px_rgba(255,111,12,0.22)]'
                            : 'rounded-2xl border border-white/12 bg-[#080808] px-3 py-3.5 text-white transition hover:border-white/25 hover:bg-white/[0.03]'
                        }
                        type="button"
                        onClick={() => handleModelSelect(item.id)}
                      >
                        <span className="block truncate text-[17px] font-black leading-none">{item.name}</span>
                        <span className={active ? 'mt-1.5 block truncate text-[12px] font-bold text-orange-100' : 'mt-1.5 block truncate text-[12px] font-bold text-zinc-500'}>
                          {item.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3 text-[13px] font-extrabold text-zinc-400">
                  <span>{'\u4e0a\u4f20\u53c2\u8003\u56fe\uff08\u53ef\u9009\uff09\uff08\u53ef\u4ece\u6587\u4ef6\u5939\u62d6\u62fd\u5230\u6b64\u533a\u57df\uff09'}</span>
                  <span className="shrink-0 text-[12px] text-zinc-500">{references.length} / {MAX_REFERENCES}</span>
                </div>
                <div
                  className={
                    draggingReferences
                      ? 'rounded-2xl border border-[#ff8b2f]/50 bg-[#120b05] p-3 shadow-[inset_0_0_0_1px_rgba(255,139,47,0.16)]'
                      : 'rounded-2xl border border-white/8 bg-[#050505] p-3'
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
                  <div className="flex flex-wrap gap-2.5">
                    <label className="flex h-[76px] w-[76px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/16 bg-[#080808] text-zinc-500 transition hover:border-[#ff8b2f]/45 hover:text-white">
                      <input className="hidden" type="file" accept="image/*" multiple onChange={handleReferenceUpload} />
                      <ImagePlus size={21} />
                      <span className="mt-1.5 text-xs font-bold">{'\u6dfb\u52a0'}</span>
                    </label>

                    {references.map((item) => (
                      <button
                        key={item.id}
                        className="group relative h-[76px] w-[76px] overflow-hidden rounded-2xl border border-white/10 bg-[#101010]"
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

              <section className="space-y-3">
                <div className="flex items-center justify-between text-[13px] font-extrabold text-zinc-400">
                  <div className="flex items-center gap-3">
                    <span>{'\u56fe\u50cf\u63d0\u793a\u8bcd'}</span>
                    <button className="text-[13px] text-[#ff9a2a] transition hover:text-[#ffb257]" type="button" onClick={applyPromptTemplate}>
                      {'\u6211\u7684\u6a21\u7248'}
                    </button>
                  </div>
                  <span className="text-[12px] text-zinc-500">{prompt.length} / {MAX_PROMPT_LENGTH}</span>
                </div>
                <div className="relative">
                  <textarea
                    className={
                      promptExpanded
                        ? 'min-h-[260px] w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-4 pr-14 text-[14px] leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-[#ff8b2f]/45'
                        : 'min-h-[150px] w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-4 pr-14 text-[14px] leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-[#ff8b2f]/45'
                    }
                    placeholder="\u8bf7\u8be6\u7ec6\u63cf\u8ff0\u60a8\u60f3\u751f\u6210\u7684\u753b\u9762..."
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value.slice(0, MAX_PROMPT_LENGTH))}
                  />
                  <button
                    className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-lg text-zinc-300 transition hover:border-white/20 hover:text-white"
                    type="button"
                    onClick={() => setPromptExpanded((current) => !current)}
                    >
                      {'\u2197'}
                    </button>
                </div>
              </section>

              <div className={isNanoBananaPro ? 'grid gap-3 xl:grid-cols-[1.15fr_1fr]' : 'space-y-3'}>
                <section className="space-y-2">
                  <div className="text-[13px] font-extrabold text-zinc-400">{'\u6e05\u6670\u5ea6'}</div>
                  <div className={isNanoBananaPro ? 'grid grid-cols-2 gap-2.5' : 'grid grid-cols-3 gap-2.5'}>
                    {selectedResolutionOptions.map((item) => {
                      const active = imageSize === item.value;

                      return (
                        <button
                          key={item.value}
                          className={
                            active
                              ? 'rounded-xl bg-white px-3 py-3 text-black shadow-[0_10px_22px_rgba(255,255,255,0.1)]'
                              : 'rounded-xl border border-white/10 bg-[#0b0b0b] px-3 py-3 text-zinc-400 transition hover:border-white/20 hover:text-white'
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
                          <span className="block text-[15px] font-black leading-none">{item.label}</span>
                          <span className={active ? 'mt-1.5 block truncate text-[11px] font-semibold text-zinc-600' : 'mt-1.5 block truncate text-[11px] font-semibold text-zinc-500'}>
                            {item.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {showGptQuality ? (
                  <section className="space-y-2">
                    <div className="text-[13px] font-extrabold text-zinc-400">{'\u8d28\u91cf'}</div>
                    <div className="grid grid-cols-3 gap-2.5">
                      {gptQualityOptions.map((item) => {
                        const active = gptQuality === item.value;

                        return (
                          <button
                            key={item.value}
                            className={
                              active
                                ? 'rounded-xl bg-white px-3 py-3 text-black shadow-[0_10px_22px_rgba(255,255,255,0.1)]'
                                : 'rounded-xl border border-white/10 bg-[#0b0b0b] px-3 py-3 text-zinc-400 transition hover:border-white/20 hover:text-white'
                            }
                            type="button"
                            onClick={() => setGptQuality(item.value)}
                          >
                            <span className="block text-[15px] font-black leading-none">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                {isNanoBananaPro ? (
                  <section className="space-y-2">
                    <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-zinc-400">
                      <span>{'AI\u589e\u5f3a'}</span>
                      <Info size={13} className="text-zinc-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        className={
                          optimizeChineseText
                            ? 'rounded-xl border border-white/10 bg-[#0b0b0b] px-3 py-3 text-zinc-400 transition hover:border-white/20 hover:text-white'
                            : 'rounded-xl bg-white px-3 py-3 text-black shadow-[0_10px_22px_rgba(255,255,255,0.1)]'
                        }
                        type="button"
                        onClick={() => setOptimizeChineseText(false)}
                      >
                          <span className="block text-[15px] font-black leading-none">{'\u5173'}</span>
                      </button>
                      <button
                        className={
                          optimizeChineseText
                            ? 'rounded-xl bg-white px-3 py-3 text-black shadow-[0_10px_22px_rgba(255,255,255,0.1)]'
                            : 'rounded-xl border border-white/10 bg-[#0b0b0b] px-3 py-3 text-zinc-400 transition hover:border-white/20 hover:text-white'
                        }
                        type="button"
                        onClick={() => setOptimizeChineseText(true)}
                      >
                          <span className="block text-[15px] font-black leading-none">{'\u5f00'}</span>
                      </button>
                    </div>
                  </section>
                ) : null}
              </div>

              <section className="space-y-2">
                <div className="text-[13px] font-extrabold text-zinc-400">{'\u753b\u9762\u6bd4\u4f8b'}</div>
                <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
                  {dimensionOptions.map(({ value, label }) => {
                    const active = value === dimensions;

                    return (
                      <button
                        key={value}
                        className={
                          active
                            ? 'rounded-xl bg-white px-2.5 py-2.5 text-[13px] font-black text-black shadow-[0_8px_18px_rgba(255,255,255,0.09)]'
                            : 'rounded-xl border border-white/10 bg-[#0b0b0b] px-2.5 py-2.5 text-[13px] font-black text-zinc-400 transition hover:border-white/20 hover:text-white'
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

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px] font-extrabold text-zinc-400">
                  <span>
                    {'\u4f7f\u7528\u79ef\u5206\uff1a'}<span className="text-white">{selectedModelCredits * batchCount}</span>/<span className="text-white">{user?.creditsRemaining ?? 0}</span>
                  </span>
                  <button className="text-[#18c8ff] transition hover:text-[#5adaff]" type="button" onClick={() => setCreditsPurchaseOpen(true)}>
                    {'\u5728\u7ebf\u8d2d\u4e70\u79ef\u5206(25%\u4f18\u60e0)'}
                  </button>
                </div>
                <div className="space-y-1.5 text-[13px] leading-5 text-zinc-500">
                  {user ? (
                    <p>{'\u5f53\u524d\u8d26\u53f7\uff1a'}{user.username}{'\u3002\u4f60\u73b0\u5728\u53ef\u4ee5\u751f\u6210\u3001\u6536\u85cf\u3001\u5907\u4efd\u548c\u4e22\u5f03\u56fe\u7247\u3002'}</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <span>{'\u8bf7\u5148\u767b\u5f55\u6216\u586b\u5199\u9080\u8bf7\u7801\u540e\u518d\u751f\u6210\u56fe\u7247\u3002'}</span>
                      <button
                        className="font-semibold text-sky-400 transition hover:text-sky-300"
                        type="button"
                        onClick={() => {
                          setAuthMode('login');
                          setAuthOpen(true);
                        }}
                      >
                        {'\u53bb\u767b\u5f55'}
                      </button>
                      <button
                        className="font-semibold text-sky-400 transition hover:text-sky-300"
                        type="button"
                        onClick={() => {
                          setAuthMode('invite');
                          setAuthOpen(true);
                        }}
                      >
                        {'\u586b\u9080\u8bf7\u7801'}
                      </button>
                    </div>
                  )}
                  <p>{hasEnoughCredits ? healthText : '\u5f53\u524d\u79ef\u5206\u5df2\u7528\u5b8c\uff0c\u6682\u65f6\u65e0\u6cd5\u7ee7\u7eed\u751f\u6210\u56fe\u7247\u3002'}</p>
                  {loadingUserData ? <p>{'\u6b63\u5728\u540c\u6b65\u4f60\u7684\u56fe\u7247\u6570\u636e...'}</p> : null}
                </div>
              </div>

              {notice ? (
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-100">{notice}</div>
              ) : null}
              {healthError ? (
                <div className="rounded-[24px] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{healthError}</div>
              ) : null}

              <div className="mt-auto grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
                <div className="rounded-2xl border border-white/10 bg-[#0b0b0b] p-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-black text-white">{'\u6570\u91cf'}</span>
                    <div className="flex items-center overflow-hidden rounded-xl border border-[#8b4a15] bg-[#2d190c]">
                      <button
                        className="flex h-9 w-9 items-center justify-center text-[#f3c58f] transition hover:bg-white/5 disabled:opacity-40"
                        type="button"
                        disabled={batchCount <= 1}
                        onClick={() => setBatchCount((current) => Math.max(1, current - 1))}
                      >
                        <Minus size={15} />
                      </button>
                      <span className="flex h-9 w-10 items-center justify-center border-x border-[#8b4a15] text-[15px] font-black text-white">{batchCount}</span>
                      <button
                        className="flex h-9 w-9 items-center justify-center text-[#f3c58f] transition hover:bg-white/5 disabled:opacity-40"
                        type="button"
                        disabled={batchCount >= 9}
                        onClick={() => setBatchCount((current) => Math.min(9, current + 1))}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3.5 flex items-center justify-between">
                    <span className="text-[14px] font-black text-white">{'\u81ea\u52a8\u4e0a\u684c'}</span>
                    <button
                      className={
                        autoPlace
                          ? 'relative h-8 w-14 rounded-full border border-white/12 bg-white/10 transition'
                          : 'relative h-8 w-14 rounded-full border border-white/12 bg-white/5 transition'
                      }
                      type="button"
                      onClick={() => setAutoPlace((current) => !current)}
                    >
                      <span
                        className={
                          autoPlace
                            ? 'absolute left-[27px] top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow-[0_4px_10px_rgba(255,255,255,0.24)] transition'
                            : 'absolute left-[3px] top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow-[0_4px_10px_rgba(255,255,255,0.14)] transition'
                        }
                      />
                    </button>
                  </div>
                </div>

                <button
                  className="flex min-h-[92px] items-center justify-center gap-2.5 rounded-2xl bg-[linear-gradient(90deg,#8f4100_0%,#aa5200_100%)] px-5 py-4 text-[18px] font-black text-white shadow-[0_16px_30px_rgba(148,71,0,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
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
            <section className="min-h-0 border-r border-white/8 px-5 py-4">
              <div className="custom-scrollbar grid h-full auto-rows-[140px] gap-3 overflow-auto pr-1">
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
          ) : (
            <AdminView
              users={adminOverview.users}
              records={adminOverview.records}
              recordsPage={adminOverview.recordsPage}
              inviteCodes={adminOverview.inviteCodes}
              inviteCodesPage={adminOverview.inviteCodesPage}
              adminCredits={adminOverview.adminCredits}
              loading={adminLoading}
              onCreateInviteCode={handleCreateInviteCode}
              onDeleteInviteCode={handleDeleteInviteCode}
              onReclaimInviteCode={handleReclaimInviteCode}
              onRecordsPageChange={setAdminRecordsPage}
              onInviteCodesPageChange={setAdminInviteCodesPage}
              onPreview={setPreviewImage}
            />
          )}

          <aside className={activeTab === 'create' ? 'h-full overflow-hidden p-4' : 'hidden'}>
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
      </div>

      {previewImage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 py-6">
          <button className="absolute inset-0 cursor-zoom-out" type="button" onClick={() => setPreviewImage(null)} />
          <div className="relative z-10 flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#090909] shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-white/8 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{previewImage.prompt}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {previewImage.modelName} / {previewImage.dimensions}
                  {previewImage.imageSize ? ` / ${previewImage.imageSize}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
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
            <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-4">
              <img alt={previewImage.prompt} className="max-h-[78vh] max-w-full object-contain" src={previewImage.imageUrl} />
            </div>
          </div>
        </div>
      ) : null}

      {creditsPurchaseOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 px-4 backdrop-blur-sm">
          <button className="absolute inset-0" type="button" onClick={() => setCreditsPurchaseOpen(false)} />
          <div className="relative z-10 w-full max-w-[640px] rounded-[38px] border border-white/10 bg-[#09090b] px-6 py-7 shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:px-8 sm:py-8">
            {copyToastVisible ? (
              <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                <div className="flex items-center gap-3 rounded-[22px] border border-emerald-400/20 bg-[#07372d] px-6 py-3 text-[15px] font-black text-emerald-100 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
                  <Copy size={22} className="text-[#67f0c8]" />
                  <span>已复制微信号</span>
                </div>
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-4">
              <h2 className="max-w-[420px] text-[28px] font-black tracking-tight text-white sm:text-[34px] sm:leading-[1.08]">
                在线购买积分(25%优惠)
              </h2>
              <button
                className="rounded-2xl p-2 text-zinc-500 transition hover:text-white"
                type="button"
                onClick={() => setCreditsPurchaseOpen(false)}
              >
                <X size={24} />
              </button>
            </div>

            <div className="mt-7 rounded-[26px] border border-cyan-500/35 bg-[#0a2028] px-6 py-6 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)]">
              <div className="flex flex-wrap items-center gap-3 text-[17px] font-black text-white">
                <span>中国区客服微信：</span>
                <span className="text-[18px] text-sky-300">lzp983813676</span>
                <button
                  className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-bold text-sky-100 transition hover:bg-sky-500/20"
                  type="button"
                  onClick={() => void handleCopyWechat()}
                >
                  复制
                </button>
              </div>

              <p className="mt-6 text-[18px] font-black text-white">现可自助购买积分！</p>
              <p className="mt-4 max-w-[430px] text-[17px] font-bold leading-8 text-zinc-100">
                降价公告：加量不加价！相同价格比原来多增加25%的积分！
              </p>

              <div className="mt-6">
                <button
                  className="inline-flex items-center rounded-full border border-amber-500/45 bg-[#4a2d14] px-6 py-3 text-[16px] font-black text-amber-50 transition hover:bg-[#5a3517]"
                  type="button"
                  onClick={() => window.open('https://pay.ldxp.cn/shop/RHPYAKWG', '_blank', 'noopener,noreferrer')}
                >
                  去购买
                </button>
              </div>
            </div>

            {/* <div className="mt-7 rounded-[26px] border border-amber-500/25 bg-[#341a0b] px-6 py-5 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.06)]">
              <p className="text-[18px] font-black text-amber-50">积分兑换</p>
              <div className="mt-5 flex items-center gap-4">
                <input
                  className="h-14 flex-1 rounded-[18px] border border-white/10 bg-[#201108] px-5 text-[16px] font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-amber-500/30"
                  placeholder="请输入积分兑换码"
                  value={purchaseRedeemCode}
                  onChange={(event) => setPurchaseRedeemCode(event.target.value.toUpperCase())}
                />
                <button
                  className="h-14 min-w-[96px] rounded-full bg-white px-6 text-[16px] font-black text-[#2d190c] transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  disabled={purchaseRedeemLoading}
                  onClick={() => void handlePurchaseRedeem()}
                >
                  {purchaseRedeemLoading ? '兑换中' : '兑换'}
                </button>
              </div>
            </div> */}
          </div>
        </div>
      ) : null}

      {authOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0b0b0c] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
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
                className="rounded-2xl bg-[linear-gradient(90deg,#6623ff_0%,#8d46ff_50%,#7a3cff_100%)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
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
