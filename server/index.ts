import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import compression from 'compression';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// 鈹€鈹€鈹€ 鐜妫€娴?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const IS_VERCEL = Boolean(process.env.VERCEL);

// 鈹€鈹€鈹€ 鍔ㄦ€佸鍏ユā鍧楋紙閬垮厤 Vercel 鏋勫缓鏃跺姞杞斤級 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

// sql.js 鍙湪 SQLite 妯″紡涓嬩娇鐢?// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initSqlJs: any = null;

async function getSqlJs() {
  if (!initSqlJs && !isSupabasePersistenceEnabled()) {
    const sql = await import('sql.js');
    initSqlJs = sql.default;
  }
  return initSqlJs;
}

// Supabase 鏁版嵁搴撳眰鍦ㄤ换浣曞惎鐢ㄤ簡 Supabase 鐨勮繍琛岀幆澧冧笅閮藉彲浣跨敤
let supabaseDb: typeof import('./supabase-db.js') | null = null;

async function getSupabaseDb() {
  if (!supabaseDb) {
    supabaseDb = await import('./supabase-db.js');
  }
  return supabaseDb;
}

// 鈹€鈹€鈹€ 绫诲瀷瀹氫箟 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

type ImageCategory = 'favorite' | 'backup' | 'discarded';

type AuthUser = {
  userId: string;
  username: string;
};

type SupabaseUserInput = {
  id: string;
  username: string;
  passwordHash?: string;
  email?: string | null;
  source?: 'password' | 'invite' | 'system';
  createdAt?: string;
};

type PublicUser = {
  id: string;
  username: string;
  isAdmin: boolean;
  creditsRemaining?: number;
};

type PromoCouponRecord = {
  couponId: string;
  discountPercent: number;
  issuedAt: string;
  expiresAt: string;
  nextEligibleAt: string;
  popupSeenAt?: string;
  source: 'welcome' | 'scheduled';
};

type PromoCouponPayload = {
  couponId: string;
  discountPercent: number;
  issuedAt: string;
  expiresAt: string;
  nextEligibleAt: string;
  purchaseUrl: string;
  active: boolean;
  shouldPopup: boolean;
};

type GeneratedImagePayload = {
  prompt: string;
  modelName: string;
  dimensions: string;
  imageSize?: string;
  imagePath: string;
  referenceImages: string[];
  createdAt: string;
};

type ImageStorageStats = {
  uploadsTotalBytes: number;
  generatedBytes: number;
  generatedCount: number;
  referenceBytes: number;
  referenceCount: number;
  referenceStorageEnabled: boolean;
  retentionDays: number;
};

type ReferenceUploadInput = {
  name: string;
  mimeType: string;
  data: string;
};

type VisionaryGenerationResponse = {
  id?: string;
  results?: Array<{
    url?: string;
    content?: string;
  }>;
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  output?: Array<{
    url?: string;
    content?: string;
  }>;
  url?: string;
  status?: string;
  error?: string;
  failure_reason?: string;
};

type PaginationResult = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ApiCreditPoolId = 'gpt_hd' | 'gpt' | 'banana' | 'legacy';

type ApiCreditPool = {
  id: ApiCreditPoolId;
  name: string;
  envName: string;
  keyPreview: string;
  status: 'available' | 'missing';
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
};

type ApiCreditAllocation = {
  poolId: ApiCreditPoolId;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
};

type ApiCreditAllocationMap = Record<ApiCreditPoolId, ApiCreditAllocation>;

type PublicApiKeyRecord = {
  id: string;
  name: string;
  keyHash: string;
  keyPreview: string;
  encryptedKey?: string;
  totalCredits: number;
  usedCredits: number;
  createdAt: string;
  createdBy: string;
  revokedAt?: string;
};

type SqlDatabase = {
  run: (sql: string, params?: unknown[]) => void;
  exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  prepare: (sql: string, params?: unknown[]) => {
    step: () => boolean;
    getAsObject: () => Record<string, unknown>;
    free: () => void;
  };
  export: () => Uint8Array;
  close: () => void;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

// 鈹€鈹€鈹€ 璺緞甯搁噺锛堟湰鍦板紑鍙戠幆澧冧娇鐢級 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const GENERATED_DIR = path.join(UPLOADS_DIR, 'generated');
const REFERENCES_DIR = path.join(UPLOADS_DIR, 'references');
const EXAMPLES_DIR = path.join(UPLOADS_DIR, 'examples');
const DB_FILE = path.join(DATA_DIR, 'app.sqlite');
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3001;
const IMAGE_RETENTION_DAYS = Math.max(1, Number(process.env.IMAGE_RETENTION_DAYS || 7));
const IMAGE_CLEANUP_INTERVAL_MS = Math.max(60 * 60 * 1000, Number(process.env.IMAGE_CLEANUP_INTERVAL_MS || 6 * 60 * 60 * 1000));
const STORE_REFERENCE_IMAGES = normalizeEnvValue(process.env.STORE_REFERENCE_IMAGES || 'false').toLowerCase() === 'true';
const PROMO_PURCHASE_URL = 'https://pay.ldxp.cn/shop/RHPYAKWG';
const PROMO_COUPON_DISCOUNT_PERCENT = 10;
const PROMO_COUPON_SETTING_PREFIX = 'promo_coupon_v1:';
const PROMO_COUPON_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;

dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const CANONICAL_WEB_HOST = normalizeEnvValue(process.env.CANONICAL_WEB_HOST) || 'pixory.top';
const CANONICAL_WEB_ORIGIN =
  normalizeEnvValue(process.env.CANONICAL_WEB_ORIGIN) || `https://${CANONICAL_WEB_HOST}`;
const APP_URL = normalizeEnvValue(process.env.APP_URL);
const ADMIN_STATS_TIME_ZONE = normalizeEnvValue(process.env.ADMIN_STATS_TIME_ZONE) || 'Asia/Shanghai';

// 鈹€鈹€鈹€ 鐜鍙橀噺 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const VISIONARY_API_BASE_URL = (process.env.VISIONARY_API_BASE_URL || 'https://visionary.beer').replace(/\/+$/, '');
const VISIONARY_IMAGE_SIZE = process.env.VISIONARY_IMAGE_SIZE || '2K';
const VISIONARY_FALLBACK_API_KEY = normalizeEnvValue(process.env.VISIONARY_API_KEY);
const VISIONARY_BANANA_PRO_API_KEY = normalizeEnvValue(process.env.VISIONARY_BANANA_PRO_API_KEY);
const VISIONARY_GPT_IMAGE_2_API_KEY = normalizeEnvValue(process.env.VISIONARY_GPT_IMAGE_2_API_KEY);
const VISIONARY_GPT_IMAGE_2_HD_API_KEY = normalizeEnvValue(process.env.VISIONARY_GPT_IMAGE_2_HD_API_KEY);
const API_CREDIT_POOL_SETTING_KEY = 'api_credit_pools_v1';
const USER_API_CREDIT_SETTING_PREFIX = 'user_api_credits_v1:';
const INVITE_API_CREDIT_SETTING_PREFIX = 'invite_api_credits_v1:';
const PUBLIC_API_KEYS_SETTING_KEY = 'public_api_keys_v1';
const UNIFIED_CREDIT_MIGRATION_SETTING_KEY = 'unified_credit_migration_v1';
const UNIFIED_CREDIT_MIGRATION_BACKUP_SETTING_KEY = 'unified_credit_migration_v1_backup';
const API_CREDIT_POOL_DEFINITIONS: Array<{
  id: ApiCreditPoolId;
  name: string;
  envName: string;
  key: string;
  defaultTotalCredits: number;
  defaultUsedCredits: number;
}> = [
  {
    id: 'gpt_hd',
    name: 'gpt-2k-4k-key',
    envName: 'VISIONARY_GPT_IMAGE_2_HD_API_KEY',
    key: VISIONARY_GPT_IMAGE_2_HD_API_KEY,
    defaultTotalCredits: Number(process.env.API_POOL_GPT_HD_TOTAL || 3800),
    defaultUsedCredits: Number(process.env.API_POOL_GPT_HD_USED || 100),
  },
  {
    id: 'gpt',
    name: 'gpt-key',
    envName: 'VISIONARY_GPT_IMAGE_2_API_KEY',
    key: VISIONARY_GPT_IMAGE_2_API_KEY,
    defaultTotalCredits: Number(process.env.API_POOL_GPT_TOTAL || 5000),
    defaultUsedCredits: Number(process.env.API_POOL_GPT_USED || 20),
  },
  {
    id: 'banana',
    name: 'banana-key',
    envName: 'VISIONARY_BANANA_PRO_API_KEY',
    key: VISIONARY_BANANA_PRO_API_KEY,
    defaultTotalCredits: Number(process.env.API_POOL_BANANA_TOTAL || 8000),
    defaultUsedCredits: Number(process.env.API_POOL_BANANA_USED || 24),
  },
  {
    id: 'legacy',
    name: '666',
    envName: 'VISIONARY_API_KEY',
    key: VISIONARY_FALLBACK_API_KEY,
    defaultTotalCredits: Number(process.env.API_POOL_LEGACY_TOTAL || 4020),
    defaultUsedCredits: Number(process.env.API_POOL_LEGACY_USED || 1279),
  },
];
const SUPABASE_URL = normalizeEnvValue(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
const DATABASE_PROVIDER = normalizeEnvValue(process.env.DATABASE_PROVIDER || 'sqlite').toLowerCase();
const USE_SUPABASE = DATABASE_PROVIDER === 'supabase';
const CORS_ORIGIN = normalizeEnvValue(process.env.CORS_ORIGIN);
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        realtime: {
          transport: WebSocket as any,
        },
      })
    : null;
const supabaseUserSyncStatus = {
  configured: Boolean(supabaseAdmin),
  tableReady: false,
  migratedUsers: 0,
  lastSyncedAt: '',
  lastError: '',
};

// 鈹€鈹€鈹€ SQLite 鍒濆鍖栵紙浠呮湰鍦扮幆澧冿級 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const require = createRequire(import.meta.url);

// sql.js 鍒濆鍖栵紙鍙湪 SQLite 妯″紡锛?// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlJsReady: Promise<any> | null = null;

async function getSqlJsReady() {
  if (!sqlJsReady && !USE_SUPABASE) {
    const sql = await import('sql.js');
    sqlJsReady = sql.default({
      locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`),
    });
  }
  return sqlJsReady!;
}

// 鈹€鈹€鈹€ 甯搁噺 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const ADMIN_INITIAL_CREDITS = 3859;
const INVITE_RECLAIM_THRESHOLD = 17;
const INVITE_RECLAIM_DAYS = 7;
const SUPABASE_SYNC_TABLES = [
  {
    name: 'users',
    select: 'id, username, password_hash, email, created_at',
    insert: 'INSERT INTO users (id, username, password_hash, email, created_at) VALUES (?, ?, ?, ?, ?)',
    onConflict: 'id',
  },
  {
    name: 'user_migrations',
    select: 'legacy_user_id, supabase_user_id, username, migrated_at',
    insert: 'INSERT INTO user_migrations (legacy_user_id, supabase_user_id, username, migrated_at) VALUES (?, ?, ?, ?)',
    onConflict: 'legacy_user_id',
  },
  {
    name: 'user_credits',
    select: 'user_id, username, total_credits, used_credits, created_at, updated_at',
    insert: 'INSERT INTO user_credits (user_id, username, total_credits, used_credits, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    onConflict: 'user_id',
  },
  {
    name: 'invite_codes',
    select: 'code, credits, issued_credits, created_by, created_at, redeemed_by, redeemed_at, low_balance_since',
    insert:
      'INSERT INTO invite_codes (code, credits, issued_credits, created_by, created_at, redeemed_by, redeemed_at, low_balance_since) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    onConflict: 'code',
  },
  {
    name: 'generations',
    select: 'id, user_id, username, prompt, model_id, model_name, dimensions, image_size, image_path, credits_used, reference_images, created_at',
    insert:
      'INSERT INTO generations (id, user_id, username, prompt, model_id, model_name, dimensions, image_size, image_path, credits_used, reference_images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    onConflict: 'id',
  },
  {
    name: 'images',
    select: 'id, user_id, prompt, model_name, dimensions, image_path, category, reference_images, created_at',
    insert:
      'INSERT INTO images (id, user_id, prompt, model_name, dimensions, image_path, category, reference_images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    onConflict: 'id',
    replaceOnSync: true,
  },
  {
    name: 'app_settings',
    select: 'key, value, updated_at',
    insert: 'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
    onConflict: 'key',
  },
] as const;

const models = [
  {
    id: 'gpt-image-2',
    name: 'GPT-image-2 Plus',
    description: 'OpenAI最强生图模型！',
    creditsCost: 20,
  },
  {
    id: 'Nano_Banana_Pro',
    name: 'Nano Banana Pro',
    description: '谷歌最强生图模型！',
    creditsCost: 24,
  },
] as const;

const tokenSecret =
  process.env.JWT_SECRET ||
  VISIONARY_FALLBACK_API_KEY ||
  VISIONARY_GPT_IMAGE_2_API_KEY ||
  VISIONARY_BANANA_PRO_API_KEY ||
  'visionary-local-dev-secret';
let writeQueue = Promise.resolve();
let imageCleanupPromise: Promise<void> | null = null;

// 鈹€鈹€鈹€ 閫氱敤杈呭姪鍑芥暟 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEnvValue(value: string | undefined) {
  return typeof value === 'string' ? value.trim().replace(/^["']|["']$/g, '') : '';
}

function nowIso() {
  return new Date().toISOString();
}

function formatDateKeyInTimeZone(value: string | Date, timeZone = ADMIN_STATS_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((item) => item.type === 'year')?.value || '0000';
  const month = parts.find((item) => item.type === 'month')?.value || '00';
  const day = parts.find((item) => item.type === 'day')?.value || '00';
  return `${year}-${month}-${day}`;
}

function formatHourKeyInTimeZone(value: string | Date, timeZone = ADMIN_STATS_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(date);
}

/** Vercel 鍏煎鐨勯殢鏈哄瓧鑺傜敓鎴?*/
function randomHex(bytes: number): string {
  if (IS_VERCEL) {
    const array = new Uint8Array(bytes);
    crypto.getRandomValues(array);
    return Array.from(array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return crypto.randomBytes(bytes).toString('hex');
}

/** Vercel 鍏煎鐨?SHA256 鎽樿 */
function sha256Digest(input: string): string {
  if (IS_VERCEL) {
    // 绠€鍗曞搱甯屾浛浠ｏ紝浠呯敤浜庣敓鎴?invite user id锛屼笉闇€瑕佸瘑鐮佸瀹夊叏
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(16).padStart(12, '0').slice(0, 12);
  }
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 12);
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function getDirectoryUsage(targetPath: string): Promise<{ bytes: number; count: number }> {
  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    let bytes = 0;
    let count = 0;

    for (const entry of entries) {
      const fullPath = path.join(targetPath, entry.name);
      if (entry.isDirectory()) {
        const nested = await getDirectoryUsage(fullPath);
        bytes += nested.bytes;
        count += nested.count;
        continue;
      }

      if (!entry.isFile()) continue;
      const stats = await fs.stat(fullPath);
      bytes += stats.size;
      count += 1;
    }

    return { bytes, count };
  } catch {
    return { bytes: 0, count: 0 };
  }
}

async function getImageStorageStats(): Promise<ImageStorageStats> {
  if (IS_VERCEL) {
    return {
      uploadsTotalBytes: 0,
      generatedBytes: 0,
      generatedCount: 0,
      referenceBytes: 0,
      referenceCount: 0,
      referenceStorageEnabled: STORE_REFERENCE_IMAGES,
      retentionDays: IMAGE_RETENTION_DAYS,
    };
  }

  const [generated, references] = await Promise.all([
    getDirectoryUsage(GENERATED_DIR),
    getDirectoryUsage(REFERENCES_DIR),
  ]);

  return {
    uploadsTotalBytes: generated.bytes + references.bytes,
    generatedBytes: generated.bytes,
    generatedCount: generated.count,
    referenceBytes: references.bytes,
    referenceCount: references.count,
    referenceStorageEnabled: STORE_REFERENCE_IMAGES,
    retentionDays: IMAGE_RETENTION_DAYS,
  };
}

async function ensureRuntimeDirectories() {
  await Promise.all([
    fs.mkdir(DATA_DIR, { recursive: true }),
    fs.mkdir(UPLOADS_DIR, { recursive: true }),
    fs.mkdir(GENERATED_DIR, { recursive: true }),
    fs.mkdir(REFERENCES_DIR, { recursive: true }),
    fs.mkdir(EXAMPLES_DIR, { recursive: true }),
  ]);
}

function splitCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function firstHeaderValue(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? normalizeString(value[0]) : normalizeString(value);
  return normalized.split(',')[0]?.trim() || '';
}

function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === DEFAULT_HOST || hostname === '';
}

function getConfiguredPublicOrigin() {
  if (APP_URL) return stripTrailingSlash(APP_URL);
  if (normalizeEnvValue(process.env.CANONICAL_WEB_ORIGIN)) return stripTrailingSlash(CANONICAL_WEB_ORIGIN);
  if (normalizeEnvValue(process.env.CANONICAL_WEB_HOST)) return `https://${normalizeEnvValue(process.env.CANONICAL_WEB_HOST)}`;
  return '';
}

function getRequestPublicOrigin(req: Request) {
  const forwardedHost = firstHeaderValue(req.headers['x-forwarded-host']);
  const host = forwardedHost || normalizeString(req.headers.host);
  const hostname = host.replace(/:\d+$/, '');
  if (!host || isLocalHostname(hostname)) return '';

  const forwardedProto = firstHeaderValue(req.headers['x-forwarded-proto']);
  const protocol = forwardedProto || normalizeString(req.protocol) || 'https';
  return `${protocol}://${host}`;
}

function toPublicAssetUrl(req: Request, assetPath: string) {
  const normalizedPath = normalizeString(assetPath);
  if (!normalizedPath) return '';
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;

  const publicOrigin = getRequestPublicOrigin(req) || getConfiguredPublicOrigin();
  if (!publicOrigin) return '';

  return `${stripTrailingSlash(publicOrigin)}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

function isAllowedOrigin(origin: string) {
  if (!CORS_ORIGIN) return true;
  const allowedOrigins = splitCsv(CORS_ORIGIN);
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

function serializeReferenceImages(referenceImages: string[]) {
  return JSON.stringify(referenceImages);
}

function parseReferenceImages(raw: unknown) {
  if (typeof raw !== 'string' || !raw) return [];

  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function toSavedImage(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    prompt: String(row.prompt || ''),
    modelName: String(row.model_name || ''),
    dimensions: String(row.dimensions || ''),
    imageUrl: String(row.image_path || ''),
    category: String(row.category || '') as ImageCategory,
    referenceImages: parseReferenceImages(row.reference_images),
    createdAt: String(row.created_at || ''),
  };
}

function toGeneration(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    userId: String(row.user_id || ''),
    username: String(row.username || ''),
    prompt: String(row.prompt || ''),
    modelId: String(row.model_id || ''),
    modelName: String(row.model_name || ''),
    dimensions: String(row.dimensions || ''),
    imageSize: String(row.image_size || ''),
    imageUrl: String(row.image_path || ''),
    creditsUsed: Number(row.credits_used || 0),
    referenceImages: parseReferenceImages(row.reference_images),
    inviteCode: row.invite_code ? String(row.invite_code) : '',
    createdAt: String(row.created_at || ''),
  };
}

function toPublicReferenceImages(req: Request, referenceImages: string[]) {
  return referenceImages.map((item) => toPublicAssetUrl(req, item) || item);
}

function toPublicGeneratedImagePayload(req: Request, payload: GeneratedImagePayload): GeneratedImagePayload {
  return {
    ...payload,
    imagePath: toPublicAssetUrl(req, payload.imagePath) || payload.imagePath,
    referenceImages: toPublicReferenceImages(req, payload.referenceImages),
  };
}

function toPublicSavedImage(req: Request, image: ReturnType<typeof toSavedImage>) {
  return {
    ...image,
    imageUrl: toPublicAssetUrl(req, image.imageUrl) || image.imageUrl,
    referenceImages: toPublicReferenceImages(req, image.referenceImages),
  };
}

function toPublicGeneration(req: Request, record: ReturnType<typeof toGeneration>) {
  return {
    ...record,
    imageUrl: toPublicAssetUrl(req, record.imageUrl) || record.imageUrl,
    referenceImages: toPublicReferenceImages(req, record.referenceImages),
  };
}

function toInviteCode(row: Record<string, unknown>) {
  return {
    code: String(row.code || ''),
    credits: Number(row.credits || 0),
    createdBy: String(row.created_by || ''),
    createdAt: String(row.created_at || ''),
    redeemedBy: row.redeemed_by ? String(row.redeemed_by) : '',
    redeemedAt: row.redeemed_at ? String(row.redeemed_at) : '',
  };
}

function addDaysIso(base: string, days: number) {
  const date = new Date(base);
  if (Number.isNaN(date.getTime())) return base;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function subtractDaysIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function toCreditSummary(row: Record<string, unknown> | null) {
  const totalCredits = Number(row?.total_credits || 0);
  const usedCredits = Number(row?.used_credits || 0);
  return {
    totalCredits,
    usedCredits,
    remainingCredits: Math.max(0, totalCredits - usedCredits),
  };
}

function apiCreditPoolIds(): ApiCreditPoolId[] {
  return API_CREDIT_POOL_DEFINITIONS.map((item) => item.id);
}

function emptyApiCreditAllocation(poolId: ApiCreditPoolId): ApiCreditAllocation {
  return {
    poolId,
    totalCredits: 0,
    usedCredits: 0,
    remainingCredits: 0,
  };
}

function normalizeCreditNumber(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? Math.max(0, Math.floor(numberValue)) : 0;
}

function maskApiKey(value: string) {
  if (!value) return '';
  if (value.length <= 16) return value;
  return `${value.slice(0, 11)}...${value.slice(-6)}`;
}

function normalizeAllocationMap(raw: unknown): ApiCreditAllocationMap {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return apiCreditPoolIds().reduce((result, poolId) => {
    const entry = source[poolId] && typeof source[poolId] === 'object'
      ? (source[poolId] as Record<string, unknown>)
      : {};
    const totalCredits = normalizeCreditNumber(entry.totalCredits);
    const usedCredits = Math.min(totalCredits, normalizeCreditNumber(entry.usedCredits));
    result[poolId] = {
      poolId,
      totalCredits,
      usedCredits,
      remainingCredits: Math.max(0, totalCredits - usedCredits),
    };
    return result;
  }, {} as ApiCreditAllocationMap);
}

function parseJsonSetting<T>(value: string, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function serializeAllocationMap(value: ApiCreditAllocationMap) {
  return JSON.stringify(value);
}

function getApiCreditPoolId(modelId: string, imageSize: string): ApiCreditPoolId {
  if (modelId === 'Nano_Banana_Pro') return 'banana';
  if (modelId === 'gpt-image-2' && (imageSize === '2K' || imageSize === '4K')) return 'gpt_hd';
  if (modelId === 'gpt-image-2') return 'gpt';
  return 'legacy';
}

function defaultAdminApiCreditPools(): ApiCreditAllocationMap {
  return API_CREDIT_POOL_DEFINITIONS.reduce((result, item) => {
    const totalCredits = normalizeCreditNumber(item.defaultTotalCredits);
    const usedCredits = Math.min(totalCredits, normalizeCreditNumber(item.defaultUsedCredits));
    result[item.id] = {
      poolId: item.id,
      totalCredits,
      usedCredits,
      remainingCredits: Math.max(0, totalCredits - usedCredits),
    };
    return result;
  }, {} as ApiCreditAllocationMap);
}

function toApiCreditPoolList(map: ApiCreditAllocationMap): ApiCreditPool[] {
  return API_CREDIT_POOL_DEFINITIONS.map((definition) => {
    const allocation = map[definition.id] || emptyApiCreditAllocation(definition.id);
    return {
      id: definition.id,
      name: definition.name,
      envName: definition.envName,
      keyPreview: maskApiKey(definition.key),
      status: definition.key ? 'available' : 'missing',
      totalCredits: allocation.totalCredits,
      usedCredits: allocation.usedCredits,
      remainingCredits: allocation.remainingCredits,
    };
  });
}

function normalizeRequestedApiCredits(input: unknown): ApiCreditAllocationMap {
  if (input && typeof input === 'object') {
    const source = input as Record<string, unknown>;
    return apiCreditPoolIds().reduce((result, poolId) => {
      const totalCredits = normalizeCreditNumber(source[poolId]);
      result[poolId] = {
        poolId,
        totalCredits,
        usedCredits: 0,
        remainingCredits: totalCredits,
      };
      return result;
    }, {} as ApiCreditAllocationMap);
  }

  const legacyCredits = normalizeCreditNumber(input);
  const map = normalizeAllocationMap({});
  map.legacy = {
    poolId: 'legacy',
    totalCredits: legacyCredits,
    usedCredits: 0,
    remainingCredits: legacyCredits,
  };
  return map;
}

function sumApiCreditTotals(map: ApiCreditAllocationMap) {
  return apiCreditPoolIds().reduce((sum, poolId) => sum + map[poolId].totalCredits, 0);
}

function sumApiCreditRemaining(map: ApiCreditAllocationMap) {
  return apiCreditPoolIds().reduce((sum, poolId) => sum + map[poolId].remainingCredits, 0);
}

function getInviteCodeApiCreditsForDisplay(code: string, credits: number, map: ApiCreditAllocationMap) {
  const normalized = sumApiCreditTotals(map) > 0 ? map : normalizeRequestedApiCredits({ legacy: credits });
  return toApiCreditPoolList(normalized).map((pool) => ({
    poolId: pool.id,
    name: pool.name,
    totalCredits: pool.totalCredits,
    usedCredits: pool.usedCredits,
    remainingCredits: pool.remainingCredits,
    code,
  }));
}

function validateCategory(value: unknown): value is ImageCategory {
  return value === 'favorite' || value === 'backup' || value === 'discarded';
}

function parsePaginationValue(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

function toPagination(page: number, pageSize: number, total: number): PaginationResult {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

type AdminUserSummaryRow = {
  userId: string;
  username: string;
  inviteCode?: string;
  generations: number;
  creditsUsed: number;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  lastGeneratedAt: string;
  usageTrend?: number[];
};

function paginateArray<T>(items: T[], page: number, pageSize: number) {
  const offset = (page - 1) * pageSize;
  return items.slice(offset, offset + pageSize);
}

function summarizeRecordStats(records: ReturnType<typeof toGeneration>[]) {
  const todayKey = formatDateKeyInTimeZone(new Date());
  const todayRecords = records.filter((item) => formatDateKeyInTimeZone(item.createdAt) === todayKey);
  const modelUsageCounter = records.reduce<Record<string, number>>((accumulator, item) => {
    accumulator[item.modelName] = (accumulator[item.modelName] || 0) + 1;
    return accumulator;
  }, {});
  const hourUsageCounter = records.reduce<Record<string, number>>((accumulator, item) => {
    const hour = formatHourKeyInTimeZone(item.createdAt);
    if (!hour) return accumulator;
    accumulator[hour] = (accumulator[hour] || 0) + 1;
    return accumulator;
  }, {});

  return {
    todayCreditsUsed: todayRecords.reduce((sum, item) => sum + item.creditsUsed, 0),
    todayRecordCount: todayRecords.length,
    totalCreditsUsed: records.reduce((sum, item) => sum + item.creditsUsed, 0),
    mostUsedModel: Object.entries(modelUsageCounter).sort((left, right) => right[1] - left[1])[0]?.[0] || '',
    mostActiveHour: Object.entries(hourUsageCounter).sort((left, right) => right[1] - left[1])[0]?.[0] || '',
  };
}

async function getSupabaseAdminUsers(): Promise<AdminUserSummaryRow[]> {
  const db = await getSupabaseDb();
  const [generationSummaries, registeredUsers, creditRows, inviteRows] = await Promise.all([
    db.getGenerationSummaries(),
    db.getRegisteredUsers(),
    db.getAllCreditRows(),
    db.listInviteCodes(1, 100000),
  ]);
  const summaryByUserId = new Map(
    generationSummaries.map((row) => [
      row.user_id,
      {
        userId: row.user_id,
        username: row.username,
        generations: row.generations,
        creditsUsed: row.credits_used,
        lastGeneratedAt: row.last_generated_at,
      },
    ]),
  );
  const inviteCodeByUserId = new Map<string, string>();
  for (const row of inviteRows.codes) {
    const redeemedBy = normalizeString(row.redeemed_by);
    if (!redeemedBy || inviteCodeByUserId.has(redeemedBy)) continue;
    inviteCodeByUserId.set(redeemedBy, normalizeString(row.code));
  }
  const userMap = new Map<string, AdminUserSummaryRow>();

  for (const row of registeredUsers) {
    userMap.set(row.user_id, {
      userId: row.user_id,
      username: row.username,
      inviteCode: inviteCodeByUserId.get(row.user_id) || '',
      generations: 0,
      creditsUsed: 0,
      totalCredits: row.total_credits,
      usedCredits: row.used_credits,
      remainingCredits: Math.max(0, row.total_credits - row.used_credits),
      lastGeneratedAt: '',
    });
  }

  for (const row of creditRows) {
    if (!userMap.has(row.user_id)) {
      userMap.set(row.user_id, {
        userId: row.user_id,
        username: row.username,
        inviteCode: inviteCodeByUserId.get(row.user_id) || '',
        generations: 0,
        creditsUsed: 0,
        totalCredits: row.total_credits,
        usedCredits: row.used_credits,
        remainingCredits: Math.max(0, row.total_credits - row.used_credits),
        lastGeneratedAt: '',
      });
    }
  }

  for (const summary of summaryByUserId.values()) {
    const current = userMap.get(summary.userId);
    userMap.set(summary.userId, {
      userId: summary.userId,
      username: current?.username || summary.username,
      inviteCode: current?.inviteCode || inviteCodeByUserId.get(summary.userId) || '',
      generations: summary.generations,
      creditsUsed: summary.creditsUsed,
      totalCredits: current?.totalCredits || 0,
      usedCredits: current?.usedCredits || 0,
      remainingCredits: current?.remainingCredits || 0,
      lastGeneratedAt: summary.lastGeneratedAt,
    });
  }

  return [...userMap.values()].sort(
    (left, right) => right.creditsUsed - left.creditsUsed || right.generations - left.generations,
  );
}

function issueToken(user: AuthUser) {
  return jwt.sign(user, tokenSecret, { expiresIn: '30d' });
}

function adminUsernames() {
  return (process.env.ADMIN_USERNAMES || 'admin')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminUser(user: AuthUser) {
  return adminUsernames().includes(user.username.toLowerCase());
}

function toPublicUser(user: AuthUser): PublicUser {
  return {
    id: user.userId,
    username: user.username,
    isAdmin: isAdminUser(user),
  };
}

function getModelCredits(modelId: string, imageSize = '') {
  if (modelId === 'gpt-image-2') {
    if (imageSize === '4K') return 36;
    if (imageSize === '2K') return 28;
    return 20;
  }
  if (modelId === 'Nano_Banana_Pro') return 24;
  return 1;
}

function normalizeImageSize(value: string, modelId: string) {
  if (modelId === 'gpt-image-2') {
    if (value === '2K' || value === '4K') return value;
    return 'STANDARD';
  }
  if (modelId !== 'Nano_Banana_Pro') return VISIONARY_IMAGE_SIZE;
  return value === '4K' ? '4K' : '2K';
}

function normalizeGptQuality(value: string, imageSize: string) {
  if (imageSize !== '2K' && imageSize !== '4K') return 'auto';
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  if (imageSize === '4K') return 'high';
  if (imageSize === '2K') return 'medium';
  return 'auto';
}

function getVisionaryApiKey(modelId: string, imageSize: string) {
  if (modelId === 'Nano_Banana_Pro') {
    return VISIONARY_BANANA_PRO_API_KEY || VISIONARY_FALLBACK_API_KEY;
  }

  if (modelId === 'gpt-image-2') {
    if (imageSize === '2K' || imageSize === '4K') {
      return VISIONARY_GPT_IMAGE_2_HD_API_KEY || VISIONARY_FALLBACK_API_KEY;
    }

    return VISIONARY_GPT_IMAGE_2_API_KEY || VISIONARY_FALLBACK_API_KEY;
  }

  return VISIONARY_FALLBACK_API_KEY;
}

function getVisionaryApiKeyLabel(modelId: string, imageSize: string) {
  if (modelId === 'Nano_Banana_Pro') return 'VISIONARY_BANANA_PRO_API_KEY';
  if (modelId === 'gpt-image-2' && (imageSize === '2K' || imageSize === '4K')) return 'VISIONARY_GPT_IMAGE_2_HD_API_KEY';
  if (modelId === 'gpt-image-2') return 'VISIONARY_GPT_IMAGE_2_API_KEY';
  return 'VISIONARY_API_KEY';
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return;
  }

  try {
    const payload = jwt.verify(header.slice(7), tokenSecret) as AuthUser;
    req.authUser = {
      userId: String(payload.userId),
      username: String(payload.username),
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser || !isAdminUser(req.authUser)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

function modelNameFromId(modelId: string) {
  return models.find((item) => item.id === modelId)?.name || modelId;
}

function normalizeModelId(modelId: string) {
  if (modelId === 'nano-banana-pro' || modelId === 'nano_banana_pro') return 'Nano_Banana_Pro';
  if (modelId === 'nano-banana2' || modelId === 'Nano_Banana_2') return 'Nano_Banana_Pro';
  if (modelId === 'dalle3-mini' || modelId === 'sdxl') return 'Nano_Banana_Pro';
  return models.some((item) => item.id === modelId) ? modelId : 'gpt-image-2';
}

function normalizeRatio(value: string, modelId: string) {
  const pixelRatioAliases: Record<string, string> = {
    '1024x1024': '1:1',
    '2048x2048': '1:1',
    '2880x2880': '1:1',
    '1280x720': '16:9',
    '2048x1152': '16:9',
    '3840x2160': '16:9',
    '720x1280': '9:16',
    '1152x2048': '9:16',
    '2160x3840': '9:16',
    '1152x864': '4:3',
    '2048x1536': '4:3',
    '3264x2448': '4:3',
    '864x1152': '3:4',
    '1536x2048': '3:4',
    '2448x3264': '3:4',
    '1536x1024': '3:2',
    '2016x1344': '3:2',
    '3504x2336': '3:2',
    '1024x1536': '2:3',
    '1344x2016': '2:3',
    '2336x3504': '2:3',
    '1456x624': '21:9',
    '3024x1296': '21:9',
    '3696x1584': '21:9',
  };
  const normalizedValue = value.toLowerCase();
  if (pixelRatioAliases[normalizedValue]) return pixelRatioAliases[normalizedValue];
  const supported = ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9'];
  if (value === 'auto') {
    return modelId === 'gpt-image-2' ? 'auto' : '1:1';
  }
  return supported.includes(value) ? value : '1:1';
}

function inferImageSizeFromAspectRatio(value: string) {
  const normalizedValue = value.toLowerCase();
  if (
    [
      '2048x2048',
      '2048x1152',
      '1152x2048',
      '2048x1536',
      '1536x2048',
      '2016x1344',
      '1344x2016',
      '3024x1296',
    ].includes(normalizedValue)
  ) {
    return '2K';
  }
  if (
    [
      '2880x2880',
      '3840x2160',
      '2160x3840',
      '3264x2448',
      '2448x3264',
      '3504x2336',
      '2336x3504',
      '3696x1584',
    ].includes(normalizedValue)
  ) {
    return '4K';
  }
  return '';
}

function getGptImageAspectRatio(ratio: string, imageSize: string) {
  const pixelRatios: Record<string, Record<string, string>> = {
    STANDARD: {
      '1:1': '1024x1024',
      '16:9': '1280x720',
      '9:16': '720x1280',
      '4:3': '1152x864',
      '3:4': '864x1152',
      '3:2': '1536x1024',
      '2:3': '1024x1536',
      '21:9': '1456x624',
    },
    '2K': {
      '1:1': '2048x2048',
      '16:9': '2048x1152',
      '9:16': '1152x2048',
      '4:3': '2048x1536',
      '3:4': '1536x2048',
      '3:2': '2016x1344',
      '2:3': '1344x2016',
      '21:9': '3024x1296',
    },
    '4K': {
      '1:1': '2880x2880',
      '16:9': '3840x2160',
      '9:16': '2160x3840',
      '4:3': '3264x2448',
      '3:4': '2448x3264',
      '3:2': '3504x2336',
      '2:3': '2336x3504',
      '21:9': '3696x1584',
    },
  };

  if (ratio === 'auto') return ratio;
  const sizeKey = imageSize === '2K' || imageSize === '4K' ? imageSize : 'STANDARD';
  return pixelRatios[sizeKey]?.[ratio] || ratio;
}

function generateInviteCode() {
  return `PIXORY-${randomHex(4).toUpperCase()}`;
}

// 鈹€鈹€鈹€ SQLite 杈呭姪鍑芥暟锛堜粎鏈湴鐜浣跨敤锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

async function openDatabase() {
  const SQL = await getSqlJsReady();
  try {
    const file = await fs.readFile(DB_FILE);
    return new SQL.Database(file) as SqlDatabase;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new SQL.Database() as SqlDatabase;
    }
    throw error;
  }
}

async function saveDatabase(db: SqlDatabase) {
  await fs.writeFile(DB_FILE, db.export());
}

function isSupabasePersistenceEnabled() {
  return USE_SUPABASE;
}

function valuesFromRow(row: Record<string, unknown>, selectClause: string) {
  return splitCsv(selectClause).map((column) => row[column] ?? null);
}

async function ensureSupabaseReady() {
  if (!supabaseAdmin) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when DATABASE_PROVIDER=supabase');
  }

  const readiness = await supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).limit(1);
  if (readiness.error) {
    console.error('Supabase readiness check failed:', readiness.error);
    throw new Error(
      `Supabase schema is not ready: ${readiness.error.message}. Run supabase/migrations/20260426000000_init_bananas_ai.sql first.`,
    );
  }
}

async function listSupabaseRows(tableName: string, selectClause: string) {
  if (!supabaseAdmin) return [];

  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;

  for (let start = 0; ; start += pageSize) {
    const end = start + pageSize - 1;
    const { data, error } = await supabaseAdmin.from(tableName).select(selectClause).range(start, end);
    if (error) {
      throw new Error(`${tableName}: ${error.message}`);
    }

    const chunk = ((data || []) as unknown) as Record<string, unknown>[];
    rows.push(...chunk);
    if (chunk.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function upsertSupabaseTable(
  tableName: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  if (!supabaseAdmin || rows.length === 0) return;

  const chunkSize = 500;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabaseAdmin.from(tableName).upsert(chunk, { onConflict });
    if (error) {
      throw new Error(`${tableName}: ${error.message}`);
    }
  }
}

async function replaceSupabaseTable(
  tableName: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  if (!supabaseAdmin) return;

  const { error } = await supabaseAdmin.from(tableName).delete().not(onConflict, 'is', null);
  if (error) {
    throw new Error(`${tableName}: ${error.message}`);
  }

  await upsertSupabaseTable(tableName, rows, onConflict);
}

async function restoreSqliteFromSupabase() {
  if (!isSupabasePersistenceEnabled()) return;

  await ensureSupabaseReady();
  const SQL = await getSqlJsReady();
  const db = new SQL.Database() as SqlDatabase;

  try {
    ensureSchema(db);
    for (const table of SUPABASE_SYNC_TABLES) {
      db.run(`DELETE FROM ${table.name}`);
      const rows = await listSupabaseRows(table.name, table.select);
      for (const row of rows) {
        db.run(table.insert, valuesFromRow(row, table.select));
      }
    }
    await saveDatabase(db);
  } finally {
    db.close();
  }
}

async function syncSqliteToSupabase(db: SqlDatabase) {
  if (!isSupabasePersistenceEnabled()) return;

  await ensureSupabaseReady();
  for (const table of SUPABASE_SYNC_TABLES) {
    const rows = runQuery<Record<string, unknown>>(db, `SELECT ${table.select} FROM ${table.name}`);
    if ('replaceOnSync' in table && table.replaceOnSync) {
      await replaceSupabaseTable(table.name, rows, table.onConflict);
      continue;
    }
    await upsertSupabaseTable(table.name, rows, table.onConflict);
  }
}

function runQuery<T extends Record<string, unknown>>(db: SqlDatabase, sql: string, params: unknown[] = []) {
  const statement = db.prepare(sql, params);
  const rows: T[] = [];

  try {
    while (statement.step()) {
      rows.push(statement.getAsObject() as T);
    }
  } finally {
    statement.free();
  }

  return rows;
}

function getOne<T extends Record<string, unknown>>(db: SqlDatabase, sql: string, params: unknown[] = []) {
  return runQuery<T>(db, sql, params)[0] || null;
}

async function withReadDb<T>(task: (db: SqlDatabase) => Promise<T> | T) {
  const db = await openDatabase();

  try {
    return await task(db);
  } finally {
    db.close();
  }
}

async function withWriteDb<T>(task: (db: SqlDatabase) => Promise<T> | T) {
  const nextTask = async () => {
    const db = await openDatabase();

    try {
      const result = await task(db);
      await saveDatabase(db);
      await syncSqliteToSupabase(db);
      return result;
    } finally {
      db.close();
    }
  };

  const result = writeQueue.then(nextTask, nextTask);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function ensureSchema(db: SqlDatabase) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_migrations (
      legacy_user_id INTEGER PRIMARY KEY,
      supabase_user_id TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      migrated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      model_name TEXT NOT NULL,
      dimensions TEXT NOT NULL,
      image_path TEXT NOT NULL,
      category TEXT NOT NULL,
      reference_images TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      prompt TEXT NOT NULL,
      model_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      dimensions TEXT NOT NULL,
      image_size TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL,
      credits_used INTEGER NOT NULL,
      reference_images TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_credits (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      total_credits INTEGER NOT NULL,
      used_credits INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      credits INTEGER NOT NULL,
      issued_credits INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      redeemed_by TEXT,
      redeemed_at TEXT,
      low_balance_since TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const generationColumns = new Set(
    runQuery<Record<string, unknown>>(db, 'PRAGMA table_info(generations)').map((row) => String(row.name || '')),
  );
  if (!generationColumns.has('image_size')) {
    db.run("ALTER TABLE generations ADD COLUMN image_size TEXT NOT NULL DEFAULT ''");
  }

  const inviteCodeColumns = new Set(
    runQuery<Record<string, unknown>>(db, 'PRAGMA table_info(invite_codes)').map((row) => String(row.name || '')),
  );
  if (!inviteCodeColumns.has('issued_credits')) {
    db.run('ALTER TABLE invite_codes ADD COLUMN issued_credits INTEGER NOT NULL DEFAULT 0');
  }
  if (!inviteCodeColumns.has('low_balance_since')) {
    db.run('ALTER TABLE invite_codes ADD COLUMN low_balance_since TEXT');
  }
  db.run('UPDATE invite_codes SET issued_credits = credits WHERE issued_credits = 0');
}

function lastInsertId(db: SqlDatabase) {
  const row = getOne<{ id: number }>(db, 'SELECT last_insert_rowid() AS id');
  return Number(row?.id || 0);
}

function getSetting(db: SqlDatabase, key: string, fallback: string) {
  const row = getOne<{ value: string }>(db, 'SELECT value FROM app_settings WHERE key = ?', [key]);
  if (row?.value !== undefined) return String(row.value);

  db.run('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)', [key, fallback, nowIso()]);
  return fallback;
}

function setSetting(db: SqlDatabase, key: string, value: string) {
  db.run(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `,
    [key, value, nowIso()],
  );
}

function promoCouponSettingKey(userId: string) {
  return `${PROMO_COUPON_SETTING_PREFIX}${userId}`;
}

function parsePromoCouponRecord(raw: string): PromoCouponRecord | null {
  const value = parseJsonSetting<Partial<PromoCouponRecord> | null>(raw, null);
  if (!value || typeof value !== 'object') return null;

  const couponId = normalizeString(value.couponId);
  const issuedAt = normalizeString(value.issuedAt);
  const expiresAt = normalizeString(value.expiresAt);
  const nextEligibleAt = normalizeString(value.nextEligibleAt);
  if (!couponId || !issuedAt || !expiresAt || !nextEligibleAt) return null;

  return {
    couponId,
    discountPercent: Math.max(1, Math.floor(Number(value.discountPercent || PROMO_COUPON_DISCOUNT_PERCENT))),
    issuedAt,
    expiresAt,
    nextEligibleAt,
    popupSeenAt: normalizeString(value.popupSeenAt) || undefined,
    source: value.source === 'welcome' ? 'welcome' : 'scheduled',
  } satisfies PromoCouponRecord;
}

function serializePromoCouponRecord(record: PromoCouponRecord) {
  return JSON.stringify(record);
}

function addDaysStrictIso(base: string, days: number) {
  const date = new Date(base);
  if (Number.isNaN(date.getTime())) return nowIso();
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function nextChinaMidnightIso(base: string) {
  const source = new Date(base);
  const now = Number.isNaN(source.getTime()) ? new Date() : source;
  const shifted = new Date(now.getTime() + PROMO_COUPON_TIMEZONE_OFFSET_MS);
  shifted.setUTCHours(24, 0, 0, 0);
  return new Date(shifted.getTime() - PROMO_COUPON_TIMEZONE_OFFSET_MS).toISOString();
}

function randomCouponIntervalDays() {
  const randomByte = Number.parseInt(randomHex(1), 16);
  return randomByte % 2 === 0 ? 2 : 3;
}

function isPromoCouponActive(record: PromoCouponRecord | null, now = nowIso()) {
  if (!record) return false;
  const expiresAt = new Date(record.expiresAt).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(expiresAt) || !Number.isFinite(current)) return false;
  return current < expiresAt;
}

function toPromoCouponPayload(record: PromoCouponRecord | null, options?: { shouldPopup?: boolean }): PromoCouponPayload {
  return {
    couponId: record?.couponId || '',
    discountPercent: record?.discountPercent || PROMO_COUPON_DISCOUNT_PERCENT,
    issuedAt: record?.issuedAt || '',
    expiresAt: record?.expiresAt || '',
    nextEligibleAt: record?.nextEligibleAt || '',
    purchaseUrl: PROMO_PURCHASE_URL,
    active: isPromoCouponActive(record),
    shouldPopup: Boolean(options?.shouldPopup),
  };
}

function shouldShowPromoCouponPopup(record: PromoCouponRecord | null, now = nowIso()) {
  if (!record || !isPromoCouponActive(record, now) || record.popupSeenAt) return false;
  return true;
}

function issuePromoCoupon(now = nowIso()): PromoCouponRecord {
  return {
    couponId: `PIXORY90-${randomHex(3).toUpperCase()}`,
    discountPercent: PROMO_COUPON_DISCOUNT_PERCENT,
    issuedAt: now,
    expiresAt: nextChinaMidnightIso(now),
    nextEligibleAt: addDaysStrictIso(now, randomCouponIntervalDays()),
    source: 'scheduled',
  };
}

async function getOrRefreshSupabasePromoCoupon(user: AuthUser) {
  if (isAdminUser(user)) {
    return toPromoCouponPayload(null);
  }

  const db = await getSupabaseDb();
  const settingKey = promoCouponSettingKey(user.userId);
  const now = nowIso();
  let record = parsePromoCouponRecord(await db.getSetting(settingKey, ''));

  if (!record) {
    return toPromoCouponPayload(null);
  }

  if (!isPromoCouponActive(record, now) && new Date(now).getTime() >= new Date(record.nextEligibleAt).getTime()) {
    record = issuePromoCoupon(now);
    await db.setSetting(settingKey, serializePromoCouponRecord(record));
  }

  return toPromoCouponPayload(record, {
    shouldPopup: shouldShowPromoCouponPopup(record, now),
  });
}

async function getOrRefreshSqlitePromoCoupon(db: SqlDatabase, user: AuthUser) {
  if (isAdminUser(user)) {
    return toPromoCouponPayload(null);
  }

  const settingKey = promoCouponSettingKey(user.userId);
  const now = nowIso();
  let record = parsePromoCouponRecord(getSetting(db, settingKey, ''));

  if (!record) {
    return toPromoCouponPayload(null);
  }

  if (!isPromoCouponActive(record, now) && new Date(now).getTime() >= new Date(record.nextEligibleAt).getTime()) {
    record = issuePromoCoupon(now);
    setSetting(db, settingKey, serializePromoCouponRecord(record));
  }

  return toPromoCouponPayload(record, {
    shouldPopup: shouldShowPromoCouponPopup(record, now),
  });
}

async function getOrRefreshPromoCoupon(user: AuthUser) {
  if (USE_SUPABASE) {
    return getOrRefreshSupabasePromoCoupon(user);
  }

  return withWriteDb((db) => {
    ensureSchema(db);
    return getOrRefreshSqlitePromoCoupon(db, user);
  });
}

async function acknowledgeSupabasePromoCoupon(user: AuthUser) {
  if (isAdminUser(user)) {
    return toPromoCouponPayload(null);
  }

  const db = await getSupabaseDb();
  const settingKey = promoCouponSettingKey(user.userId);
  const now = nowIso();
  const record = parsePromoCouponRecord(await db.getSetting(settingKey, ''));

  if (!record) {
    return toPromoCouponPayload(null);
  }

  if (!record.popupSeenAt) {
    record.popupSeenAt = now;
    await db.setSetting(settingKey, serializePromoCouponRecord(record));
  }

  return toPromoCouponPayload(record, {
    shouldPopup: shouldShowPromoCouponPopup(record, now),
  });
}

async function acknowledgePromoCoupon(user: AuthUser) {
  if (USE_SUPABASE) {
    return acknowledgeSupabasePromoCoupon(user);
  }

  return withWriteDb((db) => {
    ensureSchema(db);
    if (isAdminUser(user)) {
      return toPromoCouponPayload(null);
    }

    const settingKey = promoCouponSettingKey(user.userId);
    const now = nowIso();
    const record = parsePromoCouponRecord(getSetting(db, settingKey, ''));
    if (!record) {
      return toPromoCouponPayload(null);
    }

    if (!record.popupSeenAt) {
      record.popupSeenAt = now;
      setSetting(db, settingKey, serializePromoCouponRecord(record));
    }

    return toPromoCouponPayload(record, {
      shouldPopup: shouldShowPromoCouponPopup(record, now),
    });
  });
}

function normalizeApiKeyRecord(value: Partial<PublicApiKeyRecord>): PublicApiKeyRecord | null {
  const id = normalizeString(value.id);
  const keyHash = normalizeString(value.keyHash);
  if (!id || !keyHash) return null;

  const totalCredits = Math.max(0, Math.floor(Number(value.totalCredits || 0)));
  const usedCredits = Math.max(0, Math.floor(Number(value.usedCredits || 0)));
  return {
    id,
    name: normalizeString(value.name) || 'API Key',
    keyHash,
    keyPreview: normalizeString(value.keyPreview) || 'px_...',
    encryptedKey: normalizeString(value.encryptedKey) || undefined,
    totalCredits,
    usedCredits: Math.min(usedCredits, totalCredits),
    createdAt: normalizeString(value.createdAt) || nowIso(),
    createdBy: normalizeString(value.createdBy) || 'admin',
    revokedAt: normalizeString(value.revokedAt) || undefined,
  };
}

function normalizeApiKeyRecords(value: unknown): PublicApiKeyRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeApiKeyRecord(item as Partial<PublicApiKeyRecord>))
    .filter((item): item is PublicApiKeyRecord => Boolean(item));
}

function serializeApiKeyRecords(records: PublicApiKeyRecord[]) {
  return JSON.stringify(records.map((item) => normalizeApiKeyRecord(item)).filter(Boolean));
}

function publicApiKeyRecord(record: PublicApiKeyRecord) {
  const plainKey = decryptPublicApiKey(record.encryptedKey);
  return {
    id: record.id,
    name: record.name,
    keyPreview: record.keyPreview,
    plainKey,
    copyable: Boolean(plainKey),
    totalCredits: record.totalCredits,
    usedCredits: record.usedCredits,
    remainingCredits: Math.max(0, record.totalCredits - record.usedCredits),
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    revokedAt: record.revokedAt || '',
  };
}

function generatePublicApiKey() {
  return `px_${randomHex(24)}`;
}

function hashPublicApiKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function previewPublicApiKey(key: string) {
  return `${key.slice(0, 8)}...${key.slice(-6)}`;
}

function getPublicApiKeyCipherKey() {
  return crypto.createHash('sha256').update(`pixory-public-api-key:${tokenSecret}`).digest();
}

function encryptPublicApiKey(key: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getPublicApiKeyCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${authTag.toString('hex')}.${encrypted.toString('hex')}`;
}

function decryptPublicApiKey(payload: string | undefined) {
  const normalized = normalizeString(payload);
  if (!normalized) return '';

  const parts = normalized.split('.');
  if (parts.length !== 3) return '';

  try {
    const [ivHex, authTagHex, encryptedHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getPublicApiKeyCipherKey(),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

async function readPublicApiKeyRecords(): Promise<PublicApiKeyRecord[]> {
  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    const raw = await db.getSetting(PUBLIC_API_KEYS_SETTING_KEY, '[]');
    return normalizeApiKeyRecords(parseJsonSetting(raw, []));
  }

  return withReadDb((db) => {
    ensureSchema(db);
    const raw = getSetting(db, PUBLIC_API_KEYS_SETTING_KEY, '[]');
    return normalizeApiKeyRecords(parseJsonSetting(raw, []));
  });
}

async function writePublicApiKeyRecords(records: PublicApiKeyRecord[]) {
  const serialized = serializeApiKeyRecords(records);
  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    await db.setSetting(PUBLIC_API_KEYS_SETTING_KEY, serialized);
    return;
  }

  await withWriteDb((db) => {
    ensureSchema(db);
    setSetting(db, PUBLIC_API_KEYS_SETTING_KEY, serialized);
  });
}

async function createPublicApiKey(name: string, totalCredits: number, createdBy: string) {
  const plainKey = generatePublicApiKey();
  const record: PublicApiKeyRecord = {
    id: randomHex(8),
    name: normalizeString(name) || 'API Key',
    keyHash: hashPublicApiKey(plainKey),
    keyPreview: previewPublicApiKey(plainKey),
    encryptedKey: encryptPublicApiKey(plainKey),
    totalCredits: Math.max(1, Math.floor(totalCredits)),
    usedCredits: 0,
    createdAt: nowIso(),
    createdBy,
  };
  const records = await readPublicApiKeyRecords();
  await writePublicApiKeyRecords([record, ...records]);
  return { plainKey, record };
}

async function revokePublicApiKey(id: string) {
  const targetId = normalizeString(id);
  if (!targetId) return null;

  const records = await readPublicApiKeyRecords();
  const revokedAt = nowIso();
  let found = false;
  const nextRecords = records.map((record) => {
    if (record.id !== targetId) return record;
    found = true;
    return { ...record, revokedAt: record.revokedAt || revokedAt };
  });

  if (!found) return null;
  await writePublicApiKeyRecords(nextRecords);

  const persistedRecords = await readPublicApiKeyRecords();
  return persistedRecords.find((record) => record.id === targetId) || nextRecords.find((record) => record.id === targetId) || null;
}

async function deletePublicApiKey(id: string) {
  const targetId = normalizeString(id);
  if (!targetId) return false;

  const records = await readPublicApiKeyRecords();
  const nextRecords = records.filter((record) => record.id !== targetId);
  if (nextRecords.length === records.length) return false;

  await writePublicApiKeyRecords(nextRecords);
  return true;
}

async function reservePublicApiKeyCredits(plainKey: string, credits: number) {
  const keyHash = hashPublicApiKey(plainKey);
  const records = await readPublicApiKeyRecords();
  const index = records.findIndex((record) => record.keyHash === keyHash);
  if (index < 0) {
    throw new Error('API Key 无效');
  }

  const record = records[index];
  if (record.revokedAt) {
    throw new Error('API Key 已停用');
  }

  const remainingCredits = Math.max(0, record.totalCredits - record.usedCredits);
  if (remainingCredits < credits) {
    throw new Error(`API Key 额度不足，需要 ${credits}，剩余 ${remainingCredits}`);
  }

  const nextRecord = {
    ...record,
    usedCredits: record.usedCredits + credits,
  };
  records[index] = nextRecord;
  await writePublicApiKeyRecords(records);
  return nextRecord;
}

async function refundPublicApiKeyCredits(keyId: string, credits: number) {
  const records = await readPublicApiKeyRecords();
  await writePublicApiKeyRecords(
    records.map((record) =>
      record.id === keyId ? { ...record, usedCredits: Math.max(0, record.usedCredits - credits) } : record,
    ),
  );
}

function getAdminApiCreditMapSqlite(db: SqlDatabase) {
  const fallback = defaultAdminApiCreditPools();
  const raw = getSetting(db, API_CREDIT_POOL_SETTING_KEY, serializeAllocationMap(fallback));
  const map = normalizeAllocationMap(parseJsonSetting(raw, fallback));
  setSetting(db, API_CREDIT_POOL_SETTING_KEY, serializeAllocationMap(map));
  return map;
}

function setAdminApiCreditMapSqlite(db: SqlDatabase, map: ApiCreditAllocationMap) {
  setSetting(db, API_CREDIT_POOL_SETTING_KEY, serializeAllocationMap(normalizeAllocationMap(map)));
}

function getScopedApiCreditMapSqlite(db: SqlDatabase, settingKey: string) {
  const raw = getSetting(db, settingKey, serializeAllocationMap(normalizeAllocationMap({})));
  return normalizeAllocationMap(parseJsonSetting(raw, {}));
}

function setScopedApiCreditMapSqlite(db: SqlDatabase, settingKey: string, map: ApiCreditAllocationMap) {
  setSetting(db, settingKey, serializeAllocationMap(normalizeAllocationMap(map)));
}

function deductAdminApiCreditPools(map: ApiCreditAllocationMap, requested: ApiCreditAllocationMap) {
  for (const poolId of apiCreditPoolIds()) {
    if (requested[poolId].totalCredits > map[poolId].remainingCredits) {
      const poolName = API_CREDIT_POOL_DEFINITIONS.find((item) => item.id === poolId)?.name || poolId;
      throw new Error(`${poolName} available credits are not enough`);
    }
  }

  for (const poolId of apiCreditPoolIds()) {
    map[poolId].usedCredits += requested[poolId].totalCredits;
    map[poolId].remainingCredits = Math.max(0, map[poolId].totalCredits - map[poolId].usedCredits);
  }
}

function returnAdminApiCreditPools(map: ApiCreditAllocationMap, returned: ApiCreditAllocationMap) {
  for (const poolId of apiCreditPoolIds()) {
    map[poolId].usedCredits = Math.max(0, map[poolId].usedCredits - returned[poolId].remainingCredits);
    map[poolId].remainingCredits = Math.max(0, map[poolId].totalCredits - map[poolId].usedCredits);
  }
}

function deductUserApiCreditPool(map: ApiCreditAllocationMap, poolId: ApiCreditPoolId, creditsUsed: number) {
  const pool = map[poolId] || emptyApiCreditAllocation(poolId);
  if (pool.remainingCredits < creditsUsed) {
    const poolName = API_CREDIT_POOL_DEFINITIONS.find((item) => item.id === poolId)?.name || poolId;
    throw new Error(`${poolName} credits are not enough, need ${creditsUsed}, remaining ${pool.remainingCredits}`);
  }

  pool.usedCredits += creditsUsed;
  pool.remainingCredits = Math.max(0, pool.totalCredits - pool.usedCredits);
  map[poolId] = pool;
}

async function getAdminApiCreditMapSupabase() {
  const db = await getSupabaseDb();
  const fallback = defaultAdminApiCreditPools();
  const raw = await db.getSetting(API_CREDIT_POOL_SETTING_KEY, serializeAllocationMap(fallback));
  const map = normalizeAllocationMap(parseJsonSetting(raw, fallback));
  await db.setSetting(API_CREDIT_POOL_SETTING_KEY, serializeAllocationMap(map));
  return map;
}

async function setAdminApiCreditMapSupabase(map: ApiCreditAllocationMap) {
  const db = await getSupabaseDb();
  await db.setSetting(API_CREDIT_POOL_SETTING_KEY, serializeAllocationMap(normalizeAllocationMap(map)));
}

async function getScopedApiCreditMapSupabase(settingKey: string) {
  const db = await getSupabaseDb();
  const raw = await db.getSetting(settingKey, serializeAllocationMap(normalizeAllocationMap({})));
  return normalizeAllocationMap(parseJsonSetting(raw, {}));
}

async function setScopedApiCreditMapSupabase(settingKey: string, map: ApiCreditAllocationMap) {
  const db = await getSupabaseDb();
  await db.setSetting(settingKey, serializeAllocationMap(normalizeAllocationMap(map)));
}

function inviteApiCreditSettingKey(code: string) {
  return `${INVITE_API_CREDIT_SETTING_PREFIX}${code}`;
}

function userApiCreditSettingKey(userId: string) {
  return `${USER_API_CREDIT_SETTING_PREFIX}${userId}`;
}

function lowBalanceSinceForCredits(credits: number, existingValue: unknown) {
  if (credits <= 0 || credits >= INVITE_RECLAIM_THRESHOLD) return null;
  return normalizeString(existingValue) || nowIso();
}

function unifiedRemainingFromApiCreditMap(map: ApiCreditAllocationMap) {
  return sumApiCreditTotals(map) > 0 ? sumApiCreditRemaining(map) : 0;
}

function parseStoredApiCreditMap(value: string) {
  return normalizeAllocationMap(parseJsonSetting(value, {}));
}

function unifiedMigrationSummary(settings: Array<{ key: string; value: string }>) {
  const adminSetting = settings.find((item) => item.key === API_CREDIT_POOL_SETTING_KEY);
  const adminRemaining = adminSetting ? unifiedRemainingFromApiCreditMap(parseStoredApiCreditMap(adminSetting.value)) : 0;
  const userSettings = settings.filter((item) => item.key.startsWith(USER_API_CREDIT_SETTING_PREFIX));
  const inviteSettings = settings.filter((item) => item.key.startsWith(INVITE_API_CREDIT_SETTING_PREFIX));

  return {
    adminRemaining,
    userSettings,
    inviteSettings,
  };
}

function getLegacyApiCreditSettingsSqlite(db: SqlDatabase) {
  return runQuery<{ key: string; value: string }>(
    db,
    `
      SELECT key, value
      FROM app_settings
      WHERE key = ?
        OR key LIKE ?
        OR key LIKE ?
      ORDER BY key ASC
    `,
    [API_CREDIT_POOL_SETTING_KEY, `${USER_API_CREDIT_SETTING_PREFIX}%`, `${INVITE_API_CREDIT_SETTING_PREFIX}%`],
  ).map((row) => ({ key: String(row.key || ''), value: String(row.value || '') }));
}

function migrateLegacyApiCreditsSqlite(db: SqlDatabase) {
  const existing = getOne<{ value: string }>(
    db,
    'SELECT value FROM app_settings WHERE key = ?',
    [UNIFIED_CREDIT_MIGRATION_SETTING_KEY],
  );
  if (existing?.value) return;

  const settings = getLegacyApiCreditSettingsSqlite(db);
  const summary = unifiedMigrationSummary(settings);
  const migratedAt = nowIso();

  setSetting(
    db,
    UNIFIED_CREDIT_MIGRATION_BACKUP_SETTING_KEY,
    JSON.stringify({
      migratedAt,
      settings,
    }),
  );

  if (summary.adminRemaining > 0) {
    const admin = getAdminCreditOwner(db);
    if (admin?.user_id) {
      const adminCredits = getUserCredits(db, String(admin.user_id));
      setUserTotalCredits(db, String(admin.user_id), adminCredits.usedCredits + summary.adminRemaining);
    }
  }

  for (const setting of summary.userSettings) {
    const userId = setting.key.slice(USER_API_CREDIT_SETTING_PREFIX.length);
    if (!userId) continue;

    const remainingCredits = unifiedRemainingFromApiCreditMap(parseStoredApiCreditMap(setting.value));
    if (remainingCredits <= 0) continue;

    const credits = getUserCredits(db, userId);
    setUserTotalCredits(db, userId, credits.usedCredits + remainingCredits);
  }

  for (const setting of summary.inviteSettings) {
    const code = setting.key.slice(INVITE_API_CREDIT_SETTING_PREFIX.length);
    if (!code) continue;

    const remainingCredits = unifiedRemainingFromApiCreditMap(parseStoredApiCreditMap(setting.value));
    const invite = getOne<Record<string, unknown>>(db, 'SELECT code, low_balance_since FROM invite_codes WHERE code = ?', [code]);
    if (!invite?.code) continue;

    db.run('UPDATE invite_codes SET credits = ?, low_balance_since = ? WHERE code = ?', [
      remainingCredits,
      lowBalanceSinceForCredits(remainingCredits, invite.low_balance_since),
      code,
    ]);
  }

  setSetting(
    db,
    UNIFIED_CREDIT_MIGRATION_SETTING_KEY,
    JSON.stringify({
      migratedAt,
      adminRemaining: summary.adminRemaining,
      userSettings: summary.userSettings.length,
      inviteSettings: summary.inviteSettings.length,
    }),
  );
}

async function getLegacyApiCreditSettingsSupabase() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client is not configured');
  }

  const settings: Array<{ key: string; value: string }> = [];
  const adminSetting = await supabaseAdmin
    .from('app_settings')
    .select('key, value')
    .eq('key', API_CREDIT_POOL_SETTING_KEY)
    .maybeSingle();
  if (adminSetting.error) throw new Error(`Fetch API credit pool setting failed: ${adminSetting.error.message}`);
  if (adminSetting.data) {
    settings.push({
      key: String((adminSetting.data as Record<string, unknown>).key || ''),
      value: String((adminSetting.data as Record<string, unknown>).value || ''),
    });
  }

  for (const prefix of [USER_API_CREDIT_SETTING_PREFIX, INVITE_API_CREDIT_SETTING_PREFIX]) {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .like('key', `${prefix}%`);
    if (error) throw new Error(`Fetch ${prefix} settings failed: ${error.message}`);
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      settings.push({
        key: String(row.key || ''),
        value: String(row.value || ''),
      });
    }
  }

  return settings;
}

async function runUnifiedCreditMigrationSupabase() {
  if (!USE_SUPABASE) return;
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client is not configured');
  }

  const existing = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', UNIFIED_CREDIT_MIGRATION_SETTING_KEY)
    .maybeSingle();
  if (existing.error) throw new Error(`Fetch unified migration marker failed: ${existing.error.message}`);
  if (existing.data) return;

  const db = await getSupabaseDb();
  const settings = await getLegacyApiCreditSettingsSupabase();
  const summary = unifiedMigrationSummary(settings);
  const migratedAt = nowIso();

  await db.setSetting(
    UNIFIED_CREDIT_MIGRATION_BACKUP_SETTING_KEY,
    JSON.stringify({
      migratedAt,
      settings,
    }),
  );

  if (summary.adminRemaining > 0) {
    const admin = await db.getAdminCreditOwner();
    if (admin?.user_id) {
      const adminCredits = await db.getUserCredits(String(admin.user_id));
      await db.setUserTotalCredits(String(admin.user_id), adminCredits.usedCredits + summary.adminRemaining);
    }
  }

  for (const setting of summary.userSettings) {
    const userId = setting.key.slice(USER_API_CREDIT_SETTING_PREFIX.length);
    if (!userId) continue;

    const remainingCredits = unifiedRemainingFromApiCreditMap(parseStoredApiCreditMap(setting.value));
    if (remainingCredits <= 0) continue;

    const credits = await db.getUserCredits(userId);
    await db.setUserTotalCredits(userId, credits.usedCredits + remainingCredits);
  }

  for (const setting of summary.inviteSettings) {
    const code = setting.key.slice(INVITE_API_CREDIT_SETTING_PREFIX.length);
    if (!code) continue;

    const remainingCredits = unifiedRemainingFromApiCreditMap(parseStoredApiCreditMap(setting.value));
    const invite = await db.getInviteCode(code);
    if (!invite?.code) continue;

    await db.updateInviteCodeCredits(
      code,
      remainingCredits,
      lowBalanceSinceForCredits(remainingCredits, invite.low_balance_since),
    );
  }

  await db.setSetting(
    UNIFIED_CREDIT_MIGRATION_SETTING_KEY,
    JSON.stringify({
      migratedAt,
      adminRemaining: summary.adminRemaining,
      userSettings: summary.userSettings.length,
      inviteSettings: summary.inviteSettings.length,
    }),
  );

  console.log(
    `[credits:migration] unified adminRemaining=${summary.adminRemaining} users=${summary.userSettings.length} invites=${summary.inviteSettings.length}`,
  );
}

function getAdminCreditSummary(db: SqlDatabase) {
  return toCreditSummary(
    getOne<Record<string, unknown>>(
      db,
      "SELECT total_credits, used_credits FROM user_credits WHERE username = 'admin' ORDER BY created_at ASC LIMIT 1",
    ),
  );
}

function getUserCredits(db: SqlDatabase, userId: string) {
  return toCreditSummary(getOne<Record<string, unknown>>(db, 'SELECT total_credits, used_credits FROM user_credits WHERE user_id = ?', [userId]));
}

function isInviteManagedUser(db: SqlDatabase, userId: string) {
  if (normalizeString(userId).startsWith('invite-')) return true;

  const creditOwner = getOne<Record<string, unknown>>(db, 'SELECT username FROM user_credits WHERE user_id = ?', [userId]);
  return normalizeString(creditOwner?.username).startsWith('invite-');
}

function ensureUserCredits(db: SqlDatabase, userId: string, username: string, totalCredits = 0) {
  const existing = getOne<Record<string, unknown>>(db, 'SELECT user_id FROM user_credits WHERE user_id = ?', [userId]);
  if (existing) {
    db.run('UPDATE user_credits SET username = ?, updated_at = ? WHERE user_id = ?', [username, nowIso(), userId]);
    return;
  }

  db.run(
    'INSERT INTO user_credits (user_id, username, total_credits, used_credits, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
    [userId, username, totalCredits, nowIso(), nowIso()],
  );
}

function setUserTotalCredits(db: SqlDatabase, userId: string, totalCredits: number) {
  db.run('UPDATE user_credits SET total_credits = ?, updated_at = ? WHERE user_id = ?', [
    Math.max(0, Math.floor(totalCredits)),
    nowIso(),
    userId,
  ]);
}

function adjustUserTotalCredits(db: SqlDatabase, userId: string, delta: number) {
  const credits = getUserCredits(db, userId);
  setUserTotalCredits(db, userId, credits.totalCredits + delta);
}

function getAdminCreditOwner(db: SqlDatabase) {
  return getOne<{ user_id: string }>(
    db,
    "SELECT user_id FROM user_credits WHERE username = 'admin' ORDER BY created_at ASC LIMIT 1",
  );
}

function adjustAdminTotalCredits(db: SqlDatabase, delta: number) {
  const admin = getAdminCreditOwner(db);
  if (!admin?.user_id) {
    throw new Error('Admin credits are not initialized');
  }

  adjustUserTotalCredits(db, String(admin.user_id), delta);
}

function syncInviteCodeBalanceForUser(db: SqlDatabase, userId: string) {
  const invite = getOne<Record<string, unknown>>(
    db,
    `
      SELECT code, credits, low_balance_since
      FROM invite_codes
      WHERE redeemed_by = ?
      ORDER BY datetime(redeemed_at) DESC, datetime(created_at) DESC
      LIMIT 1
    `,
    [userId],
  );
  if (!invite?.code) return;

  if (!isInviteManagedUser(db, userId)) {
    if (invite.low_balance_since) {
      db.run('UPDATE invite_codes SET low_balance_since = NULL WHERE code = ?', [String(invite.code)]);
    }
    return;
  }

  const credits = getUserCredits(db, userId);
  const remainingCredits = credits.remainingCredits;
  const currentCredits = Number(invite.credits || 0);
  const existingLowBalanceSince = invite.low_balance_since ? String(invite.low_balance_since) : '';
  const nextLowBalanceSince =
    remainingCredits > 0 && remainingCredits < INVITE_RECLAIM_THRESHOLD
      ? existingLowBalanceSince || nowIso()
      : null;

  if (currentCredits === remainingCredits && String(invite.low_balance_since || '') === String(nextLowBalanceSince || '')) {
    return;
  }

  db.run('UPDATE invite_codes SET credits = ?, low_balance_since = ? WHERE code = ?', [
    remainingCredits,
    nextLowBalanceSince,
    String(invite.code),
  ]);
}

function syncRedeemedInviteCodeBalances(db: SqlDatabase) {
  const redeemedUsers = runQuery<Record<string, unknown>>(
    db,
    'SELECT DISTINCT redeemed_by FROM invite_codes WHERE redeemed_by IS NOT NULL AND redeemed_by != ""',
  );

  for (const row of redeemedUsers) {
    const userId = String(row.redeemed_by || '');
    if (userId) {
      syncInviteCodeBalanceForUser(db, userId);
    }
  }
}

function reclaimLowBalanceInviteCodes(db: SqlDatabase) {
  ensureSchema(db);
  const invites = runQuery<Record<string, unknown>>(
    db,
    `
      SELECT code, credits, redeemed_by, low_balance_since
      FROM invite_codes
      WHERE credits > 0 AND low_balance_since IS NOT NULL
    `,
  );

  for (const invite of invites) {
    const lowBalanceSince = String(invite.low_balance_since || '');
    if (!lowBalanceSince) continue;

    const reclaimAt = new Date(addDaysIso(lowBalanceSince, INVITE_RECLAIM_DAYS));
    if (Number.isNaN(reclaimAt.getTime()) || reclaimAt.getTime() > Date.now()) {
      continue;
    }

    const creditsToReturn = Number(invite.credits || 0);
    if (creditsToReturn <= 0) continue;

    // 已按需求停用“邀请码余额耗尽后自动处理用户和邀请码记录”的逻辑。
    // 如需恢复自动回收，请取消下面这段代码的注释。
    /*
    const redeemedBy = invite.redeemed_by ? String(invite.redeemed_by) : '';
    if (redeemedBy) {
      if (!isInviteManagedUser(db, redeemedBy)) {
        db.run('UPDATE invite_codes SET low_balance_since = NULL WHERE code = ?', [String(invite.code)]);
        continue;
      }

      const userCredits = getUserCredits(db, redeemedBy);
      setUserTotalCredits(db, redeemedBy, userCredits.usedCredits);
    }

    db.run('UPDATE invite_codes SET credits = 0, low_balance_since = NULL WHERE code = ?', [String(invite.code)]);
    adjustAdminTotalCredits(db, creditsToReturn);
    */
  }
}

function purgeExpiredImageDataSqlite(db: SqlDatabase, retentionDays = IMAGE_RETENTION_DAYS) {
  ensureSchema(db);
  const cutoffIso = subtractDaysIso(retentionDays);
  const deletedGenerations = Number(
    getOne<{ total: number }>(
      db,
      'SELECT COUNT(*) AS total FROM generations WHERE datetime(created_at) < datetime(?)',
      [cutoffIso],
    )?.total || 0,
  );
  const deletedImages = Number(
    getOne<{ total: number }>(
      db,
      'SELECT COUNT(*) AS total FROM images WHERE datetime(created_at) < datetime(?)',
      [cutoffIso],
    )?.total || 0,
  );

  if (deletedGenerations > 0) {
    db.run('DELETE FROM generations WHERE datetime(created_at) < datetime(?)', [cutoffIso]);
  }
  if (deletedImages > 0) {
    db.run('DELETE FROM images WHERE datetime(created_at) < datetime(?)', [cutoffIso]);
  }

  return {
    deletedGenerations,
    deletedImages,
    cutoffIso,
  };
}

async function purgeExpiredReferenceFiles(retentionDays = IMAGE_RETENTION_DAYS) {
  if (IS_VERCEL) {
    return 0;
  }

  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await fs.readdir(REFERENCES_DIR, { withFileTypes: true }).catch(() => []);
  let deletedFiles = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const filePath = path.join(REFERENCES_DIR, entry.name);
    const stats = await fs.stat(filePath).catch(() => null);
    if (!stats || stats.mtimeMs >= cutoffTime) continue;

    await fs.unlink(filePath).catch(() => undefined);
    deletedFiles += 1;
  }

  return deletedFiles;
}

async function purgeExpiredGeneratedFiles(retentionDays = IMAGE_RETENTION_DAYS) {
  if (IS_VERCEL) {
    return 0;
  }

  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await fs.readdir(GENERATED_DIR, { withFileTypes: true }).catch(() => []);
  let deletedFiles = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const filePath = path.join(GENERATED_DIR, entry.name);
    const stats = await fs.stat(filePath).catch(() => null);
    if (!stats || stats.mtimeMs >= cutoffTime) continue;

    await fs.unlink(filePath).catch(() => undefined);
    deletedFiles += 1;
  }

  return deletedFiles;
}

async function runImageRetentionCleanup(reason: string) {
  if (imageCleanupPromise) {
    return imageCleanupPromise;
  }

  imageCleanupPromise = (async () => {
    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        const result = await db.purgeExpiredImageData(IMAGE_RETENTION_DAYS);
        const deletedReferenceFiles = await purgeExpiredReferenceFiles(IMAGE_RETENTION_DAYS);
        const deletedGeneratedFiles = await purgeExpiredGeneratedFiles(IMAGE_RETENTION_DAYS);
        if (result.deletedGenerations > 0 || result.deletedImages > 0 || deletedReferenceFiles > 0 || deletedGeneratedFiles > 0) {
          console.log(
            `[image-cleanup:${reason}] cutoff=${result.cutoffIso} generations=${result.deletedGenerations} images=${result.deletedImages} referenceFiles=${deletedReferenceFiles} generatedFiles=${deletedGeneratedFiles}`,
          );
        }
        return;
      }

      const result = await withWriteDb((db) => purgeExpiredImageDataSqlite(db, IMAGE_RETENTION_DAYS));
      const deletedReferenceFiles = await purgeExpiredReferenceFiles(IMAGE_RETENTION_DAYS);
      const deletedGeneratedFiles = await purgeExpiredGeneratedFiles(IMAGE_RETENTION_DAYS);
      if (result.deletedGenerations > 0 || result.deletedImages > 0 || deletedReferenceFiles > 0 || deletedGeneratedFiles > 0) {
        console.log(
          `[image-cleanup:${reason}] cutoff=${result.cutoffIso} generations=${result.deletedGenerations} images=${result.deletedImages} referenceFiles=${deletedReferenceFiles} generatedFiles=${deletedGeneratedFiles}`,
        );
      }
    } catch (error) {
      console.error(`[image-cleanup:${reason}] failed`, error);
    } finally {
      imageCleanupPromise = null;
    }
  })();

  return imageCleanupPromise;
}

async function ensureRuntimeSchema() {
  await withWriteDb(async (db) => {
    ensureSchema(db);

    const adminUsername = 'admin';
    const passwordHash = await bcrypt.hash('admin654', 10);
    let adminUser = getOne<{ id: number; username: string }>(db, 'SELECT id, username FROM users WHERE username = ?', [
      adminUsername,
    ]);

    if (!adminUser) {
      db.run('INSERT INTO users (username, password_hash, email, created_at) VALUES (?, ?, ?, ?)', [
        adminUsername,
        passwordHash,
        'admin@example.com',
        nowIso(),
      ]);
      adminUser = { id: lastInsertId(db), username: adminUsername };
    } else {
      db.run('UPDATE users SET password_hash = ? WHERE username = ?', [passwordHash, adminUsername]);
    }

    const adminUserId = await resolveExternalUserId(db, adminUser.id, adminUsername);
    ensureUserCredits(db, adminUserId, adminUsername, 0);
    const adminCredits = getUserCredits(db, adminUserId);
    if (adminCredits.totalCredits === 0 && adminCredits.usedCredits === 0) {
      const outstandingInviteCredits = Number(
        getOne<{ credits: number }>(db, 'SELECT COALESCE(SUM(credits), 0) AS credits FROM invite_codes')?.credits || 0,
      );
      setUserTotalCredits(db, adminUserId, Math.max(0, ADMIN_INITIAL_CREDITS - outstandingInviteCredits));
    }
    migrateLegacyApiCreditsSqlite(db);
    syncRedeemedInviteCodeBalances(db);
    reclaimLowBalanceInviteCodes(db);
  });
}

async function resolveExternalUserId(db: SqlDatabase, legacyUserId: number, username: string) {
  const existing = getOne<{ supabase_user_id: string }>(
    db,
    'SELECT supabase_user_id FROM user_migrations WHERE legacy_user_id = ?',
    [legacyUserId],
  );

  if (existing?.supabase_user_id) {
    return existing.supabase_user_id;
  }

  const externalUserId = crypto.randomUUID();
  db.run(
    'INSERT INTO user_migrations (legacy_user_id, supabase_user_id, username, migrated_at) VALUES (?, ?, ?, ?)',
    [legacyUserId, externalUserId, username, nowIso()],
  );
  return externalUserId;
}

// 鈹€鈹€鈹€ 鑾峰彇鐢ㄦ埛绉垎锛堢粺涓€鎺ュ彛锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

async function getPublicUser(user: AuthUser) {
  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    const credits = await db.getUserCredits(user.userId);
    return {
      ...toPublicUser(user),
      creditsRemaining: credits.remainingCredits,
    };
  }

  const credits = await withReadDb((db) => {
    ensureSchema(db);
    return getUserCredits(db, user.userId);
  });

  return {
    ...toPublicUser(user),
    creditsRemaining: credits.remainingCredits,
  };
}

// 鈹€鈹€鈹€ Visionary API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

async function callVisionaryGeneration({
  prompt,
  modelId,
  ratio,
  imageSize,
  quality,
  optimizeChineseText,
  images,
}: {
  prompt: string;
  modelId: string;
  ratio: string;
  imageSize: string;
  quality: string;
  optimizeChineseText: boolean;
  images: string[];
}) {
  const apiKey = getVisionaryApiKey(modelId, imageSize);
  if (!apiKey) {
    throw new Error(`${getVisionaryApiKeyLabel(modelId, imageSize)} is not configured`);
  }

  const aspectRatio = ratio || '1:1';
  const visionaryAspectRatio =
    modelId === 'gpt-image-2' ? getGptImageAspectRatio(aspectRatio, imageSize) : aspectRatio;
  const requestConfig =
    modelId === 'gpt-image-2'
      ? {
          endpointPath: '/v1/api/generate',
          body: {
            prompt,
            model: 'gpt-image-2',
            images,
            aspectRatio: visionaryAspectRatio,
            imageSize: imageSize === 'STANDARD' ? undefined : imageSize,
            quality: normalizeGptQuality(quality, imageSize),
            replyType: 'json',
          },
        }
      : {
          endpointPath: '/v1/api/nano-banana',
          body: {
            prompt,
            model: 'nano-banana-pro',
            images,
            aspectRatio: visionaryAspectRatio,
            imageSize: imageSize || '2K',
            // Keep local billing at +8 for AI enhancement, but use the standard upstream route.
            optimizeChineseText: false,
            replyType: 'json',
          },
        };

  const response = await fetch(`${VISIONARY_API_BASE_URL}${requestConfig.endpointPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Idempotency-Key': `req_${Date.now()}_${randomHex(8)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestConfig.body),
  });

  const payload = (await response.json().catch(() => null)) as VisionaryGenerationResponse | null;
  if (!response.ok) {
    const message = payload?.error || payload?.failure_reason || `Visionary API request failed (${response.status})`;
    throw new Error(message);
  }

  const imageUrl =
    payload?.results?.find((item) => item.url || item.content)?.url ||
    payload?.results?.[0]?.content ||
    payload?.output?.find((item) => item.url || item.content)?.url ||
    payload?.output?.[0]?.content ||
    payload?.data?.find((item) => item.url || item.b64_json)?.url ||
    payload?.data?.[0]?.b64_json ||
    payload?.url;
  if (!imageUrl) {
    throw new Error(`Visionary API returned no image URL${payload?.id ? `, response id: ${payload.id}` : ''}`);
  }

  return imageUrl;
}

// 鈹€鈹€鈹€ SVG 鍗犱綅鍥?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function sanitizeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hashColor(value: string, offset: number) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0) + offset) % 360;
  }
  return `hsl(${hash}, 78%, ${offset % 2 === 0 ? 58 : 46}%)`;
}

function svgSize(dimensions: string) {
  if (dimensions === '3:2') {
    return { width: 1200, height: 800 };
  }
  if (dimensions === '2:3') {
    return { width: 800, height: 1200 };
  }
  return { width: 1024, height: 1024 };
}

function buildSvg(prompt: string, modelName: string, dimensions: string) {
  const { width, height } = svgSize(dimensions);
  const safePrompt = sanitizeSvgText(prompt).slice(0, 140);
  const safeModel = sanitizeSvgText(modelName);
  const primary = hashColor(prompt, 17);
  const secondary = hashColor(`${prompt}:${modelName}`, 71);
  const accent = hashColor(`${dimensions}:${prompt}`, 143);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${primary}" />
      <stop offset="55%" stop-color="${secondary}" />
      <stop offset="100%" stop-color="#050816" />
    </linearGradient>
    <radialGradient id="orb" cx="28%" cy="24%" r="65%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.75)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" />
  <circle cx="${Math.round(width * 0.25)}" cy="${Math.round(height * 0.24)}" r="${Math.round(
    Math.min(width, height) * 0.16,
  )}" fill="url(#orb)" />
  <path d="M 0 ${Math.round(height * 0.78)} Q ${Math.round(width * 0.22)} ${Math.round(
    height * 0.62,
  )}, ${Math.round(width * 0.45)} ${Math.round(height * 0.74)} T ${width} ${Math.round(
    height * 0.64,
  )} L ${width} ${height} L 0 ${height} Z" fill="${accent}" opacity="0.72" />
  <rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.1)}" width="${Math.round(
    width * 0.84,
  )}" height="${Math.round(height * 0.8)}" rx="34" fill="rgba(8,11,24,0.16)" stroke="rgba(255,255,255,0.18)" />
  <text x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.17)}" fill="white" font-size="${Math.round(
    Math.min(width, height) * 0.034,
  )}" font-family="Segoe UI, Arial, sans-serif" font-weight="700">PIXORY</text>
  <text x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.26)}" fill="rgba(255,255,255,0.95)" font-size="${Math.round(
    Math.min(width, height) * 0.068,
  )}" font-family="Segoe UI, Arial, sans-serif" font-weight="700">${safePrompt}</text>
  <text x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.34)}" fill="rgba(255,255,255,0.72)" font-size="${Math.round(
    Math.min(width, height) * 0.03,
  )}" font-family="Consolas, monospace">${safeModel} / ${dimensions}</text>
</svg>`.trim();
}

// 鈹€鈹€鈹€ 鍙傝€冨浘鐗囨寔涔呭寲 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function fileExtensionFromMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/svg+xml') return 'svg';
  return 'png';
}

function fileExtensionFromUrl(value: string) {
  try {
    const parsed = new URL(value);
    const extension = path.extname(parsed.pathname || '').replace('.', '').toLowerCase();
    if (extension === 'jpeg') return 'jpg';
    if (['jpg', 'png', 'webp', 'gif', 'svg'].includes(extension)) return extension;
  } catch {
    // Ignore invalid URLs and fall back to png.
  }

  return 'png';
}

async function persistGeneratedImage(source: string) {
  const normalizedSource = normalizeString(source);
  if (!normalizedSource) {
    throw new Error('Generated image URL is empty');
  }

  if (IS_VERCEL) {
    return normalizedSource;
  }

  if (normalizedSource.startsWith('data:image/')) {
    const mimeMatch = normalizedSource.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const mimeType = mimeMatch?.[1] || 'image/png';
    const extension = fileExtensionFromMimeType(mimeType);
    const base64 = normalizedSource.split(',').pop() || '';
    if (!base64) {
      throw new Error('Generated image data is invalid');
    }

    const fileName = `generated-${Date.now()}-${randomHex(4)}.${extension}`;
    const target = path.join(GENERATED_DIR, fileName);
    await fs.writeFile(target, Buffer.from(base64, 'base64'));
    return `/uploads/generated/${fileName}`;
  }

  if (!/^https?:\/\//i.test(normalizedSource)) {
    return normalizedSource;
  }

  const response = await fetch(normalizedSource);
  if (!response.ok) {
    throw new Error(`Download generated image failed (${response.status})`);
  }

  const contentType = normalizeString(response.headers.get('content-type') || '').toLowerCase();
  const extension = contentType.startsWith('image/')
    ? fileExtensionFromMimeType(contentType.split(';')[0])
    : fileExtensionFromUrl(normalizedSource);
  const buffer = Buffer.from(await response.arrayBuffer());
  const fileName = `generated-${Date.now()}-${randomHex(4)}.${extension}`;
  const target = path.join(GENERATED_DIR, fileName);
  await fs.writeFile(target, buffer);
  return `/uploads/generated/${fileName}`;
}

async function persistReferenceImages(referenceImages: ReferenceUploadInput[]) {
  // Vercel 鐜涓嬩笉淇濆瓨鍙傝€冨浘鐗囧埌鏈湴鏂囦欢绯荤粺锛岀洿鎺ヨ繑鍥炲師濮?data URL
  if (IS_VERCEL || !STORE_REFERENCE_IMAGES) {
    return [];
  }

  const output: string[] = [];

  for (const item of referenceImages.slice(0, 9)) {
    const base64 = typeof item.data === 'string' ? item.data.split(',').pop() || '' : '';
    if (!base64) continue;

    const extension = fileExtensionFromMimeType(item.mimeType);
    const fileName = `reference-${Date.now()}-${randomHex(3)}.${extension}`;
    const target = path.join(REFERENCES_DIR, fileName);
    await fs.writeFile(target, Buffer.from(base64, 'base64'));
    output.push(`/uploads/references/${fileName}`);
  }

  return output;
}

// 鈹€鈹€鈹€ 鏈嶅姟鍣ㄥ惎鍔?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

async function persistTemporaryReferenceImages(referenceImages: ReferenceUploadInput[]) {
  if (IS_VERCEL) {
    return [];
  }

  const output: string[] = [];

  for (const item of referenceImages.slice(0, 9)) {
    const data = normalizeString(item.data);
    if (!data.startsWith('data:image/')) continue;

    const base64 = data.split(',').pop() || '';
    if (!base64) continue;

    const extension = fileExtensionFromMimeType(item.mimeType);
    const fileName = `temp-reference-${Date.now()}-${randomHex(3)}.${extension}`;
    const target = path.join(REFERENCES_DIR, fileName);
    await fs.writeFile(target, Buffer.from(base64, 'base64'));
    output.push(`/uploads/references/${fileName}`);
  }

  return output;
}

async function cleanupTemporaryReferenceImages(referenceImages: string[]) {
  await Promise.all(
    referenceImages
      .filter((item) => item.startsWith('/uploads/references/temp-reference-'))
      .map(async (item) => {
        const target = path.resolve(ROOT_DIR, item.replace(/^\/+/, ''));
        if (!target.startsWith(REFERENCES_DIR)) return;
        await fs.unlink(target).catch(() => undefined);
      }),
  );
}

async function start() {
  if (!IS_VERCEL) {
    await ensureRuntimeDirectories();
  }

  if (USE_SUPABASE) {
    if (IS_VERCEL) {
      // Vercel Serverless 鐜锛氬垵濮嬪寲澶辫触鏃跺欢杩熷埌棣栦釜璇锋眰鍐嶉噸璇?
      try {
        const db = await getSupabaseDb();
        await db.ensureRuntimeSchema();
        await runUnifiedCreditMigrationSupabase();
      } catch (schemaError) {
        console.error('Supabase schema initialization failed (will retry on first request):', schemaError);
      }
    } else {
      const db = await getSupabaseDb();
      await db.ensureRuntimeSchema();
      await runUnifiedCreditMigrationSupabase();
    }
  } else if (!IS_VERCEL) {
    // SQLite 浠呭湪鎸佷箙鍖栨枃浠剁郴缁熺幆澧冧笅鍒濆鍖?    // await restoreSqliteFromSupabase();
    await ensureRuntimeSchema();
  } else if (IS_VERCEL) {
    throw new Error('SQLite persistence is not supported in the Vercel serverless runtime.');
  }

  await runImageRetentionCleanup('startup');
  if (!IS_VERCEL) {
    setInterval(() => {
      void runImageRetentionCleanup('interval');
    }, IMAGE_CLEANUP_INTERVAL_MS);
  }

  const app = express();
  const hasDistBuild = !IS_VERCEL && (await pathExists(path.join(DIST_DIR, 'index.html')));

  app.use((req, res, next) => {
    const originHeader = req.headers.origin;
    if (originHeader && isAllowedOrigin(originHeader)) {
      res.setHeader('Access-Control-Allow-Origin', originHeader);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key, Idempotency-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use((req, res, next) => {
    const rawHost = normalizeString(req.headers.host);
    const hostname = rawHost.replace(/:\d+$/, '');
    const acceptHeader = normalizeString(req.headers.accept).toLowerCase();
    const prefersHtml = acceptHeader.includes('text/html') || acceptHeader.includes('*/*');
    const isHtmlRequest = (req.method === 'GET' || req.method === 'HEAD') && prefersHtml;
    const isAssetRequest =
      req.path.startsWith('/api') || req.path.startsWith('/assets') || req.path.startsWith('/uploads');
    const isLocalHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === DEFAULT_HOST ||
      hostname === '';
    const isCanonicalHost =
      hostname === CANONICAL_WEB_HOST || hostname === `www.${CANONICAL_WEB_HOST}`;

    if (CANONICAL_WEB_HOST && isHtmlRequest && !isAssetRequest && !isLocalHost && !isCanonicalHost) {
      res.redirect(301, `${CANONICAL_WEB_ORIGIN}${req.originalUrl}`);
      return;
    }

    next();
  });

  app.use(
    compression({
      threshold: 1024,
    }),
  );

  app.use(express.json({ limit: '20mb' }));

  // 闈欐€佹枃浠舵湇鍔′粎鏈湴鐜
  if (!IS_VERCEL) {
    app.use('/uploads', express.static(UPLOADS_DIR));
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      userStorage: USE_SUPABASE ? 'Supabase' : 'SQLite',
      databaseProvider: DATABASE_PROVIDER,
    });
  });

  // 鈹€鈹€鈹€ 娉ㄥ唽 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  app.post('/api/auth/register', async (req, res) => {
    const username = normalizeString(req.body?.username);
    const password = normalizeString(req.body?.password);
    const email = normalizeString(req.body?.email) || null;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    if (username.length < 3 || password.length < 6) {
      res.status(400).json({ error: 'Username must be 3+ chars and password 6+ chars' });
      return;
    }

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();

        const existing = await db.findUserByUsername(username);
        if (existing) {
          res.status(409).json({ error: 'Username already exists' });
          return;
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await db.createUser(username, passwordHash, email);
        await db.ensureUserCredits(user.id, username, 0);

        const authUser = { userId: user.id, username };
        res.status(201).json({
          token: issueToken(authUser),
          user: await getPublicUser(authUser),
        });
        return;
      }

      // SQLite 妯″紡
      const result = await withWriteDb(async (db) => {
        ensureSchema(db);

        const existing = getOne<{ id: number }>(db, 'SELECT id FROM users WHERE username = ?', [username]);
        if (existing) {
          return null;
        }

        const passwordHash = await bcrypt.hash(password, 10);
        db.run(
          'INSERT INTO users (username, password_hash, email, created_at) VALUES (?, ?, ?, ?)',
          [username, passwordHash, email, nowIso()],
        );
        const legacyUserId = lastInsertId(db);
        const externalUserId = await resolveExternalUserId(db, legacyUserId, username);
        ensureUserCredits(db, externalUserId, username, 0);
        return {
          token: issueToken({ userId: externalUserId, username }),
          authUser: { userId: externalUserId, username },
        };
      });

      if (!result) {
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      res.status(201).json({
        token: result.token,
        user: await getPublicUser(result.authUser),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Register failed' });
    }
  });

  // 鈹€鈹€鈹€ 鐧诲綍 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  app.post('/api/auth/login', async (req, res) => {
    const username = normalizeString(req.body?.username);
    const password = normalizeString(req.body?.password);

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();

        const record = await db.findUserByUsername(username);
        if (!record) {
          res.status(401).json({ error: 'Invalid username or password' });
          return;
        }

        const matches = await bcrypt.compare(password, record.password_hash);
        if (!matches) {
          res.status(401).json({ error: 'Invalid username or password' });
          return;
        }

        await db.ensureUserCredits(record.id, record.username, 0);
        const authUser = { userId: record.id, username: record.username };

        res.json({
          token: issueToken(authUser),
          user: await getPublicUser(authUser),
        });
        return;
      }

      // SQLite 妯″紡
      const user = await withWriteDb(async (db) => {
        ensureSchema(db);
        const record = getOne<{
          id: number;
          username: string;
          password_hash: string;
        }>(db, 'SELECT id, username, password_hash FROM users WHERE username = ?', [username]);

        if (!record) {
          return null;
        }

        const matches = await bcrypt.compare(password, String(record.password_hash || ''));
        if (!matches) {
          return null;
        }

        const externalUserId = await resolveExternalUserId(db, Number(record.id), String(record.username || username));
        ensureUserCredits(db, externalUserId, String(record.username || username), 0);
        return {
          id: externalUserId,
          username: String(record.username || username),
        };
      });

      if (!user) {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }

      res.json({
        token: issueToken({ userId: user.id, username: user.username }),
        user: await getPublicUser({ userId: user.id, username: user.username }),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Login failed' });
    }
  });

  // 鈹€鈹€鈹€ 閭€璇风爜鐧诲綍 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  app.post('/api/auth/invite', async (req, res) => {
    const code = normalizeString(req.body?.code).toUpperCase();

    if (!code) {
      res.status(400).json({ error: 'Invite code is required' });
      return;
    }

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        await db.reclaimLowBalanceInviteCodes();

        const invite = await db.getInviteCode(code);
        if (!invite) {
          res.status(401).json({ error: 'Invalid invite code' });
          return;
        }

        const credits = invite.credits;
        const redeemedBy = invite.redeemed_by || '';
        if (!redeemedBy && credits <= 0) {
          res.status(401).json({ error: 'Invalid invite code' });
          return;
        }

        const username = `invite-${code.slice(-4).toLowerCase()}`;
        const inviteUser = await db.findOrCreateInviteUser(username);
        const userId = inviteUser.id;

        if (!redeemedBy) {
          await db.redeemInviteCode(code, userId);
          await db.ensureUserCredits(userId, username, credits);
        } else if (redeemedBy !== userId) {
          await db.migrateLegacyInviteUserId(redeemedBy, userId, username);
          await db.redeemInviteCode(code, userId);
          await db.ensureUserCredits(userId, username, 0);
        } else {
          await db.ensureUserCredits(userId, username, 0);
        }

        const authUser = { userId, username };
        res.json({
          token: issueToken(authUser),
          user: await getPublicUser(authUser),
        });
        return;
      }

      // SQLite 妯″紡
      const inviteUser = await withWriteDb((db) => {
        ensureSchema(db);
        reclaimLowBalanceInviteCodes(db);
        const invite = getOne<Record<string, unknown>>(db, 'SELECT * FROM invite_codes WHERE code = ?', [code]);
        if (!invite) return null;

        const credits = Number(invite.credits || 0);
        const redeemedBy = normalizeString(invite.redeemed_by);
        if (!redeemedBy && credits <= 0) return null;
        const digest = sha256Digest(code);
        const userId = redeemedBy || `invite-${digest}`;
        const username = `invite-${code.slice(-4).toLowerCase()}`;

        if (!redeemedBy) {
          db.run('UPDATE invite_codes SET redeemed_by = ?, redeemed_at = ? WHERE code = ?', [userId, nowIso(), code]);
          ensureUserCredits(db, userId, username, credits);
        } else {
          ensureUserCredits(db, userId, username, 0);
        }

        return { id: userId, username };
      });

      if (!inviteUser) {
        res.status(401).json({ error: 'Invalid invite code' });
        return;
      }

      res.json({
        token: issueToken({ userId: inviteUser.id, username: inviteUser.username }),
        user: await getPublicUser({ userId: inviteUser.id, username: inviteUser.username }),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Invite login failed' });
    }
  });

  // 鈹€鈹€鈹€ 鑾峰彇褰撳墠鐢ㄦ埛 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    if (USE_SUPABASE) {
      const db = await getSupabaseDb();
      await db.reclaimLowBalanceInviteCodes();
    } else {
      await withWriteDb((db) => {
        ensureSchema(db);
        reclaimLowBalanceInviteCodes(db);
      });
    }
    res.json({ user: await getPublicUser(req.authUser!) });
  });

  // 鈹€鈹€鈹€ 妯″瀷鍒楄〃 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  app.get('/api/user/promo-coupon', requireAuth, async (req, res) => {
    try {
      const coupon = await getOrRefreshPromoCoupon(req.authUser!);
      res.json({ coupon });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch promo coupon failed' });
    }
  });

  app.post('/api/user/promo-coupon/ack', requireAuth, async (req, res) => {
    try {
      const coupon = await acknowledgePromoCoupon(req.authUser!);
      res.json({ coupon });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Acknowledge promo coupon failed' });
    }
  });

  app.get('/api/models', requireAuth, (_req, res) => {
    res.json({ models });
  });

  // 鈹€鈹€鈹€ 鍥剧墖鐢熸垚 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  const publicGenerateHandler = async (req: Request, res: Response) => {
    const apiKey = normalizeString(req.headers['x-api-key'] || req.headers.authorization?.replace(/^Bearer\s+/i, ''));
    const prompt = normalizeString(req.body?.prompt);
    const model = normalizeString(req.body?.model);
    const dimensions = normalizeString(req.body?.dimensions || req.body?.aspectRatio) || '1:1';
    const requestedImageSize = normalizeString(req.body?.imageSize) || inferImageSizeFromAspectRatio(dimensions);
    const requestedQuality = normalizeString(req.body?.quality).toLowerCase();
    const optimizeChineseText = Boolean(req.body?.optimizeChineseText);
    const rawReferenceImages = Array.isArray(req.body?.reference_images)
      ? req.body.reference_images
      : Array.isArray(req.body?.images)
        ? req.body.images
        : [];
    const referenceImages = rawReferenceImages
      .map((item: unknown) => (typeof item === 'string' ? item : normalizeString((item as { data?: string })?.data)))
      .filter((item: string) => /^https?:\/\//i.test(item));

    if (!apiKey) {
      res.status(401).json({ error: 'X-API-Key is required' });
      return;
    }

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    let reservedKey: PublicApiKeyRecord | null = null;
    let creditsUsed = 0;

    try {
      const modelId = normalizeModelId(model);
      const ratio = normalizeRatio(dimensions, modelId);
      const modelName = modelNameFromId(modelId);
      const imageSize = normalizeImageSize(requestedImageSize, modelId);
      creditsUsed = getModelCredits(modelId, imageSize) + (modelId === 'Nano_Banana_Pro' && optimizeChineseText ? 8 : 0);
      reservedKey = await reservePublicApiKeyCredits(apiKey, creditsUsed);

      const createdAt = nowIso();
      const generatedImageSource = await callVisionaryGeneration({
        prompt,
        modelId,
        ratio,
        imageSize,
        quality: modelId === 'gpt-image-2' ? requestedQuality : '',
        optimizeChineseText: modelId === 'Nano_Banana_Pro' ? optimizeChineseText : false,
        images: Array.from(new Set(referenceImages)),
      });
      const imagePath = await persistGeneratedImage(generatedImageSource);
      const username = `api-${reservedKey.name}`.slice(0, 80);

      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        await db.insertGeneration({
          userId: `api-key:${reservedKey.id}`,
          username,
          prompt,
          modelId,
          modelName,
          dimensions: ratio,
          imageSize,
          imagePath,
          creditsUsed,
          referenceImages,
          createdAt,
        });
      } else {
        await withWriteDb((db) => {
          ensureSchema(db);
          db.run(
            `
              INSERT INTO generations (
                user_id,
                username,
                prompt,
                model_id,
                model_name,
                dimensions,
                image_size,
                image_path,
                credits_used,
                reference_images,
                created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              `api-key:${reservedKey!.id}`,
              username,
              prompt,
              modelId,
              modelName,
              ratio,
              imageSize,
              imagePath,
              creditsUsed,
              serializeReferenceImages(referenceImages),
              createdAt,
            ],
          );
        });
      }

      res.json({
        image: toPublicGeneratedImagePayload(req, {
          prompt,
          modelName,
          dimensions: ratio,
          imageSize,
          imagePath,
          referenceImages,
          createdAt,
        }),
        usage: {
          creditsUsed,
          remainingCredits: Math.max(0, reservedKey.totalCredits - reservedKey.usedCredits),
        },
      });
    } catch (error) {
      if (reservedKey && creditsUsed > 0) {
        await refundPublicApiKeyCredits(reservedKey.id, creditsUsed).catch(() => undefined);
      }

      const message = error instanceof Error ? error.message : 'Generate failed';
      const status = message.includes('无效') || message.includes('停用') ? 401 : message.includes('额度不足') ? 402 : 500;
      res.status(status).json({ error: message });
    }
  };

  [
    '/api/v1/generate',
    '/v1/api/generate',
    '/v1/images/generations',
    '/openapi/v1/images/generations',
    '/v1/chat/completions',
    '/v1/api/nano-banana',
  ].forEach((path) => app.post(path, publicGenerateHandler));

  app.post('/api/generate', requireAuth, async (req, res) => {
    const prompt = normalizeString(req.body?.prompt);
    const model = normalizeString(req.body?.model);
    const dimensions = normalizeString(req.body?.dimensions) || '1:1';
    const requestedImageSize = normalizeString(req.body?.imageSize);
    const requestedQuality = normalizeString(req.body?.quality).toLowerCase();
    const optimizeChineseText = Boolean(req.body?.optimizeChineseText);
    const referenceImagesInput = Array.isArray(req.body?.reference_images)
      ? (req.body.reference_images as ReferenceUploadInput[])
      : [];

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    try {
      let modelId = normalizeModelId(model);
      let ratio = normalizeRatio(dimensions, modelId);
      let modelName = modelNameFromId(modelId);
      let imageSize = normalizeImageSize(requestedImageSize, modelId);
      let creditsUsed = getModelCredits(modelId, imageSize) + (modelId === 'Nano_Banana_Pro' && optimizeChineseText ? 8 : 0);

      // Credits check
      if (creditsUsed > 0) {
        if (USE_SUPABASE) {
          const db = await getSupabaseDb();
          await db.reclaimLowBalanceInviteCodes();
          await db.ensureUserCredits(req.authUser!.userId, req.authUser!.username, 0);
          const credits = await db.getUserCredits(req.authUser!.userId);
          if (credits.remainingCredits < creditsUsed) {
            throw new Error(`绉垎涓嶈冻锛屾湰娆￠渶瑕?${creditsUsed} 绉垎锛屽綋鍓嶅墿浣?${credits.remainingCredits} 绉垎`);
          }
        } else {
          await withWriteDb((db) => {
            ensureSchema(db);
            reclaimLowBalanceInviteCodes(db);
            ensureUserCredits(db, req.authUser!.userId, req.authUser!.username, 0);
            const credits = getUserCredits(db, req.authUser!.userId);
            if (credits.remainingCredits < creditsUsed) {
              throw new Error(`绉垎涓嶈冻锛屾湰娆￠渶瑕?${creditsUsed} 绉垎锛屽綋鍓嶅墿浣?${credits.remainingCredits} 绉垎`);
            }
          });
        }
      }

      const referenceImages = await persistReferenceImages(referenceImagesInput);
      const temporaryReferenceImages = referenceImages.length > 0 ? [] : await persistTemporaryReferenceImages(referenceImagesInput);
      const modelReferenceImages = [
        ...referenceImagesInput
          .map((item) => normalizeString(item.data))
          .filter((item) => item.startsWith('http://') || item.startsWith('https://')),
        ...referenceImages
          .map((item) => toPublicAssetUrl(req, item))
          .filter((item) => item.startsWith('http://') || item.startsWith('https://')),
        ...temporaryReferenceImages
          .map((item) => toPublicAssetUrl(req, item))
          .filter((item) => item.startsWith('http://') || item.startsWith('https://')),
      ];
      const uniqueModelReferenceImages = Array.from(new Set(modelReferenceImages));

      if (referenceImagesInput.length > 0 && uniqueModelReferenceImages.length === 0) {
        await cleanupTemporaryReferenceImages(temporaryReferenceImages);
        throw new Error('当前部署未提供可公网访问的参考图链接，请配置 APP_URL / CANONICAL_WEB_ORIGIN，或改用已公开的图片链接后再试。');
      }

      const createdAt = nowIso();
      let imagePath = '';
      try {
        const generatedImageSource = await callVisionaryGeneration({
          prompt,
          modelId,
          ratio,
          imageSize,
          quality: modelId === 'gpt-image-2' ? requestedQuality : '',
          optimizeChineseText: modelId === 'Nano_Banana_Pro' ? optimizeChineseText : false,
          images: uniqueModelReferenceImages,
        });
        imagePath = await persistGeneratedImage(generatedImageSource);
      } finally {
        await cleanupTemporaryReferenceImages(temporaryReferenceImages);
      }

      const payload: GeneratedImagePayload = {
        prompt,
        modelName,
        dimensions: ratio,
        imageSize,
        imagePath,
        referenceImages,
        createdAt,
      };

      // 鎵ｉ櫎绉垎
      if (creditsUsed > 0) {
        if (USE_SUPABASE) {
          const db = await getSupabaseDb();
          await db.reclaimLowBalanceInviteCodes();
          await db.incrementUsedCredits(req.authUser!.userId, creditsUsed);
          await db.syncInviteCodeBalanceForUser(req.authUser!.userId);
        } else {
          await withWriteDb((db) => {
            ensureSchema(db);
            reclaimLowBalanceInviteCodes(db);
            db.run('UPDATE user_credits SET used_credits = used_credits + ?, updated_at = ? WHERE user_id = ?', [
              creditsUsed,
              nowIso(),
              req.authUser!.userId,
            ]);
            syncInviteCodeBalanceForUser(db, req.authUser!.userId);
          });
        }
      }

      // 璁板綍鐢熸垚鍘嗗彶
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        await db.reclaimLowBalanceInviteCodes();
        await db.insertGeneration({
          userId: req.authUser!.userId,
          username: req.authUser!.username,
          prompt,
          modelId,
          modelName,
          dimensions: ratio,
          imageSize,
          imagePath,
          creditsUsed,
          referenceImages,
          createdAt,
        });
      } else {
        await withWriteDb((db) => {
          ensureSchema(db);
          reclaimLowBalanceInviteCodes(db);
          db.run(
            `
              INSERT INTO generations (
                user_id,
                username,
                prompt,
                model_id,
                model_name,
                dimensions,
                image_size,
                image_path,
                credits_used,
                reference_images,
                created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              req.authUser!.userId,
              req.authUser!.username,
              prompt,
              modelId,
              modelName,
              ratio,
              imageSize,
              imagePath,
              creditsUsed,
              serializeReferenceImages(referenceImages),
              createdAt,
            ],
          );
        });
      }

      res.json({ image: toPublicGeneratedImagePayload(req, payload) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Generate failed' });
    }
  });

  // 鈹€鈹€鈹€ 鐢熸垚鍘嗗彶 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  app.get('/api/user/history', requireAuth, async (req, res) => {
    const userId = req.authUser!.userId;

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        const generations = await db.getUserGenerations(userId);
        const history = generations.map((row) => toGeneration({
          id: row.id,
          user_id: row.user_id,
          username: row.username,
          prompt: row.prompt,
          model_id: row.model_id,
          model_name: row.model_name,
          dimensions: row.dimensions,
          image_size: row.image_size,
          image_path: row.image_path,
          credits_used: row.credits_used,
          reference_images: row.reference_images,
          created_at: row.created_at,
        }));
        res.json({ history: history.map((item) => toPublicGeneration(req, item)) });
        return;
      }

      const history = await withReadDb((db) => {
        ensureSchema(db);
        return runQuery<Record<string, unknown>>(
          db,
          `
            SELECT id, user_id, username, prompt, model_id, model_name, dimensions, image_size, image_path, credits_used, reference_images, created_at
            FROM generations
            WHERE user_id = ?
            ORDER BY datetime(created_at) DESC, id DESC
          `,
          [userId],
        ).map(toGeneration);
      });

      res.json({ history: history.map((item) => toPublicGeneration(req, item)) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch history failed' });
    }
  });

  // 鈹€鈹€鈹€ 绠＄悊鍛樻瑙?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  app.get('/api/admin/overview', requireAuth, requireAdmin, async (req, res) => {
    const recordsPage = parsePaginationValue(req.query.recordsPage, 1, 1, 100000);
    const recordsPageSize = parsePaginationValue(req.query.recordsPageSize, 10, 1, 100);
    const inviteCodesPage = parsePaginationValue(req.query.inviteCodesPage, 1, 1, 100000);
    const inviteCodesPageSize = parsePaginationValue(req.query.inviteCodesPageSize, 10, 1, 100);

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        await db.reclaimLowBalanceInviteCodes();

        const generationSummaries = await db.getGenerationSummaries();
        const registeredUsers = await db.getRegisteredUsers();
        const creditRows = await db.getAllCreditRows();

        const summaryByUserId = new Map(
          generationSummaries.map((row) => [
            row.user_id,
            {
              userId: row.user_id,
              username: row.username,
              generations: row.generations,
              creditsUsed: row.credits_used,
              lastGeneratedAt: row.last_generated_at,
            },
          ]),
        );

        const userMap = new Map<
          string,
          {
            userId: string;
            username: string;
            generations: number;
            creditsUsed: number;
            totalCredits: number;
            usedCredits: number;
            remainingCredits: number;
            lastGeneratedAt: string;
          }
        >();

        for (const row of registeredUsers) {
          userMap.set(row.user_id, {
            userId: row.user_id,
            username: row.username,
            generations: 0,
            creditsUsed: 0,
            totalCredits: row.total_credits,
            usedCredits: row.used_credits,
            remainingCredits: Math.max(0, row.total_credits - row.used_credits),
            lastGeneratedAt: '',
          });
        }

        for (const row of creditRows) {
          if (!userMap.has(row.user_id)) {
            userMap.set(row.user_id, {
              userId: row.user_id,
              username: row.username,
              generations: 0,
              creditsUsed: 0,
              totalCredits: row.total_credits,
              usedCredits: row.used_credits,
              remainingCredits: Math.max(0, row.total_credits - row.used_credits),
              lastGeneratedAt: '',
            });
          }
        }

        for (const summary of summaryByUserId.values()) {
          const current = userMap.get(summary.userId);
          userMap.set(summary.userId, {
            userId: summary.userId,
            username: current?.username || summary.username,
            generations: summary.generations,
            creditsUsed: summary.creditsUsed,
            totalCredits: current?.totalCredits || 0,
            usedCredits: current?.usedCredits || 0,
            remainingCredits: current?.remainingCredits || 0,
            lastGeneratedAt: summary.lastGeneratedAt,
          });
        }

        const users = [...userMap.values()].sort(
          (left, right) => right.creditsUsed - left.creditsUsed || right.generations - left.generations,
        );

        const { records: genRecords, total: recordsTotal } = await db.getGenerationsWithInviteCode(recordsPage, recordsPageSize);
        const records = genRecords.map((row) => toGeneration({
          id: row.id,
          user_id: row.user_id,
          username: row.username,
          prompt: row.prompt,
          model_id: row.model_id,
          model_name: row.model_name,
          dimensions: row.dimensions,
          image_size: row.image_size,
          image_path: row.image_path,
          credits_used: row.credits_used,
          reference_images: row.reference_images,
          created_at: row.created_at,
          invite_code: row.invite_code,
        }));

        const { codes: inviteCodeRows, total: inviteCodesTotal } = await db.listInviteCodes(inviteCodesPage, inviteCodesPageSize);
        const inviteCodes = inviteCodeRows.map((row) => toInviteCode({
          code: row.code,
          credits: row.credits,
          issued_credits: row.issued_credits,
          created_by: row.created_by,
          created_at: row.created_at,
          redeemed_by: row.redeemed_by,
          redeemed_at: row.redeemed_at,
          low_balance_since: row.low_balance_since,
        }));

        const adminCredits = await db.getAdminCreditSummary();

        res.json({
          users,
          records: records.map((item) => toPublicGeneration(req, item)),
          recordsPage: toPagination(recordsPage, recordsPageSize, recordsTotal),
          inviteCodes,
          inviteCodesPage: toPagination(inviteCodesPage, inviteCodesPageSize, inviteCodesTotal),
          adminCredits,
        });
        return;
      }

      // SQLite 妯″紡
      const payload = await withWriteDb((db) => {
        ensureSchema(db);
        reclaimLowBalanceInviteCodes(db);
        const generationSummaries = runQuery<Record<string, unknown>>(
          db,
          `
            SELECT
              user_id,
              username,
              COUNT(*) AS generations,
              COALESCE(SUM(credits_used), 0) AS credits_used,
              MAX(created_at) AS last_generated_at
            FROM generations
            WHERE username != 'demo'
            GROUP BY user_id, username
            ORDER BY credits_used DESC, generations DESC
          `,
        );
        const registeredUsers = runQuery<Record<string, unknown>>(
          db,
          `
            SELECT
              COALESCE(m.supabase_user_id, CAST(u.id AS TEXT)) AS user_id,
              u.username AS username,
              COALESCE(c.total_credits, 0) AS total_credits,
              COALESCE(c.used_credits, 0) AS used_credits
            FROM users u
            LEFT JOIN user_migrations m ON m.legacy_user_id = u.id
            LEFT JOIN user_credits c ON c.user_id = COALESCE(m.supabase_user_id, CAST(u.id AS TEXT))
            WHERE u.username != 'demo'
            ORDER BY u.id DESC
          `,
        );
        const summaryByUserId = new Map(
          generationSummaries.map((row) => [
            String(row.user_id || ''),
            {
              userId: String(row.user_id || ''),
              username: String(row.username || ''),
              generations: Number(row.generations || 0),
              creditsUsed: Number(row.credits_used || 0),
              lastGeneratedAt: String(row.last_generated_at || ''),
            },
          ]),
        );

        const creditRows = runQuery<Record<string, unknown>>(
          db,
          "SELECT user_id, username, total_credits, used_credits FROM user_credits WHERE username != 'demo'",
        );
        const userMap = new Map<
          string,
          {
            userId: string;
            username: string;
            generations: number;
            creditsUsed: number;
            totalCredits: number;
            usedCredits: number;
            remainingCredits: number;
            lastGeneratedAt: string;
          }
        >();

        for (const row of registeredUsers) {
          const userId = String(row.user_id || '');
          const totalCredits = Number(row.total_credits || 0);
          const usedCredits = Number(row.used_credits || 0);
          userMap.set(userId, {
            userId,
            username: String(row.username || ''),
            generations: 0,
            creditsUsed: 0,
            totalCredits,
            usedCredits,
            remainingCredits: Math.max(0, totalCredits - usedCredits),
            lastGeneratedAt: '',
          });
        }

        for (const row of creditRows) {
          const userId = String(row.user_id || '');
          const totalCredits = Number(row.total_credits || 0);
          const usedCredits = Number(row.used_credits || 0);
          if (!userMap.has(userId)) {
            userMap.set(userId, {
              userId,
              username: String(row.username || ''),
              generations: 0,
              creditsUsed: 0,
              totalCredits,
              usedCredits,
              remainingCredits: Math.max(0, totalCredits - usedCredits),
              lastGeneratedAt: '',
            });
          }
        }

        for (const summary of summaryByUserId.values()) {
          const current = userMap.get(summary.userId);
          userMap.set(summary.userId, {
            userId: summary.userId,
            username: current?.username || summary.username,
            generations: summary.generations,
            creditsUsed: summary.creditsUsed,
            totalCredits: current?.totalCredits || 0,
            usedCredits: current?.usedCredits || 0,
            remainingCredits: current?.remainingCredits || 0,
            lastGeneratedAt: summary.lastGeneratedAt,
          });
        }

        const users = [...userMap.values()].sort(
          (left, right) => right.creditsUsed - left.creditsUsed || right.generations - left.generations,
        );

        const recordsTotal = Number(
          getOne<{ total: number }>(
            db,
            `
              SELECT COUNT(*) AS total
              FROM generations
              WHERE username != 'demo'
            `,
          )?.total || 0,
        );
        const records = runQuery<Record<string, unknown>>(
          db,
          `
            SELECT
              g.id,
              g.user_id,
              g.username,
              g.prompt,
              g.model_id,
              g.model_name,
              g.dimensions,
              g.image_size,
              g.image_path,
              g.credits_used,
              g.reference_images,
              g.created_at,
              COALESCE((
                SELECT ic.code
                FROM invite_codes ic
                WHERE ic.redeemed_by = g.user_id
                ORDER BY datetime(ic.redeemed_at) DESC, datetime(ic.created_at) DESC
                LIMIT 1
              ), '') AS invite_code
            FROM generations g
            WHERE g.username != 'demo'
            ORDER BY datetime(g.created_at) DESC, g.id DESC
            LIMIT ? OFFSET ?
          `,
          [recordsPageSize, (recordsPage - 1) * recordsPageSize],
        ).map(toGeneration);

        const inviteCodesTotal = Number(
          getOne<{ total: number }>(
            db,
            `
              SELECT COUNT(*) AS total
              FROM invite_codes
            `,
          )?.total || 0,
        );
        const inviteCodes = runQuery<Record<string, unknown>>(
          db,
          `
            SELECT code, credits, issued_credits, created_by, created_at, redeemed_by, redeemed_at, low_balance_since
            FROM invite_codes
            ORDER BY datetime(created_at) DESC
            LIMIT ? OFFSET ?
          `,
          [inviteCodesPageSize, (inviteCodesPage - 1) * inviteCodesPageSize],
        ).map(toInviteCode);

        return {
          users,
          records,
          recordsPage: toPagination(recordsPage, recordsPageSize, recordsTotal),
          inviteCodes,
          inviteCodesPage: toPagination(inviteCodesPage, inviteCodesPageSize, inviteCodesTotal),
          adminCredits: getAdminCreditSummary(db),
        };
      });

      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch admin overview failed' });
    }
  });

  // 鈹€鈹€鈹€ 鍒涘缓閭€璇风爜 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  app.get('/api/admin/api-keys', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const keys = await readPublicApiKeyRecords();
      res.json({ keys: keys.map(publicApiKeyRecord) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch API keys failed' });
    }
  });

  app.post('/api/admin/api-keys', requireAuth, requireAdmin, async (req, res) => {
    const name = normalizeString(req.body?.name) || 'API Key';
    const credits = Math.floor(Number(req.body?.credits));

    if (!Number.isFinite(credits) || credits <= 0) {
      res.status(400).json({ error: 'Credits must be a positive number' });
      return;
    }

    try {
      const payload = await createPublicApiKey(name, credits, req.authUser!.username);
      res.status(201).json({
        apiKey: payload.plainKey,
        key: publicApiKeyRecord(payload.record),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Create API key failed' });
    }
  });

  app.post('/api/admin/api-keys/:id/revoke', requireAuth, requireAdmin, async (req, res) => {
    try {
      const key = await revokePublicApiKey(normalizeString(req.params.id));
      if (!key) {
        res.status(404).json({ error: 'API key not found' });
        return;
      }

      res.json({ key: publicApiKeyRecord(key) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Revoke API key failed' });
    }
  });

  app.delete('/api/admin/api-keys/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const deleted = await deletePublicApiKey(normalizeString(req.params.id));
      if (!deleted) {
        res.status(404).json({ error: 'API key not found' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Delete API key failed' });
    }
  });

  app.get('/api/admin/dashboard', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const imageStorage = await getImageStorageStats();

      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        const [users, adminCredits, recordPage, invitePage, usedInvitePage] = await Promise.all([
          getSupabaseAdminUsers(),
          db.getAdminCreditSummary(),
          db.getGenerationsWithInviteCode(1, 100000),
          db.listInviteCodes(1, 1),
          db.listInviteCodes(1, 1, { status: 'used' }),
        ]);
        const records = recordPage.records.map((row) => toGeneration({
          id: row.id,
          user_id: row.user_id,
          username: row.username,
          prompt: row.prompt,
          model_id: row.model_id,
          model_name: row.model_name,
          dimensions: row.dimensions,
          image_size: row.image_size,
          image_path: row.image_path,
          credits_used: row.credits_used,
          reference_images: row.reference_images,
          created_at: row.created_at,
          invite_code: row.invite_code,
        }));
        const recordStats = summarizeRecordStats(records);

        res.json({
          stats: {
            todayRecordCount: recordStats.todayRecordCount,
            todayCreditsUsed: recordStats.todayCreditsUsed,
            inviteUsageRate: invitePage.total > 0 ? Math.round((usedInvitePage.total / invitePage.total) * 100) : 0,
            lowCreditUserCount: users.filter((item) => item.remainingCredits <= 50).length,
            userCount: users.length,
            inviteCodeCount: invitePage.total,
            recordCount: recordPage.total,
            usedInviteCodeCount: usedInvitePage.total,
          },
          imageStorage,
          adminCredits,
        });
        return;
      }

      const payload = await withReadDb((db) => {
        ensureSchema(db);
        const todayKey = formatDateKeyInTimeZone(new Date());
        const todayRows = runQuery<Record<string, unknown>>(
          db,
          "SELECT created_at, credits_used FROM generations WHERE username != 'demo'",
        ).filter((row) => formatDateKeyInTimeZone(String(row.created_at || '')) === todayKey);
        const inviteCount = Number(getOne<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM invite_codes')?.total || 0);
        const usedInviteCount = Number(
          getOne<{ total: number }>(db, "SELECT COUNT(*) AS total FROM invite_codes WHERE redeemed_by IS NOT NULL AND redeemed_by != ''")?.total || 0,
        );
        const userCount = Number(getOne<{ total: number }>(db, "SELECT COUNT(*) AS total FROM users WHERE username != 'demo'")?.total || 0);
        const recordCount = Number(getOne<{ total: number }>(db, "SELECT COUNT(*) AS total FROM generations WHERE username != 'demo'")?.total || 0);
        return {
          stats: {
            todayRecordCount: todayRows.length,
            todayCreditsUsed: todayRows.reduce((sum, row) => sum + Number(row.credits_used || 0), 0),
            inviteUsageRate: inviteCount > 0 ? Math.round((usedInviteCount / inviteCount) * 100) : 0,
            lowCreditUserCount: 0,
            userCount,
            inviteCodeCount: inviteCount,
            recordCount,
            usedInviteCodeCount: usedInviteCount,
          },
          imageStorage,
          adminCredits: getAdminCreditSummary(db),
        };
      });

      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch admin dashboard failed' });
    }
  });

  app.get('/api/admin/invite-codes', requireAuth, requireAdmin, async (req, res) => {
    const page = parsePaginationValue(req.query.page, 1, 1, 100000);
    const pageSize = parsePaginationValue(req.query.pageSize, 10, 1, 100);
    const status = normalizeString(req.query.status) || 'all';
    const sort = normalizeString(req.query.sort) || 'created-desc';
    const search = normalizeString(req.query.search);

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        const [{ codes, total }, adminCredits, users] = await Promise.all([
          db.listInviteCodes(page, pageSize, { status, sort, search }),
          db.getAdminCreditSummary(),
          getSupabaseAdminUsers(),
        ]);
        const usersById = new Map(users.map((item) => [item.userId, item]));
        const inviteCodes = codes.map((row) => {
          const redeemedBy = normalizeString(row.redeemed_by);
          const redeemedUser = redeemedBy ? usersById.get(redeemedBy) : null;
          return {
            ...toInviteCode({
              code: row.code,
              credits: row.credits,
              issued_credits: row.issued_credits,
              created_by: row.created_by,
              created_at: row.created_at,
              redeemed_by: row.redeemed_by,
              redeemed_at: row.redeemed_at,
              low_balance_since: row.low_balance_since,
            }),
            redeemedUsername: redeemedUser?.username || '',
            consumedAfterRedeem: redeemedUser?.creditsUsed || 0,
          };
        });

        res.json({
          inviteCodes,
          inviteCodesPage: toPagination(page, pageSize, total),
          adminCredits,
        });
        return;
      }

      const payload = await withReadDb((db) => {
        ensureSchema(db);
        const total = Number(getOne<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM invite_codes')?.total || 0);
        const inviteCodes = runQuery<Record<string, unknown>>(
          db,
          'SELECT code, credits, issued_credits, created_by, created_at, redeemed_by, redeemed_at, low_balance_since FROM invite_codes ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?',
          [pageSize, (page - 1) * pageSize],
        ).map(toInviteCode);
        return {
          inviteCodes,
          inviteCodesPage: toPagination(page, pageSize, total),
          adminCredits: getAdminCreditSummary(db),
        };
      });
      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch invite codes failed' });
    }
  });

  app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    const page = parsePaginationValue(req.query.page, 1, 1, 100000);
    const pageSize = parsePaginationValue(req.query.pageSize, 10, 1, 100);
    const search = normalizeString(req.query.search).toLowerCase();
    const sort = normalizeString(req.query.sort) || 'recent-desc';

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        const [users, matchedInvites, trendRecords] = await Promise.all([
          getSupabaseAdminUsers(),
          search ? db.listInviteCodes(1, 200, { search }) : Promise.resolve({ codes: [], total: 0 }),
          db.getGenerationsWithInviteCode(1, 100000, { range: '7d' }),
        ]);
        const matchedInviteUserIds = new Set(matchedInvites.codes.map((item) => normalizeString(item.redeemed_by)).filter(Boolean));
        const trendByUserId = new Map<string, number[]>();
        for (const record of trendRecords.records) {
          const buckets = trendByUserId.get(record.user_id) || Array.from({ length: 7 }, () => 0);
          const diff = Math.floor((Date.now() - new Date(record.created_at).getTime()) / (24 * 60 * 60 * 1000));
          if (diff >= 0 && diff < 7) {
            buckets[6 - diff] += Number(record.credits_used || 0);
          }
          trendByUserId.set(record.user_id, buckets);
        }

        const filteredUsers = users
          .filter((item) => {
            if (!search) return true;
            return (
              item.username.toLowerCase().includes(search) ||
              item.userId.toLowerCase().includes(search) ||
              matchedInviteUserIds.has(item.userId)
            );
          })
          .sort((left, right) => {
            const leftTime = left.lastGeneratedAt ? new Date(left.lastGeneratedAt).getTime() : 0;
            const rightTime = right.lastGeneratedAt ? new Date(right.lastGeneratedAt).getTime() : 0;
            return sort === 'recent-asc' ? leftTime - rightTime : rightTime - leftTime;
          });
        const pagedUsers = paginateArray(filteredUsers, page, pageSize).map((item) => ({
          ...item,
          usageTrend: trendByUserId.get(item.userId) || Array.from({ length: 7 }, () => 0),
        }));

        res.json({
          users: pagedUsers,
          usersPage: toPagination(page, pageSize, filteredUsers.length),
        });
        return;
      }

      res.json({ users: [], usersPage: toPagination(page, pageSize, 0) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch users failed' });
    }
  });

  app.get('/api/admin/records', requireAuth, requireAdmin, async (req, res) => {
    const page = parsePaginationValue(req.query.page, 1, 1, 100000);
    const pageSize = parsePaginationValue(req.query.pageSize, 10, 1, 100);
    const options = {
      search: normalizeString(req.query.search),
      model: normalizeString(req.query.model),
      resolution: normalizeString(req.query.resolution),
      range: normalizeString(req.query.range),
    };

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        const [pagePayload, statsPayload, allPayload] = await Promise.all([
          db.getGenerationsWithInviteCode(page, pageSize, options),
          db.getGenerationsWithInviteCode(1, 100000, options),
          db.getGenerationsWithInviteCode(1, 100000),
        ]);
        const toRecord = (row: (typeof pagePayload.records)[number]) => toGeneration({
          id: row.id,
          user_id: row.user_id,
          username: row.username,
          prompt: row.prompt,
          model_id: row.model_id,
          model_name: row.model_name,
          dimensions: row.dimensions,
          image_size: row.image_size,
          image_path: row.image_path,
          credits_used: row.credits_used,
          reference_images: row.reference_images,
          created_at: row.created_at,
          invite_code: row.invite_code,
        });
        const records = pagePayload.records.map(toRecord);
        const statRecords = statsPayload.records.map(toRecord);
        const allRecords = allPayload.records.map(toRecord);

        res.json({
          records: records.map((item) => toPublicGeneration(req, item)),
          recordsPage: toPagination(page, pageSize, pagePayload.total),
          stats: summarizeRecordStats(statRecords),
          modelOptions: Array.from(new Set(allRecords.map((item) => item.modelName))).sort(),
          resolutionOptions: Array.from(
            new Set(allRecords.map((item) => (item.imageSize ? `${item.dimensions} / ${item.imageSize}` : item.dimensions))),
          ).sort(),
        });
        return;
      }

      res.json({
        records: [],
        recordsPage: toPagination(page, pageSize, 0),
        stats: summarizeRecordStats([]),
        modelOptions: [],
        resolutionOptions: [],
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch records failed' });
    }
  });

  app.post('/api/admin/invite-codes', requireAuth, requireAdmin, async (req, res) => {
    const requestedCredits = Number(req.body?.credits);

    if (!Number.isFinite(requestedCredits) || requestedCredits <= 0) {
      res.status(400).json({ error: 'Credits must be a positive number' });
      return;
    }

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        await db.reclaimLowBalanceInviteCodes();

        const adminCredits = await db.getAdminCreditSummary();
        const credits = Math.floor(requestedCredits);

        if (credits > adminCredits.remainingCredits) {
          throw new Error(`Admin credits are not enough. Remaining: ${adminCredits.remainingCredits}`);
        }

        let code = generateInviteCode();
        while (await db.getInviteCode(code)) {
          code = generateInviteCode();
        }

        await db.createInviteCode(code, credits, req.authUser!.username);
        await db.adjustAdminTotalCredits(-credits);

        const invite = await db.getInviteCode(code);
        const newAdminCredits = await db.getAdminCreditSummary();

        res.status(201).json({
          inviteCode: invite ? toInviteCode({
              code: invite.code,
              credits: invite.credits,
              issued_credits: invite.issued_credits,
              created_by: invite.created_by,
              created_at: invite.created_at,
              redeemed_by: invite.redeemed_by,
              redeemed_at: invite.redeemed_at,
              low_balance_since: invite.low_balance_since,
            }) : null,
          adminCredits: newAdminCredits,
        });
        return;
      }

      // SQLite 妯″紡
      const payload = await withWriteDb((db) => {
        ensureSchema(db);
        reclaimLowBalanceInviteCodes(db);
        const adminCredits = getAdminCreditSummary(db);
        const credits = Math.floor(requestedCredits);

        if (credits > adminCredits.remainingCredits) {
          throw new Error(`Admin credits are not enough. Remaining: ${adminCredits.remainingCredits}`);
        }

        let code = generateInviteCode();
        while (getOne(db, 'SELECT code FROM invite_codes WHERE code = ?', [code])) {
          code = generateInviteCode();
        }

        db.run(
          'INSERT INTO invite_codes (code, credits, issued_credits, created_by, created_at, low_balance_since) VALUES (?, ?, ?, ?, ?, ?)',
          [
            code,
            credits,
            credits,
            req.authUser!.username,
            nowIso(),
            credits < INVITE_RECLAIM_THRESHOLD ? nowIso() : null,
          ],
        );
        adjustAdminTotalCredits(db, -credits);

        const invite = getOne<Record<string, unknown>>(db, 'SELECT * FROM invite_codes WHERE code = ?', [code]);
        return {
          inviteCode: invite ? toInviteCode(invite) : null,
          adminCredits: getAdminCreditSummary(db),
        };
      });

      res.status(201).json(payload);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Create invite code failed' });
    }
  });

  app.delete('/api/admin/invite-codes/:code', requireAuth, requireAdmin, async (req, res) => {
    const code = normalizeString(req.params.code);

    if (!code) {
      res.status(400).json({ error: 'Invite code is required' });
      return;
    }

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        await db.reclaimLowBalanceInviteCodes();

        const invite = await db.getInviteCode(code);
        if (!invite) {
          res.status(404).json({ error: 'Invite code not found' });
          return;
        }

        let creditsToReturn = Math.max(0, Number(invite.credits || 0));
        const redeemedBy = normalizeString(invite.redeemed_by);

        if (redeemedBy) {
          const userCredits = await db.getUserCredits(redeemedBy);
          creditsToReturn = Math.min(creditsToReturn, userCredits.remainingCredits);
          if (creditsToReturn > 0) {
            await db.setUserTotalCredits(
              redeemedBy,
              Math.max(userCredits.usedCredits, userCredits.totalCredits - creditsToReturn),
            );
          }
        }

        await db.deleteInviteCode(code);
        if (creditsToReturn > 0) {
          await db.adjustAdminTotalCredits(creditsToReturn);
        }

        res.json({
          ok: true,
          adminCredits: await db.getAdminCreditSummary(),
        });
        return;
      }

      const payload = await withWriteDb((db) => {
        ensureSchema(db);
        reclaimLowBalanceInviteCodes(db);

        const invite = getOne<Record<string, unknown>>(
          db,
          'SELECT code, credits, redeemed_by FROM invite_codes WHERE code = ?',
          [code],
        );

        if (!invite) {
          throw new Error('Invite code not found');
        }

        let creditsToReturn = Math.max(0, Number(invite.credits || 0));
        const redeemedBy = normalizeString(invite.redeemed_by);

        if (redeemedBy) {
          const userCredits = getUserCredits(db, redeemedBy);
          creditsToReturn = Math.min(creditsToReturn, userCredits.remainingCredits);
          if (creditsToReturn > 0) {
            setUserTotalCredits(
              db,
              redeemedBy,
              Math.max(userCredits.usedCredits, userCredits.totalCredits - creditsToReturn),
            );
          }
        }

        db.run('DELETE FROM invite_codes WHERE code = ?', [code]);
        if (creditsToReturn > 0) {
          adjustAdminTotalCredits(db, creditsToReturn);
        }

        return {
          ok: true,
          adminCredits: getAdminCreditSummary(db),
        };
      });

      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete invite code failed';
      if (message === 'Invite code not found') {
        res.status(404).json({ error: message });
        return;
      }
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/admin/invite-codes/:code/reclaim', requireAuth, requireAdmin, async (req, res) => {
    const code = normalizeString(req.params.code);
    const requestedCredits = Math.floor(Number(req.body?.credits));

    if (!code) {
      res.status(400).json({ error: 'Invite code is required' });
      return;
    }

    if (!Number.isFinite(requestedCredits) || requestedCredits <= 0) {
      res.status(400).json({ error: 'Credits must be a positive number' });
      return;
    }

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        await db.reclaimLowBalanceInviteCodes();

        const invite = await db.getInviteCode(code);
        if (!invite) {
          res.status(404).json({ error: 'Invite code not found' });
          return;
        }

        const currentCredits = Math.max(0, Number(invite.credits || 0));
        const redeemedBy = normalizeString(invite.redeemed_by);
        let reclaimableCredits = Math.min(requestedCredits, currentCredits);

        if (reclaimableCredits <= 0) {
          res.status(400).json({ error: 'No remaining credits can be reclaimed' });
          return;
        }

        if (redeemedBy) {
          const userCredits = await db.getUserCredits(redeemedBy);
          reclaimableCredits = Math.min(reclaimableCredits, userCredits.remainingCredits);
          if (reclaimableCredits <= 0) {
            res.status(400).json({ error: 'No remaining credits can be reclaimed' });
            return;
          }

          await db.setUserTotalCredits(
            redeemedBy,
            Math.max(userCredits.usedCredits, userCredits.totalCredits - reclaimableCredits),
          );
          await db.syncInviteCodeBalanceForUser(redeemedBy);
        } else {
          const nextCredits = currentCredits - reclaimableCredits;
          const nextLowBalanceSince =
            nextCredits > 0 && nextCredits < INVITE_RECLAIM_THRESHOLD
              ? invite.low_balance_since || nowIso()
              : null;
          await db.updateInviteCodeCredits(code, nextCredits, nextLowBalanceSince);
        }

        await db.adjustAdminTotalCredits(reclaimableCredits);
        res.json({
          ok: true,
          adminCredits: await db.getAdminCreditSummary(),
        });
        return;
      }

      const payload = await withWriteDb((db) => {
        ensureSchema(db);
        reclaimLowBalanceInviteCodes(db);

        const invite = getOne<Record<string, unknown>>(
          db,
          'SELECT code, credits, redeemed_by, low_balance_since FROM invite_codes WHERE code = ?',
          [code],
        );

        if (!invite) {
          throw new Error('Invite code not found');
        }

        const currentCredits = Math.max(0, Number(invite.credits || 0));
        const redeemedBy = normalizeString(invite.redeemed_by);
        let reclaimableCredits = Math.min(requestedCredits, currentCredits);

        if (reclaimableCredits <= 0) {
          throw new Error('No remaining credits can be reclaimed');
        }

        if (redeemedBy) {
          const userCredits = getUserCredits(db, redeemedBy);
          reclaimableCredits = Math.min(reclaimableCredits, userCredits.remainingCredits);
          if (reclaimableCredits <= 0) {
            throw new Error('No remaining credits can be reclaimed');
          }

          setUserTotalCredits(
            db,
            redeemedBy,
            Math.max(userCredits.usedCredits, userCredits.totalCredits - reclaimableCredits),
          );
          syncInviteCodeBalanceForUser(db, redeemedBy);
        } else {
          const nextCredits = currentCredits - reclaimableCredits;
          const nextLowBalanceSince =
            nextCredits > 0 && nextCredits < INVITE_RECLAIM_THRESHOLD
              ? normalizeString(invite.low_balance_since) || nowIso()
              : null;
          db.run(
            'UPDATE invite_codes SET credits = ?, low_balance_since = ? WHERE code = ?',
            [nextCredits, nextLowBalanceSince, code],
          );
        }

        adjustAdminTotalCredits(db, reclaimableCredits);

        return {
          ok: true,
          adminCredits: getAdminCreditSummary(db),
        };
      });

      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reclaim invite credits failed';
      if (message === 'Invite code not found') {
        res.status(404).json({ error: message });
        return;
      }
      res.status(400).json({ error: message });
    }
  });

  // 鈹€鈹€鈹€ 鐢ㄦ埛鍥剧墖鍒楄〃 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  app.get('/api/user/images', requireAuth, async (req, res) => {
    const category = normalizeString(req.query.category);
    const userId = req.authUser!.userId;

    if (category && !validateCategory(category)) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        const images = await db.getUserImages(userId, category || undefined);
        res.json({
          images: images.map((row) =>
            toPublicSavedImage(
              req,
              toSavedImage({
                id: row.id,
                prompt: row.prompt,
                model_name: row.model_name,
                dimensions: row.dimensions,
                image_path: row.image_path,
                category: row.category,
                reference_images: row.reference_images,
                created_at: row.created_at,
              }),
            ),
          ),
        });
        return;
      }

      const images = await withReadDb((db) => {
        ensureSchema(db);
        const rows = category
          ? runQuery<Record<string, unknown>>(
              db,
              `
                SELECT id, prompt, model_name, dimensions, image_path, category, reference_images, created_at
                FROM images
                WHERE user_id = ? AND category = ?
                ORDER BY datetime(created_at) DESC, id DESC
              `,
              [userId, category],
            )
          : runQuery<Record<string, unknown>>(
              db,
              `
                SELECT id, prompt, model_name, dimensions, image_path, category, reference_images, created_at
                FROM images
                WHERE user_id = ?
                ORDER BY datetime(created_at) DESC, id DESC
              `,
              [userId],
            );

        return rows.map(toSavedImage);
      });

      res.json({ images: images.map((item) => toPublicSavedImage(req, item)) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch images failed' });
    }
  });

  // 鈹€鈹€鈹€ 淇濆瓨/绉诲姩鍥剧墖 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  app.post('/api/user/images/move', requireAuth, async (req, res) => {
    const category = normalizeString(req.body?.category);
    const imageId = req.body?.imageId;
    const image = req.body?.image as GeneratedImagePayload | undefined;
    const userId = req.authUser!.userId;

    if (!validateCategory(category)) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();

        if (typeof imageId === 'number') {
          // Vercel 鐜涓?imageId 鏄?UUID 瀛楃涓诧紝浣嗗墠绔彲鑳戒紶 number
          // 灏濊瘯閫氳繃瀛楃涓?ID 鏌ユ壘
          const existing = await db.getImageById(String(imageId), userId);
          if (!existing) {
            res.json({ image: null });
            return;
          }

          await db.updateImageCategory(String(imageId), userId, category);
          res.json({
            image: toPublicSavedImage(
              req,
              toSavedImage({
                id: existing.id,
                prompt: existing.prompt,
                model_name: existing.model_name,
                dimensions: existing.dimensions,
                image_path: existing.image_path,
                category,
                reference_images: existing.reference_images,
                created_at: existing.created_at,
              }),
            ),
          });
          return;
        }

        const prompt = normalizeString(image?.prompt);
        const modelName = normalizeString(image?.modelName);
        const dimensions = normalizeString(image?.dimensions) || '1:1';
        const imagePath = normalizeString(image?.imagePath);
        const referenceImages = Array.isArray(image?.referenceImages)
          ? image.referenceImages.filter((item): item is string => typeof item === 'string')
          : [];
        const createdAt = normalizeString(image?.createdAt) || nowIso();

        if (!prompt || !modelName || !imagePath) {
          throw new Error('Image payload is incomplete');
        }

        const savedImage = await db.insertImage({
          userId,
          prompt,
          modelName,
          dimensions,
          imagePath,
          category,
          referenceImages,
          createdAt,
        });

        res.json({
          image: toPublicSavedImage(
            req,
            toSavedImage({
              id: savedImage.id,
              prompt: savedImage.prompt,
              model_name: savedImage.model_name,
              dimensions: savedImage.dimensions,
              image_path: savedImage.image_path,
              category: savedImage.category,
              reference_images: savedImage.reference_images,
              created_at: savedImage.created_at,
            }),
          ),
        });
        return;
      }

      // SQLite 妯″紡
      const savedImage = await withWriteDb((db) => {
        ensureSchema(db);

        if (typeof imageId === 'number') {
          const existing = getOne<Record<string, unknown>>(
            db,
            `
              SELECT id, prompt, model_name, dimensions, image_path, category, reference_images, created_at
              FROM images
              WHERE id = ? AND user_id = ?
            `,
            [imageId, userId],
          );

          if (!existing) {
            return null;
          }

          db.run('UPDATE images SET category = ? WHERE id = ? AND user_id = ?', [category, imageId, userId]);
          return {
            ...existing,
            category,
          };
        }

        const prompt = normalizeString(image?.prompt);
        const modelName = normalizeString(image?.modelName);
        const dimensions = normalizeString(image?.dimensions) || '1:1';
        const imagePath = normalizeString(image?.imagePath);
        const referenceImages = Array.isArray(image?.referenceImages)
          ? image.referenceImages.filter((item): item is string => typeof item === 'string')
          : [];
        const createdAt = normalizeString(image?.createdAt) || nowIso();

        if (!prompt || !modelName || !imagePath) {
          throw new Error('Image payload is incomplete');
        }

        db.run(
          `
            INSERT INTO images (
              user_id,
              prompt,
              model_name,
              dimensions,
              image_path,
              category,
              reference_images,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [userId, prompt, modelName, dimensions, imagePath, category, serializeReferenceImages(referenceImages), createdAt],
        );

        return getOne<Record<string, unknown>>(
          db,
          `
            SELECT id, prompt, model_name, dimensions, image_path, category, reference_images, created_at
            FROM images
            WHERE id = ?
          `,
          [lastInsertId(db)],
        );
      });

      res.json({ image: savedImage ? toPublicSavedImage(req, toSavedImage(savedImage)) : null });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Save image failed' });
    }
  });

  // 鈹€鈹€鈹€ 鍒犻櫎鍥剧墖 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  app.delete('/api/user/images/:id', requireAuth, async (req, res) => {
    const id = req.params.id;
    const userId = req.authUser!.userId;

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        await db.deleteImage(id, userId);
        res.json({ ok: true });
        return;
      }

      const numericId = Number(id);
      if (!Number.isFinite(numericId)) {
        res.status(400).json({ error: 'Invalid image id' });
        return;
      }

      await withWriteDb((db) => {
        ensureSchema(db);
        db.run('DELETE FROM images WHERE id = ? AND user_id = ?', [numericId, userId]);
      });

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Delete failed' });
    }
  });

  // 鈹€鈹€鈹€ 闈欐€佹枃浠舵湇鍔★紙浠呮湰鍦扮幆澧冿級 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  if (hasDistBuild) {
    // 闈欐€佽祫婧愭枃浠讹紙assets锛変紭鍏堝鐞?
    app.use(
      '/assets',
      express.static(path.join(DIST_DIR, 'assets'), {
        immutable: true,
        maxAge: '1y',
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    // 鍏朵粬闈欐€佹枃浠?
    app.use(
      express.static(DIST_DIR, {
        index: false,
        maxAge: 0,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            return;
          }

          res.setHeader('Cache-Control', 'public, max-age=300');
        },
      }),
    );
    // 鍓嶇璺敱 fallback锛堟帓闄?API 鍜?uploads锛?
    app.get(/^(?!\/api(?:\/|$)|\/uploads(?:\/|$)).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  // 鈹€鈹€鈹€ 閿欒澶勭悊 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    res.status(500).json({ error: message });
  });

  // 鈹€鈹€鈹€ 鍚姩鐩戝惉 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  const host = process.env.HOST || DEFAULT_HOST;
  const port = Number(process.env.PORT || DEFAULT_PORT);

  // Vercel Serverless 鐜涓嬩笉鍚姩鐩戝惉锛屽鍑?app
  if (IS_VERCEL) {
    return app;
  }

  app.listen(port, host, () => {
    console.log(`Visionary server listening on http://${host}:${port}`);
  });
  return app;
}

const serverPromise = start();

// 鏈湴寮€鍙戞椂鐩存帴鍚姩
if (!IS_VERCEL) {
  serverPromise.catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// Vercel Serverless 瀵煎嚭
export default serverPromise;



