import { setTimeout as sleep } from 'node:timers/promises';

function errorValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  return (
    errorValue(record.message) ||
    errorValue(record.error) ||
    errorValue(record.detail) ||
    errorValue(record.failure_reason) ||
    errorValue(record.reason)
  );
}

export function isValidImageBuffer(buffer: Buffer, contentType: string) {
  if (buffer.length < 16) return false;

  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const gifHeader = buffer.subarray(0, 6).toString('ascii');
  const isGif = gifHeader === 'GIF87a' || gifHeader === 'GIF89a';
  const isWebp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  const trimmedStart = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8').trimStart();
  const isSvg = contentType.startsWith('image/svg+xml') && (trimmedStart.startsWith('<svg') || trimmedStart.includes('<svg'));

  return isPng || isJpeg || isGif || isWebp || isSvg;
}

export function generatedImageDownloadError(buffer: Buffer, fallback: string) {
  if (buffer.length > 64 * 1024) return fallback;
  const responseText = buffer.toString('utf8').trim();
  if (!responseText) return fallback;

  try {
    return errorValue(JSON.parse(responseText)) || fallback;
  } catch {
    return errorValue(responseText) || fallback;
  }
}

function shouldRetry(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('归档') || normalized.includes('稍后重试') || normalized.includes('archiv');
}

export async function downloadGeneratedImage(
  sourceUrl: string,
  retryDelaysMs = [0, 2_000, 4_000, 8_000, 12_000, 18_000, 25_000],
) {
  let lastError = 'Download generated image failed';

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    if (retryDelaysMs[attempt] > 0) await sleep(retryDelaysMs[attempt]);

    let response: Response;
    try {
      response = await fetch(sourceUrl, {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Download generated image failed';
      if (attempt === retryDelaysMs.length - 1) throw new Error(lastError);
      continue;
    }

    const contentType = String(response.headers.get('content-type') || '').trim().toLowerCase();
    const buffer = Buffer.from(await response.arrayBuffer());
    if (response.ok && isValidImageBuffer(buffer, contentType)) return { buffer, contentType };

    lastError = generatedImageDownloadError(
      buffer,
      response.ok ? '图像服务返回的结果不是有效图片' : `Download generated image failed (${response.status})`,
    );
    if (!shouldRetry(lastError) || attempt === retryDelaysMs.length - 1) throw new Error(lastError);

    console.warn(`[generated-image] result is not ready, retry ${attempt + 2}/${retryDelaysMs.length}`);
  }

  throw new Error(lastError);
}
