import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Brain, ChevronDown, Lightbulb, LoaderCircle, Menu, MessageSquarePlus, Send, Sparkles, Trash2, X } from 'lucide-react';

import {
  createChatConversation,
  deleteChatConversation,
  fetchChatConversations,
  sendChatMessage,
  type ChatConversation,
  type ChatModel,
} from './lib/api';

interface ChatViewProps {
  loggedIn: boolean;
  username?: string;
  onLogin: () => void;
}

const suggestions = [
  { icon: Lightbulb, title: '开动小脑筋', prompt: '给我一个适合夏日冰饮电商海报的创意方案和完整提示词。' },
  { icon: Sparkles, title: '生成一份 AI 漫画提示词', prompt: '帮我写一份四格 AI 漫画提示词，主题是设计师和人工智能成为搭档。' },
];

export default function ChatView({ loggedIn, username, onLogin }: ChatViewProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState('');
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const active = useMemo(
    () => conversations.find((item) => item.id === activeId) || conversations[0] || null,
    [activeId, conversations],
  );

  useEffect(() => {
    if (!loggedIn) {
      setConversations([]);
      setActiveId('');
      return;
    }
    setInitializing(true);
    setError('');
    void fetchChatConversations()
      .then((payload) => {
        setConversations(payload.conversations);
        setModels(payload.models);
        setSelectedModel(payload.models[0]?.id || '');
        setActiveId(payload.conversations[0]?.id || '');
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : '会话加载失败'))
      .finally(() => setInitializing(false));
  }, [loggedIn]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages.length, loading]);

  async function createConversation() {
    if (!loggedIn) {
      onLogin();
      return null;
    }
    setError('');
    const payload = await createChatConversation();
    setConversations((current) => [payload.conversation, ...current]);
    setActiveId(payload.conversation.id);
    setSidebarOpen(false);
    return payload.conversation;
  }

  async function removeConversation(id: string) {
    setError('');
    try {
      await deleteChatConversation(id);
      setConversations((current) => {
        const next = current.filter((item) => item.id !== id);
        if (activeId === id) setActiveId(next[0]?.id || '');
        return next;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除会话失败');
    }
  }

  async function submit(event?: FormEvent, suggestedPrompt?: string) {
    event?.preventDefault();
    const content = (suggestedPrompt ?? input).trim();
    if (!content || loading) return;
    if (!loggedIn) {
      onLogin();
      return;
    }

    setLoading(true);
    setError('');
    try {
      let conversation = active;
      if (!conversation) conversation = await createConversation();
      if (!conversation) return;
      const optimistic = {
        ...conversation,
        messages: [...conversation.messages, { id: `pending-${Date.now()}`, role: 'user' as const, content, createdAt: new Date().toISOString() }],
      };
      setConversations((current) => current.map((item) => (item.id === conversation!.id ? optimistic : item)));
      setInput('');
      const payload = await sendChatMessage(conversation.id, { content, model: selectedModel });
      setConversations((current) => [payload.conversation, ...current.filter((item) => item.id !== payload.conversation.id)]);
      setActiveId(payload.conversation.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '消息发送失败');
      if (active) {
        setConversations((current) => current.map((item) => item.id === active.id ? active : item));
      }
    } finally {
      setLoading(false);
    }
  }

  const selected = models.find((item) => item.id === selectedModel) || models[0];

  return (
    <section className="relative flex h-full min-h-[calc(100dvh-64px)] overflow-hidden bg-[#101010] lg:min-h-0">
      {sidebarOpen ? <button className="absolute inset-0 z-30 bg-black/70 lg:hidden" aria-label="关闭会话列表" onClick={() => setSidebarOpen(false)} /> : null}
      <aside className={`absolute inset-y-0 left-0 z-40 flex w-[300px] flex-col border-r border-white/10 bg-[#0b0b0b] p-4 transition-transform lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <span className="font-black text-white">会话</span>
          <button className="btn-ghost min-h-0 p-2" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>
        <button className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-4 py-3.5 text-sm font-black text-white transition hover:bg-white/[0.06]" onClick={() => void createConversation()}>
          <MessageSquarePlus size={18} /> 新对话
        </button>
        <div className="custom-scrollbar mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {conversations.map((item) => (
            <div key={item.id} className={`group flex items-center rounded-xl ${active?.id === item.id ? 'bg-white/[0.12]' : 'hover:bg-white/[0.05]'}`}>
              <button className="min-w-0 flex-1 truncate px-4 py-3 text-left text-sm text-zinc-300" onClick={() => { setActiveId(item.id); setSidebarOpen(false); }}>{item.title}</button>
              <button className="mr-2 rounded-lg p-2 text-zinc-600 opacity-0 transition hover:bg-white/10 hover:text-rose-300 group-hover:opacity-100" aria-label="删除会话" onClick={() => void removeConversation(item.id)}><Trash2 size={15} /></button>
            </div>
          ))}
          {!initializing && conversations.length === 0 ? <p className="px-3 py-6 text-center text-xs text-zinc-600">还没有对话记录</p> : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-white/10 px-3 sm:h-14 sm:px-5">
          <button className="btn-ghost min-h-0 p-1.5 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu size={17} /></button>
          <div className="text-[13px] font-black tracking-wide text-white sm:text-sm">PIXORY-CHAT</div>
          <Brain className="ml-auto text-zinc-500" size={18} />
        </header>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          {!loggedIn ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center"><h1 className="text-3xl font-black text-white">登录后开始对话</h1><p className="mt-3 text-sm text-zinc-500">会话会跟随账号同步到不同设备。</p><button className="btn-primary mt-6 px-6 py-3" onClick={onLogin}>立即登录</button></div>
          ) : initializing ? (
            <div className="flex h-full items-center justify-center"><LoaderCircle className="animate-spin text-zinc-500" /></div>
          ) : !active || active.messages.length === 0 ? (
            <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center px-5 py-12">
              <p className="text-xl font-bold text-zinc-300">hi{username ? `，${username}` : ''}~</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl">今天在想什么呢？</h1>
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                {suggestions.map(({ icon: Icon, title, prompt }) => <button key={title} className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 text-left transition hover:border-white/20 hover:bg-white/[0.06]" onClick={() => void submit(undefined, prompt)}><Icon size={22} className="text-zinc-500" /><strong className="mt-6 block text-base text-white">{title}</strong><span className="mt-2 block text-sm leading-6 text-zinc-500">{prompt}</span></button>)}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-4xl space-y-7 px-4 py-8 sm:px-6">
              {active.messages.map((message) => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={message.role === 'user' ? 'max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-md bg-white px-5 py-3.5 text-sm leading-7 text-black' : 'max-w-[92%] whitespace-pre-wrap text-sm leading-7 text-zinc-200'}>{message.content}</div></div>)}
              {loading ? <div className="flex items-center gap-2 text-sm text-zinc-500"><LoaderCircle className="animate-spin" size={16} /> 正在思考...</div> : null}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#101010] p-3 sm:p-5">
          <form className="relative mx-auto max-w-5xl rounded-3xl border border-white/15 bg-[#0b0b0b] p-3 focus-within:border-white/25" onSubmit={(event) => void submit(event)}>
            <textarea className="min-h-16 w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-white outline-none placeholder:text-zinc-700" maxLength={8000} placeholder={loggedIn ? '给 PIXORY-CHAT 发送消息，Enter 发送，Shift + Enter 换行' : '登录后开始对话'} disabled={!loggedIn || loading} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} />
            <div className="flex items-end justify-between gap-3">
              <div className="relative">
                <button className="flex items-center gap-2 rounded-xl bg-white/[0.08] px-3 py-2 text-xs font-bold text-zinc-300" type="button" disabled={!models.length} onClick={() => setModelOpen((value) => !value)}><Sparkles size={14} /> {selected?.name || '模型未配置'} <ChevronDown size={14} /></button>
                {modelOpen ? <div className="absolute bottom-12 left-0 z-20 w-72 rounded-2xl border border-white/10 bg-[#202020] p-2 shadow-2xl">{models.map((model) => <button key={model.id} className={`block w-full rounded-xl px-4 py-3 text-left ${model.id === selectedModel ? 'bg-white/[0.12]' : 'hover:bg-white/[0.06]'}`} type="button" onClick={() => { setSelectedModel(model.id); setModelOpen(false); }}><strong className="block text-sm text-white">{model.name}</strong><span className="mt-1 block text-xs text-zinc-500">{model.description}</span></button>)}</div> : null}
              </div>
              <button className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-black disabled:opacity-35" type="submit" disabled={!loggedIn || loading || !input.trim() || !selectedModel}>{loading ? <LoaderCircle className="animate-spin" size={17} /> : <Send size={17} />}<span className="hidden sm:inline">发送</span></button>
            </div>
          </form>
          {error ? <p className="mx-auto mt-2 max-w-5xl px-2 text-xs text-rose-400">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
