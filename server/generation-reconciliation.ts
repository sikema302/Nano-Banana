// 生图请求「上游异步任务结果尚未确定」时的后台对账（reconciliation）语义。
//
// 背景：异步渠道（Schat / Flux / Visionary Lite）轮询窗口耗尽或整体超时时，
// 上游任务往往仍在队列里继续执行，之后可能出图并计费。若此时就把请求判成
// 终局失败并退款，会出现「公司垫付上游成本、用户却被退款」的成本泄漏。
// 因此必须区分「确定性失败」（可立即终局）与「不确定超时」（进入后台幂等续查）。

export type GenerationResumeKind = 'schat' | 'flux-banana' | 'visionary-lite';

/**
 * 后台幂等续查所需的全部信息。绝不包含 apiKey 等密钥——续查时由
 * server/index.ts 按 channelId / 渠道配置现取，避免错误对象把密钥带进日志。
 */
export type GenerationResume = {
  kind: GenerationResumeKind;
  taskId: string;
  /** Schat / Flux 的轮询地址；Visionary Lite 用 taskId 拼接查询端点。 */
  pollUrl?: string;
  /** provider 已知的上游模型名，续查时用于重放（避免按 imageSize 猜错模型）。 */
  sourceModel?: string;
  /** 由调用方（failover 处）回填的渠道 id，用于选择续查时使用的配置。 */
  channelId?: string;
};

/** 有界对账窗口：超过即终局失败 + 退款，避免无限后台轮询（≥ 后端最坏 15~20 分钟）。 */
export const GENERATION_RECONCILIATION_WINDOW_MS = 20 * 60_000;
/** 后台对账扫描间隔。 */
export const GENERATION_RECONCILIATION_INTERVAL_MS = 20_000;

/** provider 抛出「不确定、可续查」错误时打上的标记。 */
export type IndeterminateGenerationError = Error & {
  indeterminate?: boolean;
  resume?: GenerationResume;
};

export function isIndeterminateGenerationError(error: unknown): error is IndeterminateGenerationError {
  return Boolean(
    error && typeof error === 'object' && (error as IndeterminateGenerationError).indeterminate === true,
  );
}

/** 从错误上提取可幂等续查的 resume 信息；不可续查（无 taskId）时返回 null。 */
export function resumeFromError(error: unknown): GenerationResume | null {
  if (!isIndeterminateGenerationError(error)) return null;
  const resume = error.resume;
  return resume && resume.taskId ? resume : null;
}

/** 有界对账窗口判定（纯函数，便于单测）。 */
export function reconciliationExpired(
  startedAtMs: number,
  nowMs: number,
  windowMs: number = GENERATION_RECONCILIATION_WINDOW_MS,
): boolean {
  return nowMs - startedAtMs >= windowMs;
}

/** 构造「不确定、可续查」错误，统一 provider 侧的字段书写。 */
export function indeterminateTaskError(
  message: string,
  resume: GenerationResume,
): IndeterminateGenerationError & { safeToFallback: boolean } {
  const error = new Error(message) as IndeterminateGenerationError & { safeToFallback: boolean };
  error.safeToFallback = false;
  error.indeterminate = true;
  error.resume = resume;
  return error;
}

/** 单次续查的结论：成功拿到图 / 上游明确失败 / 仍不确定。 */
export type ReconciliationAttempt =
  | { status: 'succeeded'; imageSource: string }
  | { status: 'failed'; reason: string }
  | { status: 'pending'; reason: string };

/**
 * 由「续查一次」的结果或异常，判定该任务当前状态（纯函数，便于单测）。
 * - 返回了图片 → 迟到成功；
 * - 抛出带 indeterminate 标记的错误 → 任务仍在上游跑，继续等待；
 * - 抛出 safeToFallback===true 的错误 → 上游对该任务给出明确失败结论，可立即终局；
 * - 其余未知错误 → 保守视为仍不确定，等对账窗口到期再终局（避免误判退款后成本泄漏）。
 */
export function classifyReconciliationAttempt(result: { imageSource?: string; error?: unknown }): ReconciliationAttempt {
  if (result.imageSource) return { status: 'succeeded', imageSource: result.imageSource };
  const error = result.error;
  if (isIndeterminateGenerationError(error)) {
    return { status: 'pending', reason: error instanceof Error ? error.message : 'unknown' };
  }
  if (error && typeof error === 'object' && (error as { safeToFallback?: unknown }).safeToFallback === true) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
  return {
    status: 'pending',
    reason: error instanceof Error ? error.message : String(error || 'unknown'),
  };
}

/** 后台对账条目：一次「不确定」的异步任务在被收场前需要携带的全部状态。 */
export type ReconciliationEntry = {
  /** 幂等键：同一 taskId 重复登记时覆盖，避免重复对账。 */
  key: string;
  jobId: string;
  /** 该次不确定尝试对应的 generation_requests 行 id，用于迟到成功/失败时翻转状态。 */
  requestId?: string;
  startedAtMs: number;
};

export type ReconciliationDeps<T extends ReconciliationEntry> = {
  /** 复用已存在 taskId 续查一次；成功返回图片源，失败/未确定则抛错（绝不重新提交）。 */
  resume: (entry: T) => Promise<string>;
  /** 迟到成功：补图 + 补扣款 + 写历史 + 翻转请求与 job 为 succeeded。 */
  onSuccess: (entry: T, imageSource: string) => Promise<void>;
  /** 上游明确失败：立即终局失败（未扣款，无需退款，释放预留即可）。 */
  onConfirmedFailure: (entry: T, reason: string) => Promise<void>;
  /** 超过有界对账窗口仍无结论：终局失败 + 释放预留（从未扣款）。 */
  onExpired: (entry: T) => Promise<void>;
  now?: () => number;
  windowMs?: number;
  logger?: Pick<Console, 'warn' | 'error'>;
};

/**
 * 进程内后台对账器（单进程 PM2 scale=1，可用 setInterval 驱动）。
 * 每次 tick 只处理「已登记」的任务；处理前先摘除条目，避免并发/重入导致重复扣款。
 */
export function createGenerationReconciler<T extends ReconciliationEntry>(deps: ReconciliationDeps<T>) {
  const now = deps.now ?? Date.now;
  const windowMs = deps.windowMs ?? GENERATION_RECONCILIATION_WINDOW_MS;
  const logger = deps.logger ?? console;
  const pending = new Map<string, T>();

  function register(entry: T) {
    if (entry?.key) pending.set(entry.key, entry);
  }

  // 先摘除再执行：即使执行中途失败也不会在下个 tick 重放（避免重复扣款），失败仅记日志。
  async function settle(entry: T, task: () => Promise<void>) {
    pending.delete(entry.key);
    try {
      await task();
    } catch (error) {
      logger.warn(`[generation-reconcile] ${entry.key} settle failed:`, error);
    }
  }

  async function tick() {
    for (const entry of [...pending.values()]) {
      let imageSource = '';
      try {
        imageSource = await deps.resume(entry);
      } catch (error) {
        const outcome = classifyReconciliationAttempt({ error });
        if (outcome.status === 'failed') {
          await settle(entry, () => deps.onConfirmedFailure(entry, outcome.reason));
          continue;
        }
        // pending：无图继续走下面的窗口判定。
      }
      if (imageSource) {
        await settle(entry, () => deps.onSuccess(entry, imageSource));
        continue;
      }
      if (reconciliationExpired(entry.startedAtMs, now(), windowMs)) {
        await settle(entry, () => deps.onExpired(entry));
      }
    }
  }

  return {
    register,
    get: (key: string) => pending.get(key),
    size: () => pending.size,
    tick,
  };
}