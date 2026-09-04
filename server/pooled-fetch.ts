import { Agent, type Dispatcher } from 'undici';

/**
 * 带并发限制和连接池复用的 fetch 封装。
 * 解决高并发时 TCP 连接被快速创建/销毁导致的 TIME_WAIT 堆积和对端断连问题。
 */

type Semaphore = {
  acquire: () => Promise<void>;
  release: () => void;
};

function createSemaphore(maxConcurrent: number): Semaphore {
  let current = 0;
  const queue: Array<() => void> = [];

  return {
    async acquire() {
      if (current < maxConcurrent) {
        current += 1;
        return;
      }
      await new Promise<void>((resolve) => queue.push(resolve));
      current += 1;
    },
    release() {
      current -= 1;
      const next = queue.shift();
      if (next) next();
    },
  };
}

// 每个 baseUrl 独立的并发限制器（默认最多 10 个并发）
const semaphores = new Map<string, Semaphore>();
const DEFAULT_MAX_CONCURRENT = 10;

function getSemaphore(baseUrl: string, maxConcurrent = DEFAULT_MAX_CONCURRENT): Semaphore {
  const key = baseUrl.toLowerCase().replace(/\/+$/, '');
  let sem = semaphores.get(key);
  if (!sem) {
    sem = createSemaphore(maxConcurrent);
    semaphores.set(key, sem);
  }
  return sem;
}

// 连接池复用：每个 baseUrl 一个 Agent
const agents = new Map<string, Agent>();

function getAgent(baseUrl: string): Agent {
  const key = baseUrl.toLowerCase().replace(/\/+$/, '');
  let agent = agents.get(key);
  if (!agent) {
    agent = new Agent({
      keepAliveTimeout: 60_000,      // 60 秒空闲后关闭
      keepAliveMaxTimeout: 600_000,  // 最长 10 分钟
      connections: 50,               // 每个 origin 最多 50 个连接
      pipelining: 1,                 // 禁用 HTTP pipelining（避免兼容性问题）
      connect: {
        timeout: 30_000,             // 连接超时 30 秒（比默认 10s 宽松，减少高负载时超时）
      },
    });
    agents.set(key, agent);
  }
  return agent;
}

/**
 * 判断错误是否是「连接被对端断开」类型，这类错误应快速 fallback 而不是死等。
 */
export function isConnectionTerminatedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; cause?: { code?: string }; message?: string };
  const code = err.code || err.cause?.code || '';
  const message = (err.message || '').toLowerCase();
  return (
    code === 'UND_ERR_SOCKET' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    message === 'terminated' ||
    message.includes('other side closed') ||
    message.includes('fetch failed') && message.includes('socket')
  );
}

export type PooledFetchOptions = {
  baseUrl: string;
  maxConcurrent?: number;
  timeoutMs?: number;
};

/**
 * 带并发限制和连接池的 fetch。
 * - 并发限制：同一 baseUrl 最多同时 maxConcurrent 个请求
 * - 连接池：复用 TCP 连接，减少 TIME_WAIT
 * - 超时：通过 AbortController 控制
 */
export async function pooledFetch(
  url: string,
  init: RequestInit & { dispatcher?: Dispatcher } = {},
  options: PooledFetchOptions,
): Promise<Response> {
  const { baseUrl, maxConcurrent, timeoutMs } = options;
  const sem = getSemaphore(baseUrl, maxConcurrent);
  const agent = getAgent(baseUrl);

  await sem.acquire();
  try {
    const controller = new AbortController();
    const timeout = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(url, {
        ...init,
        signal: init.signal || controller.signal,
        // undici 的 dispatcher 属性不在标准 RequestInit 类型里，需要断言
        dispatcher: agent,
      } as RequestInit);
      return response;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  } finally {
    sem.release();
  }
}

/**
 * 判断是否应该对当前渠道快速 fallback（连接断开类错误 + 不可重试错误）。
 */
export function shouldFastFailover(error: unknown): boolean {
  if (isConnectionTerminatedError(error)) return true;
  const err = error as { safeToFallback?: boolean; status?: number };
  if (err.safeToFallback === false) return true;
  // 4xx 错误（除 429）通常不需要重试同渠道
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 500 && err.status !== 429) {
    return true;
  }
  return false;
}
