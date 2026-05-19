import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useState } from 'react';
import {
  Bookmark,
  Clock3,
  Download,
  ImagePlus,
  LoaderCircle,
  LogIn,
  LogOut,
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
  register,
  type GeneratedImagePayload,
  type AdminUserSummary,
  type CreditSummary,
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
  { id: 'gemini-2.0-flash', name: 'Gemini Image', description: 'Google Gemini通用模型。', creditsCost: 0 },
  { id: 'gpt-image-2', name: 'GPT Image 2', description: '通用图像生成，支持自动比例。' },
  { id: 'Nano_Banana_2', name: 'Nano Banana2', description: '快速生成 2K 图片，适合日常创意出图。' },
  { id: 'Nano_Banana_Pro', name: 'Nano Banana Pro', description: '更高质量的 Banana 生成模型。' },
];

type DimensionOption = '1:1' | '3:2' | '16:9' | '4:3' | '9:16' | '3:4';
type ImageSizeOption = '2K' | '4K';
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
  pageSize: 20,
  total: 0,
  totalPages: 1,
};

const dimensionOptions: Array<{ value: DimensionOption; label: string }> = [
  { value: '1:1', label: '1:1' },
  { value: '3:2', label: '3:2' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16' },
  { value: '3:4', label: '3:4' },
];

const imageSizeOptions: Array<{ value: ImageSizeOption; label: string; hint: string }> = [
  { value: '2K', label: '2K', hint: '满血版 图片大小 4M-8M' },
  { value: '4K', label: '4K', hint: '满血版 图片大小 15M-20M' },
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

function getModelCredits(model: Pick<ModelInfo, 'id' | 'creditsCost'> | null) {
  if (!model) return 0;
  if (typeof model.creditsCost === 'number') return model.creditsCost;
  if (model.id === 'gemini-2.0-flash') return 0;
  if (model.id === 'gpt-image-2') return 20;
  if (model.id === 'Nano_Banana_Pro') return 20;
  if (model.id === 'Nano_Banana_2') return 17;
  return 1;
}

function getModelSortOrder(modelId: string) {
  if (modelId === 'gemini-2.0-flash') return 0;
  if (modelId === 'Nano_Banana_Pro') return 1;
  if (modelId === 'Nano_Banana_2') return 2;
  if (modelId === 'gpt-image-2') return 3;
  return 99;
}

function CreditsSummary({
  user,
  selectedModel,
}: {
  user: UserInfo | null;
  selectedModel: ModelInfo | null;
}) {
  const creditsRemaining = typeof user?.creditsRemaining === 'number' ? user.creditsRemaining : null;
  const creditsCost = getModelCredits(selectedModel);
  const insufficientCredits = creditsRemaining !== null && creditsRemaining < creditsCost;

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/8 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Credits</p>
          <p className="mt-1 text-sm text-zinc-100">
            {creditsRemaining !== null ? `当前余额 ${creditsRemaining} 积分` : '登录后可查看积分余额'}
          </p>
        </div>
        {selectedModel ? (
          <div className="text-right">
            <p className="text-xs text-zinc-400">当前模型</p>
            <p className="mt-1 text-sm font-semibold text-white">{selectedModel.name}</p>
          </div>
        ) : null}
      </div>
      {selectedModel ? (
        <p className={`mt-2 text-xs ${insufficientCredits ? 'text-rose-200' : 'text-amber-100'}`}>
          本次生成预计消耗 {creditsCost} 积分
          {insufficientCredits ? '，当前余额不足' : ''}
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
  onCreateInviteCode,
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
  onCreateInviteCode: (credits: number) => Promise<void>;
  onRecordsPageChange: (page: number) => void;
  onInviteCodesPageChange: (page: number) => void;
  onPreview: (item: GenerationRecord) => void;
}) {
  const [credits, setCredits] = useState(100);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreateInviteCode() {
    setSubmitting(true);
    try {
      await onCreateInviteCode(credits);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="h-full overflow-hidden px-5 py-4">
      <div className="custom-scrollbar grid h-full gap-4 overflow-auto pr-1 xl:grid-rows-[auto_auto_1fr]">
        <div className="rounded-[20px] border border-white/8 bg-black/35 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">邀请码与管理员积分</h2>
              <p className="mt-1 text-xs text-zinc-500">
                总积分 {adminCredits.totalCredits} · 已分配 {adminCredits.usedCredits} · 剩余 {adminCredits.remainingCredits}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                className="w-28 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm outline-none"
                min={1}
                max={adminCredits.remainingCredits || 1}
                type="number"
                value={credits}
                onChange={(event) => setCredits(Math.max(1, Number(event.target.value) || 1))}
              />
              <button
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50"
                disabled={submitting || credits > adminCredits.remainingCredits}
                type="button"
                onClick={() => void handleCreateInviteCode()}
              >
                生成邀请码
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {inviteCodes.length > 0 ? (
              <table className="min-w-full text-left text-xs">
                <thead className="text-zinc-500">
                  <tr className="border-b border-white/8">
                    <th className="px-3 py-2 font-medium">邀请码</th>
                    <th className="px-3 py-2 font-medium">积分</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="px-3 py-2 font-medium">使用者</th>
                    <th className="px-3 py-2 font-medium">创建时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {inviteCodes.map((item) => (
                    <tr key={item.code} className="text-zinc-300">
                      <td className="px-3 py-3 font-mono font-semibold text-white">{item.code}</td>
                      <td className="px-3 py-3 text-sky-200">{item.credits}</td>
                      <td className="px-3 py-3">{item.redeemedBy ? '已使用' : '未使用'}</td>
                      <td className="max-w-[220px] truncate px-3 py-3 text-zinc-500">{item.redeemedBy || '-'}</td>
                      <td className="px-3 py-3">{formatTime(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-8 text-center text-sm text-zinc-500">暂无邀请码</div>
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
        </div>

        <div className="rounded-[20px] border border-white/8 bg-black/35 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">用户信息与 Key 使用情况</h2>
            <span className="text-xs text-zinc-500">{users.length} 人</span>
          </div>
          <div className="overflow-x-auto">
            {users.length > 0 ? (
              <table className="min-w-full text-left text-xs">
                <thead className="text-zinc-500">
                  <tr className="border-b border-white/8">
                    <th className="px-3 py-2 font-medium">用户</th>
                    <th className="px-3 py-2 font-medium">用户 ID</th>
                    <th className="px-3 py-2 font-medium">生成次数</th>
                    <th className="px-3 py-2 font-medium">用户积分</th>
                    <th className="px-3 py-2 font-medium">Key 积分消耗</th>
                    <th className="px-3 py-2 font-medium">最近生成</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {users.map((item) => (
                    <tr key={item.userId} className="text-zinc-300">
                      <td className="px-3 py-3 font-semibold text-white">{item.username}</td>
                      <td className="max-w-[260px] truncate px-3 py-3 text-zinc-500">{item.userId}</td>
                      <td className="px-3 py-3">{item.generations}</td>
                      <td className="px-3 py-3">
                        {item.remainingCredits} / {item.totalCredits}
                      </td>
                      <td className="px-3 py-3 text-sky-200">{item.creditsUsed} 点</td>
                      <td className="px-3 py-3">{item.lastGeneratedAt ? formatTime(item.lastGeneratedAt) : '暂无'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-10 text-center text-sm text-zinc-500">暂无用户生图数据</div>
            )}
          </div>
        </div>

        <div className="rounded-[20px] border border-white/8 bg-black/35 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">生图记录</h2>
            <span className="text-xs text-zinc-500">共 {recordsPage.total} 条</span>
          </div>
          <div className="overflow-x-auto">
            {records.length > 0 ? (
              <table className="min-w-[1060px] text-left text-xs">
                <thead className="text-zinc-500">
                  <tr className="border-b border-white/8">
                    <th className="px-3 py-2 font-medium">图片</th>
                    <th className="px-3 py-2 font-medium">用户</th>
                    <th className="px-3 py-2 font-medium">邀请码</th>
                    <th className="px-3 py-2 font-medium">模型</th>
                    <th className="px-3 py-2 font-medium">比例/分辨率</th>
                    <th className="px-3 py-2 font-medium">积分</th>
                    <th className="px-3 py-2 font-medium">提示词/描述</th>
                    <th className="px-3 py-2 font-medium">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {records.map((item) => (
                    <tr key={item.id} className="align-top text-zinc-300">
                      <td className="px-3 py-3">
                        <button className="h-16 w-16 overflow-hidden rounded-xl bg-black" type="button" onClick={() => onPreview(item)}>
                          <img alt={item.prompt} className="h-full w-full object-cover" src={item.imageUrl} />
                        </button>
                      </td>
                      <td className="px-3 py-3 font-semibold text-white">{item.username}</td>
                      <td className="max-w-[180px] truncate px-3 py-3 font-mono text-zinc-500">{item.inviteCode || '-'}</td>
                      <td className="px-3 py-3">{item.modelName}</td>
                      <td className="px-3 py-3">
                        {item.dimensions}
                        {item.imageSize ? ` / ${item.imageSize}` : ''}
                      </td>
                      <td className="px-3 py-3 text-sky-200">{item.creditsUsed}</td>
                      <td className="max-w-[360px] px-3 py-3 leading-5">{item.prompt}</td>
                      <td className="px-3 py-3">{formatTime(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-10 text-center text-sm text-zinc-500">暂无生图记录</div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3 text-xs text-zinc-400">
            <span>
              第 {recordsPage.page} 页，每页 {recordsPage.pageSize} 条
            </span>
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
      </div>
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([...defaultModels].sort((left, right) => getModelSortOrder(left.id) - getModelSortOrder(right.id)));
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash');
  const [prompt, setPrompt] = useState('');
  const [dimensions, setDimensions] = useState<DimensionOption>('1:1');
  const [imageSize, setImageSize] = useState<ImageSizeOption>('2K');
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
  const [healthText, setHealthText] = useState('正在检查本地服务...');
  const [healthError, setHealthError] = useState('');
  const [notice, setNotice] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'invite'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authForm, setAuthForm] = useState({ username: '', password: '', email: '', inviteCode: '' });

  const sideFavoriteItems = user ? favorites : [];
  const sideBackupItems = user ? backup : [];
  const sideDiscardedItems = user ? discarded : [];
  const isNanoBananaPro = selectedModel === 'Nano_Banana_Pro';
  const selectedModelInfo = models.find((item) => item.id === selectedModel) || defaultModels.find((item) => item.id === selectedModel) || null;
  const selectedModelCredits = getModelCredits(selectedModelInfo);
  const hasEnoughCredits =
    typeof user?.creditsRemaining === 'number' ? user.creditsRemaining >= selectedModelCredits : true;

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
        const preferred = modelPayload.models.find((item) => item.id === 'Nano_Banana_Pro');
        return preferred?.id || modelPayload.models[0]?.id || 'Nano_Banana_Pro';
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

  async function handleReferenceUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []) as File[];
    if (files.length === 0) return;

    try {
      const next = await Promise.all(files.slice(0, 3).map((file) => fileToBase64(file)));
      setReferences((current) => [...current, ...next].slice(0, 3));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '参考图片读取失败');
    } finally {
      event.target.value = '';
    }
  }

  function removeReference(id: string) {
    setReferences((current) => current.filter((item) => item.id !== id));
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      setNotice('请先登录后再生成图片');
      setAuthMode('login');
      setAuthOpen(true);
      return;
    }

    if (!prompt.trim()) {
      setNotice('请输入提示词');
      return;
    }

    setLoading(true);
    setNotice('');

    try {
      const referenceImages: ReferenceUploadInput[] = references.map((item) => ({
        name: item.name,
        mimeType: item.mimeType,
        data: item.data,
      }));

      const response = await generateImage({
        prompt,
        model: selectedModel,
        dimensions,
        imageSize: isNanoBananaPro ? imageSize : undefined,
        reference_images: referenceImages,
      });

      setHistoryQueue((current) => (currentImage ? [currentImage, ...current].slice(0, 7) : current));
      setCurrentImage(toDisplayImage(response.image));

      // 如果发生了模型回退，提示用户
      if (response.image.fallbackUsed) {
        setNotice(`Gemini 免费额度已用完，已自动切换到 ${response.image.modelName} 生成。`);
      }

      void fetchMe().then(setUser).catch(() => undefined);
      void loadHistory();
      if (user?.isAdmin) {
        void loadAdminOverview();
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '生成失败');
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
            <CreditsSummary selectedModel={selectedModelInfo} user={user} />

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
              <span className="text-[30px] font-extrabold leading-none tracking-tight text-white">BANANAS AI</span>
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
            <div className="hidden rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-400 md:block">
              {healthText}
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
          <aside className={activeTab === 'create' ? 'h-full overflow-hidden border-r border-white/8 p-4' : 'hidden'}>
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
                  className="min-h-[126px] w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-4 text-sm leading-7 text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/40"
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
                          <span
                            className={`mt-2 block text-xs font-semibold leading-5 ${
                              active ? 'text-emerald-600' : 'text-emerald-300'
                            }`}
                          >
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
                    <p>当前账号：{user.username}。你现在可以生成、收藏、备份和丢弃图片。</p>
                  ) : (
                    <>
                      <p>匿名访客只能浏览公开内容，暂不能生成图片。</p>
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
                <CreditsSummary selectedModel={selectedModelInfo} user={user} />

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
              onCreateInviteCode={handleCreateInviteCode}
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
