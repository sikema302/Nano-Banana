import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string;
  endpoint: string;
};

type R2Command = PutObjectCommand | HeadObjectCommand | DeleteObjectCommand | ListObjectsV2Command;

export type R2CommandClient = {
  send(command: R2Command): Promise<Record<string, unknown>>;
};

const CONFIG_KEYS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL',
] as const;

function normalized(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/^['"]|['"]$/g, '') : '';
}

function withoutTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function readR2Config(env: NodeJS.ProcessEnv = process.env): R2Config | null {
  const values = Object.fromEntries(CONFIG_KEYS.map((key) => [key, normalized(env[key])])) as Record<
    (typeof CONFIG_KEYS)[number],
    string
  >;
  const configuredKeys = CONFIG_KEYS.filter((key) => values[key]);
  if (configuredKeys.length === 0) return null;

  const missingKeys = CONFIG_KEYS.filter((key) => !values[key]);
  if (missingKeys.length > 0) {
    throw new Error(`Incomplete R2 configuration: missing ${missingKeys.join(', ')}`);
  }

  const publicBaseUrl = withoutTrailingSlash(values.R2_PUBLIC_BASE_URL);
  const parsedPublicUrl = new URL(publicBaseUrl);
  if (parsedPublicUrl.protocol !== 'https:') {
    throw new Error('R2_PUBLIC_BASE_URL must use https');
  }

  return {
    accountId: values.R2_ACCOUNT_ID,
    accessKeyId: values.R2_ACCESS_KEY_ID,
    secretAccessKey: values.R2_SECRET_ACCESS_KEY,
    bucketName: values.R2_BUCKET_NAME,
    publicBaseUrl,
    endpoint: `https://${values.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  };
}

export function contentTypeForObjectKey(key: string) {
  const extension = path.extname(key).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.txt') return 'text/plain; charset=utf-8';
  return 'image/png';
}

export function legacyAssetObjectKey(assetPath: string) {
  let pathname = normalized(assetPath);
  if (!pathname) return '';

  try {
    pathname = new URL(pathname).pathname;
  } catch {
    pathname = pathname.split(/[?#]/, 1)[0] || '';
  }

  const match = pathname.match(/^\/(?:uploads\/)?(generated|thumbnails)\/([^/]+)$/);
  if (!match) return '';
  return `${match[1]}/${match[2]}`;
}

export function thumbnailUrlForImage(imagePath: string, publicBaseUrl: string) {
  const normalizedImagePath = normalized(imagePath);
  if (!normalizedImagePath) return '';

  const localMatch = normalizedImagePath.match(/^\/uploads\/generated\/([^/?#]+)$/);
  if (localMatch) {
    return `/uploads/thumbnails/${localMatch[1].replace(/\.[^.]+$/, '')}.webp`;
  }

  try {
    const imageUrl = new URL(normalizedImagePath);
    const configuredBaseUrl = new URL(withoutTrailingSlash(publicBaseUrl));
    if (imageUrl.origin !== configuredBaseUrl.origin) return '';
    const key = legacyAssetObjectKey(imageUrl.pathname);
    if (!key.startsWith('generated/')) return '';
    const fileName = path.posix.basename(key).replace(/\.[^.]+$/, '');
    return `${withoutTrailingSlash(publicBaseUrl)}/thumbnails/${fileName}.webp`;
  } catch {
    return '';
  }
}

const R2_PUT_RETRY_DELAYS_MS = [0, 1_000, 3_000, 8_000];

function isPermanentR2Error(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const metadata = record.$metadata as Record<string, unknown> | undefined;
  const status = Number(metadata?.httpStatusCode);
  if ([400, 401, 403, 404].includes(status)) return true;

  const signature = `${String(record.name || '')} ${String(record.code || '')} ${String(record.message || '')}`.toLowerCase();
  return (
    signature.includes('invalidaccesskeyid') ||
    signature.includes('signaturedoesnotmatch') ||
    signature.includes('accessdenied') ||
    signature.includes('access denied') ||
    signature.includes('nosuchbucket') ||
    signature.includes('invalidbucketname')
  );
}

export class R2ObjectStorage {
  constructor(
    readonly config: R2Config,
    private readonly client: R2CommandClient,
  ) {}

  publicUrl(key: string) {
    return `${this.config.publicBaseUrl}/${key.replace(/^\/+/, '')}`;
  }

  async putVerifiedObject(
    key: string,
    body: Buffer,
    contentType = contentTypeForObjectKey(key),
    retryDelaysMs: readonly number[] = R2_PUT_RETRY_DELAYS_MS,
  ) {
    let lastError: unknown = new Error(`R2 upload failed for ${key}`);

    for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
      const delay = retryDelaysMs[attempt];
      if (delay > 0) await sleep(delay);

      try {
        return await this.putAndVerifyObject(key, body, contentType);
      } catch (error) {
        lastError = error;
        if (isPermanentR2Error(error) || attempt === retryDelaysMs.length - 1) break;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[r2-upload] retry ${attempt + 2}/${retryDelaysMs.length} for ${key}: ${message}`);
      }
    }

    throw lastError;
  }

  private async putAndVerifyObject(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
        Body: body,
        ContentLength: body.byteLength,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    const head = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      }),
    );
    const remoteSize = Number(head.ContentLength);
    if (!Number.isFinite(remoteSize) || remoteSize !== body.byteLength) {
      // Same key + same body, so re-putting is idempotent and a stale HEAD can recover on retry.
      throw new Error(`R2 verification failed for ${key}: expected ${body.byteLength}, received ${remoteSize}`);
    }

    return this.publicUrl(key);
  }

  async deleteObject(key: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      }),
    );
  }

  async listObjectSizes(prefixes: string[]) {
    const objects = new Map<string, number>();
    for (const prefix of prefixes) {
      let continuationToken: string | undefined;
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.config.bucketName,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        const contents = Array.isArray(page.Contents)
          ? page.Contents as Array<{ Key?: unknown; Size?: unknown }>
          : [];
        for (const item of contents) {
          const key = typeof item.Key === 'string' ? item.Key : '';
          const size = Number(item.Size);
          if (key && Number.isFinite(size)) objects.set(key, size);
        }
        continuationToken = typeof page.NextContinuationToken === 'string'
          ? page.NextContinuationToken
          : undefined;
      } while (continuationToken);
    }
    return objects;
  }

  async verifyRoundTrip() {
    const key = `health/verify-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`;
    const body = Buffer.from('pixory-r2-ok', 'utf8');
    await this.putVerifiedObject(key, body, 'text/plain; charset=utf-8');
    await this.deleteObject(key);
  }
}

export function createR2ObjectStorage(
  env: NodeJS.ProcessEnv = process.env,
  commandClient?: R2CommandClient,
) {
  const config = readR2Config(env);
  if (!config) return null;

  const client = commandClient || (new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    maxAttempts: 2,
  }) as unknown as R2CommandClient);

  return new R2ObjectStorage(config, client);
}
