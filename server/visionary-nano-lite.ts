type VisionaryNanoLiteInput = {
  prompt: string;
  ratio: string;
  images: string[];
};

type VisionaryNanoLiteOptions = {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  maxPolls?: number;
  maxPollErrors?: number;
  requestTimeoutMs?: number;
  submitTimeoutMs?: number;
  pollTimeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  requestId?: string;
  logger?: Pick<Console, 'warn'>;
};

type VisionaryTaskImage = {
  url?: string | string[];
};

type VisionaryTaskData = {
  id?: string;
  task_id?: string;
  status?: string;
  retry_after?: number;
  error?: unknown;
  result?: {
    images?: VisionaryTaskImage[];
  };
};

type VisionaryTaskEnvelope = {
  data?: VisionaryTaskData | VisionaryTaskData[];
  error?: unknown;
  message?: unknown;
};

function errorMessage(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  return (
    errorMessage(record.message) ||
    errorMessage(record.error) ||
    errorMessage(record.detail) ||
    errorMessage(record.failure_reason)
  );
}

function taskData(payload: VisionaryTaskEnvelope) {
  if (Array.isArray(payload.data)) return payload.data[0] || null;
  return payload.data || null;
}

async function readResponse(response: Response, fallback: string) {
  const text = await response.text().catch(() => '');
  let payload: VisionaryTaskEnvelope = {};
  try {
    payload = text ? JSON.parse(text) as VisionaryTaskEnvelope : {};
  } catch {
    // The HTTP status and short response excerpt are enough for the public error.
  }
  if (!response.ok) {
    throw new Error(errorMessage(payload) || `${fallback} (${response.status}): ${text.slice(0, 240)}`);
  }
  return payload;
}

function completedImageUrl(data: VisionaryTaskData) {
  const value = data.result?.images?.[0]?.url;
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
}

function caughtErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return errorMessage(error) || String(error || 'unknown error');
}

export async function generateVisionaryNanoLite(
  input: VisionaryNanoLiteInput,
  options: VisionaryNanoLiteOptions,
) {
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const maxPolls = options.maxPolls ?? 240;
  const maxPollErrors = options.maxPollErrors ?? 3;
  const submitTimeoutMs = options.submitTimeoutMs ?? options.requestTimeoutMs ?? 120_000;
  const pollTimeoutMs = options.pollTimeoutMs ?? options.requestTimeoutMs ?? 120_000;
  const requestId = options.requestId || `nano-lite-${globalThis.crypto.randomUUID()}`;
  const logger = options.logger || console;
  const headers = {
    Authorization: /^Bearer\s/i.test(options.apiKey) ? options.apiKey : `Bearer ${options.apiKey}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': requestId,
  };

  let submitted: VisionaryTaskData | null = null;
  try {
    const submitResponse = await fetchImpl(`${baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'nano-banana-2-lite',
        prompt: input.prompt,
        images: input.images,
        size: input.ratio || '1:1',
        resolution: '1K',
        optimizeChineseText: false,
        client_request_id: requestId,
      }),
      signal: AbortSignal.timeout(submitTimeoutMs),
    });
    submitted = taskData(await readResponse(submitResponse, '提交 Nano Banana 2 Lite 任务失败'));
  } catch (error) {
    const detail = caughtErrorMessage(error);
    logger.warn(`[visionary-nano-lite] submit failed requestId=${requestId}: ${detail}`);
    throw new Error(`Visionary Nano Banana 2 Lite 提交阶段失败（请求 ID：${requestId}）：${detail}`);
  }
  const taskId = String(submitted?.task_id || submitted?.id || '').trim();
  if (!taskId) {
    logger.warn(`[visionary-nano-lite] submit response missing task_id requestId=${requestId}`);
    throw new Error(`Visionary Nano Banana 2 Lite 提交结果缺少 task_id（请求 ID：${requestId}）`);
  }

  let retryAfterSeconds = Math.max(1, Number(submitted?.retry_after || 3));
  let consecutivePollErrors = 0;
  for (let poll = 0; poll < maxPolls; poll += 1) {
    await sleep(retryAfterSeconds * 1_000);
    let statusData: VisionaryTaskData | null = null;
    try {
      const statusResponse = await fetchImpl(`${baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers: {
          Authorization: headers.Authorization,
        },
        signal: AbortSignal.timeout(pollTimeoutMs),
      });
      const statusPayload = await readResponse(statusResponse, '查询 Nano Banana 2 Lite 任务失败');
      statusData = taskData(statusPayload);
      if (!statusData) throw new Error('Visionary Nano Banana 2 Lite 返回了空任务状态');
      consecutivePollErrors = 0;
    } catch (error) {
      consecutivePollErrors += 1;
      const detail = caughtErrorMessage(error);
      logger.warn(
        `[visionary-nano-lite] poll failed taskId=${taskId} requestId=${requestId} ` +
        `attempt=${poll + 1} consecutiveErrors=${consecutivePollErrors}/${maxPollErrors}: ${detail}`,
      );
      if (consecutivePollErrors >= maxPollErrors) {
        throw new Error(
          `Visionary Nano Banana 2 Lite 查询阶段连续失败（任务 ID：${taskId}，请求 ID：${requestId}）：${detail}`,
        );
      }
      continue;
    }

    const status = String(statusData.status || '').trim().toLowerCase();
    if (status === 'completed' || status === 'succeeded') {
      const imageUrl = completedImageUrl(statusData);
      if (!imageUrl) throw new Error(`Visionary Nano Banana 2 Lite 任务完成但没有图片地址：${taskId}`);
      return imageUrl;
    }
    if (status === 'failed' || status === 'cancelled') {
      const detail = errorMessage(statusData.error) || '上游未返回具体失败原因';
      logger.warn(
        `[visionary-nano-lite] task failed taskId=${taskId} requestId=${requestId} status=${status}: ${detail}`,
      );
      throw new Error(`Visionary Nano Banana 2 Lite 生成失败（任务 ID：${taskId}）：${detail}`);
    }
    retryAfterSeconds = Math.max(1, Number(statusData.retry_after || retryAfterSeconds));
  }

  logger.warn(`[visionary-nano-lite] polling window exceeded taskId=${taskId} requestId=${requestId}`);
  throw new Error(`Visionary Nano Banana 2 Lite 查询超时（任务 ID：${taskId}，请求 ID：${requestId}）`);
}
