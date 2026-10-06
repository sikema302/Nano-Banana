import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  createPromptTemplate,
  deletePromptTemplate,
  fetchPromptTemplates,
  type PromptTemplateInfo,
} from './lib/api';

const PANEL_WIDTH = 320;
const PANEL_MAX_HEIGHT = 380;
const NAME_MAX_LENGTH = 60;
const PROMPT_MAX_LENGTH = 8000;

type PromptTemplatesProps = {
  /** 点击某个模版时回调，把模版提示词填进输入框 */
  onApply: (prompt: string) => void;
  /** 触发按钮文案 */
  title?: string;
  /** 打开「创建模版」时用于预填当前输入框里的提示词（可选） */
  getInitialPrompt?: () => string;
  /** 额外把错误抛给外层提示条（可选，组件内部也会展示错误） */
  onError?: (message: string) => void;
};

/**
 * 「我的模版」组件：触发按钮 + 模版列表面板 + 创建模版弹窗。
 * 可在任意提示词输入区旁复用（生图 / 生视频等）。
 */
export default function PromptTemplates({ onApply, title = '我的模版', getInitialPrompt, onError }: PromptTemplatesProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  const [position, setPosition] = useState({ left: 0, top: 0, bottom: 0 });

  const [templates, setTemplates] = useState<PromptTemplateInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [panelError, setPanelError] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [pendingDelete, setPendingDelete] = useState<PromptTemplateInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 12));
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < PANEL_MAX_HEIGHT + 24 && rect.top > spaceBelow) {
      setPlacement('above');
      setPosition({ left, top: 0, bottom: window.innerHeight - rect.top + 8 });
    } else {
      setPlacement('below');
      setPosition({ left, top: rect.bottom + 8, bottom: 0 });
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setPanelError('');
    try {
      const result = await fetchPromptTemplates();
      setTemplates(result.templates || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取模版失败';
      setPanelError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  const openPanel = useCallback(() => {
    setOpen(true);
    void loadTemplates();
  }, [loadTemplates]);

  const openCreate = useCallback(() => {
    setName('');
    const initial = getInitialPrompt ? getInitialPrompt().slice(0, PROMPT_MAX_LENGTH) : '';
    setDraft(initial);
    setFormError('');
    setCreateOpen(true);
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }, [getInitialPrompt]);

  const closeCreate = useCallback(() => {
    if (submitting) return;
    setCreateOpen(false);
    setFormError('');
  }, [submitting]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open && !createOpen && !pendingDelete) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (pendingDelete) setPendingDelete(null);
      else if (createOpen) closeCreate();
      else setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, createOpen, closeCreate, pendingDelete]);

  const applyTemplate = (template: PromptTemplateInfo) => {
    onApply(template.prompt);
    setOpen(false);
  };

  const removeTemplate = async (template: PromptTemplateInfo) => {
    setDeleting(true);
    setPanelError('');
    try {
      await deletePromptTemplate(template.id);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      setPendingDelete(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除模版失败';
      setPanelError(message);
      onError?.(message);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const submitTemplate = async () => {
    const trimmedName = name.trim();
    const trimmedPrompt = draft.trim();
    if (!trimmedName) {
      setFormError('请填写模版名称');
      return;
    }
    if (!trimmedPrompt) {
      setFormError('请填写提示词');
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      const result = await createPromptTemplate({ name: trimmedName, prompt: trimmedPrompt });
      if (result.template) {
        setTemplates((current) => [result.template as PromptTemplateInfo, ...current]);
      } else {
        void loadTemplates();
      }
      setCreateOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建模版失败';
      setFormError(message);
      onError?.(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="flex items-center gap-1 text-[10px] font-black text-amber-400 underline-offset-2 transition hover:text-amber-300 hover:underline"
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        {title}
      </button>

      {open ? (
        <>
          <button
            aria-label="关闭模版面板"
            className="fixed inset-0 z-40 cursor-default"
            type="button"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111114] shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
            style={{
              left: position.left,
              width: PANEL_WIDTH,
              maxHeight: PANEL_MAX_HEIGHT,
              ...(placement === 'below' ? { top: position.top } : { bottom: position.bottom }),
            }}
          >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-white/8 px-4 pb-3 pt-3.5">
              <div className="min-w-0">
                <p className="text-[15px] font-black text-white">我的模版</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{templates.length} 个模版</p>
              </div>
              <button
                className="flex shrink-0 items-center gap-1 rounded-full border border-amber-400/70 px-3 py-1.5 text-[11px] font-bold text-amber-300 transition hover:bg-amber-400/10"
                type="button"
                onClick={openCreate}
              >
                <Plus size={12} />
                创建模版
              </button>
            </div>

            <div className="relative min-h-0 flex-1">
              <div className="no-scrollbar h-full space-y-2 overflow-y-auto p-3">
                {loading ? (
                <div className="flex items-center justify-center py-8 text-[11px] text-zinc-500">正在加载模版...</div>
              ) : templates.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-8 text-center">
                  <p className="text-[12px] font-bold text-zinc-400">还没有模版</p>
                  <p className="text-[11px] text-zinc-600">点击右上角「创建模版」保存常用提示词</p>
                </div>
              ) : (
                templates.map((template) => (
                  <div
                    className="group relative cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition hover:border-amber-400/40 hover:bg-white/[0.06]"
                    key={template.id}
                    onClick={() => applyTemplate(template)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        applyTemplate(template);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <p className="pr-8 text-[13px] font-bold text-white">{template.name}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-500">{template.prompt}</p>
                    <button
                      className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/10 hover:text-rose-300"
                      title="删除模版"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDelete(template);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
              </div>
            </div>

            {pendingDelete ? (
              <div
                className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-black/60 px-4"
                onClick={() => {
                  if (!deleting) setPendingDelete(null);
                }}
              >
                <div
                  className="w-full max-w-[240px] rounded-xl border border-white/10 bg-[#141416] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-white">删除模版</p>
                      <p className="mt-0.5 truncate text-[10px] text-zinc-500">{pendingDelete.name}</p>
                    </div>
                    <button
                      aria-label="关闭"
                      className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:text-white disabled:opacity-50"
                      disabled={deleting}
                      type="button"
                      onClick={() => setPendingDelete(null)}
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <div className="mt-2.5 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-[11px] text-zinc-300">
                    确认删除这个模版吗？
                  </div>

                  <div className="mt-2.5 flex items-center justify-end gap-2">
                    <button
                      className="rounded-full px-3 py-1 text-[11px] font-semibold text-zinc-400 transition hover:text-white disabled:opacity-50"
                      disabled={deleting}
                      type="button"
                      onClick={() => setPendingDelete(null)}
                    >
                      取消
                    </button>
                    <button
                      className="rounded-full bg-red-500 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={deleting}
                      type="button"
                      onClick={() => void removeTemplate(pendingDelete)}
                    >
                      {deleting ? '删除中...' : '删除'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {panelError ? (
              <p className="shrink-0 border-t border-white/8 px-4 py-2 text-[11px] text-rose-300">{panelError}</p>
            ) : null}
          </div>
        </>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
          <button
            aria-label="关闭创建模版弹窗"
            className="absolute inset-0"
            type="button"
            onClick={closeCreate}
          />
          <div className="relative z-10 flex max-h-full w-full max-w-[520px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#0c0c0d] shadow-[0_28px_90px_rgba(0,0,0,0.6)]">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <h2 className="text-lg font-black text-white">创建模版</h2>
              <button
                aria-label="关闭"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#2b2b2e] text-[#9a9ba3] transition hover:border-[#444449] hover:text-white"
                type="button"
                onClick={closeCreate}
              >
                <X size={16} />
              </button>
            </header>

            <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-zinc-400" htmlFor="prompt-template-name">
                  模版名称
                </label>
                <input
                  autoFocus
                  className="input w-full bg-transparent! px-3.5 py-2.5 text-[13px] text-white placeholder:text-zinc-600"
                  id="prompt-template-name"
                  maxLength={NAME_MAX_LENGTH}
                  placeholder="例如：电商主图"
                  ref={nameInputRef}
                  value={name}
                  onChange={(event) => setName(event.target.value.slice(0, NAME_MAX_LENGTH))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-zinc-400" htmlFor="prompt-template-prompt">
                  提示词
                </label>
                <textarea
                  className="input h-[180px] w-full resize-none bg-transparent! px-3.5 py-2.5 text-[13px] leading-6 text-white placeholder:text-zinc-600"
                  id="prompt-template-prompt"
                  maxLength={PROMPT_MAX_LENGTH}
                  placeholder="输入要保存为模版的提示词"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, PROMPT_MAX_LENGTH))}
                />
                <div className="text-right text-[11px] text-zinc-500">{draft.length} / {PROMPT_MAX_LENGTH}</div>
              </div>

              {formError ? <p className="text-[11px] text-rose-300">{formError}</p> : null}
            </div>

            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
              <button
                className="rounded-full px-4 py-1.5 text-sm font-semibold text-zinc-400 transition hover:text-white"
                type="button"
                onClick={closeCreate}
              >
                取消
              </button>
              <button
                className="rounded-full bg-white px-5 py-1.5 text-sm font-semibold text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={submitting}
                type="button"
                onClick={() => void submitTemplate()}
              >
                {submitting ? '提交中...' : '提交'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
