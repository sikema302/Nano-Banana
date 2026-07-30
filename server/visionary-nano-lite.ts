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
  requestTimeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  requestId?: string;
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

export async function generateVisionaryNanoLite(
  input: VisionaryNanoLiteInput,
  options: VisionaryNanoLiteOptions,
) {
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const maxPolls = options.maxPolls ?? 120;
  const requestTimeoutMs = options.requestTimeoutMs ?? 60_000;
  const requestId = options.requestId || `nano-lite-${globalThis.crypto.randomUUID()}`;
  const headers = {
    Authorization: /^Bearer\s/i.test(options.apiKey) ? options.apiKey : `Bearer ${options.apiKey}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': requestId,
  };

  const submitResponse = await fetchImpl(`${baseUrl}/v1/images/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'nano-banana-2-lite',
      prompt: input.prompt,
      images: input.images,
      size: input.ratio || '1:1',
      resolution: '1K',
    }),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const submitted = taskData(await readResponse(submitResponse, '提交 Nano Banana 2 Lite 任务失败'));
  const taskId = String(submitted?.task_id || submitted?.id || '').trim();
  if (!taskId) throw new Error('Visionary Nano Banana 2 Lite 返回结果中缺少 task_id');

  let retryAfterSeconds = Math.max(1, Number(submitted?.retry_after || 3));
  for (let poll = 0; poll < maxPolls; poll += 1) {
    await sleep(retryAfterSeconds * 1_000);
    const statusResponse = await fetchImpl(`${baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: {
        Authorization: headers.Authorization,
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const statusPayload = await readResponse(statusResponse, '查询 Nano Banana 2 Lite 任务失败');
    const statusData = taskData(statusPayload);
    if (!statusData) throw new Error('Visionary Nano Banana 2 Lite 返回了空任务状态');

    const status = String(statusData.status || '').trim().toLowerCase();
    if (status === 'completed' || status === 'succeeded') {
      const imageUrl = completedImageUrl(statusData);
      if (!imageUrl) throw new Error(`Visionary Nano Banana 2 Lite 任务完成但没有图片地址：${taskId}`);
      return imageUrl;
    }
    if (status === 'failed' || status === 'cancelled') {
      throw new Error(errorMessage(statusData.error) || `Visionary Nano Banana 2 Lite 生成失败：${taskId}`);
    }
    retryAfterSeconds = Math.max(1, Number(statusData.retry_after || retryAfterSeconds));
  }

  throw new Error(`Visionary Nano Banana 2 Lite 查询超时：${taskId}`);
}
