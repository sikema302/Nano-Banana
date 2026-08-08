import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import compression from 'compression';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import WebSocket from 'ws';

import { startBusinessDataBackupScheduler } from './business-backup.js';
import {
  downloadGeneratedImage,
  generatedImageDownloadError,
  isValidImageBuffer,
} from './generated-image-download.js';
import { getGptImageCredits, normalizeGptImageQuality } from '../src/lib/model-pricing.js';
import { resolveAiEnhancementBillingRequested } from '../src/lib/image-generation-flags.js';
import { createImageChannelFailover } from './image-channel-failover.js';
import { normalizePublicApiProviderRouting } from './public-api-routing.js';
import {
  getVideoGenerationCredits,
  supportsVideoConfiguration,
  type VideoDurationSeconds,
  type VideoModelId,
  type VideoRatio,
  type VideoResolution,
} from '../src/lib/video-pricing.js';
import {
  getActiveGptImagePricing,
  getVisionaryDocSyncStatus,
} from './visionary-doc-sync.js';
import {
  createImageProviderRouter,
  type ImageGenerationInput,
} from './image-provider-router.js';
import { generateFluxBanana } from './flux-banana.js';
import { requestSourceLabel } from './request-source-label.js';
import {
  dedicatedJunliBananaPolicy,
} from './dedicated-public-api-key.js';
import { generateVisionaryNanoLite } from './visionary-nano-lite.js';
import { createProviderMetrics } from './provider-metrics.js';
import { createProviderRiskMonitor } from './provider-risk-monitor.js';
import {
  applyProviderRoutingToImageSize,
  createProviderRouting,
  enabledProviderIds,
  isProviderEnabled,
  routingResolution,
  type ProviderRoutingConfig,
  type ProviderRoutingPatch,
} from './provider-routing.js';
import { getInviteRedemptionCredits, INVITE_REDEMPTION_ERRORS } from './invite-redemption.js';
import { createNotificationService } from './notifications.js';
import { resolveApiKeyDisplayCredits, type CreditValues } from './api-key-credits.js';
import {
  getPromoCouponPrefix,
  getPromoCouponSchedule,
  normalizePromoDiscountPercent,
  pickPromoDiscountPercent,
} from '../src/lib/promo-coupon.js';
import {
  isSamePromoCouponClaim,
  orderPromoCouponCodes,
  parsePromoCouponCodeClaim,
  parsePromoCouponCodes,
  promoCouponCodeClaimKey,
  serializePromoCouponCodeClaim,
  type PromoCouponDiscountPercent,
} from './promo-coupon-code-pool.js';

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
  sessionId?: string;
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
  canRedeemInvite: boolean;
  creditsRemaining?: number;
};

type PromoCouponRecord = {
  couponId: string;
  discountPercent: number;
  issuedAt: string;
  expiresAt: string;
  nextEligibleAt: string;
  popupSeenAt?: string;
  redemptionCode?: string;
  scheduleVersion: 2;
  source: 'welcome' | 'scheduled';
};

type PromoCouponPayload = {
  couponId: string;
  discountPercent: number;
  issuedAt: string;
  expiresAt: string;
  nextEligibleAt: string;
  purchaseUrl: string;
  redemptionCode: string;
  active: boolean;
  shouldPopup: boolean;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

type ChatConversation = {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

type ChatMemory = {
  enabled: boolean;
  items: Array<{ id: string; content: string; createdAt: string }>;
};

type GeneratedImagePayload = {
  prompt: string;
  modelName: string;
  dimensions: string;
  imageSize?: string;
  imagePath: string;
  thumbnailPath?: string;
  referenceImages: string[];
  createdAt: string;
};

type ImageStorageStats = {
  uploadsTotalBytes: number;
  generatedBytes: number;
  generatedCount: number;
  thumbnailBytes: number;
  thumbnailCount: number;
  referenceBytes: number;
  referenceCount: number;
  referenceStorageEnabled: boolean;
  retentionDays: number;
  originalRetentionDays: number;
  thumbnailRetentionDays: number;
  diskUsagePercent: number;
  diskWarningPercent: number;
  diskEmergencyPercent: number;
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
  error?: unknown;
  message?: unknown;
  detail?: unknown;
  failure_reason?: unknown;
};

// 鈹€鈹€鈹€ Visionary 寮傛鎺ュ彛绫诲瀷 鈹€鈹€鈹€

type VisionaryAsyncTaskResponse = {
  id: string;
  taskId?: string;
  object?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  generationStatus?: string;
  results?: Array<{
    url?: string;
    content?: string;
  }>;
  progress?: number;
  retryAfterSeconds?: number;
  error?: string;
};

type VisionaryAsyncBatchResponse = {
  object?: string;
  data?: Array<VisionaryAsyncTaskResponse>;
  count?: number;
  requestedCount?: number;
  retryAfterSeconds?: number;
};

type PublicAsyncGenerationTask = {
  id: string;
  upstreamId?: string;
  apiKeyId: string;
  apiKeyHash: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  generationStatus: string;
  progress: number;
  retryAfterSeconds: number;
  creditsUsed: number;
  refunded: boolean;
  prompt: string;
  modelId: string;
  modelName: string;
  dimensions: string;
  imageSize: string;
  quality?: string;
  optimizeChineseText?: boolean;
  providerRouting?: 'junliai_only' | 'junliai_dedicated';
  referenceImages: string[];
  temporaryReferenceImages?: string[];
  createdAt: string;
  updatedAt: string;
  imagePath?: string;
  error?: string;
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
  ownerUserId?: string;
  ownerUsername?: string;
  billingMode?: 'legacy' | 'account';
  pausedAt?: string;
  lastUsedAt?: string;
  rotatedFromId?: string;
  providerRouting?: 'junliai_only' | 'junliai_dedicated';
};

type PublicGenerateInput = {
  apiKey: string;
  prompt: string;
  model: string;
  dimensions: string;
  requestedImageSize: string;
  requestedQuality: string;
  optimizeChineseText: boolean;
  referenceImages: string[];
};

type PublicGenerateResult = {
  image: GeneratedImagePayload;
  usage: {
    creditsUsed: number;
    remainingCredits: number;
  };
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
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');
const REFERENCES_DIR = path.join(UPLOADS_DIR, 'references');
const EXAMPLES_DIR = path.join(UPLOADS_DIR, 'examples');
const DB_FILE = path.join(DATA_DIR, 'app.sqlite');
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3001;
const MAX_REFERENCE_IMAGE_COUNT = 9;
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const ORIGINAL_IMAGE_RETENTION_DAYS = Math.max(1, Number(process.env.ORIGINAL_IMAGE_RETENTION_DAYS || 3));
const THUMBNAIL_RETENTION_DAYS = Math.max(
  ORIGINAL_IMAGE_RETENTION_DAYS,
  Number(process.env.THUMBNAIL_RETENTION_DAYS || process.env.IMAGE_RETENTION_DAYS || 3),
);
const IMAGE_RETENTION_DAYS = THUMBNAIL_RETENTION_DAYS;
const IMAGE_CLEANUP_INTERVAL_MS = Math.max(60 * 60 * 1000, Number(process.env.IMAGE_CLEANUP_INTERVAL_MS || 6 * 60 * 60 * 1000));
const DISK_WARNING_PERCENT = Math.min(99, Math.max(1, Number(process.env.DISK_WARNING_PERCENT || 70)));
const DISK_EMERGENCY_PERCENT = Math.min(100, Math.max(DISK_WARNING_PERCENT, Number(process.env.DISK_EMERGENCY_PERCENT || 85)));
const DISK_EMERGENCY_TARGET_PERCENT = Math.max(
  DISK_WARNING_PERCENT,
  Math.min(DISK_EMERGENCY_PERCENT - 1, Number(process.env.DISK_EMERGENCY_TARGET_PERCENT || 80)),
);
const STORE_REFERENCE_IMAGES = false;
const PROMO_PURCHASE_URL = 'https://pay.ldxp.cn/shop/RHPYAKWG';
const PROMO_COUPON_SETTING_PREFIX = 'promo_coupon_v1:';
const PROMO_COUPON_CODE_POOL_SETTING_PREFIX = 'promo_coupon_code_pool_v1:';
const promoCouponCodeCache = new Map<PromoCouponDiscountPercent, Promise<string[]>>();

dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });
dotenv.config({ path: path.join(ROOT_DIR, '.env') });
dns.setDefaultResultOrder('ipv4first');

const CANONICAL_WEB_HOST = normalizeEnvValue(process.env.CANONICAL_WEB_HOST) || 'pixory.top';
const CANONICAL_WEB_ORIGIN =
  normalizeEnvValue(process.env.CANONICAL_WEB_ORIGIN) || `https://${CANONICAL_WEB_HOST}`;
const APP_URL = normalizeEnvValue(process.env.APP_URL);
const ADMIN_STATS_TIME_ZONE = normalizeEnvValue(process.env.ADMIN_STATS_TIME_ZONE) || 'Asia/Shanghai';
const PUBLIC_ASYNC_MAX_PENDING = Math.max(1, Math.min(1_000, Number(process.env.PUBLIC_ASYNC_MAX_PENDING || 100)));
const PUBLIC_ASYNC_CONCURRENCY = Math.max(
  1,
  Math.min(PUBLIC_ASYNC_MAX_PENDING, Number(process.env.PUBLIC_ASYNC_CONCURRENCY || 2)),
);

// 鈹€鈹€鈹€ 鐜鍙橀噺 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const VISIONARY_API_BASE_URL = (process.env.VISIONARY_API_BASE_URL || 'https://visionary.beer').replace(/\/+$/, '');
const VISIONARY_IMAGE_SIZE = process.env.VISIONARY_IMAGE_SIZE || '2K';
const VISIONARY_FALLBACK_API_KEY = normalizeEnvValue(process.env.VISIONARY_API_KEY);
const VISIONARY_BANANA_PRO_API_KEY = normalizeEnvValue(process.env.VISIONARY_BANANA_PRO_API_KEY);
const VISIONARY_NANO_LITE_API_KEY = normalizeEnvValue(process.env.VISIONARY_NANO_LITE_API_KEY);
const VISIONARY_GPT_IMAGE_2_API_KEY = normalizeEnvValue(process.env.VISIONARY_GPT_IMAGE_2_API_KEY);
const VISIONARY_GPT_IMAGE_2_HD_API_KEY = normalizeEnvValue(process.env.VISIONARY_GPT_IMAGE_2_HD_API_KEY);
const FLUX_BANANA_API_BASE_URL = normalizeEnvValue(
  process.env.FLUX_BANANA_API_BASE_URL || 'https://api.ai-media.vip',
);
const FLUX_BANANA_API_KEY = normalizeEnvValue(process.env.FLUX_BANANA_API_KEY);
const FLUX_BANANA_TIMEOUT_MS = Math.max(
  60_000,
  Number(process.env.FLUX_BANANA_TIMEOUT_MS || 15 * 60_000),
);
// Previous Chat2API primary integration is intentionally disabled:
// CHAT2API_PRIMARY_ENABLED / CHAT2API_BASE_URL / CHAT2API_AUTHORIZATION
const JUNLIAI_PRIMARY_ENABLED = !['0', 'false', 'no', 'off'].includes(
  normalizeEnvValue(process.env.JUNLIAI_PRIMARY_ENABLED || 'true').toLowerCase(),
);
const JUNLIAI_BASE_URL = normalizeEnvValue(process.env.JUNLIAI_BASE_URL || 'https://img.junliai.org');
const JUNLIAI_API_KEY = normalizeEnvValue(process.env.JUNLIAI_API_KEY);
const JUNLIAI_MODEL = normalizeEnvValue(process.env.JUNLIAI_MODEL || 'firefly-gpt-image-2');
const JUNLIAI_GPT_IMAGE_2_STANDARD_MODEL = 'gpt-image-2';
const JUNLIAI_TIMEOUT_MS = Math.max(15 * 60_000, Number(process.env.JUNLIAI_TIMEOUT_MS || 15 * 60_000));
const JUNLIAI_FAILURE_THRESHOLD = Math.max(1, Number(process.env.JUNLIAI_FAILURE_THRESHOLD || 1));
const JUNLIAI_TRANSIENT_COOLDOWN_MS = Math.max(
  15_000,
  Number(process.env.JUNLIAI_TRANSIENT_COOLDOWN_MS || 30_000),
);
const JUNLIAI_QUOTA_COOLDOWN_MS = Math.max(
  15_000,
  Number(process.env.JUNLIAI_QUOTA_COOLDOWN_MS || 30_000),
);
const JUNLIAI_AUTH_COOLDOWN_MS = Math.max(
  15_000,
  Number(process.env.JUNLIAI_AUTH_COOLDOWN_MS || 30_000),
);
const IMAGE_CHANNEL_RETRY_COOLDOWN_MS = Math.max(
  5_000,
  Number(process.env.IMAGE_CHANNEL_RETRY_COOLDOWN_MS || 30_000),
);
const VIDEO_MODEL_GEMINI_ID = 'gemini-veo31';
const VIDEO_MODEL_FIREFLY_ID = 'firefly-video';
const VIDEO_MODEL_LABELS: Record<string, string> = {
  [VIDEO_MODEL_GEMINI_ID]: 'Gemini Veo 3.1',
  [VIDEO_MODEL_FIREFLY_ID]: 'Firefly Video',
};
const VIDEO_JOB_TIMEOUT_MS = 30 * 60_000;
const JUNLIAI_CIRCUIT_SETTING_KEY = 'junliai_circuit_state_v3';
const DEFAULT_PROVIDER_ROUTING: ProviderRoutingConfig = {
  image2Routes: {
    '1K': [
      { id: 'junliai-economy', enabled: JUNLIAI_PRIMARY_ENABLED },
      { id: 'junliai-firefly', enabled: JUNLIAI_PRIMARY_ENABLED },
      { id: 'visionary', enabled: true },
    ],
    '2K': [
      { id: 'junliai-firefly', enabled: JUNLIAI_PRIMARY_ENABLED },
      { id: 'visionary', enabled: true },
    ],
    '4K': [
      { id: 'junliai-firefly', enabled: JUNLIAI_PRIMARY_ENABLED },
      { id: 'visionary', enabled: true },
    ],
  },
  bananaRoutes: {
    '1K': [
      { id: 'flux', enabled: true },
      { id: 'visionary', enabled: true },
      { id: 'junliai', enabled: JUNLIAI_PRIMARY_ENABLED },
      { id: 'junliai-nano-banana-2', enabled: JUNLIAI_PRIMARY_ENABLED },
    ],
    '2K': [
      { id: 'flux', enabled: true },
      { id: 'visionary', enabled: true },
      { id: 'junliai', enabled: JUNLIAI_PRIMARY_ENABLED },
    ],
    '4K': [
      { id: 'flux', enabled: true },
      { id: 'visionary', enabled: true },
      { id: 'junliai', enabled: JUNLIAI_PRIMARY_ENABLED },
    ],
  },
  junliaiGeminiVeo31: JUNLIAI_PRIMARY_ENABLED,
  junliaiFireflyVideo: JUNLIAI_PRIMARY_ENABLED,
};
const API_CREDIT_POOL_SETTING_KEY = 'api_credit_pools_v1';
const USER_API_CREDIT_SETTING_PREFIX = 'user_api_credits_v1:';
const INVITE_API_CREDIT_SETTING_PREFIX = 'invite_api_credits_v1:';
const PUBLIC_API_KEYS_SETTING_KEY = 'public_api_keys_v1';
const PUBLIC_API_KEYS_BACKUP_SETTING_KEY = 'public_api_keys_v1_backup';
const PUBLIC_ASYNC_TASKS_SETTING_KEY = 'public_async_generation_tasks_v1';
const AUTH_SESSION_SETTING_PREFIX = 'auth_session_v1:';
const ALLOW_MULTI_DEVICE_LOGIN = !['0', 'false', 'no', 'off'].includes(
  String(process.env.ALLOW_MULTI_DEVICE_LOGIN || 'true').trim().toLowerCase(),
);
const INVITE_POPUP_IP_SETTING_PREFIX = 'invite_popup_ip_v1:';
const ADMIN_CREDIT_POOL_SETTING_KEY = 'admin_credit_pool_v2';
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
const GEMINI_API_KEY = normalizeEnvValue(process.env.GEMINI_API_KEY);
const CHAT_MODEL = normalizeEnvValue(process.env.CHAT_MODEL || 'gemini-3.5-flash');
const CHAT_MAX_CONVERSATIONS = 30;
const CHAT_MAX_MESSAGES = 100;
const CHAT_MESSAGE_CREDITS = 20;
const CHAT_MODELS = [
  { id: CHAT_MODEL, name: 'Gemini 3.5 Flash', description: '高质量推理，快速响应，支持中文创意、写作与问答' },
];
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
    select: 'id, user_id, username, prompt, model_id, model_name, dimensions, image_size, image_path, credits_used, api_request_ms, reference_images, created_at',
    insert:
      'INSERT INTO generations (id, user_id, username, prompt, model_id, model_name, dimensions, image_size, image_path, credits_used, api_request_ms, reference_images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    name: 'GPT-image-2',
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
let imageCleanupPromise: Promise<{
  cutoffIso: string;
  deletedGenerations: number;
  deletedImages: number;
  deletedReferenceFiles: number;
  deletedGeneratedFiles: number;
}> | null = null;

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

function chatSettingKey(userId: string) {
  return `chat_conversations:${userId}`;
}

function chatMemorySettingKey(userId: string) {
  return `chat_memory:${userId}`;
}

function normalizeChatMemory(value: unknown): ChatMemory {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const items = Array.isArray(record.items) ? record.items.slice(0, 30).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const content = normalizeString(row.content).slice(0, 500);
    if (!content) return [];
    return [{ id: normalizeString(row.id) || crypto.randomUUID(), content, createdAt: normalizeString(row.createdAt) || nowIso() }];
  }) : [];
  return { enabled: record.enabled !== false, items };
}

async function loadChatMemory(userId: string): Promise<ChatMemory> {
  let raw = '';
  if (USE_SUPABASE) {
    raw = await (await getSupabaseDb()).getSetting(chatMemorySettingKey(userId), '');
  } else {
    raw = await withWriteDb((db) => {
      ensureSchema(db);
      return getSetting(db, chatMemorySettingKey(userId), '');
    });
  }
  try {
    return normalizeChatMemory(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeChatMemory({});
  }
}

async function saveChatMemory(userId: string, memory: ChatMemory) {
  const value = JSON.stringify(normalizeChatMemory(memory));
  if (USE_SUPABASE) {
    await (await getSupabaseDb()).setSetting(chatMemorySettingKey(userId), value);
  } else {
    await withWriteDb((db) => {
      ensureSchema(db);
      setSetting(db, chatMemorySettingKey(userId), value);
    });
  }
}

async function reserveChatCredits(user: AuthUser) {
  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    await db.ensureUserCredits(user.userId, user.username, 0);
    const credits = await db.getUserCredits(user.userId);
    if (credits.remainingCredits < CHAT_MESSAGE_CREDITS) return null;
    await db.incrementUsedCredits(user.userId, CHAT_MESSAGE_CREDITS);
    await db.syncInviteCodeBalanceForUser(user.userId);
    return credits.remainingCredits - CHAT_MESSAGE_CREDITS;
  }
  return withWriteDb((db) => {
    ensureSchema(db);
    ensureUserCredits(db, user.userId, user.username, 0);
    const credits = getUserCredits(db, user.userId);
    if (credits.remainingCredits < CHAT_MESSAGE_CREDITS) return null;
    db.run('UPDATE user_credits SET used_credits = used_credits + ?, updated_at = ? WHERE user_id = ?', [CHAT_MESSAGE_CREDITS, nowIso(), user.userId]);
    syncInviteCodeBalanceForUser(db, user.userId);
    return credits.remainingCredits - CHAT_MESSAGE_CREDITS;
  });
}

async function refundChatCredits(userId: string) {
  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    await db.incrementUsedCredits(userId, -CHAT_MESSAGE_CREDITS);
    await db.syncInviteCodeBalanceForUser(userId);
    return;
  }
  await withWriteDb((db) => {
    ensureSchema(db);
    db.run('UPDATE user_credits SET used_credits = MAX(0, used_credits - ?), updated_at = ? WHERE user_id = ?', [CHAT_MESSAGE_CREDITS, nowIso(), userId]);
    syncInviteCodeBalanceForUser(db, userId);
  });
}

function normalizeChatConversations(value: unknown): ChatConversation[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, CHAT_MAX_CONVERSATIONS).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const id = normalizeString(record.id);
    if (!id) return [];
    const createdAt = normalizeString(record.createdAt) || nowIso();
    const messages: ChatMessage[] = Array.isArray(record.messages)
      ? record.messages.slice(-CHAT_MAX_MESSAGES).flatMap((message) => {
          if (!message || typeof message !== 'object') return [];
          const row = message as Record<string, unknown>;
          const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : null;
          const content = normalizeString(row.content).slice(0, 24000);
          if (!role || !content) return [];
          return [{ id: normalizeString(row.id) || crypto.randomUUID(), role, content, createdAt: normalizeString(row.createdAt) || createdAt } as ChatMessage];
        })
      : [];
    return [{
      id,
      title: normalizeString(record.title).slice(0, 60) || '新对话',
      model: CHAT_MODEL,
      messages,
      createdAt,
      updatedAt: normalizeString(record.updatedAt) || createdAt,
    }];
  });
}

async function loadChatConversations(userId: string) {
  let raw = '[]';
  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    raw = await db.getSetting(chatSettingKey(userId), '[]');
  } else {
    raw = await withWriteDb((db) => {
      ensureSchema(db);
      return getSetting(db, chatSettingKey(userId), '[]');
    });
  }
  try {
    return normalizeChatConversations(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function saveChatConversations(userId: string, conversations: ChatConversation[]) {
  const value = JSON.stringify(normalizeChatConversations(conversations));
  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    await db.setSetting(chatSettingKey(userId), value);
    return;
  }
  await withWriteDb((db) => {
    ensureSchema(db);
    setSetting(db, chatSettingKey(userId), value);
  });
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

async function getDiskUsagePercent() {
  if (IS_VERCEL) return 0;
  try {
    const stats = await fs.statfs(UPLOADS_DIR);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const available = Number(stats.bavail) * Number(stats.bsize);
    return total > 0 ? Math.max(0, Math.min(100, ((total - available) / total) * 100)) : 0;
  } catch {
    return 0;
  }
}

async function getImageStorageStats(): Promise<ImageStorageStats> {
  if (IS_VERCEL) {
    return {
      uploadsTotalBytes: 0,
      generatedBytes: 0,
      generatedCount: 0,
      thumbnailBytes: 0,
      thumbnailCount: 0,
      referenceBytes: 0,
      referenceCount: 0,
      referenceStorageEnabled: STORE_REFERENCE_IMAGES,
      retentionDays: IMAGE_RETENTION_DAYS,
      originalRetentionDays: ORIGINAL_IMAGE_RETENTION_DAYS,
      thumbnailRetentionDays: THUMBNAIL_RETENTION_DAYS,
      diskUsagePercent: 0,
      diskWarningPercent: DISK_WARNING_PERCENT,
      diskEmergencyPercent: DISK_EMERGENCY_PERCENT,
    };
  }

  const [generated, thumbnails, references, diskUsagePercent] = await Promise.all([
    getDirectoryUsage(GENERATED_DIR),
    getDirectoryUsage(THUMBNAILS_DIR),
    getDirectoryUsage(REFERENCES_DIR),
    getDiskUsagePercent(),
  ]);

  return {
    uploadsTotalBytes: generated.bytes + thumbnails.bytes + references.bytes,
    generatedBytes: generated.bytes,
    generatedCount: generated.count,
    thumbnailBytes: thumbnails.bytes,
    thumbnailCount: thumbnails.count,
    referenceBytes: references.bytes,
    referenceCount: references.count,
    referenceStorageEnabled: STORE_REFERENCE_IMAGES,
    retentionDays: IMAGE_RETENTION_DAYS,
    originalRetentionDays: ORIGINAL_IMAGE_RETENTION_DAYS,
    thumbnailRetentionDays: THUMBNAIL_RETENTION_DAYS,
    diskUsagePercent,
    diskWarningPercent: DISK_WARNING_PERCENT,
    diskEmergencyPercent: DISK_EMERGENCY_PERCENT,
  };
}

async function ensureRuntimeDirectories() {
  await Promise.all([
    fs.mkdir(DATA_DIR, { recursive: true }),
    fs.mkdir(UPLOADS_DIR, { recursive: true }),
    fs.mkdir(GENERATED_DIR, { recursive: true }),
    fs.mkdir(THUMBNAILS_DIR, { recursive: true }),
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
  if (CANONICAL_WEB_ORIGIN) return stripTrailingSlash(CANONICAL_WEB_ORIGIN);
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

function thumbnailPathForImage(imagePath: string) {
  const normalized = normalizeString(imagePath);
  if (!normalized.startsWith('/uploads/generated/')) return '';
  const fileName = path.basename(normalized);
  return `/uploads/thumbnails/${fileName.replace(/\.[^.]+$/, '')}.webp`;
}

function toSavedImage(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    prompt: String(row.prompt || ''),
    modelName: String(row.model_name || ''),
    dimensions: String(row.dimensions || ''),
    imageUrl: String(row.image_path || ''),
    thumbnailUrl: thumbnailPathForImage(String(row.image_path || '')),
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
    thumbnailUrl: thumbnailPathForImage(String(row.image_path || '')),
    creditsUsed: Number(row.credits_used || 0),
    apiRequestMs: Number(row.api_request_ms || 0),
    referenceImages: parseReferenceImages(row.reference_images),
    inviteCode: row.invite_code ? String(row.invite_code) : '',
    resultStatus: String(row.result_status || 'success'),
    resultMessage: String(row.result_message || ''),
    createdAt: String(row.created_at || ''),
  };
}

async function recordGenerationRequest(attempt: {
  modelId: string;
  provider: string;
  configuration: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  sourceModel: string;
  prompt: string;
  requestContext?: { userId: string; username: string; creditsUsed: number; successfulRequestId?: string };
}): Promise<string> {
  const context = attempt.requestContext;
  if (!context?.userId || !context.username) return '';
  const [imageSize = '', quality = '', ratio = ''] = attempt.configuration.split('/').map((item) => item.trim());
  const record = {
    userId: context.userId,
    username: context.username,
    prompt: attempt.prompt,
    modelId: attempt.modelId,
    modelName: requestSourceLabel(attempt.provider, attempt.sourceModel),
    dimensions: ratio,
    imageSize: [imageSize, quality].filter(Boolean).join(' / '),
    creditsUsed: attempt.success ? context.creditsUsed : 0,
    apiRequestMs: Math.max(0, Math.round(attempt.durationMs || 0)),
    resultStatus: attempt.success ? 'success' : 'failed',
    resultMessage: attempt.success ? '' : sanitizeExternalErrorMessage(attempt.errorMessage || 'Upstream request failed', 'Upstream request failed'),
    createdAt: nowIso(),
  };
  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    return db.insertGenerationRequest(record);
  }
  let requestId = 0;
  await withWriteDb((db) => {
    ensureSchema(db);
    db.run(
      `INSERT INTO generation_requests (
        user_id, username, prompt, model_id, model_name, dimensions, image_size,
        image_path, credits_used, api_request_ms, reference_images, result_status,
        result_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, '[]', ?, ?, ?)`,
      [
        record.userId, record.username, record.prompt, record.modelId, record.modelName,
        record.dimensions, record.imageSize, record.creditsUsed, record.apiRequestMs, record.resultStatus,
        record.resultMessage, record.createdAt,
      ],
    );
    requestId = lastInsertId(db);
  });
  return String(requestId);
}

async function updateGenerationRequestImage(requestId: string | undefined, imagePath: string) {
  if (!requestId || !imagePath) return;
  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    await db.updateGenerationRequestImage(requestId, imagePath);
    return;
  }
  await withWriteDb((db) => {
    ensureSchema(db);
    db.run('UPDATE generation_requests SET image_path = ? WHERE id = ?', [imagePath, requestId]);
  });
}

function toPublicReferenceImages(req: Request, referenceImages: string[]) {
  return referenceImages.map((item) => toPublicAssetUrl(req, item) || item);
}

function toPublicGeneratedImagePayload(req: Request, payload: GeneratedImagePayload): GeneratedImagePayload {
  return {
    ...payload,
    imagePath: toPublicAssetUrl(req, payload.imagePath) || payload.imagePath,
    thumbnailPath: toPublicAssetUrl(req, payload.thumbnailPath || thumbnailPathForImage(payload.imagePath)) || undefined,
    referenceImages: toPublicReferenceImages(req, payload.referenceImages),
  };
}

function toPublicSavedImage(req: Request, image: ReturnType<typeof toSavedImage>) {
  return {
    ...image,
    imageUrl: toPublicAssetUrl(req, image.imageUrl) || image.imageUrl,
    thumbnailUrl: toPublicAssetUrl(req, image.thumbnailUrl) || image.thumbnailUrl,
    referenceImages: toPublicReferenceImages(req, image.referenceImages),
  };
}

function toPublicGeneration(req: Request, record: ReturnType<typeof toGeneration>) {
  return {
    ...record,
    imageUrl: toPublicAssetUrl(req, record.imageUrl) || record.imageUrl,
    thumbnailUrl: toPublicAssetUrl(req, record.thumbnailUrl) || record.thumbnailUrl,
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
  apiKeyId?: string;
  quotaSource?: 'key' | 'account';
  ownerUserId?: string;
  ownerUsername?: string;
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

function summarizeRecordStatRows(records: Array<{ createdAt: string; creditsUsed: number; modelName: string }>) {
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
  const [generationSummaries, registeredUsers, creditRows, inviteRows, apiKeys] = await Promise.all([
    db.getGenerationSummaries(),
    db.getRegisteredUsers(),
    db.getAllCreditRows(),
    db.listInviteCodes(1, 100000),
    readPublicApiKeyRecords(),
  ]);
  const apiKeyById = new Map(apiKeys.map((item) => [item.id, item]));
  const creditsByUserId = new Map<string, CreditValues>(
    creditRows.map((row) => [
      row.user_id,
      { totalCredits: row.total_credits, usedCredits: row.used_credits },
    ]),
  );
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
    const apiKeyId = summary.userId.startsWith('api-key:')
      ? summary.userId.slice('api-key:'.length)
      : '';
    const apiKey = apiKeyId ? apiKeyById.get(apiKeyId) : undefined;
    const apiKeyCredits = apiKey
      ? resolveApiKeyDisplayCredits(
          apiKey,
          apiKey.ownerUserId ? creditsByUserId.get(apiKey.ownerUserId) : undefined,
        )
      : undefined;
    userMap.set(summary.userId, {
      userId: summary.userId,
      username: current?.username || summary.username,
      inviteCode: current?.inviteCode || inviteCodeByUserId.get(summary.userId) || '',
      generations: summary.generations,
      creditsUsed: summary.creditsUsed,
      totalCredits: apiKeyCredits?.totalCredits ?? current?.totalCredits ?? 0,
      usedCredits: apiKeyCredits?.usedCredits ?? current?.usedCredits ?? 0,
      remainingCredits: apiKeyCredits?.remainingCredits ?? current?.remainingCredits ?? 0,
      apiKeyId: apiKey?.id,
      quotaSource: apiKeyCredits?.quotaSource,
      ownerUserId: apiKey?.ownerUserId,
      ownerUsername: apiKey?.ownerUsername,
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

function authSessionSettingKey(userId: string) {
  return `${AUTH_SESSION_SETTING_PREFIX}${sha256Digest(userId).slice(0, 40)}`;
}

const AUTH_SESSION_CACHE_TTL_MS = Math.max(1_000, Number(process.env.AUTH_SESSION_CACHE_TTL_MS || 5_000));
const activeAuthSessionCache = new Map<string, { sessionId: string; expiresAt: number }>();
const activeAuthSessionLoads = new Map<string, Promise<string>>();

async function setActiveAuthSession(userId: string, sessionId: string) {
  const key = authSessionSettingKey(userId);
  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    await db.setSetting(key, sessionId);
    activeAuthSessionCache.set(userId, { sessionId, expiresAt: Date.now() + AUTH_SESSION_CACHE_TTL_MS });
    return;
  }
  await withWriteDb((db) => {
    ensureSchema(db);
    setSetting(db, key, sessionId);
  });
}

async function getActiveAuthSession(userId: string) {
  const key = authSessionSettingKey(userId);
  if (USE_SUPABASE) {
    const cached = activeAuthSessionCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.sessionId;
    const existingLoad = activeAuthSessionLoads.get(userId);
    if (existingLoad) return existingLoad;
    const load = (async () => {
      const db = await getSupabaseDb();
      const sessionId = await db.getSetting(key, '');
      activeAuthSessionCache.set(userId, { sessionId, expiresAt: Date.now() + AUTH_SESSION_CACHE_TTL_MS });
      return sessionId;
    })().finally(() => {
      activeAuthSessionLoads.delete(userId);
    });
    activeAuthSessionLoads.set(userId, load);
    return load;
  }
  return withReadDb((db) => {
    ensureSchema(db);
    return getSetting(db, key, '');
  });
}

async function issueExclusiveToken(user: AuthUser) {
  const sessionId = crypto.randomUUID();
  if (!ALLOW_MULTI_DEVICE_LOGIN) {
    await setActiveAuthSession(user.userId, sessionId);
  }
  return issueToken({ ...user, sessionId });
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

function isInviteLoginUser(user: AuthUser) {
  return user.username.toLowerCase().startsWith('invite-');
}

function toPublicUser(user: AuthUser): PublicUser {
  return {
    id: user.userId,
    username: user.username,
    isAdmin: isAdminUser(user),
    canRedeemInvite: !isInviteLoginUser(user),
  };
}

function getModelCredits(modelId: string, imageSize = '', quality = '') {
  if (modelId === 'gpt-image-2') {
    return getGptImageCredits(imageSize, quality, getActiveGptImagePricing());
  }
  if (modelId === 'Nano_Banana_Pro') {
    if (imageSize === '1K') return 20;
    if (imageSize === '4K') return 30;
    return 24;
  }
  return 1;
}

function getNanoBananaEnhancementCredits(modelId: string, imageSize: string, enabled: boolean) {
  if (!enabled || modelId !== 'Nano_Banana_Pro') return 0;
  if (imageSize === '1K' || imageSize === '2K' || imageSize === '4K') return 8;
  return 0;
}

function shouldEnhanceNanoBanana(modelId: string, imageSize: string, requested: boolean) {
  return requested && getNanoBananaEnhancementCredits(modelId, imageSize, true) > 0;
}

function normalizeImageSize(value: string, modelId: string) {
  if (modelId === 'gpt-image-2') {
    if (value === '2K' || value === '4K') return value;
    return 'STANDARD';
  }
  if (modelId !== 'Nano_Banana_Pro') return VISIONARY_IMAGE_SIZE;
  if (value === '1K') return '1K';
  if (value === '4K') return '4K';
  return '2K';
}

async function normalizeRoutedImageSize(
  value: string,
  modelId: string,
) {
  const imageSize = normalizeImageSize(value, modelId);
  if (modelId !== 'Nano_Banana_Pro' || imageSize !== '1K' || !providerRouting) return imageSize;
  const routing = await providerRouting.get();
  return applyProviderRoutingToImageSize(modelId, imageSize, routing);
}

function normalizeGptQuality(value: string, imageSize: string) {
  return normalizeGptImageQuality(value, imageSize);
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

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ code: 'AUTH_TOKEN_MISSING', error: 'Missing Bearer token' });
    return;
  }

  let payload: AuthUser;
  try {
    payload = jwt.verify(header.slice(7), tokenSecret) as AuthUser;
  } catch {
    res.status(401).json({ code: 'AUTH_TOKEN_INVALID', error: 'Invalid or expired token' });
    return;
  }

  const userId = String(payload.userId);
  const sessionId = normalizeString(payload.sessionId);
  if (!sessionId) {
    res.status(401).json({ code: 'AUTH_TOKEN_INVALID', error: 'Invalid or expired token' });
    return;
  }
  if (!ALLOW_MULTI_DEVICE_LOGIN) {
    try {
      if ((await getActiveAuthSession(userId)) !== sessionId) {
        res.status(401).json({ code: 'AUTH_SESSION_REPLACED', error: 'This account has signed in on another device' });
        return;
      }
    } catch (error) {
      console.error('[auth] session lookup failed:', error);
      res.status(503).json({ code: 'AUTH_SESSION_CHECK_FAILED', error: 'Authentication service temporarily unavailable' });
      return;
    }
  }

  req.authUser = { userId, username: String(payload.username), sessionId };
  next();
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
  const normalized = normalizeString(modelId).toLowerCase();
  const bananaAliases = [
    'nano-banana-pro',
    'nano_banana_pro',
    'nano-banana2',
    'nano_banana_2',
    'gemini-3-pro-image-preview',
    'gemini-2.5-flash-image',
    'gemini-2.5-flash-image-preview',
    'dalle3-mini',
    'sdxl',
  ];
  if (bananaAliases.some((alias) => normalized === alias || normalized.endsWith(alias))) {
    return 'Nano_Banana_Pro';
  }

  return models.find((item) => item.id.toLowerCase() === normalized)?.id || 'gpt-image-2';
}

function normalizePublicModelId(modelId: string) {
  const normalized = normalizeString(modelId).toLowerCase();
  if (!normalized) return null;
  if (['gpt-image-1', 'gpt-image-1.5', 'gpt-image-2'].includes(normalized)) {
    return 'gpt-image-2';
  }

  const directModel = models.find((item) => item.id.toLowerCase() === normalized);
  if (directModel) return directModel.id;

  const bananaAliases = new Set([
    'nano-banana-pro',
    'nano_banana_pro',
    'nano-banana2',
    'nano_banana_2',
    'gemini-3-pro-image-preview',
    'gemini-2.5-flash-image',
    'gemini-2.5-flash-image-preview',
    'dalle3-mini',
    'sdxl',
  ]);
  return bananaAliases.has(normalized) ? 'Nano_Banana_Pro' : null;
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
      api_request_ms INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS generation_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      prompt TEXT NOT NULL,
      model_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      dimensions TEXT NOT NULL,
      image_size TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL DEFAULT '',
      credits_used INTEGER NOT NULL DEFAULT 0,
      api_request_ms INTEGER NOT NULL DEFAULT 0,
      reference_images TEXT NOT NULL DEFAULT '[]',
      result_status TEXT NOT NULL,
      result_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_generation_requests_created_at ON generation_requests(created_at DESC)');

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
  if (!generationColumns.has('api_request_ms')) {
    db.run('ALTER TABLE generations ADD COLUMN api_request_ms INTEGER NOT NULL DEFAULT 0');
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

function claimSqliteSetting(db: SqlDatabase, key: string, value: string) {
  const existing = getOne<{ value: string }>(db, 'SELECT value FROM app_settings WHERE key = ?', [key]);
  if (existing) return { claimed: false, value: String(existing.value) };

  db.run('INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)', [key, value, nowIso()]);
  const stored = getOne<{ value: string }>(db, 'SELECT value FROM app_settings WHERE key = ?', [key]);
  return { claimed: stored?.value === value, value: String(stored?.value || '') };
}

function promoCouponSettingKey(userId: string) {
  return `${PROMO_COUPON_SETTING_PREFIX}${userId}`;
}

function parsePromoCouponRecord(raw: string): PromoCouponRecord | null {
  const value = parseJsonSetting<Partial<PromoCouponRecord> | null>(raw, null);
  if (!value || typeof value !== 'object') return null;

  const couponId = normalizeString(value.couponId);
  const issuedAt = normalizeString(value.issuedAt);
  let expiresAt = normalizeString(value.expiresAt);
  let nextEligibleAt = normalizeString(value.nextEligibleAt);
  if (!couponId || !issuedAt || !expiresAt || !nextEligibleAt) return null;

  if (value.scheduleVersion !== 2) {
    const migratedSchedule = getPromoCouponSchedule(issuedAt, 2);
    expiresAt = migratedSchedule.expiresAt;
    nextEligibleAt = migratedSchedule.nextEligibleAt;
  }

  return {
    couponId,
    discountPercent: normalizePromoDiscountPercent(value.discountPercent),
    issuedAt,
    expiresAt,
    nextEligibleAt,
    popupSeenAt: normalizeString(value.popupSeenAt) || undefined,
    redemptionCode: normalizeString(value.redemptionCode) || undefined,
    scheduleVersion: 2,
    source: value.source === 'welcome' ? 'welcome' : 'scheduled',
  } satisfies PromoCouponRecord;
}

function serializePromoCouponRecord(record: PromoCouponRecord) {
  return JSON.stringify(record);
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
  const discountPercent = normalizePromoDiscountPercent(record?.discountPercent);
  const couponVariant = discountPercent === 5 ? '95' : '90';
  return {
    couponId: record?.couponId || '',
    discountPercent,
    issuedAt: record?.issuedAt || '',
    expiresAt: record?.expiresAt || '',
    nextEligibleAt: record?.nextEligibleAt || '',
    purchaseUrl: normalizeString(process.env[`PROMO_COUPON_${couponVariant}_URL`]) || PROMO_PURCHASE_URL,
    redemptionCode: normalizeString(record?.redemptionCode),
    active: isPromoCouponActive(record),
    shouldPopup: Boolean(options?.shouldPopup),
  };
}

function shouldShowPromoCouponPopup(record: PromoCouponRecord | null, now = nowIso()) {
  if (!record || !isPromoCouponActive(record, now) || record.popupSeenAt) return false;
  return true;
}

function issuePromoCoupon(now = nowIso(), source: PromoCouponRecord['source'] = 'scheduled'): PromoCouponRecord {
  const discountPercent = pickPromoDiscountPercent(crypto.randomInt(100));
  const schedule = getPromoCouponSchedule(now, randomCouponIntervalDays());
  return {
    couponId: `${getPromoCouponPrefix(discountPercent)}-${randomHex(3).toUpperCase()}`,
    discountPercent,
    issuedAt: now,
    expiresAt: schedule.expiresAt,
    nextEligibleAt: schedule.nextEligibleAt,
    scheduleVersion: 2,
    source,
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
    record = issuePromoCoupon(now, 'welcome');
    await db.setSetting(settingKey, serializePromoCouponRecord(record));
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
    record = issuePromoCoupon(now, 'welcome');
    setSetting(db, settingKey, serializePromoCouponRecord(record));
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

function promoCouponCodesFilePath(discountPercent: PromoCouponDiscountPercent) {
  const couponVariant = discountPercent === 5 ? '95' : '90';
  const configured = normalizeString(process.env[`PROMO_COUPON_${couponVariant}_CODES_FILE`]);
  if (!configured) return path.join(DATA_DIR, 'promo-coupon-codes', `${couponVariant}.txt`);
  return path.isAbsolute(configured) ? configured : path.resolve(ROOT_DIR, configured);
}

function promoCouponCodePoolSettingKey(discountPercent: PromoCouponDiscountPercent) {
  return `${PROMO_COUPON_CODE_POOL_SETTING_PREFIX}${discountPercent}`;
}

function loadPromoCouponCodes(discountPercent: PromoCouponDiscountPercent) {
  const cached = promoCouponCodeCache.get(discountPercent);
  if (cached) return cached;

  const pending = fs
    .readFile(promoCouponCodesFilePath(discountPercent), 'utf8')
    .then(parsePromoCouponCodes)
    .catch((error: unknown) => {
      promoCouponCodeCache.delete(discountPercent);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`优惠券码池读取失败：${message}`);
    });
  promoCouponCodeCache.set(discountPercent, pending);
  return pending;
}

async function reservePromoCouponCode(
  user: AuthUser,
  record: PromoCouponRecord,
  storedPool: string,
  claimSetting: (key: string, value: string) => Promise<{ claimed: boolean; value: string }> | { claimed: boolean; value: string },
) {
  if (record.redemptionCode) return record.redemptionCode;

  const discountPercent = normalizePromoDiscountPercent(record.discountPercent);
  const storedCodes = parsePromoCouponCodes(storedPool);
  const codes = storedCodes.length > 0 ? storedCodes : await loadPromoCouponCodes(discountPercent);
  const orderedCodes = orderPromoCouponCodes(codes, `${user.userId}:${record.couponId}`);
  const expectedClaim = {
    userId: user.userId,
    couponId: record.couponId,
    discountPercent,
    claimedAt: nowIso(),
  };
  const claimValue = serializePromoCouponCodeClaim(expectedClaim);

  for (const code of orderedCodes) {
    const result = await claimSetting(promoCouponCodeClaimKey(discountPercent, code), claimValue);
    if (result.claimed || isSamePromoCouponClaim(parsePromoCouponCodeClaim(result.value), expectedClaim)) {
      return code;
    }
  }

  throw new Error(`${discountPercent === 5 ? '95 折' : '9 折'}优惠券已领完，请稍后再试`);
}

async function claimPromoCoupon(user: AuthUser) {
  await getOrRefreshPromoCoupon(user);
  if (isAdminUser(user)) return toPromoCouponPayload(null);

  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    const settingKey = promoCouponSettingKey(user.userId);
    const record = parsePromoCouponRecord(await db.getSetting(settingKey, ''));
    if (!record || !isPromoCouponActive(record)) return toPromoCouponPayload(record);
    if (!record.redemptionCode) {
      const discountPercent = normalizePromoDiscountPercent(record.discountPercent);
      const storedPool = await db.getSetting(promoCouponCodePoolSettingKey(discountPercent), '');
      record.redemptionCode = await reservePromoCouponCode(user, record, storedPool, db.claimSetting);
      await db.setSetting(settingKey, serializePromoCouponRecord(record));
    }
    return toPromoCouponPayload(record);
  }

  return withWriteDb(async (db) => {
    ensureSchema(db);
    const settingKey = promoCouponSettingKey(user.userId);
    const record = parsePromoCouponRecord(getSetting(db, settingKey, ''));
    if (!record || !isPromoCouponActive(record)) return toPromoCouponPayload(record);
    if (!record.redemptionCode) {
      const discountPercent = normalizePromoDiscountPercent(record.discountPercent);
      const storedPool = getSetting(db, promoCouponCodePoolSettingKey(discountPercent), '');
      record.redemptionCode = await reservePromoCouponCode(
        user,
        record,
        storedPool,
        (key, value) => claimSqliteSetting(db, key, value),
      );
      setSetting(db, settingKey, serializePromoCouponRecord(record));
    }
    return toPromoCouponPayload(record);
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
    ownerUserId: normalizeString(value.ownerUserId) || undefined,
    ownerUsername: normalizeString(value.ownerUsername) || undefined,
    billingMode: value.billingMode === 'account' ? 'account' : 'legacy',
    pausedAt: normalizeString(value.pausedAt) || undefined,
    lastUsedAt: normalizeString(value.lastUsedAt) || undefined,
    rotatedFromId: normalizeString(value.rotatedFromId) || undefined,
    // Legacy Junliai-only keys now follow the same managed routes as the website.
    providerRouting: normalizePublicApiProviderRouting(value.providerRouting),
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

function publicApiKeyRecord(record: PublicApiKeyRecord, ownerCredits?: CreditValues) {
  const plainKey = decryptPublicApiKey(record.encryptedKey);
  const credits = resolveApiKeyDisplayCredits(record, ownerCredits);
  return {
    id: record.id,
    name: record.name,
    keyPreview: record.keyPreview,
    plainKey,
    copyable: Boolean(plainKey),
    totalCredits: credits.totalCredits,
    usedCredits: credits.usedCredits,
    remainingCredits: credits.remainingCredits,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    revokedAt: record.revokedAt || '',
    billingMode: record.billingMode || 'legacy',
    quotaSource: credits.quotaSource,
    ownerUserId: record.ownerUserId || '',
    ownerUsername: record.ownerUsername || '',
    pausedAt: record.pausedAt || '',
    lastUsedAt: record.lastUsedAt || '',
  };
}

async function publicApiKeyRecordsForAdmin(records: PublicApiKeyRecord[]) {
  const ownerIds = new Set(
    records
      .filter((record) => record.billingMode === 'account' && record.ownerUserId)
      .map((record) => record.ownerUserId!),
  );
  const ownerCredits = new Map<string, CreditValues>();

  if (ownerIds.size > 0) {
    if (USE_SUPABASE) {
      const db = await getSupabaseDb();
      const creditRows = await db.getAllCreditRows();
      for (const row of creditRows) {
        if (!ownerIds.has(row.user_id)) continue;
        ownerCredits.set(row.user_id, {
          totalCredits: row.total_credits,
          usedCredits: row.used_credits,
        });
      }
    } else {
      await withReadDb((db) => {
        ensureSchema(db);
        for (const row of runQuery<Record<string, unknown>>(
          db,
          'SELECT user_id, total_credits, used_credits FROM user_credits',
        )) {
          const userId = String(row.user_id || '');
          if (!ownerIds.has(userId)) continue;
          ownerCredits.set(userId, {
            totalCredits: Number(row.total_credits || 0),
            usedCredits: Number(row.used_credits || 0),
          });
        }
      });
    }
  }

  return records.map((record) =>
    publicApiKeyRecord(record, record.ownerUserId ? ownerCredits.get(record.ownerUserId) : undefined),
  );
}

function userApiKeyRecord(record: PublicApiKeyRecord) {
  return {
    id: record.id,
    name: record.name,
    keyPreview: record.keyPreview,
    createdAt: record.createdAt,
    pausedAt: record.pausedAt || '',
    revokedAt: record.revokedAt || '',
    lastUsedAt: record.lastUsedAt || '',
    status: record.revokedAt ? 'revoked' : record.pausedAt ? 'paused' : 'active',
  };
}

function generatePublicApiKey() {
  return `px_${randomHex(24)}`;
}

function generateUserApiKey() {
  return `px_live_${randomHex(24)}`;
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

let publicApiKeyRecordsCache: PublicApiKeyRecord[] | null = null;
let publicApiKeyRecordsLoad: Promise<PublicApiKeyRecord[]> | null = null;

function clonePublicApiKeyRecords(records: PublicApiKeyRecord[]) {
  return normalizeApiKeyRecords(records);
}

async function readPublicApiKeyRecords(): Promise<PublicApiKeyRecord[]> {
  if (USE_SUPABASE) {
    if (publicApiKeyRecordsCache) return clonePublicApiKeyRecords(publicApiKeyRecordsCache);
    if (!publicApiKeyRecordsLoad) {
      publicApiKeyRecordsLoad = (async () => {
        const db = await getSupabaseDb();
        const raw = await db.getSetting(PUBLIC_API_KEYS_SETTING_KEY, '[]');
        const records = normalizeApiKeyRecords(parseJsonSetting(raw, []));
        publicApiKeyRecordsCache = records;
        return records;
      })().finally(() => {
        publicApiKeyRecordsLoad = null;
      });
    }
    return clonePublicApiKeyRecords(await publicApiKeyRecordsLoad);
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
    publicApiKeyRecordsCache = clonePublicApiKeyRecords(records);
    return;
  }

  await withWriteDb((db) => {
    ensureSchema(db);
    setSetting(db, PUBLIC_API_KEYS_SETTING_KEY, serialized);
  });
}

async function backupPublicApiKeyRecords(records: PublicApiKeyRecord[]) {
  if (records.length === 0) return;
  const payload = JSON.stringify({ backedUpAt: nowIso(), records });

  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    await db.setSetting(PUBLIC_API_KEYS_BACKUP_SETTING_KEY, payload);
    return;
  }

  await withWriteDb((db) => {
    ensureSchema(db);
    setSetting(db, PUBLIC_API_KEYS_BACKUP_SETTING_KEY, payload);
  });
}

async function createPublicApiKeyUnlocked(name: string, totalCredits: number, createdBy: string) {
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
  await backupPublicApiKeyRecords(records);
  await writePublicApiKeyRecords([record, ...records]);
  return { plainKey, record };
}

async function createUserApiKeyUnlocked(
  name: string,
  ownerUserId: string,
  ownerUsername: string,
  rotatedFromId?: string,
) {
  const records = await readPublicApiKeyRecords();
  const ownedActiveKeys = records.filter(
    (record) => record.ownerUserId === ownerUserId && record.billingMode === 'account' && !record.revokedAt,
  );
  if (ownedActiveKeys.length >= 5) {
    throw new Error('\u6bcf\u4e2a\u8d26\u53f7\u6700\u591a\u4fdd\u7559 5 \u4e2a\u672a\u6ce8\u9500\u7684 API Key');
  }

  const plainKey = generateUserApiKey();
  const record: PublicApiKeyRecord = {
    id: randomHex(8),
    name: normalizeString(name).slice(0, 40) || 'API Key',
    keyHash: hashPublicApiKey(plainKey),
    keyPreview: previewPublicApiKey(plainKey),
    totalCredits: 0,
    usedCredits: 0,
    createdAt: nowIso(),
    createdBy: ownerUsername,
    ownerUserId,
    ownerUsername,
    billingMode: 'account',
    rotatedFromId,
  };
  await backupPublicApiKeyRecords(records);
  await writePublicApiKeyRecords([record, ...records]);
  return { plainKey, record };
}

async function updateOwnedUserApiKeyUnlocked(
  id: string,
  ownerUserId: string,
  action: 'pause' | 'resume' | 'revoke',
) {
  const records = await readPublicApiKeyRecords();
  const index = records.findIndex(
    (record) => record.id === id && record.ownerUserId === ownerUserId && record.billingMode === 'account',
  );
  if (index < 0) return null;
  const record = records[index];
  if (record.revokedAt && action !== 'revoke') {
    throw new Error('API Key \u5df2\u6ce8\u9500');
  }
  const timestamp = nowIso();
  records[index] = action === 'pause'
    ? { ...record, pausedAt: record.pausedAt || timestamp }
    : action === 'resume'
      ? { ...record, pausedAt: undefined }
      : { ...record, pausedAt: undefined, revokedAt: record.revokedAt || timestamp };
  await writePublicApiKeyRecords(records);
  return records[index];
}

async function revokePublicApiKeyUnlocked(id: string) {
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
  await backupPublicApiKeyRecords(records);
  await writePublicApiKeyRecords(nextRecords);

  const persistedRecords = await readPublicApiKeyRecords();
  return persistedRecords.find((record) => record.id === targetId) || nextRecords.find((record) => record.id === targetId) || null;
}

async function deductPublicApiKeyCreditsUnlocked(id: string, credits: number) {
  const targetId = normalizeString(id);
  const requestedCredits = Math.max(0, Math.floor(credits));
  if (!targetId || requestedCredits <= 0) return null;

  const records = await readPublicApiKeyRecords();
  const index = records.findIndex((record) => record.id === targetId);
  if (index < 0) return null;

  const record = records[index];
  if (record.billingMode === 'account' && record.ownerUserId) {
    throw new Error('账户共享型 API Key 请在用户管理中调整所属账户积分');
  }
  const remainingCredits = Math.max(0, record.totalCredits - record.usedCredits);
  const deductedCredits = Math.min(requestedCredits, remainingCredits);
  if (deductedCredits <= 0) {
    throw new Error('API Key has no remaining credits to deduct');
  }

  records[index] = {
    ...record,
    usedCredits: record.usedCredits + deductedCredits,
  };
  await backupPublicApiKeyRecords(records.map((item, itemIndex) => itemIndex === index ? record : item));
  await writePublicApiKeyRecords(records);

  const persistedRecords = await readPublicApiKeyRecords();
  return {
    record: persistedRecords.find((item) => item.id === targetId) || records[index],
    deductedCredits,
  };
}

async function rechargePublicApiKeyCreditsUnlocked(id: string, credits: number) {
  const targetId = normalizeString(id);
  const rechargedCredits = Math.max(0, Math.floor(credits));
  if (!targetId || rechargedCredits <= 0) return null;

  const records = await readPublicApiKeyRecords();
  const index = records.findIndex((record) => record.id === targetId);
  if (index < 0) return null;
  if (records[index].billingMode === 'account' && records[index].ownerUserId) {
    throw new Error('账户共享型 API Key 请在用户管理中调整所属账户积分');
  }

  const previousRecords = records.map((item) => ({ ...item }));
  records[index] = {
    ...records[index],
    totalCredits: records[index].totalCredits + rechargedCredits,
  };
  await backupPublicApiKeyRecords(previousRecords);
  await writePublicApiKeyRecords(records);

  const persistedRecords = await readPublicApiKeyRecords();
  return {
    record: persistedRecords.find((item) => item.id === targetId) || records[index],
    rechargedCredits,
  };
}

async function deletePublicApiKeyUnlocked(id: string) {
  const targetId = normalizeString(id);
  if (!targetId) return false;

  const records = await readPublicApiKeyRecords();
  const nextRecords = records.filter((record) => record.id !== targetId);
  if (nextRecords.length === records.length) return false;

  await backupPublicApiKeyRecords(records);
  await writePublicApiKeyRecords(nextRecords);
  return true;
}

async function reserveAccountApiKeyCredits(record: PublicApiKeyRecord, credits: number) {
  const ownerUserId = record.ownerUserId!;
  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    await db.ensureUserCredits(ownerUserId, record.ownerUsername || record.createdBy, 0);
    const balance = await db.getUserCredits(ownerUserId);
    if (balance.remainingCredits < credits) {
      throw new Error(`API Key \u6240\u5c5e\u8d26\u53f7\u79ef\u5206\u4e0d\u8db3\uff0c\u9700\u8981 ${credits}\uff0c\u5269\u4f59 ${balance.remainingCredits}`);
    }
    await db.incrementUsedCredits(ownerUserId, credits);
    return { ...balance, usedCredits: balance.usedCredits + credits };
  }
  return withWriteDb((db) => {
    ensureSchema(db);
    ensureUserCredits(db, ownerUserId, record.ownerUsername || record.createdBy, 0);
    const balance = getUserCredits(db, ownerUserId);
    if (balance.remainingCredits < credits) {
      throw new Error(`API Key \u6240\u5c5e\u8d26\u53f7\u79ef\u5206\u4e0d\u8db3\uff0c\u9700\u8981 ${credits}\uff0c\u5269\u4f59 ${balance.remainingCredits}`);
    }
    incrementUserUsedCredits(db, ownerUserId, credits);
    return { ...balance, usedCredits: balance.usedCredits + credits };
  });
}

async function reservePublicApiKeyCreditsUnlocked(plainKey: string, credits: number) {
  const keyHash = hashPublicApiKey(plainKey);
  const records = await readPublicApiKeyRecords();
  const index = records.findIndex((record) => record.keyHash === keyHash);
  if (index < 0) {
    throw new Error('API Key 无效');
  }

  const record = records[index];
  if (record.revokedAt) {
    throw new Error('API Key \u5df2\u6ce8\u9500');
  }
  if (record.pausedAt) throw new Error('API Key \u5df2\u6682\u505c');
  if (record.billingMode === 'account' && record.ownerUserId) {
    const balance = await reserveAccountApiKeyCredits(record, credits);
    records[index] = { ...record, lastUsedAt: nowIso() };
    await writePublicApiKeyRecords(records);
    return { ...records[index], totalCredits: balance.totalCredits, usedCredits: balance.usedCredits };
  }
  const remainingCredits = Math.max(0, record.totalCredits - record.usedCredits);
  if (remainingCredits < credits) {
    throw new Error(`API Key 额度不足，需要 ${credits}，剩余 ${remainingCredits}`);
  }

  const nextRecord = {
    ...record,
    usedCredits: record.usedCredits + credits,
    lastUsedAt: nowIso(),
  };
  records[index] = nextRecord;
  await writePublicApiKeyRecords(records);
  return nextRecord;
}

async function getPublicApiKeyBalance(plainKey: string) {
  const keyHash = hashPublicApiKey(plainKey);
  const records = await readPublicApiKeyRecords();
  const record = records.find((item) => item.keyHash === keyHash);
  if (!record || record.revokedAt || record.pausedAt) return null;

  if (record.billingMode === 'account' && record.ownerUserId) {
    if (USE_SUPABASE) {
      const db = await getSupabaseDb();
      await db.ensureUserCredits(record.ownerUserId, record.ownerUsername || record.createdBy, 0);
      return db.getUserCredits(record.ownerUserId);
    }
    return withReadDb((db) => {
      ensureSchema(db);
      return getUserCredits(db, record.ownerUserId!);
    });
  }

  return {
    totalCredits: record.totalCredits,
    usedCredits: record.usedCredits,
    remainingCredits: Math.max(0, record.totalCredits - record.usedCredits),
  };
}

function normalizePublicAsyncTask(value: Partial<PublicAsyncGenerationTask>): PublicAsyncGenerationTask | null {
  const id = normalizeString(value.id);
  const upstreamId = normalizeString(value.upstreamId);
  const apiKeyId = normalizeString(value.apiKeyId);
  const apiKeyHash = normalizeString(value.apiKeyHash);
  if (!id || !apiKeyId || !apiKeyHash) return null;

  const rawStatus = normalizeString(value.status).toLowerCase();
  let status: PublicAsyncGenerationTask['status'] =
    rawStatus === 'succeeded' || rawStatus === 'failed' || rawStatus === 'running' ? rawStatus : 'queued';
  if (status === 'running' && !upstreamId) status = 'queued';
  return {
    id,
    upstreamId: upstreamId || undefined,
    apiKeyId,
    apiKeyHash,
    status,
    generationStatus: normalizeString(value.generationStatus) || (status === 'queued' ? 'pending' : status),
    progress: Math.max(0, Math.min(100, Number(value.progress || 0))),
    retryAfterSeconds: Math.max(0, Number(value.retryAfterSeconds ?? 3)),
    creditsUsed: Math.max(0, Math.floor(Number(value.creditsUsed || 0))),
    refunded: Boolean(value.refunded),
    prompt: normalizeString(value.prompt),
    modelId: normalizeString(value.modelId),
    modelName: normalizeString(value.modelName),
    dimensions: normalizeString(value.dimensions) || '1:1',
    imageSize: normalizeString(value.imageSize),
    quality: normalizeString(value.quality) || undefined,
    optimizeChineseText: Boolean(value.optimizeChineseText),
    providerRouting: normalizePublicApiProviderRouting(value.providerRouting),
    referenceImages: Array.isArray(value.referenceImages)
      ? value.referenceImages.map(normalizeString).filter(Boolean)
      : [],
    temporaryReferenceImages: Array.isArray(value.temporaryReferenceImages)
      ? value.temporaryReferenceImages.map(normalizeString).filter(Boolean)
      : [],
    createdAt: normalizeString(value.createdAt) || nowIso(),
    updatedAt: normalizeString(value.updatedAt) || nowIso(),
    imagePath: normalizeString(value.imagePath) || undefined,
    error: normalizeString(value.error) || undefined,
  };
}

function normalizePublicAsyncTasks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizePublicAsyncTask(item as Partial<PublicAsyncGenerationTask>))
    .filter((item): item is PublicAsyncGenerationTask => Boolean(item));
}

let publicAsyncTasksCache: PublicAsyncGenerationTask[] | null = null;
let publicAsyncTasksLoad: Promise<PublicAsyncGenerationTask[]> | null = null;

function clonePublicAsyncTasks(tasks: PublicAsyncGenerationTask[]) {
  return normalizePublicAsyncTasks(tasks);
}

async function readPublicAsyncTasks(): Promise<PublicAsyncGenerationTask[]> {
  if (USE_SUPABASE) {
    if (publicAsyncTasksCache) return clonePublicAsyncTasks(publicAsyncTasksCache);
    if (!publicAsyncTasksLoad) {
      publicAsyncTasksLoad = (async () => {
        const db = await getSupabaseDb();
        const raw = await db.getSetting(PUBLIC_ASYNC_TASKS_SETTING_KEY, '[]');
        const tasks = normalizePublicAsyncTasks(parseJsonSetting(raw, []));
        publicAsyncTasksCache = tasks;
        return tasks;
      })().finally(() => {
        publicAsyncTasksLoad = null;
      });
    }
    return clonePublicAsyncTasks(await publicAsyncTasksLoad);
  }

  return withReadDb((db) => {
    ensureSchema(db);
    return normalizePublicAsyncTasks(parseJsonSetting(getSetting(db, PUBLIC_ASYNC_TASKS_SETTING_KEY, '[]'), []));
  });
}

async function writePublicAsyncTasks(tasks: PublicAsyncGenerationTask[]) {
  const retentionCutoff = Date.now() - 7 * 24 * 60 * 60 * 1_000;
  const retained = tasks
    .filter((task) => {
      const updatedAt = new Date(task.updatedAt).getTime();
      return task.status === 'queued' || task.status === 'running' || !Number.isFinite(updatedAt) || updatedAt >= retentionCutoff;
    })
    .slice(-2_000);
  const serialized = JSON.stringify(retained);

  if (USE_SUPABASE) {
    const db = await getSupabaseDb();
    await db.setSetting(PUBLIC_ASYNC_TASKS_SETTING_KEY, serialized);
    publicAsyncTasksCache = clonePublicAsyncTasks(retained);
    return;
  }

  await withWriteDb((db) => {
    ensureSchema(db);
    setSetting(db, PUBLIC_ASYNC_TASKS_SETTING_KEY, serialized);
  });
}

let publicAsyncTaskMutationQueue: Promise<unknown> = Promise.resolve();

function withPublicAsyncTaskMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = publicAsyncTaskMutationQueue.then(operation, operation);
  publicAsyncTaskMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function refundPublicApiKeyCreditsUnlocked(keyId: string, credits: number) {
  const records = await readPublicApiKeyRecords();
  const target = records.find((record) => record.id === keyId);
  if (target?.billingMode === 'account' && target.ownerUserId) {
    if (USE_SUPABASE) {
      const db = await getSupabaseDb();
      const balance = await db.getUserCredits(target.ownerUserId);
      await db.incrementUsedCredits(target.ownerUserId, -Math.min(balance.usedCredits, credits));
    } else {
      await withWriteDb((db) => {
        ensureSchema(db);
        db.run(
          'UPDATE user_credits SET used_credits = MAX(0, used_credits - ?), updated_at = ? WHERE user_id = ?',
          [Math.max(0, Math.floor(credits)), nowIso(), target.ownerUserId],
        );
      });
    }
    return;
  }
  await writePublicApiKeyRecords(
    records.map((record) =>
      record.id === keyId ? { ...record, usedCredits: Math.max(0, record.usedCredits - credits) } : record,
    ),
  );
}

let publicApiKeyMutationQueue: Promise<unknown> = Promise.resolve();

function withPublicApiKeyMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = publicApiKeyMutationQueue.then(operation, operation);
  publicApiKeyMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function createPublicApiKey(name: string, totalCredits: number, createdBy: string) {
  return withPublicApiKeyMutationLock(() => createPublicApiKeyUnlocked(name, totalCredits, createdBy));
}

function revokePublicApiKey(id: string) {
  return withPublicApiKeyMutationLock(() => revokePublicApiKeyUnlocked(id));
}

function deductPublicApiKeyCredits(id: string, credits: number) {
  return withPublicApiKeyMutationLock(() => deductPublicApiKeyCreditsUnlocked(id, credits));
}

function rechargePublicApiKeyCredits(id: string, credits: number) {
  return withPublicApiKeyMutationLock(() => rechargePublicApiKeyCreditsUnlocked(id, credits));
}

function deletePublicApiKey(id: string) {
  return withPublicApiKeyMutationLock(() => deletePublicApiKeyUnlocked(id));
}

function reservePublicApiKeyCredits(plainKey: string, credits: number) {
  return withPublicApiKeyMutationLock(() => reservePublicApiKeyCreditsUnlocked(plainKey, credits));
}

function refundPublicApiKeyCredits(keyId: string, credits: number) {
  return withPublicApiKeyMutationLock(() => refundPublicApiKeyCreditsUnlocked(keyId, credits));
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
  const fallback = toCreditSummary(
    getOne<Record<string, unknown>>(
      db,
      "SELECT total_credits, used_credits FROM user_credits WHERE username = 'admin' ORDER BY created_at ASC LIMIT 1",
    ),
  );
  const raw = getSetting(db, ADMIN_CREDIT_POOL_SETTING_KEY, JSON.stringify(fallback));
  try {
    const parsed = JSON.parse(raw) as Partial<{
      totalCredits: number;
      usedCredits: number;
      remainingCredits: number;
    }>;
    const totalCredits = Math.max(0, Math.floor(Number(parsed.totalCredits || 0)));
    const usedCredits = Math.max(0, Math.floor(Number(parsed.usedCredits || 0)));
    return { totalCredits, usedCredits, remainingCredits: Math.max(0, totalCredits - usedCredits) };
  } catch {
    return fallback;
  }
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

function incrementUserUsedCredits(db: SqlDatabase, userId: string, amount: number) {
  db.run('UPDATE user_credits SET used_credits = used_credits + ?, updated_at = ? WHERE user_id = ?', [
    Math.max(0, Math.floor(amount)),
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
  const current = getAdminCreditSummary(db);
  const totalCredits = Math.max(current.usedCredits, current.totalCredits + Math.floor(delta));
  setSetting(db, ADMIN_CREDIT_POOL_SETTING_KEY, JSON.stringify({
    totalCredits,
    usedCredits: current.usedCredits,
    remainingCredits: Math.max(0, totalCredits - current.usedCredits),
  }));
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

    const thumbnailFile = path.join(THUMBNAILS_DIR, `${entry.name.replace(/\.[^.]+$/, '')}.webp`);
    if (!(await pathExists(thumbnailFile))) continue;

    await fs.unlink(filePath).catch(() => undefined);
    deletedFiles += 1;
  }

  return deletedFiles;
}

async function purgeExpiredThumbnailFiles(retentionDays = THUMBNAIL_RETENTION_DAYS) {
  if (IS_VERCEL) return 0;

  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await fs.readdir(THUMBNAILS_DIR, { withFileTypes: true }).catch(() => []);
  let deletedFiles = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(THUMBNAILS_DIR, entry.name);
    const stats = await fs.stat(filePath).catch(() => null);
    if (!stats || stats.mtimeMs >= cutoffTime) continue;
    await fs.unlink(filePath).catch(() => undefined);
    deletedFiles += 1;
  }

  return deletedFiles;
}

async function enforceDiskPressure(reason: string) {
  let usagePercent = await getDiskUsagePercent();
  let deletedEmergencyFiles = 0;

  if (usagePercent >= DISK_WARNING_PERCENT) {
    console.warn(
      `[disk-usage:${reason}] usage=${usagePercent.toFixed(1)}% warning=${DISK_WARNING_PERCENT}% emergency=${DISK_EMERGENCY_PERCENT}%`,
    );
  }
  if (usagePercent < DISK_EMERGENCY_PERCENT || IS_VERCEL) {
    return { diskUsagePercent: usagePercent, deletedEmergencyFiles };
  }

  const candidates = await Promise.all(
    (await fs.readdir(GENERATED_DIR, { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filePath = path.join(GENERATED_DIR, entry.name);
        const stats = await fs.stat(filePath).catch(() => null);
        return stats ? { filePath, mtimeMs: stats.mtimeMs } : null;
      }),
  );

  for (const candidate of candidates.filter((item): item is { filePath: string; mtimeMs: number } => Boolean(item)).sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    await fs.unlink(candidate.filePath).catch(() => undefined);
    deletedEmergencyFiles += 1;
    usagePercent = await getDiskUsagePercent();
    if (usagePercent <= DISK_EMERGENCY_TARGET_PERCENT) break;
  }

  console.warn(
    `[disk-emergency:${reason}] deletedOriginals=${deletedEmergencyFiles} usage=${usagePercent.toFixed(1)}% target=${DISK_EMERGENCY_TARGET_PERCENT}%`,
  );
  return { diskUsagePercent: usagePercent, deletedEmergencyFiles };
}

async function runImageRetentionCleanup(reason: string, retentionDays = IMAGE_RETENTION_DAYS) {
  if (imageCleanupPromise) {
    return imageCleanupPromise;
  }

  imageCleanupPromise = (async () => {
    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        const result = await db.purgeExpiredImageData(retentionDays);
        const deletedReferenceFiles = await purgeExpiredReferenceFiles(1);
        const deletedGeneratedFiles = await purgeExpiredGeneratedFiles(ORIGINAL_IMAGE_RETENTION_DAYS);
        const deletedThumbnailFiles = await purgeExpiredThumbnailFiles(retentionDays);
        const diskPressure = await enforceDiskPressure(reason);
        if (result.deletedGenerations > 0 || result.deletedImages > 0 || deletedReferenceFiles > 0 || deletedGeneratedFiles > 0 || deletedThumbnailFiles > 0 || diskPressure.deletedEmergencyFiles > 0) {
          console.log(
            `[image-cleanup:${reason}] cutoff=${result.cutoffIso} generations=${result.deletedGenerations} images=${result.deletedImages} referenceFiles=${deletedReferenceFiles} generatedFiles=${deletedGeneratedFiles} thumbnailFiles=${deletedThumbnailFiles} emergencyOriginals=${diskPressure.deletedEmergencyFiles}`,
          );
        }
        return {
          ...result,
          deletedReferenceFiles,
          deletedGeneratedFiles,
          deletedThumbnailFiles,
          ...diskPressure,
        };
      }

      const result = await withWriteDb((db) => purgeExpiredImageDataSqlite(db, retentionDays));
      const deletedReferenceFiles = await purgeExpiredReferenceFiles(1);
      const deletedGeneratedFiles = await purgeExpiredGeneratedFiles(ORIGINAL_IMAGE_RETENTION_DAYS);
      const deletedThumbnailFiles = await purgeExpiredThumbnailFiles(retentionDays);
      const diskPressure = await enforceDiskPressure(reason);
      if (result.deletedGenerations > 0 || result.deletedImages > 0 || deletedReferenceFiles > 0 || deletedGeneratedFiles > 0 || deletedThumbnailFiles > 0 || diskPressure.deletedEmergencyFiles > 0) {
        console.log(
          `[image-cleanup:${reason}] cutoff=${result.cutoffIso} generations=${result.deletedGenerations} images=${result.deletedImages} referenceFiles=${deletedReferenceFiles} generatedFiles=${deletedGeneratedFiles} thumbnailFiles=${deletedThumbnailFiles} emergencyOriginals=${diskPressure.deletedEmergencyFiles}`,
        );
      }
      return {
        ...result,
        deletedReferenceFiles,
        deletedGeneratedFiles,
        deletedThumbnailFiles,
        ...diskPressure,
      };
    } catch (error) {
      console.error(`[image-cleanup:${reason}] failed`, error);
      if (reason.startsWith('manual')) {
        throw error;
      }
      return {
        cutoffIso: subtractDaysIso(retentionDays),
        deletedGenerations: 0,
        deletedImages: 0,
        deletedReferenceFiles: 0,
        deletedGeneratedFiles: 0,
        deletedThumbnailFiles: 0,
        deletedEmergencyFiles: 0,
        diskUsagePercent: 0,
      };
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

function stringifyApiErrorValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  return (
    stringifyApiErrorValue(record.message) ||
    stringifyApiErrorValue(record.error) ||
    stringifyApiErrorValue(record.detail) ||
    stringifyApiErrorValue(record.failure_reason) ||
    stringifyApiErrorValue(record.reason)
  );
}

function sanitizeExternalErrorMessage(value: string, fallback = '图像服务返回异常，请稍后重试') {
  const normalized = normalizeString(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const raw = normalizeString(value);
  const lower = `${raw} ${normalized}`.toLowerCase();

  // Never expose implementation details returned by an upstream provider (for
  // example Prisma/PostgreSQL shutdown messages) to end users. These errors
  // are transient provider failures and do not indicate a problem with the
  // user's API key or credits.
  if (
    lower.includes('prisma.') ||
    lower.includes('error querying the database') ||
    lower.includes('database system is shutting down') ||
    lower.includes('database connection') ||
    lower.includes('connection terminated unexpectedly')
  ) {
    return '图像服务暂时不可用，请稍后重试';
  }

  if (lower.includes('504 gateway time-out') || lower.includes('504 gateway timeout')) {
    return '图像服务响应超时，请稍后重试';
  }
  if (lower.includes('502 bad gateway')) {
    return '图像服务网关异常，请稍后重试';
  }
  if (lower.includes('503 service unavailable')) {
    return '图像服务暂时不可用，请稍后重试';
  }
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) {
    return normalized && normalized.length <= 180 ? normalized : fallback;
  }

  return normalized ? normalized.slice(0, 300) : fallback;
}

function getVisionaryErrorMessage(payload: unknown, fallback: string) {
  const message = stringifyApiErrorValue(payload);
  if (message) return sanitizeExternalErrorMessage(message, fallback);
  return sanitizeExternalErrorMessage(fallback, '图像服务返回异常，请稍后重试');
}

async function parseVisionaryJsonResponse<T>(response: globalThis.Response, fallback: string): Promise<T> {
  const responseText = await response.text().catch(() => '');
  let payload: T | null = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText) as T;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = new Error(
      getVisionaryErrorMessage(payload || responseText, `${fallback} (${response.status})`),
    ) as Error & { safeToFallback: boolean; status: number };
    error.safeToFallback = true;
    error.status = response.status;
    throw error;
  }

  if (!payload) {
    const error = new Error(`${fallback}: 图像服务返回了非 JSON 响应，请稍后重试`) as Error & {
      safeToFallback: boolean;
    };
    error.safeToFallback = false;
    throw error;
  }

  return payload;
}

function getPublicApiErrorStatus(message: string) {
  if (/invalid|无效|停用|revoked/i.test(message)) return 401;
  if (/额度不足|余额不足|credits?.*(not enough|insufficient)|insufficient/i.test(message)) return 402;
  if (/queue capacity|queue is full|队列已满/i.test(message)) return 429;
  return 500;
}

function getNetworkErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return '';
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    return normalizeString((cause as { code?: unknown }).code);
  }
  return normalizeString((error as { code?: unknown }).code);
}

function isRetryableConnectError(error: unknown) {
  return [
    'UND_ERR_CONNECT_TIMEOUT',
    'EAI_AGAIN',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'ECONNREFUSED',
  ].includes(getNetworkErrorCode(error));
}

async function fetchVisionaryWithConnectRetry(url: string, init: RequestInit) {
  const maxAttempts = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (!isRetryableConnectError(error) || attempt >= maxAttempts) break;
      console.warn(
        `[visionary] connect failed (${getNetworkErrorCode(error)}), retry ${attempt + 1}/${maxAttempts}`,
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }
  }

  if (isRetryableConnectError(lastError)) {
    throw new Error('图像服务连接超时，已自动重试，请稍后再试');
  }
  throw lastError;
}

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
  if (modelId === 'Nano_Banana_Pro' && imageSize === '1K') {
    const apiKey = VISIONARY_NANO_LITE_API_KEY || VISIONARY_BANANA_PRO_API_KEY || VISIONARY_FALLBACK_API_KEY;
    if (!apiKey) {
      const error = new Error('香蕉生图渠道暂时不可用') as Error & { safeToFallback: boolean };
      error.safeToFallback = true;
      throw error;
    }
    return generateVisionaryNanoLite(
      { prompt, ratio, images },
      { baseUrl: VISIONARY_API_BASE_URL, apiKey },
    );
  }

  const task = await callVisionaryAsyncGeneration({
    prompt,
    modelId,
    ratio,
    imageSize,
    quality,
    optimizeChineseText,
    images,
  });
  const taskId = normalizeString(task.id || task.taskId);
  if (!taskId) {
    const error = new Error('Image provider returned no task id') as Error & { safeToFallback: boolean };
    error.safeToFallback = false;
    throw error;
  }

  const payload = task.status === 'succeeded'
    ? task
    : await pollVisionaryAsyncUntilComplete(taskId, modelId, imageSize);
  const imageUrl =
    payload.results?.find((item) => item.url || item.content)?.url ||
    payload.results?.[0]?.content;
  if (!imageUrl) {
    const error = new Error(`Image provider returned no image URL, task id: ${taskId}`) as Error & {
      safeToFallback: boolean;
    };
    error.safeToFallback = false;
    throw error;
  }

  return imageUrl;
}

// 鈹€鈹€鈹€ Visionary 寮傛鎺ュ彛璋冪敤 鈹€鈹€鈹€

let imageProviderRouter: ReturnType<typeof createImageProviderRouter> | null = null;
let providerMetrics: ReturnType<typeof createProviderMetrics> | null = null;
let providerRiskMonitor: ReturnType<typeof createProviderRiskMonitor> | null = null;
let providerRouting: ReturnType<typeof createProviderRouting> | null = null;
const imageChannelFailover = createImageChannelFailover({
  cooldownMs: IMAGE_CHANNEL_RETRY_COOLDOWN_MS,
});

function imageAttemptConfiguration(input: ImageGenerationInput) {
  return `${input.imageSize || 'STANDARD'} / ${input.quality || 'default'} / ${input.ratio || '1:1'}`;
}

function safeToTryNextProvider(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { safeToFallback?: unknown }).safeToFallback);
}

function imageErrorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown image provider error');
}

async function recordImageChannelAttempt({
  traceId,
  input,
  provider,
  sourceModel,
  startedAt,
  success,
  error,
}: {
  traceId: string;
  input: ImageGenerationInput;
  provider: string;
  sourceModel: string;
  startedAt: number;
  success: boolean;
  error?: unknown;
}) {
  const attempt = {
    traceId,
    modelId: input.modelId,
    provider,
    configuration: imageAttemptConfiguration(input),
    durationMs: Math.max(0, Date.now() - startedAt),
    success,
    failureReason: success ? undefined : safeToTryNextProvider(error) ? 'explicit_failure' : 'uncertain',
    errorMessage: success ? undefined : imageErrorText(error),
    sourceModel,
    prompt: input.prompt,
    requestContext: input.requestContext,
  };
  const requestId = await recordGenerationRequest(attempt);
  if (success && requestId && input.requestContext) input.requestContext.successfulRequestId = requestId;
  await Promise.all([
    providerMetrics?.record(attempt),
    providerRiskMonitor?.record(attempt),
  ]);
}

async function callMeasuredImageChannel(
  input: ImageGenerationInput,
  traceId: string,
  provider: string,
  sourceModel: string,
  call: () => Promise<string>,
) {
  const startedAt = Date.now();
  try {
    const source = await call();
    await recordImageChannelAttempt({ traceId, input, provider, sourceModel, startedAt, success: true });
    return source;
  } catch (error) {
    await recordImageChannelAttempt({ traceId, input, provider, sourceModel, startedAt, success: false, error });
    throw error;
  }
}

async function callConfiguredImageChannel(
  input: ImageGenerationInput,
  channelId: string,
  traceId: string,
) {
  if (input.modelId === 'Nano_Banana_Pro') {
    if (channelId === 'flux') {
      if (!FLUX_BANANA_API_KEY) {
        const error = new Error('Flux banana key is not configured') as Error & { safeToFallback: boolean };
        error.safeToFallback = true;
        throw error;
      }
      const startedAt = Date.now();
      try {
        const selected = await generateFluxBanana(input, {
          baseUrl: FLUX_BANANA_API_BASE_URL,
          apiKey: FLUX_BANANA_API_KEY,
          timeoutMs: FLUX_BANANA_TIMEOUT_MS,
        });
        await recordImageChannelAttempt({
          traceId,
          input,
          provider: `Flux · ${selected.model}`,
          sourceModel: selected.model,
          startedAt,
          success: true,
        });
        return selected.source;
      } catch (error) {
        await recordImageChannelAttempt({
          traceId,
          input,
          provider: 'Flux',
          sourceModel: (error as { sourceModel?: string })?.sourceModel || 'gemini-image',
          startedAt,
          success: false,
          error,
        });
        throw error;
      }
    }
    if (channelId === 'visionary') {
      const sourceModel = input.imageSize === '1K' ? 'nano-banana-2-lite' : 'nano-banana-pro';
      return callMeasuredImageChannel(
        input,
        traceId,
        'Visionary',
        sourceModel,
        () => callVisionaryGeneration(input),
      );
    }
    if (channelId === 'junliai' && imageProviderRouter) {
      return imageProviderRouter.generate({
        ...input,
        providerRouting: 'junliai_only',
        upstreamModelOverride: 'nano-banana-pro',
        traceId,
      });
    }
    if (channelId === 'junliai-nano-banana-2' && imageProviderRouter) {
      return imageProviderRouter.generate({
        ...input,
        providerRouting: 'junliai_only',
        upstreamModelOverride: 'nano-banana-2',
        traceId,
      });
    }
  }

  if (input.modelId === 'gpt-image-2') {
    if (channelId === 'visionary') {
      return callMeasuredImageChannel(
        input,
        traceId,
        'Visionary',
        'gpt-image-2',
        () => callVisionaryGeneration(input),
      );
    }
    const upstreamModel = channelId === 'junliai-economy'
      ? JUNLIAI_GPT_IMAGE_2_STANDARD_MODEL
      : channelId === 'junliai-firefly'
        ? JUNLIAI_MODEL
        : '';
    if (upstreamModel && imageProviderRouter) {
      return imageProviderRouter.generate({
        ...input,
        providerRouting: 'junliai_only',
        upstreamModelOverride: upstreamModel,
        traceId,
      });
    }
  }

  const error = new Error(`Image channel ${channelId} is unavailable`) as Error & { safeToFallback: boolean };
  error.safeToFallback = true;
  throw error;
}

async function callImageGeneration(input: ImageGenerationInput) {
  const effectiveInput = {
    ...input,
    // AI 增强只参与 PIXORY 计费；图片后端始终接收 false，避免触发其原生增强流程。
    optimizeChineseText: false,
  };
  if (effectiveInput.providerRouting === 'junliai_dedicated') {
    if (!imageProviderRouter) throw new Error('Junli image provider is unavailable');
    return imageProviderRouter.generate({
      ...effectiveInput,
      modelId: 'Nano_Banana_Pro',
      providerRouting: 'junliai_dedicated',
      upstreamModelOverride: 'nano-banana-pro',
      traceId: crypto.randomUUID(),
    });
  }
  const routing = providerRouting ? await providerRouting.get() : DEFAULT_PROVIDER_ROUTING;
  const resolution = routingResolution(effectiveInput.imageSize);
  const configuredChannels = effectiveInput.modelId === 'Nano_Banana_Pro'
    ? enabledProviderIds(routing.bananaRoutes[resolution])
    : enabledProviderIds(routing.image2Routes[resolution]);
  if (configuredChannels.length === 0) {
    throw new Error('管理员已停用当前模型的全部生图渠道');
  }
  const routeKey = `${effectiveInput.modelId}:${resolution}`;
  const channels = imageChannelFailover.candidates(routeKey, configuredChannels);

  const traceId = crypto.randomUUID();
  for (const channelId of channels) {
    try {
      const source = await callConfiguredImageChannel(effectiveInput, channelId, traceId);
      imageChannelFailover.markSuccess(routeKey, channelId);
      return source;
    } catch (error) {
      imageChannelFailover.markFailure(routeKey, channelId);
      console.warn(`[image-channel] ${channelId} failed: ${imageErrorText(error)}`);
      if (!safeToTryNextProvider(error)) {
        throw new Error('生成结果暂时无法确认，为避免重复扣费，本次不会自动切换渠道；积分将自动退回，请稍后重试。');
      }
    }
  }
  throw new Error('图片生成服务暂时不可用，请稍后重试');
}

function videoSize(ratio: string, resolution: string) {
  const sizes: Record<string, Record<string, string>> = {
    '720p': { '16:9': '1280x720', '1:1': '720x720', '9:16': '720x1280' },
    '1080p': { '16:9': '1920x1080', '1:1': '1080x1080', '9:16': '1080x1920' },
  };
  return sizes[resolution]?.[ratio] || sizes['720p']['16:9'];
}

function dataUrlBlob(value: string) {
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error('Invalid video reference image');
  const bytes = match[2]
    ? Buffer.from(match[3].replace(/\s+/g, ''), 'base64')
    : Buffer.from(decodeURIComponent(match[3]));
  return new Blob([bytes], { type: match[1] || 'image/png' });
}

async function parseJunliaiVideoResponse(response: globalThis.Response) {
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(
      stringifyApiErrorValue(payload) ||
      `Video provider returned HTTP ${response.status}: ${text.slice(0, 240)}`,
    );
  }
  return payload;
}

async function createJunliaiVideoTask(input: {
  modelId: VideoModelId;
  prompt: string;
  ratio: string;
  resolution: string;
  seconds: VideoDurationSeconds;
  referenceImages: ReferenceUploadInput[];
}) {
  const url = `${JUNLIAI_BASE_URL.replace(/\/+$/, '')}/v1/videos`;
  const headers: Record<string, string> = {
    Authorization: /^Bearer\s/i.test(JUNLIAI_API_KEY) ? JUNLIAI_API_KEY : `Bearer ${JUNLIAI_API_KEY}`,
  };
  let body: BodyInit;
  if (input.referenceImages.length > 0) {
    const form = new FormData();
    form.set('model', input.modelId);
    form.set('prompt', input.prompt);
    form.set('seconds', String(input.seconds));
    form.set('size', videoSize(input.ratio, input.resolution));
    form.set('response_format', 'url');
    input.referenceImages.slice(0, 2).forEach((item, index) => {
      form.append('input_reference', dataUrlBlob(item.data), item.name || `reference-${index + 1}.png`);
    });
    body = form;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({
      model: input.modelId,
      prompt: input.prompt,
      seconds: String(input.seconds),
      size: videoSize(input.ratio, input.resolution),
      response_format: 'url',
    });
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await parseJunliaiVideoResponse(response);
  const taskId = normalizeString(payload.id);
  if (!taskId) throw new Error('Video provider returned no task id');
  return { taskId, payload };
}

async function archiveJunliaiVideo(taskId: string, videoUrl: string) {
  const headers = videoUrl
    ? undefined
    : { Authorization: /^Bearer\s/i.test(JUNLIAI_API_KEY) ? JUNLIAI_API_KEY : `Bearer ${JUNLIAI_API_KEY}` };
  const source = videoUrl || `${JUNLIAI_BASE_URL.replace(/\/+$/, '')}/v1/videos/${encodeURIComponent(taskId)}/content`;
  const response = await fetch(source, { headers, signal: AbortSignal.timeout(5 * 60_000) });
  if (!response.ok) throw new Error(`Video download failed (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength < 1_024) throw new Error('Video provider returned an empty video');
  const fileName = `generated-video-${Date.now()}-${randomHex(4)}.mp4`;
  await fs.writeFile(path.join(GENERATED_DIR, fileName), buffer);
  return `/uploads/generated/${fileName}`;
}

async function waitForJunliaiVideo(taskId: string, onProgress: (progress: number) => void) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < VIDEO_JOB_TIMEOUT_MS) {
    const response = await fetch(
      `${JUNLIAI_BASE_URL.replace(/\/+$/, '')}/v1/videos/${encodeURIComponent(taskId)}`,
      {
        headers: {
          Authorization: /^Bearer\s/i.test(JUNLIAI_API_KEY) ? JUNLIAI_API_KEY : `Bearer ${JUNLIAI_API_KEY}`,
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    const payload = await parseJunliaiVideoResponse(response);
    const status = normalizeString(payload.status).toLowerCase();
    const progress = Math.max(12, Math.min(95, Number(payload.progress || 0)));
    onProgress(Number.isFinite(progress) ? progress : 20);
    if (status === 'completed' || status === 'succeeded') {
      const data = Array.isArray(payload.data) ? payload.data[0] as Record<string, unknown> | undefined : undefined;
      const url = normalizeString(payload.url || payload.video_url || data?.url);
      return archiveJunliaiVideo(taskId, url);
    }
    if (status === 'failed' || status === 'cancelled') {
      throw new Error(stringifyApiErrorValue(payload) || 'Video generation failed');
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error('Video generation timed out');
}

async function callVisionaryAsyncGeneration({
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

  const requestBody =
    modelId === 'gpt-image-2'
      ? {
          model: 'gpt-image-2',
          prompt,
          images,
          aspectRatio: visionaryAspectRatio,
          imageSize: imageSize === 'STANDARD' ? undefined : imageSize,
          quality: normalizeGptQuality(quality, imageSize),
        }
      : {
          model: 'nano-banana-pro',
          prompt,
          images,
          aspectRatio: visionaryAspectRatio,
          imageSize: imageSize || '2K',
          optimizeChineseText,
        };

  const response = await fetchVisionaryWithConnectRetry(
    `${VISIONARY_API_BASE_URL}/v1/async/images/generations`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Idempotency-Key': `async_${Date.now()}_${randomHex(8)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );

  const payload = await parseVisionaryJsonResponse<VisionaryAsyncTaskResponse>(
    response,
    '提交图像生成任务失败',
  );

  const taskId = normalizeString(payload?.id || payload?.taskId);
  if (!taskId) {
    const error = new Error('Image provider returned no task id') as Error & { safeToFallback: boolean };
    error.safeToFallback = false;
    throw error;
  }

  return { ...payload, id: taskId };
}

async function queryVisionaryAsyncStatus(taskId: string, modelId: string, imageSize: string) {
  const apiKey = getVisionaryApiKey(modelId, imageSize);
  if (!apiKey) {
    throw new Error(`${getVisionaryApiKeyLabel(modelId, imageSize)} is not configured`);
  }

  const response = await fetchVisionaryWithConnectRetry(
    `${VISIONARY_API_BASE_URL}/v1/async/images/generations/${taskId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );

  return parseVisionaryJsonResponse<VisionaryAsyncTaskResponse>(
    response,
    '查询图像生成任务失败',
  );
}

async function pollVisionaryAsyncUntilComplete(
  taskId: string,
  modelId: string,
  imageSize: string,
  options: { maxPolls?: number; onStatus?: (status: VisionaryAsyncTaskResponse) => void } = {},
): Promise<VisionaryAsyncTaskResponse> {
  const { maxPolls = 120, onStatus } = options;

  for (let poll = 0; poll < maxPolls; poll += 1) {
    let status: VisionaryAsyncTaskResponse;
    try {
      status = await queryVisionaryAsyncStatus(taskId, modelId, imageSize);
    } catch (error) {
      if (error && typeof error === 'object') {
        (error as { safeToFallback?: boolean }).safeToFallback = false;
      }
      throw error;
    }
    if (onStatus) onStatus(status);

    if (status.status === 'succeeded') {
      return status;
    }
    if (status.status === 'failed') {
      const error = new Error(
        getVisionaryErrorMessage(status, `Async generation failed: ${status.generationStatus || 'unknown'}`),
      ) as Error & { safeToFallback: boolean };
      error.safeToFallback = true;
      throw error;
    }

    const delayMs = (status.retryAfterSeconds || 5) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const error = new Error(`Async generation timed out after ${maxPolls} polls`) as Error & {
    safeToFallback: boolean;
  };
  error.safeToFallback = false;
  throw error;
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

async function createGeneratedThumbnail(buffer: Buffer, fileName: string) {
  const thumbnailName = `${fileName.replace(/\.[^.]+$/, '')}.webp`;
  const target = path.join(THUMBNAILS_DIR, thumbnailName);
  const qualities = [72, 60, 48, 36, 28, 20];
  let thumbnail = Buffer.alloc(0);

  for (const quality of qualities) {
    thumbnail = await sharp(buffer, { failOn: 'none', limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer();
    if (thumbnail.byteLength <= 100 * 1024) break;
  }

  await fs.writeFile(target, thumbnail);
  return `/uploads/thumbnails/${thumbnailName}`;
}

async function writeGeneratedImage(buffer: Buffer, extension: string) {
  const fileName = `generated-${Date.now()}-${randomHex(4)}.${extension}`;
  const target = path.join(GENERATED_DIR, fileName);
  await fs.writeFile(target, buffer);
  try {
    await createGeneratedThumbnail(buffer, fileName);
  } catch (error) {
    console.error(`[thumbnail] failed for ${fileName}`, error);
  }
  return `/uploads/generated/${fileName}`;
}

async function backfillGeneratedThumbnails() {
  if (IS_VERCEL) return;
  const entries = await fs.readdir(GENERATED_DIR, { withFileTypes: true }).catch(() => []);
  let created = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const thumbnailFile = path.join(THUMBNAILS_DIR, `${entry.name.replace(/\.[^.]+$/, '')}.webp`);
    if (await pathExists(thumbnailFile)) continue;
    try {
      const originalFile = path.join(GENERATED_DIR, entry.name);
      const [buffer, stats] = await Promise.all([fs.readFile(originalFile), fs.stat(originalFile)]);
      await createGeneratedThumbnail(buffer, entry.name);
      await fs.utimes(thumbnailFile, stats.atime, stats.mtime);
      created += 1;
    } catch (error) {
      console.error(`[thumbnail-backfill] failed for ${entry.name}`, error);
    }
  }

  if (created > 0) console.log(`[thumbnail-backfill] created=${created}`);
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

    const buffer = Buffer.from(base64, 'base64');
    if (!isValidImageBuffer(buffer, mimeType)) {
      throw new Error(generatedImageDownloadError(buffer, '图像服务返回的结果不是有效图片'));
    }

    return writeGeneratedImage(buffer, extension);
  }

  if (!/^https?:\/\//i.test(normalizedSource)) {
    return normalizedSource;
  }

  const { buffer, contentType } = await downloadGeneratedImage(normalizedSource);
  const extension = contentType.startsWith('image/')
    ? fileExtensionFromMimeType(contentType.split(';')[0])
    : fileExtensionFromUrl(normalizedSource);
  return writeGeneratedImage(buffer, extension);
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

  for (const item of referenceImages.slice(0, MAX_REFERENCE_IMAGE_COUNT)) {
    const data = normalizeString(item.data);
    if (!data.startsWith('data:image/')) continue;

    const base64 = data.split(',').pop() || '';
    if (!base64) continue;

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error('Each reference image must be 10 MB or smaller');
    }
    if (!isValidImageBuffer(buffer, item.mimeType)) {
      throw new Error('Reference image data is not a valid supported image');
    }

    const extension = fileExtensionFromMimeType(item.mimeType);
    const fileName = `temp-reference-${Date.now()}-${randomHex(3)}.${extension}`;
    const target = path.join(REFERENCES_DIR, fileName);
    await fs.writeFile(target, buffer);
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

function asPlainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizePublicReferenceImages(value: unknown) {
  const rawReferenceImages = Array.isArray(value) ? value : [];
  return rawReferenceImages
    .map((item: unknown) => {
      if (typeof item === 'string') return item;
      const record = asPlainObject(item);
      return (
        normalizeString(record.data) ||
        normalizeString(record.url) ||
        normalizeString(record.file_uri) ||
        normalizeString(record.fileUri)
      );
    })
    .filter(isReferenceImageInput);
}

function isReferenceImageInput(value: string) {
  return /^https?:\/\//i.test(value) || /^data:image\//i.test(value);
}

function normalizeGeminiReferenceImages(value: unknown) {
  const rawReferenceImages = Array.isArray(value) ? value : [];
  return rawReferenceImages
    .map((item: unknown) => {
      if (typeof item === 'string') return item;
      const record = asPlainObject(item);
      return (
        normalizeString(record.data) ||
        normalizeString(record.url) ||
        normalizeString(record.file_uri) ||
        normalizeString(record.fileUri)
      );
    })
    .filter(isReferenceImageInput);
}

function extractGeminiTextParts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => extractGeminiTextParts(item));

  const record = asPlainObject(value);
  const directText =
    normalizeString(record.text) ||
    normalizeString(record.prompt) ||
    normalizeString(record.message) ||
    (typeof record.content === 'string' ? normalizeString(record.content) : '');
  const current = directText ? [directText] : [];
  const parts = Array.isArray(record.parts) ? extractGeminiTextParts(record.parts) : [];
  const contents = Array.isArray(record.contents) ? extractGeminiTextParts(record.contents) : [];
  const content = record.content && typeof record.content !== 'string' ? extractGeminiTextParts(record.content) : [];
  return [...current, ...parts, ...contents, ...content];
}

function stripGeminiTransportParameters(value: string) {
  return value
    .replace(
      /\s*\[\s*(?:(?:分辨率|比例)\s*:\s*[^,\]]+\s*)(?:,\s*(?:分辨率|比例)\s*:\s*[^,\]]+\s*)?\]\s*$/i,
      '',
    )
    .trim();
}

function extractGeminiReferenceImages(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => extractGeminiReferenceImages(item));

  const record = asPlainObject(value);
  const inlineData = asPlainObject(record.inline_data || record.inlineData);
  const fileData = asPlainObject(record.file_data || record.fileData);
  const fileUri = normalizeString(fileData.file_uri || fileData.fileUri);
  const mimeType = normalizeString(inlineData.mime_type || inlineData.mimeType);
  const inlineBase64 = normalizeString(inlineData.data);
  const inlineImage = mimeType.startsWith('image/') && inlineBase64 ? `data:${mimeType};base64,${inlineBase64}` : '';
  const parts = Array.isArray(record.parts) ? extractGeminiReferenceImages(record.parts) : [];
  const contents = Array.isArray(record.contents) ? extractGeminiReferenceImages(record.contents) : [];
  const content = record.content ? extractGeminiReferenceImages(record.content) : [];
  return [fileUri, inlineImage, ...parts, ...contents, ...content].filter(isReferenceImageInput);
}

function toReferenceUploadInputs(dataUrls: string[]): ReferenceUploadInput[] {
  return dataUrls
    .map((data, index) => {
      const match = data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
      const mimeType = match?.[1] || '';
      if (!mimeType) return null;
      return {
        name: `gemini-reference-${index}.${fileExtensionFromMimeType(mimeType)}`,
        mimeType,
        data,
      };
    })
    .filter((item): item is ReferenceUploadInput => Boolean(item));
}

function parseGeminiModelAction(value: string) {
  const normalized = normalizeString(value);
  const [model, action = 'generateContent'] = normalized.split(':');
  return {
    model: model || 'nano-banana-pro',
    action,
  };
}

function mimeTypeFromImagePath(value: string) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized.includes('.jpg') || normalized.includes('.jpeg')) return 'image/jpeg';
  if (normalized.includes('.webp')) return 'image/webp';
  if (normalized.includes('.gif')) return 'image/gif';
  if (normalized.includes('.svg')) return 'image/svg+xml';
  return 'image/png';
}

async function readImageAsBase64(req: Request, imagePath: string) {
  const publicUrl = toPublicAssetUrl(req, imagePath) || imagePath;
  let buffer: Buffer | null = null;
  let mimeType = mimeTypeFromImagePath(publicUrl);

  try {
    const parsed = new URL(publicUrl);
    const localPath = path.resolve(ROOT_DIR, decodeURIComponent(parsed.pathname).replace(/^\/+/, ''));
    if (localPath.startsWith(UPLOADS_DIR)) {
      buffer = await fs.readFile(localPath);
    }
  } catch {
    const localPath = path.resolve(ROOT_DIR, imagePath.replace(/^\/+/, ''));
    if (localPath.startsWith(UPLOADS_DIR)) {
      buffer = await fs.readFile(localPath).catch(() => null);
    }
  }

  if (!buffer && /^https?:\/\//i.test(publicUrl)) {
    const response = await fetch(publicUrl);
    if (response.ok) {
      const contentType = normalizeString(response.headers.get('content-type')).split(';')[0];
      if (contentType.startsWith('image/')) mimeType = contentType;
      buffer = Buffer.from(await response.arrayBuffer());
    }
  }

  if (!buffer) return null;
  return {
    mimeType,
    data: buffer.toString('base64'),
  };
}

async function toGeminiGenerateContentResponse(req: Request, result: PublicGenerateResult) {
  const imageUrl = result.image.imagePath;
  const inlineImage = await readImageAsBase64(req, imageUrl).catch(() => null);
  const parts: Array<Record<string, unknown>> = [
    {
      text: JSON.stringify({
        imagePath: imageUrl,
        usage: result.usage,
      }),
    },
  ];

  if (inlineImage) {
    parts.push({
      inline_data: {
        mime_type: inlineImage.mimeType,
        data: inlineImage.data,
      },
      inlineData: {
        mimeType: inlineImage.mimeType,
        data: inlineImage.data,
      },
    });
  }

  return {
    candidates: [
      {
        content: {
          role: 'model',
          parts,
        },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    pixory: {
      image: result.image,
      usage: result.usage,
    },
  };
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
      void (async () => {
        const db = await getSupabaseDb();
        await db.ensureRuntimeSchema();
        await runUnifiedCreditMigrationSupabase();
      })().catch((schemaError) => {
        console.error('Supabase schema initialization failed (server remains available):', schemaError);
      });
    }
  } else if (!IS_VERCEL) {
    // SQLite 浠呭湪鎸佷箙鍖栨枃浠剁郴缁熺幆澧冧笅鍒濆鍖?    // await restoreSqliteFromSupabase();
    await ensureRuntimeSchema();
  } else if (IS_VERCEL) {
    throw new Error('SQLite persistence is not supported in the Vercel serverless runtime.');
  }

  const visionaryDocSyncStore = {
    get: async (key: string, fallback: string) => {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        return db.getSetting(key, fallback);
      }
      return withWriteDb((db) => {
        ensureSchema(db);
        return getSetting(db, key, fallback);
      });
    },
    set: async (key: string, value: string) => {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        await db.setSetting(key, value);
        return;
      }
      await withWriteDb((db) => {
        ensureSchema(db);
        setSetting(db, key, value);
      });
    },
  };
  const notificationService = createNotificationService(visionaryDocSyncStore);
  providerRouting = createProviderRouting({
    store: visionaryDocSyncStore,
    defaults: DEFAULT_PROVIDER_ROUTING,
  });
  providerMetrics = createProviderMetrics({
    store: visionaryDocSyncStore,
    timeZone: ADMIN_STATS_TIME_ZONE,
  });
  providerRiskMonitor = createProviderRiskMonitor({
    store: visionaryDocSyncStore,
    timeZone: ADMIN_STATS_TIME_ZONE,
  });
  imageProviderRouter = createImageProviderRouter({
    baseUrl: JUNLIAI_PRIMARY_ENABLED ? JUNLIAI_BASE_URL : '',
    authorization: JUNLIAI_API_KEY,
    primaryModel: JUNLIAI_MODEL,
    primaryModels: {
      'gpt-image-2': JUNLIAI_MODEL,
      Nano_Banana_Pro: 'nano-banana-pro',
    },
    primaryModelChains: {
      'gpt-image-2': [JUNLIAI_GPT_IMAGE_2_STANDARD_MODEL, JUNLIAI_MODEL],
      Nano_Banana_Pro: ['nano-banana-pro', 'nano-banana-2'],
    },
    primaryModelCapabilities: {
      [JUNLIAI_GPT_IMAGE_2_STANDARD_MODEL]: {
        imageSizes: ['STANDARD', '1K'],
        ratios: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4'],
        maxImages: 6,
      },
      [JUNLIAI_MODEL]: {
        imageSizes: ['STANDARD', '1K', '2K', '4K'],
        ratios: ['auto', '1:1', '5:4', '9:16', '21:9', '16:9', '4:3', '3:2', '4:5', '3:4', '2:3'],
        maxImages: 6,
      },
    },
    isPrimaryEnabled: async (input) => {
      const routing = await providerRouting!.get();
      const resolution = routingResolution(input.imageSize);
      return input.modelId === 'Nano_Banana_Pro'
        ? isProviderEnabled(routing.bananaRoutes[resolution], 'junliai')
          || isProviderEnabled(routing.bananaRoutes[resolution], 'junliai-nano-banana-2')
        : isProviderEnabled(routing.image2Routes[resolution], 'junliai-economy')
          || isProviderEnabled(routing.image2Routes[resolution], 'junliai-firefly');
    },
    isPrimaryModelEnabled: async (input, upstreamModel) => {
      const routing = await providerRouting!.get();
      const resolution = routingResolution(input.imageSize);
      if (input.modelId === 'Nano_Banana_Pro') {
        return upstreamModel === 'nano-banana-2'
          ? isProviderEnabled(routing.bananaRoutes[resolution], 'junliai-nano-banana-2')
          : isProviderEnabled(routing.bananaRoutes[resolution], 'junliai');
      }
      return upstreamModel === JUNLIAI_GPT_IMAGE_2_STANDARD_MODEL
        ? isProviderEnabled(routing.image2Routes[resolution], 'junliai-economy')
        : isProviderEnabled(routing.image2Routes[resolution], 'junliai-firefly');
    },
    timeoutMs: JUNLIAI_TIMEOUT_MS,
    failureThreshold: JUNLIAI_FAILURE_THRESHOLD,
    transientCooldownMs: JUNLIAI_TRANSIENT_COOLDOWN_MS,
    quotaCooldownMs: JUNLIAI_QUOTA_COOLDOWN_MS,
    authCooldownMs: JUNLIAI_AUTH_COOLDOWN_MS,
    store: {
      get: async (upstreamModel = JUNLIAI_MODEL) => {
        const raw = await visionaryDocSyncStore.get(
          `${JUNLIAI_CIRCUIT_SETTING_KEY}:${upstreamModel}`,
          '',
        );
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      },
      set: (state, upstreamModel = JUNLIAI_MODEL) => visionaryDocSyncStore.set(
        `${JUNLIAI_CIRCUIT_SETTING_KEY}:${upstreamModel}`,
        JSON.stringify(state),
      ),
    },
    fallback: callVisionaryGeneration,
    onAttempt: async (attempt) => {
      const requestId = await recordGenerationRequest(attempt);
      if (attempt.success && requestId && attempt.requestContext) {
        attempt.requestContext.successfulRequestId = requestId;
      }
      await Promise.all([
        providerMetrics?.record(attempt),
        providerRiskMonitor?.record(attempt),
      ]);
    },
  });
  if (USE_SUPABASE && !IS_VERCEL) {
    startBusinessDataBackupScheduler();
  }

  const app = express();
  app.set('trust proxy', 'loopback');
  const hasDistBuild = !IS_VERCEL && (await pathExists(path.join(DIST_DIR, 'index.html')));
  let invitePopupClaimQueue: Promise<unknown> = Promise.resolve();

  app.use((req, res, next) => {
    const originHeader = req.headers.origin;
    if (originHeader && isAllowedOrigin(originHeader)) {
      res.setHeader('Access-Control-Allow-Origin', originHeader);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key, Idempotency-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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

  app.use(express.json({ limit: '100mb' }));

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

  app.get('/api/ready', async (_req, res) => {
    try {
      if (USE_SUPABASE) {
        await (await getSupabaseDb()).checkConnection();
      } else {
        await withReadDb((db) => {
          ensureSchema(db);
          db.exec('SELECT 1');
        });
      }
      res.json({ ok: true, databaseProvider: DATABASE_PROVIDER });
    } catch (error) {
      console.error('[ready] database check failed:', error);
      res.status(503).json({ ok: false, databaseProvider: DATABASE_PROVIDER });
    }
  });

  app.get('/api/notifications', requireAuth, async (req, res) => {
    try {
      res.json(await notificationService.listForUser(req.authUser!.userId));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '获取通知失败' });
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
    try {
      await notificationService.markAllRead(req.authUser!.userId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '更新通知失败' });
    }
  });

  app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
    try {
      await notificationService.mark(req.authUser!.userId, String(req.params.id), 'readIds');
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '更新通知失败' });
    }
  });

  app.post('/api/notifications/:id/popup-shown', requireAuth, async (req, res) => {
    try {
      await notificationService.markPopupShownAndAllRead(req.authUser!.userId, String(req.params.id));
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '更新通知失败' });
    }
  });

  app.get('/api/admin/notifications', requireAuth, requireAdmin, async (_req, res) => {
    try {
      res.json(await notificationService.listAdmin());
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '获取通知失败' });
    }
  });

  app.post('/api/admin/notifications', requireAuth, requireAdmin, async (req, res) => {
    try {
      const notification = await notificationService.create(req.body || {}, req.authUser!.username);
      res.status(201).json({ notification });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : '创建通知失败' });
    }
  });

  app.put('/api/admin/notifications/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const notification = await notificationService.update(String(req.params.id), req.body || {});
      if (!notification) {
        res.status(404).json({ error: '通知不存在' });
        return;
      }
      res.json({ notification });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : '更新通知失败' });
    }
  });

  app.post('/api/admin/notifications/:id/publish', requireAuth, requireAdmin, async (req, res) => {
    try {
      const notification = await notificationService.setStatus(String(req.params.id), 'published');
      if (!notification) {
        res.status(404).json({ error: '通知不存在' });
        return;
      }
      res.json({ notification });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : '发布通知失败' });
    }
  });

  app.post('/api/admin/notifications/:id/archive', requireAuth, requireAdmin, async (req, res) => {
    try {
      const notification = await notificationService.setStatus(String(req.params.id), 'archived');
      if (!notification) {
        res.status(404).json({ error: '通知不存在' });
        return;
      }
      res.json({ notification });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : '归档通知失败' });
    }
  });

  app.delete('/api/admin/notifications/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const removed = await notificationService.remove(String(req.params.id));
      if (!removed) {
        res.status(404).json({ error: '通知不存在' });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '删除通知失败' });
    }
  });

  app.post('/api/ui/invite-popup/claim', async (req, res) => {
    const clientIp = normalizeString(req.ip || req.socket.remoteAddress).replace(/^::ffff:/, '');
    if (!clientIp) {
      res.json({ shouldShow: false });
      return;
    }
    const settingKey = `${INVITE_POPUP_IP_SETTING_PREFIX}${sha256Digest(clientIp).slice(0, 40)}`;
    const claim = async () => {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        const existing = await db.getSetting(settingKey, '');
        if (existing) return false;
        await db.setSetting(settingKey, nowIso());
        return true;
      }
      return withWriteDb((db) => {
        ensureSchema(db);
        if (getSetting(db, settingKey, '')) return false;
        setSetting(db, settingKey, nowIso());
        return true;
      });
    };
    const result = invitePopupClaimQueue.then(claim, claim);
    invitePopupClaimQueue = result.then(() => undefined, () => undefined);
    try {
      res.json({ shouldShow: await result });
    } catch (error) {
      console.error('[invite-popup] claim failed:', error);
      res.json({ shouldShow: false });
    }
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
          token: await issueExclusiveToken(authUser),
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
        return { authUser: { userId: externalUserId, username } };
      });

      if (!result) {
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      res.status(201).json({
        token: await issueExclusiveToken(result.authUser),
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

        const [matches, credits] = await Promise.all([
          bcrypt.compare(password, record.password_hash),
          db.getUserCredits(record.id),
        ]);
        if (!matches) {
          res.status(401).json({ error: 'Invalid username or password' });
          return;
        }

        const authUser = { userId: record.id, username: record.username };
        const token = await issueExclusiveToken(authUser);
        void db.ensureUserCredits(record.id, record.username, 0).catch((error) => {
          console.error('[auth] background credit maintenance failed:', error);
        });

        res.json({
          token,
          user: {
            ...toPublicUser(authUser),
            creditsRemaining: credits.remainingCredits,
          },
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
        token: await issueExclusiveToken({ userId: user.id, username: user.username }),
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
          token: await issueExclusiveToken(authUser),
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
        token: await issueExclusiveToken({ userId: inviteUser.id, username: inviteUser.username }),
        user: await getPublicUser({ userId: inviteUser.id, username: inviteUser.username }),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Invite login failed' });
    }
  });

  // 鈹€鈹€鈹€ 鑾峰彇褰撳墠鐢ㄦ埛 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  let inviteRedemptionQueue: Promise<unknown> = Promise.resolve();
  const withInviteRedemptionLock = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = inviteRedemptionQueue.then(operation, operation);
    inviteRedemptionQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  app.post('/api/user/redeem-invite', requireAuth, async (req, res) => {
    if (isInviteLoginUser(req.authUser!)) {
      res.status(403).json({ error: '邀请码登录账号不能再次兑换邀请码' });
      return;
    }

    const inviteCode = normalizeString(req.body?.code).toUpperCase();
    if (!inviteCode) {
      res.status(400).json({ error: '请输入邀请码' });
      return;
    }

    try {
      const redeemedCredits = await withInviteRedemptionLock(async () => {
        if (USE_SUPABASE) {
          const db = await getSupabaseDb();
          return db.claimInviteCodeForUser(
            inviteCode,
            req.authUser!.userId,
            req.authUser!.username,
          );
        }

        return withWriteDb((db) => {
          ensureSchema(db);
          db.run('BEGIN TRANSACTION');
          try {
            const invite = getOne<Record<string, unknown>>(
              db,
              'SELECT code, credits, redeemed_by FROM invite_codes WHERE code = ?',
              [inviteCode],
            );
            const credits = getInviteRedemptionCredits(invite);

            ensureUserCredits(db, req.authUser!.userId, req.authUser!.username, 0);
            adjustUserTotalCredits(db, req.authUser!.userId, credits);
            db.run(
              'UPDATE invite_codes SET credits = 0, redeemed_by = ?, redeemed_at = ?, low_balance_since = NULL WHERE code = ? AND (redeemed_by IS NULL OR redeemed_by = "") AND credits = ?',
              [req.authUser!.userId, nowIso(), inviteCode, credits],
            );
            db.run('COMMIT');
            return credits;
          } catch (error) {
            db.run('ROLLBACK');
            throw error;
          }
        });
      });

      res.json({
        redeemedCredits,
        user: await getPublicUser(req.authUser!),
      });
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : '';
      if (errorCode === INVITE_REDEMPTION_ERRORS.notFound) {
        res.status(404).json({ error: '邀请码不存在' });
        return;
      }
      if (errorCode === INVITE_REDEMPTION_ERRORS.alreadyRedeemed) {
        res.status(409).json({ error: '该邀请码已经兑换，不能重复使用' });
        return;
      }
      if (errorCode === INVITE_REDEMPTION_ERRORS.noCredits) {
        res.status(409).json({ error: '该邀请码没有可兑换积分' });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : '兑换邀请码失败' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
      res.json({ user: await getPublicUser(req.authUser!) });
    } catch (error) {
      console.error('[auth] load current user failed:', error);
      res.status(503).json({ code: 'AUTH_PROFILE_UNAVAILABLE', error: 'User profile is temporarily unavailable' });
    }
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

  app.post('/api/user/promo-coupon/claim', requireAuth, async (req, res) => {
    try {
      const coupon = await claimPromoCoupon(req.authUser!);
      if (!coupon.active || !coupon.redemptionCode) {
        res.status(409).json({ error: '优惠券已失效，请刷新后重试' });
        return;
      }
      res.json({ coupon });
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : '优惠券领取失败，请稍后再试' });
    }
  });

  app.get('/api/models', requireAuth, async (_req, res) => {
    res.json({
      models,
      gptImagePricing: getActiveGptImagePricing(),
      providerRouting: await providerRouting!.get(),
    });
  });

  app.get('/api/chat/conversations', requireAuth, async (req, res) => {
    try {
      res.json({ conversations: await loadChatConversations(req.authUser!.userId), models: CHAT_MODELS });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '会话加载失败' });
    }
  });

  app.get('/api/chat/memory', requireAuth, async (req, res) => {
    try {
      res.json({ memory: await loadChatMemory(req.authUser!.userId) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '长期记忆加载失败' });
    }
  });

  app.put('/api/chat/memory', requireAuth, async (req, res) => {
    try {
      const memory = await loadChatMemory(req.authUser!.userId);
      memory.enabled = req.body?.enabled !== false;
      await saveChatMemory(req.authUser!.userId, memory);
      res.json({ memory });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '长期记忆设置失败' });
    }
  });

  app.post('/api/chat/memory/items', requireAuth, async (req, res) => {
    const content = normalizeString(req.body?.content).slice(0, 500);
    if (!content) {
      res.status(400).json({ error: '记忆内容不能为空' });
      return;
    }
    try {
      const memory = await loadChatMemory(req.authUser!.userId);
      if (memory.items.length >= 30) {
        res.status(400).json({ error: '最多保存 30 条长期记忆' });
        return;
      }
      memory.items.unshift({ id: crypto.randomUUID(), content, createdAt: nowIso() });
      await saveChatMemory(req.authUser!.userId, memory);
      res.status(201).json({ memory });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '添加长期记忆失败' });
    }
  });

  app.delete('/api/chat/memory/items/:id', requireAuth, async (req, res) => {
    try {
      const memory = await loadChatMemory(req.authUser!.userId);
      memory.items = memory.items.filter((item) => item.id !== normalizeString(req.params.id));
      await saveChatMemory(req.authUser!.userId, memory);
      res.json({ memory });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '删除长期记忆失败' });
    }
  });

  app.post('/api/chat/conversations', requireAuth, async (req, res) => {
    try {
      const createdAt = nowIso();
      const conversation: ChatConversation = { id: crypto.randomUUID(), title: '新对话', model: CHAT_MODEL, messages: [], createdAt, updatedAt: createdAt };
      const conversations = await loadChatConversations(req.authUser!.userId);
      await saveChatConversations(req.authUser!.userId, [conversation, ...conversations]);
      res.status(201).json({ conversation });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '新建会话失败' });
    }
  });

  app.delete('/api/chat/conversations/:id', requireAuth, async (req, res) => {
    try {
      const id = normalizeString(req.params.id);
      const conversations = await loadChatConversations(req.authUser!.userId);
      if (!conversations.some((item) => item.id === id)) {
        res.status(404).json({ error: '会话不存在' });
        return;
      }
      await saveChatConversations(req.authUser!.userId, conversations.filter((item) => item.id !== id));
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '删除会话失败' });
    }
  });

  app.post('/api/chat/conversations/:id/messages', requireAuth, async (req, res) => {
    const content = normalizeString(req.body?.content).slice(0, 8000);
    const model = normalizeString(req.body?.model);
    if (!content) {
      res.status(400).json({ error: '消息内容不能为空' });
      return;
    }
    if (model !== CHAT_MODEL) {
      res.status(400).json({ error: `不支持的对话模型：${model || '(empty)'}` });
      return;
    }
    if (!GEMINI_API_KEY) {
      res.status(503).json({ error: '对话模型尚未配置，请先设置 GEMINI_API_KEY' });
      return;
    }
    let creditsReserved = false;
    try {
      const conversations = await loadChatConversations(req.authUser!.userId);
      const conversation = conversations.find((item) => item.id === normalizeString(req.params.id));
      if (!conversation) {
        res.status(404).json({ error: '会话不存在' });
        return;
      }
      const creditsRemaining = await reserveChatCredits(req.authUser!);
      if (creditsRemaining === null) {
        res.status(402).json({ error: `当前正式积分不足，本次对话需要 ${CHAT_MESSAGE_CREDITS} 积分。`, requiredCredits: CHAT_MESSAGE_CREDITS });
        return;
      }
      creditsReserved = true;
      const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content, createdAt: nowIso() };
      const history = [...conversation.messages, userMessage].slice(-40);
      const memory = await loadChatMemory(req.authUser!.userId);
      const rememberedContent = content.match(/^记住[：:]\s*(.+)$/s)?.[1]?.trim().slice(0, 500);
      if (rememberedContent && !memory.items.some((item) => item.content === rememberedContent) && memory.items.length < 30) {
        memory.items.unshift({ id: crypto.randomUUID(), content: rememberedContent, createdAt: nowIso() });
        await saveChatMemory(req.authUser!.userId, memory);
      }
      const memoryInstruction = memory.enabled && memory.items.length
        ? `\n用户的长期记忆：\n${memory.items.map((item) => `- ${item.content}`).join('\n')}\n仅在与当前问题有关时自然地使用这些信息。`
        : '';
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: CHAT_MODEL,
        contents: history.map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
        config: {
          systemInstruction: `你是 PIXORY-CHAT，一名可靠、清晰且富有创意的中文 AI 助手。优先直接回答用户问题；涉及图像创作时，给出可直接使用的高质量提示词。${memoryInstruction}`,
          maxOutputTokens: 4096,
        },
      });
      const answer = normalizeString(response.text);
      if (!answer) throw new Error('模型未返回有效内容');
      const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: answer, createdAt: nowIso() };
      conversation.messages = [...conversation.messages, userMessage, assistantMessage].slice(-CHAT_MAX_MESSAGES);
      conversation.title = conversation.messages.find((message) => message.role === 'user')?.content.slice(0, 24) || '新对话';
      conversation.updatedAt = assistantMessage.createdAt;
      await saveChatConversations(req.authUser!.userId, [conversation, ...conversations.filter((item) => item.id !== conversation.id)]);
      res.json({ conversation, creditsUsed: CHAT_MESSAGE_CREDITS, creditsRemaining });
    } catch (error) {
      if (creditsReserved) {
        await refundChatCredits(req.authUser!.userId).catch((refundError) => console.error('[chat-credit-refund]', refundError));
      }
      const message = error instanceof Error ? error.message : '消息发送失败';
      const lowerMessage = message.toLowerCase();
      const publicMessage = lowerMessage.includes('permission_denied') || lowerMessage.includes('denied access')
        ? 'Gemini 服务项目当前无权访问该模型，请联系管理员检查 API Key 或项目权限。失败请求不会扣除积分。'
        : lowerMessage.includes('api key') || lowerMessage.includes('api_key')
          ? 'Gemini 服务密钥无效或不可用，请联系管理员。失败请求不会扣除积分。'
          : lowerMessage.includes('resource_exhausted') || lowerMessage.includes('rate limit') || lowerMessage.includes('quota')
            ? 'Gemini 服务当前额度或请求频率已达上限，请稍后重试。失败请求不会扣除积分。'
            : 'Gemini 服务暂时不可用，请稍后重试。失败请求不会扣除积分。';
      console.error('[chat-generation]', message);
      res.status(502).json({ error: publicMessage });
    }
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
      .map((item: unknown) => {
        if (typeof item === 'string') return item;
        const record = asPlainObject(item);
        return normalizeString(record.data || record.url || record.file_uri || record.fileUri);
      })
      .filter(isReferenceImageInput);

    if (!apiKey) {
      res.status(401).json({ error: 'X-API-Key is required' });
      return;
    }

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }
    const dedicatedPolicy = dedicatedJunliBananaPolicy(
      hashPublicApiKey(apiKey),
      requestedImageSize,
      optimizeChineseText,
    );
    const modelId = dedicatedPolicy?.modelId || normalizePublicModelId(model);
    if (!modelId) {
      res.status(400).json({
        error: `Unsupported model: ${model || '(empty)'}`,
        supportedModels: ['gpt-image-2', 'nano-banana-pro'],
      });
      return;
    }

    let reservedKey: PublicApiKeyRecord | null = null;
    let creditsUsed = 0;

    try {
      const ratio = normalizeRatio(dimensions, modelId);
      const modelName = modelNameFromId(modelId);
      const imageSize = dedicatedPolicy
        ? dedicatedPolicy.imageSize
        : await normalizeRoutedImageSize(requestedImageSize, modelId);
      const quality = modelId === 'gpt-image-2' ? normalizeGptQuality(requestedQuality, imageSize) : '';
      const effectiveOptimizeChineseText = shouldEnhanceNanoBanana(modelId, imageSize, optimizeChineseText);
      creditsUsed = dedicatedPolicy
        ? dedicatedPolicy.credits
        : getModelCredits(modelId, imageSize, quality)
          + getNanoBananaEnhancementCredits(modelId, imageSize, effectiveOptimizeChineseText);
      reservedKey = await reservePublicApiKeyCredits(apiKey, creditsUsed);

      const createdAt = nowIso();
      const apiRequestStartedAt = Date.now();
      const requestContext: { userId: string; username: string; creditsUsed: number; successfulRequestId?: string } = {
        userId: `api-key:${reservedKey.id}`,
        username: `api-${reservedKey.name}`.slice(0, 80),
        creditsUsed,
      };
      const generatedImageSource = await callImageGeneration({
        prompt,
        modelId,
        ratio,
        imageSize,
        quality,
        optimizeChineseText: effectiveOptimizeChineseText,
        providerRouting: dedicatedPolicy?.providerRouting,
        images: Array.from(new Set(referenceImages)),
        requestContext,
      });
      const apiRequestMs = Math.max(0, Date.now() - apiRequestStartedAt);
      const imagePath = await persistGeneratedImage(generatedImageSource);
      await updateGenerationRequestImage(requestContext.successfulRequestId, imagePath);
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
          apiRequestMs,
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
                api_request_ms,
                reference_images,
                created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              apiRequestMs,
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

      console.error('[public-generate]', error);
      const message = error instanceof Error ? error.message : 'Generate failed';
      const status = message.includes('无效') || message.includes('停用') ? 401 : message.includes('额度不足') ? 402 : 500;
      res.status(status).json({ error: message });
    }
  };

  const geminiGenerateContentHandler = async (req: Request, res: Response) => {
    const { model, action } = parseGeminiModelAction(req.params.modelAction);
    if (action !== 'generateContent') {
      res.status(404).json({ error: `Unsupported Gemini action: ${action}` });
      return;
    }

    const geminiApiKey =
      normalizeString(req.query.key) ||
      normalizeString(req.headers['x-goog-api-key']) ||
      normalizeString(asPlainObject(req.body).api_key);
    if (geminiApiKey && !req.headers.authorization && !req.headers['x-api-key']) {
      req.headers.authorization = `Bearer ${geminiApiKey}`;
    }

    const rawPrompt =
      normalizeString(req.body?.prompt || req.body?.text || req.body?.message) ||
      extractGeminiTextParts(req.body).join('\n\n').trim();
    const prompt = stripGeminiTransportParameters(rawPrompt);
    const requestBody = asPlainObject(req.body);
    const generationConfig = asPlainObject(requestBody.generationConfig || requestBody.generation_config);
    const imageConfig = asPlainObject(generationConfig.imageConfig || generationConfig.image_config);
    const rawReferenceImages = Array.from(
      new Set([
        ...normalizeGeminiReferenceImages(req.body?.images),
        ...normalizeGeminiReferenceImages(req.body?.reference_images),
        ...extractGeminiReferenceImages(req.body),
      ]),
    );
    const referenceImages = rawReferenceImages.filter(isReferenceImageInput);
    const dimensions = normalizeString(
      requestBody.dimensions ||
      requestBody.aspectRatio ||
      requestBody.aspect_ratio ||
      imageConfig.aspectRatio ||
      imageConfig.aspect_ratio,
    ) || '1:1';
    const imageSize = normalizeString(
      requestBody.imageSize ||
      requestBody.image_size ||
      imageConfig.imageSize ||
      imageConfig.image_size,
    );
    req.body = {
      ...requestBody,
      prompt,
      model,
      dimensions,
      aspectRatio: dimensions,
      imageSize,
      images: referenceImages,
      reference_images: referenceImages,
    };

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const payload = asPlainObject(body);
      const image = asPlainObject(payload.image);
      if (normalizeString(image.imagePath)) {
        void toGeminiGenerateContentResponse(req, body as PublicGenerateResult)
          .then((geminiBody) => originalJson(geminiBody))
          .catch(() => originalJson(body));
        return res;
      }

      return originalJson(body);
    }) as Response['json'];

    await publicGenerateHandler(req, res);
  };

  const comfyuiGeminiHandler = async (req: Request, res: Response) => {
    const { action } = parseGeminiModelAction(req.params.modelAction);
    if (action !== 'generateContent') {
      res.status(404).json({ error: `Unsupported Gemini action: ${action}` });
      return;
    }

    const geminiApiKey =
      normalizeString(req.query.key) ||
      normalizeString(req.headers['x-goog-api-key']) ||
      normalizeString(asPlainObject(req.body).api_key);
    if (geminiApiKey && !req.headers.authorization && !req.headers['x-api-key']) {
      req.headers.authorization = `Bearer ${geminiApiKey}`;
    }

    const rawPrompt =
      normalizeString(req.body?.prompt || req.body?.text || req.body?.message) ||
      extractGeminiTextParts(req.body).join('\n\n').trim();
    const prompt = stripGeminiTransportParameters(rawPrompt);
    const requestBody = asPlainObject(req.body);
    const generationConfig = asPlainObject(requestBody.generationConfig || requestBody.generation_config);
    const imageConfig = asPlainObject(generationConfig.imageConfig || generationConfig.image_config);
    const rawReferenceImages = Array.from(
      new Set([
        ...normalizeGeminiReferenceImages(req.body?.images),
        ...normalizeGeminiReferenceImages(req.body?.reference_images),
        ...extractGeminiReferenceImages(req.body),
      ]),
    );
    const referenceImages = rawReferenceImages.filter(isReferenceImageInput);
    const dimensions = normalizeString(
      requestBody.dimensions ||
      requestBody.aspectRatio ||
      requestBody.aspect_ratio ||
      imageConfig.aspectRatio ||
      imageConfig.aspect_ratio,
    ) || '1:1';
    const imageSize = normalizeString(
      requestBody.imageSize ||
      requestBody.image_size ||
      imageConfig.imageSize ||
      imageConfig.image_size,
    );

    // Force model to Nano_Banana_Pro for ComfyUI plugin compatibility
    req.body = {
      ...requestBody,
      prompt,
      model: 'Nano_Banana_Pro',
      dimensions,
      aspectRatio: dimensions,
      imageSize,
      images: referenceImages,
      reference_images: referenceImages,
    };

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const payload = asPlainObject(body);
      const image = asPlainObject(payload.image);
      if (normalizeString(image.imagePath)) {
        void toGeminiGenerateContentResponse(req, body as PublicGenerateResult)
          .then((geminiBody) => originalJson(geminiBody))
          .catch(() => originalJson(body));
        return res;
      }
      return originalJson(body);
    }) as Response['json'];

    await publicGenerateHandler(req, res);
  };

  const openAiImagesGenerationHandler = async (req: Request, res: Response) => {
    const requestBody = asPlainObject(req.body);
    const requestedN = Math.max(1, Number(requestBody.n || 1));
    if (requestedN !== 1) {
      res.status(400).json({ error: { message: 'This endpoint currently supports n=1', type: 'invalid_request_error' } });
      return;
    }
    const size = normalizeString(requestBody.size);
    const ratioBySize: Record<string, string> = {
      '1024x1024': '1:1',
      '1536x1024': '3:2',
      '1024x1536': '2:3',
    };
    req.body = {
      ...requestBody,
      model: normalizeString(requestBody.model) || 'gpt-image-2',
      dimensions:
        normalizeString(requestBody.dimensions || requestBody.aspect_ratio || requestBody.aspectRatio) ||
        ratioBySize[size] ||
        '1:1',
      imageSize: normalizeString(requestBody.imageSize || requestBody.image_size) || 'STANDARD',
    };

    const responseFormat = normalizeString(requestBody.response_format).toLowerCase() || 'url';
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const payload = asPlainObject(body);
      const image = asPlainObject(payload.image);
      const imageUrl = normalizeString(image.imagePath);
      if (!imageUrl) {
        const message = normalizeString(payload.error) || 'Image generation failed';
        return originalJson({ error: { message, type: 'image_generation_error' } });
      }
      if (responseFormat !== 'b64_json') {
        return originalJson({
          created: Math.floor(Date.now() / 1000),
          data: [{ url: imageUrl, revised_prompt: normalizeString(image.prompt) || normalizeString(requestBody.prompt) }],
        });
      }

      void (async () => {
        const pathname = /^https?:\/\//i.test(imageUrl) ? new URL(imageUrl).pathname : imageUrl;
        const localPath = path.resolve(ROOT_DIR, pathname.replace(/^\/+/, ''));
        if (!localPath.startsWith(GENERATED_DIR)) {
          throw new Error('Generated image path is outside the image directory');
        }
        const buffer = await fs.readFile(localPath);
        originalJson({
          created: Math.floor(Date.now() / 1000),
          data: [{ b64_json: buffer.toString('base64'), revised_prompt: normalizeString(image.prompt) || normalizeString(requestBody.prompt) }],
        });
      })().catch((error) => {
        console.error('[openai-images-response]', error);
        if (!res.headersSent) {
          res.status(500);
          originalJson({ error: { message: 'Failed to encode generated image', type: 'server_error' } });
        }
      });
      return res;
    }) as Response['json'];

    await publicGenerateHandler(req, res);
  };

  const legacyPublicImageApiRemovedHandler = (_req: Request, res: Response) => {
    res.status(410).json({
      error: 'Legacy sync image generation endpoints are no longer supported. Use POST /v1/async/images/generations, then poll GET /v1/async/images/generations/:id.',
      endpoint: '/v1/async/images/generations',
      statusEndpoint: '/v1/async/images/generations/:id',
    });
  };

  [
    '/api/v1/generate',
    '/v1/api/generate',
    '/openapi/v1/images/generations',
    '/v1/chat/completions',
    '/v1/api/nano-banana',
    '/v1beta/models/:modelAction',
    '/v1/api/nano-banana/v1beta/models/:modelAction',
  ].forEach((path) => app.post(path, legacyPublicImageApiRemovedHandler));
  app.post('/v1/images/generations', openAiImagesGenerationHandler);

  // 鈹€鈹€鈹€ 寮傛鐢熸垚鎺ュ彛 鈹€鈹€鈹€

  function publicAsyncTaskPayload(req: Request, task: PublicAsyncGenerationTask) {
    const imageUrl = task.imagePath ? toPublicAssetUrl(req, task.imagePath) : '';
    return {
      id: task.id,
      taskId: task.id,
      object: 'image.generation.task',
      status: task.status,
      generationStatus: task.generationStatus,
      results: imageUrl ? [{ url: imageUrl }] : [],
      progress: task.status === 'succeeded' ? 100 : task.progress,
      retryAfterSeconds: task.status === 'succeeded' || task.status === 'failed' ? 0 : task.retryAfterSeconds,
      ...(task.error ? { error: sanitizeExternalErrorMessage(task.error, '图像生成失败') } : {}),
    };
  }

  async function persistPublicAsyncGeneration(task: PublicAsyncGenerationTask, imagePath: string) {
    const apiRequestMs = Math.max(0, Date.now() - new Date(task.createdAt).getTime());
    const username = `api-${task.apiKeyId}`.slice(0, 80);
    if (USE_SUPABASE) {
      const db = await getSupabaseDb();
      await db.insertGeneration({
        userId: `api-key:${task.apiKeyId}`,
        username,
        prompt: task.prompt,
        modelId: task.modelId,
        modelName: task.modelName,
        dimensions: task.dimensions,
        imageSize: task.imageSize,
        imagePath,
        creditsUsed: task.creditsUsed,
        apiRequestMs,
        referenceImages: task.referenceImages,
        createdAt: task.createdAt,
      });
      return;
    }

    await withWriteDb((db) => {
      ensureSchema(db);
      db.run(
        `INSERT INTO generations (
          user_id, username, prompt, model_id, model_name, dimensions, image_size,
          image_path, credits_used, api_request_ms, reference_images, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `api-key:${task.apiKeyId}`,
          username,
          task.prompt,
          task.modelId,
          task.modelName,
          task.dimensions,
          task.imageSize,
          imagePath,
          task.creditsUsed,
          apiRequestMs,
          serializeReferenceImages(task.referenceImages),
          task.createdAt,
        ],
      );
    });
  }

  async function readPublicAsyncTask(taskId: string, apiKeyHash: string) {
    const tasks = await readPublicAsyncTasks();
    return tasks.find((item) => item.id === taskId && item.apiKeyHash === apiKeyHash) || null;
  }

  async function updatePublicAsyncTask(
    taskId: string,
    apiKeyHash: string,
    updater: (task: PublicAsyncGenerationTask) => Promise<PublicAsyncGenerationTask> | PublicAsyncGenerationTask,
  ) {
    return withPublicAsyncTaskMutationLock(async () => {
      const tasks = await readPublicAsyncTasks();
      const index = tasks.findIndex((item) => item.id === taskId && item.apiKeyHash === apiKeyHash);
      if (index < 0) return null;

      const task = tasks[index];
      const nextTask = await updater(task);
      tasks[index] = nextTask;
      await writePublicAsyncTasks(tasks);
      return nextTask;
    });
  }

  async function refreshPublicAsyncTask(taskId: string, apiKeyHash: string) {
    const task = await readPublicAsyncTask(taskId, apiKeyHash);
    if (!task) return null;
    if ((task.status === 'succeeded' && task.imagePath) || (task.status === 'failed' && task.refunded)) return task;
    if (!task.upstreamId) return task;

    const upstream = await queryVisionaryAsyncStatus(task.upstreamId, task.modelId, task.imageSize);
    const upstreamStatus = normalizeString(upstream.status).toLowerCase();
    const nextStatus: PublicAsyncGenerationTask['status'] =
      upstreamStatus === 'succeeded' || upstreamStatus === 'failed' || upstreamStatus === 'running'
        ? upstreamStatus
        : 'queued';
    const baseNextTask: PublicAsyncGenerationTask = {
      ...task,
      status: nextStatus,
      generationStatus: normalizeString(upstream.generationStatus) || (nextStatus === 'queued' ? 'pending' : nextStatus),
      progress: Math.max(0, Math.min(100, Number(upstream.progress || 0))),
      retryAfterSeconds: Math.max(0, Number(upstream.retryAfterSeconds ?? 5)),
      updatedAt: nowIso(),
    };

    if (nextStatus === 'succeeded') {
      const existing = await readPublicAsyncTask(taskId, apiKeyHash);
      if (existing?.status === 'succeeded' && existing.imagePath) return existing;

      const imageSource =
        upstream.results?.find((item) => item.url || item.content)?.url ||
        upstream.results?.[0]?.content;
      if (!imageSource) throw new Error('Visionary async task succeeded without an image URL');
      const imagePath = await persistGeneratedImage(imageSource);

      return updatePublicAsyncTask(taskId, apiKeyHash, async (current) => {
        if (current.status === 'succeeded' && current.imagePath) return current;
        const nextTask: PublicAsyncGenerationTask = {
          ...current,
          status: 'succeeded',
          generationStatus: normalizeString(upstream.generationStatus) || 'succeeded',
          progress: 100,
          retryAfterSeconds: 0,
          imagePath,
          updatedAt: nowIso(),
        };
        await persistPublicAsyncGeneration(nextTask, imagePath);
        return nextTask;
      });
    }

    if (nextStatus === 'failed') {
      const error = getVisionaryErrorMessage(upstream, '图像生成失败');
      return updatePublicAsyncTask(taskId, apiKeyHash, async (current) => {
        if (current.status === 'failed' && current.refunded) return current;
        if (!current.refunded && current.creditsUsed > 0) {
          await refundPublicApiKeyCredits(current.apiKeyId, current.creditsUsed);
        }
        return {
          ...current,
          status: 'failed',
          generationStatus: normalizeString(upstream.generationStatus) || 'failed',
          progress: baseNextTask.progress,
          retryAfterSeconds: 0,
          error,
          refunded: true,
          updatedAt: nowIso(),
        };
      });
    }

    return updatePublicAsyncTask(taskId, apiKeyHash, (current) => ({
      ...current,
      status: nextStatus,
      generationStatus: baseNextTask.generationStatus,
      progress: baseNextTask.progress,
      retryAfterSeconds: baseNextTask.retryAfterSeconds,
      updatedAt: nowIso(),
    }));
  }

  async function monitorPublicAsyncTask(taskId: string, apiKeyHash: string) {
    try {
      for (let poll = 0; poll < 120; poll += 1) {
        try {
          const task = await refreshPublicAsyncTask(taskId, apiKeyHash);
          if (!task || task.status === 'succeeded' || task.status === 'failed') return;
          await new Promise((resolve) => setTimeout(resolve, Math.max(1, task.retryAfterSeconds) * 1_000));
        } catch (error) {
          console.warn(`[public-async] task ${taskId} poll ${poll + 1} failed:`, error);
          await new Promise((resolve) => setTimeout(resolve, 5_000));
        }
      }
      console.warn(`[public-async] task ${taskId} exceeded the background polling window`);
    } finally {
      const tasks = await readPublicAsyncTasks().catch(() => [] as PublicAsyncGenerationTask[]);
      const task = tasks.find((item) => item.id === taskId && item.apiKeyHash === apiKeyHash);
      await cleanupTemporaryReferenceImages(task?.temporaryReferenceImages || []);
    }
  }

  const activePublicAsyncTasks = new Set<string>();
  let publicAsyncQueuePump: Promise<void> | null = null;
  let publicAsyncQueuePumpRequested = false;

  async function failPublicAsyncTask(task: PublicAsyncGenerationTask, error: unknown) {
    const message = error instanceof Error
      ? sanitizeExternalErrorMessage(error.message, 'Async generation failed')
      : 'Async generation failed';
    await updatePublicAsyncTask(task.id, task.apiKeyHash, async (current) => {
      if (current.status === 'succeeded' || (current.status === 'failed' && current.refunded)) return current;
      if (!current.refunded && current.creditsUsed > 0) {
        await refundPublicApiKeyCredits(current.apiKeyId, current.creditsUsed);
      }
      return {
        ...current,
        status: 'failed',
        generationStatus: 'failed',
        retryAfterSeconds: 0,
        error: message,
        refunded: true,
        updatedAt: nowIso(),
      };
    });
    await cleanupTemporaryReferenceImages(task.temporaryReferenceImages || []);
  }

  async function executePublicAsyncTask(task: PublicAsyncGenerationTask) {
    try {
      let current = await readPublicAsyncTask(task.id, task.apiKeyHash);
      if (!current || current.status === 'succeeded' || current.status === 'failed') return;

      if (!current.upstreamId) {
        current = await updatePublicAsyncTask(current.id, current.apiKeyHash, (latest) => ({
          ...latest,
          status: 'running',
          generationStatus: 'running',
          progress: Math.max(1, latest.progress),
          retryAfterSeconds: 5,
          updatedAt: nowIso(),
        }));
        if (!current) return;
        const requestContext: { userId: string; username: string; creditsUsed: number; successfulRequestId?: string } = {
          userId: `api-key:${current.apiKeyId}`,
          username: `api-${current.apiKeyId}`,
          creditsUsed: current.creditsUsed,
        };
        const generatedImageSource = await callImageGeneration({
          prompt: current.prompt,
          modelId: current.modelId,
          ratio: current.dimensions,
          imageSize: current.imageSize,
          quality: current.quality || '',
          optimizeChineseText: Boolean(current.optimizeChineseText),
          providerRouting: current.providerRouting,
          images: current.referenceImages,
          requestContext,
        });
        const imagePath = await persistGeneratedImage(generatedImageSource);
        await updateGenerationRequestImage(requestContext.successfulRequestId, imagePath);
        current = await updatePublicAsyncTask(current.id, current.apiKeyHash, async (latest) => {
          if (latest.status === 'succeeded' && latest.imagePath) return latest;
          const completed: PublicAsyncGenerationTask = {
            ...latest,
            status: 'succeeded',
            generationStatus: 'succeeded',
            progress: 100,
            retryAfterSeconds: 0,
            imagePath,
            updatedAt: nowIso(),
          };
          await persistPublicAsyncGeneration(completed, imagePath);
          return completed;
        });
        await cleanupTemporaryReferenceImages(current?.temporaryReferenceImages || []);
        return;
      }

      if (current) await monitorPublicAsyncTask(current.id, current.apiKeyHash);
    } catch (error) {
      console.error(`[public-async] task ${task.id} failed:`, error);
      await failPublicAsyncTask(task, error).catch((failureError) => {
        console.error(`[public-async] task ${task.id} failure handling failed:`, failureError);
      });
    } finally {
      activePublicAsyncTasks.delete(task.id);
      setTimeout(() => void schedulePublicAsyncQueue(), 0);
    }
  }

  function schedulePublicAsyncQueue() {
    publicAsyncQueuePumpRequested = true;
    if (publicAsyncQueuePump) return publicAsyncQueuePump;
    publicAsyncQueuePump = (async () => {
      while (publicAsyncQueuePumpRequested) {
        publicAsyncQueuePumpRequested = false;
        const availableSlots = Math.max(0, PUBLIC_ASYNC_CONCURRENCY - activePublicAsyncTasks.size);
        if (availableSlots === 0) return;
        const tasks = await readPublicAsyncTasks();
        const ready = tasks
          .filter((task) => (task.status === 'queued' || task.status === 'running') && !activePublicAsyncTasks.has(task.id))
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
          .slice(0, availableSlots);
        for (const task of ready) {
          activePublicAsyncTasks.add(task.id);
          void executePublicAsyncTask(task);
        }
      }
    })()
      .catch((error) => console.error('[public-async] queue pump failed:', error))
      .finally(() => {
        publicAsyncQueuePump = null;
      });
    return publicAsyncQueuePump;
  }

  const publicAsyncGenerateHandler = async (req: Request, res: Response) => {
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
    const suppliedReferenceImages = rawReferenceImages
      .map((item: unknown) => {
        if (typeof item === 'string') return item;
        const record = asPlainObject(item);
        return normalizeString(record.data || record.url || record.file_uri || record.fileUri);
      })
      .filter(Boolean);

    if (!apiKey) {
      res.status(401).json({ error: 'X-API-Key is required' });
      return;
    }
    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }
    const dedicatedPolicy = dedicatedJunliBananaPolicy(
      hashPublicApiKey(apiKey),
      requestedImageSize,
      optimizeChineseText,
    );
    const modelId = dedicatedPolicy?.modelId || normalizePublicModelId(model);
    if (!modelId) {
      res.status(400).json({
        error: `Unsupported model: ${model || '(empty)'}`,
        supportedModels: ['gpt-image-2', 'nano-banana-pro'],
      });
      return;
    }
    let reservedKey: PublicApiKeyRecord | null = null;
    let creditsUsed = 0;
    let temporaryReferenceImages: string[] = [];

    try {
      const queueSnapshot = await readPublicAsyncTasks();
      const unfinishedSnapshotCount = queueSnapshot.filter(
        (item) => item.status === 'queued' || item.status === 'running',
      ).length;
      if (unfinishedSnapshotCount >= PUBLIC_ASYNC_MAX_PENDING) {
        throw new Error(`Async generation queue is full (capacity ${PUBLIC_ASYNC_MAX_PENDING})`);
      }
      if (suppliedReferenceImages.length > MAX_REFERENCE_IMAGE_COUNT) {
        throw new Error(`A maximum of ${MAX_REFERENCE_IMAGE_COUNT} reference images is supported`);
      }
      const remoteReferenceImages = suppliedReferenceImages.filter((item: string) => /^https:\/\//i.test(item));
      const dataReferenceImages = suppliedReferenceImages.filter((item: string) => item.startsWith('data:image/'));
      const unsupportedReferenceImages = suppliedReferenceImages.filter(
        (item: string) => !/^https:\/\//i.test(item) && !item.startsWith('data:image/'),
      );
      if (unsupportedReferenceImages.length > 0) {
        throw new Error('Reference images must be HTTPS URLs or base64 data URLs');
      }

      temporaryReferenceImages = await persistTemporaryReferenceImages(toReferenceUploadInputs(dataReferenceImages));
      const temporaryReferenceUrls = temporaryReferenceImages
        .map((item) => toPublicAssetUrl(req, item))
        .filter((item) => item.startsWith('https://'));
      if (dataReferenceImages.length > 0 && temporaryReferenceUrls.length !== dataReferenceImages.length) {
        throw new Error('Base64 reference images require persistent hosting and a public HTTPS APP_URL');
      }
      const referenceImages = Array.from(new Set([...remoteReferenceImages, ...temporaryReferenceUrls]));

      const ratio = normalizeRatio(dimensions, modelId);
      const modelName = modelNameFromId(modelId);
      const imageSize = dedicatedPolicy
        ? dedicatedPolicy.imageSize
        : await normalizeRoutedImageSize(requestedImageSize, modelId);
      const quality = modelId === 'gpt-image-2' ? normalizeGptQuality(requestedQuality, imageSize) : '';
      const effectiveOptimizeChineseText = shouldEnhanceNanoBanana(modelId, imageSize, optimizeChineseText);
      creditsUsed = dedicatedPolicy
        ? dedicatedPolicy.credits
        : getModelCredits(modelId, imageSize, quality)
          + getNanoBananaEnhancementCredits(modelId, imageSize, effectiveOptimizeChineseText);
      reservedKey = await reservePublicApiKeyCredits(apiKey, creditsUsed);

      const publicTask: PublicAsyncGenerationTask = {
        id: `pxgen_${Date.now()}_${randomHex(8)}`,
        apiKeyId: reservedKey.id,
        apiKeyHash: reservedKey.keyHash,
        status: 'queued',
        generationStatus: 'queued',
        progress: 0,
        retryAfterSeconds: 3,
        creditsUsed,
        refunded: false,
        prompt,
        modelId,
        modelName,
        dimensions: ratio,
        imageSize,
        quality,
        optimizeChineseText: effectiveOptimizeChineseText,
        providerRouting: dedicatedPolicy?.providerRouting,
        referenceImages: Array.from(new Set(referenceImages)),
        temporaryReferenceImages,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await withPublicAsyncTaskMutationLock(async () => {
        const tasks = await readPublicAsyncTasks();
        const unfinishedCount = tasks.filter((item) => item.status === 'queued' || item.status === 'running').length;
        if (unfinishedCount >= PUBLIC_ASYNC_MAX_PENDING) {
          throw new Error(`Async generation queue is full (capacity ${PUBLIC_ASYNC_MAX_PENDING})`);
        }
        tasks.push(publicTask);
        await writePublicAsyncTasks(tasks);
      });
      void schedulePublicAsyncQueue();

      res.status(202).json({
        ...publicAsyncTaskPayload(req, publicTask),
        message: `Task accepted. Use GET /v1/async/images/generations/${publicTask.id} to query the result.`,
        queue: {
          maxPending: PUBLIC_ASYNC_MAX_PENDING,
          concurrency: PUBLIC_ASYNC_CONCURRENCY,
        },
        usage: {
          creditsUsed,
          remainingCredits: Math.max(0, reservedKey.totalCredits - reservedKey.usedCredits),
        },
      });
    } catch (error) {
      await cleanupTemporaryReferenceImages(temporaryReferenceImages);
      if (reservedKey && creditsUsed > 0) {
        await refundPublicApiKeyCredits(reservedKey.id, creditsUsed).catch(() => undefined);
      }
      console.error('[async-generate]', error);
      const message = error instanceof Error
        ? sanitizeExternalErrorMessage(error.message, 'Async generation failed')
        : 'Async generation failed';
      const status = getPublicApiErrorStatus(message);
      res.status(status).json({ error: message });
    }
  };

  const publicAsyncStatusHandler = async (req: Request, res: Response) => {
    const apiKey = normalizeString(req.headers['x-api-key'] || req.headers.authorization?.replace(/^Bearer\s+/i, ''));
    const taskId = normalizeString(req.params.taskId || req.params.id);

    if (!apiKey) {
      res.status(401).json({ error: 'X-API-Key is required' });
      return;
    }
    if (!taskId) {
      res.status(400).json({ error: 'Task ID is required' });
      return;
    }

    try {
      const balance = await getPublicApiKeyBalance(apiKey);
      if (!balance) {
        res.status(401).json({ error: 'API Key is invalid or revoked' });
        return;
      }
      const task = await readPublicAsyncTask(taskId, hashPublicApiKey(apiKey));
      if (!task) {
        res.status(404).json({ error: 'Generation task not found' });
        return;
      }
      res.json(publicAsyncTaskPayload(req, task));
    } catch (error) {
      console.error('[async-status]', error);
      res.status(502).json({
        error: error instanceof Error ? sanitizeExternalErrorMessage(error.message, 'Query failed') : 'Query failed',
      });
    }
  };

  async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
  ) {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.max(1, Math.min(limit, items.length));
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
          const index = nextIndex;
          nextIndex += 1;
          results[index] = await mapper(items[index], index);
        }
      }),
    );
    return results;
  }

  const publicAsyncBatchStatusHandler = async (req: Request, res: Response) => {
    const apiKey = normalizeString(req.headers['x-api-key'] || req.headers.authorization?.replace(/^Bearer\s+/i, ''));
    const ids = Array.isArray(req.body?.ids)
      ? Array.from(
          new Set<string>(
            req.body.ids
              .map((value: unknown) => normalizeString(value))
              .filter((value: string): value is string => Boolean(value)),
          ),
        ).slice(0, 100)
      : [];
    if (!apiKey) {
      res.status(401).json({ error: 'X-API-Key is required' });
      return;
    }
    if (ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array' });
      return;
    }
    if (!(await getPublicApiKeyBalance(apiKey))) {
      res.status(401).json({ error: 'API Key is invalid or revoked' });
      return;
    }

    const apiKeyHash = hashPublicApiKey(apiKey);
    const data = await mapWithConcurrency(ids, 8, async (id) => {
      try {
        const task = await readPublicAsyncTask(id, apiKeyHash);
        return task
          ? { requestedId: id, ...publicAsyncTaskPayload(req, task) }
          : { requestedId: id, status: 'failed', error: 'Generation task not found', results: [], retryAfterSeconds: 0 };
      } catch (error) {
        return {
          requestedId: id,
          status: 'failed',
          error: error instanceof Error ? sanitizeExternalErrorMessage(error.message, 'Query failed') : 'Query failed',
          results: [],
          retryAfterSeconds: 0,
        };
      }
    });
    res.json({
      object: 'list',
      data,
      count: data.length,
      requestedCount: ids.length,
      retryAfterSeconds: data.reduce((max, item) => Math.max(max, Number(item.retryAfterSeconds || 0)), 0),
    });
  };

  app.post('/v1/async/images/generations', publicAsyncGenerateHandler);
  app.get('/v1/async/images/generations/:id', publicAsyncStatusHandler);
  app.post('/v1/async/images/generations/status', publicAsyncBatchStatusHandler);

  [
    '/api/v1/async/generate',
    '/openapi/v1/async/images/generations',
  ].forEach((path) => app.post(path, legacyPublicImageApiRemovedHandler));
  [
    '/api/v1/async/status/:taskId',
    '/openapi/v1/async/images/generations/:id',
  ].forEach((path) => app.get(path, legacyPublicImageApiRemovedHandler));
  app.post('/openapi/v1/async/images/generations/status', legacyPublicImageApiRemovedHandler);
  void schedulePublicAsyncQueue();

  type AuthenticatedGenerationJob = {
    id: string;
    userId: string;
    username: string;
    status: 'queued' | 'processing' | 'succeeded' | 'failed';
    progress: number;
    requestBody: unknown;
    authHeader: string;
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    completedAt?: string;
    image?: GeneratedImagePayload;
    error?: string;
  };

  const generationJobs = new Map<string, AuthenticatedGenerationJob>();
  const generationJobTtlMs = 2 * 60 * 60 * 1000;
  const internalApiOrigin = `http://127.0.0.1:${Number(process.env.PORT || DEFAULT_PORT)}`;

  function publicGenerationJob(job: AuthenticatedGenerationJob) {
    const elapsedMs = job.startedAt ? Math.max(0, Date.now() - new Date(job.startedAt).getTime()) : 0;
    const simulatedProgress =
      job.status === 'processing'
        ? Math.min(96, Math.round(14 + (1 - Math.exp(-elapsedMs / 85000)) * 82))
        : job.progress;

    return {
      id: job.id,
      status: job.status,
      progress: job.status === 'succeeded' ? 100 : job.status === 'failed' ? job.progress : Math.max(job.progress, simulatedProgress),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      image: job.image,
      error: job.error,
    };
  }

  function cleanupGenerationJobs() {
    const cutoff = Date.now() - generationJobTtlMs;
    for (const [jobId, job] of generationJobs) {
      const updatedAt = new Date(job.updatedAt).getTime();
      if (!Number.isNaN(updatedAt) && updatedAt < cutoff) {
        generationJobs.delete(jobId);
      }
    }
  }

  async function runGenerationJob(jobId: string) {
    const job = generationJobs.get(jobId);
    if (!job) return;

    const updateJob = (patch: Partial<AuthenticatedGenerationJob>) => {
      const current = generationJobs.get(jobId);
      if (!current) return null;
      const next = { ...current, ...patch, updatedAt: nowIso() };
      generationJobs.set(jobId, next);
      return next;
    };

    updateJob({ status: 'processing', progress: 12, startedAt: nowIso() });

    try {
      const response = await fetch(`${internalApiOrigin}/api/generate`, {
        method: 'POST',
        headers: {
          Authorization: job.authHeader,
          'Content-Type': 'application/json',
          'X-Forwarded-Host': CANONICAL_WEB_HOST,
          'X-Forwarded-Proto': 'https',
        },
        body: JSON.stringify(job.requestBody),
      });
      updateJob({ progress: 88 });

      const responseText = await response.text().catch(() => '');
      let payload: { image?: GeneratedImagePayload; error?: unknown; message?: unknown; detail?: unknown; failure_reason?: unknown } | null = null;
      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        throw new Error(getVisionaryErrorMessage(payload || responseText, `Generate failed (${response.status})`));
      }

      if (!payload?.image) {
        throw new Error('Generate failed: missing image result');
      }

      updateJob({
        status: 'succeeded',
        progress: 100,
        image: payload.image,
        completedAt: nowIso(),
      });
    } catch (error) {
      updateJob({
        status: 'failed',
        progress: Math.max(12, generationJobs.get(jobId)?.progress || 12),
        error: error instanceof Error ? sanitizeExternalErrorMessage(error.message, 'Generate failed') : 'Generate failed',
        completedAt: nowIso(),
      });
    }
  }

  app.post('/api/generate/jobs', requireAuth, async (req, res) => {
    const prompt = normalizeString(req.body?.prompt);
    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    cleanupGenerationJobs();
    const jobId = `gen_${Date.now()}_${randomHex(6)}`;
    const authHeader = normalizeString(req.headers.authorization);
    const job: AuthenticatedGenerationJob = {
      id: jobId,
      userId: req.authUser!.userId,
      username: req.authUser!.username,
      status: 'queued',
      progress: 5,
      requestBody: req.body,
      authHeader,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    generationJobs.set(jobId, job);
    void runGenerationJob(jobId);
    res.status(202).json({ job: publicGenerationJob(job) });
  });

  app.get('/api/generate/jobs/:id', requireAuth, (req, res) => {
    cleanupGenerationJobs();
    const job = generationJobs.get(normalizeString(req.params.id));
    if (!job || job.userId !== req.authUser!.userId) {
      res.status(404).json({ error: 'Generation job not found' });
      return;
    }

    res.json({ job: publicGenerationJob(job) });
  });

  type VideoGenerationJob = {
    id: string;
    userId: string;
    username: string;
    status: 'queued' | 'processing' | 'succeeded' | 'failed';
    progress: number;
    prompt: string;
    ratio: VideoRatio;
    resolution: VideoResolution;
    modelId: VideoModelId;
    seconds: VideoDurationSeconds;
    referenceImages: ReferenceUploadInput[];
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    videoPath?: string;
    error?: string;
    creditsRemaining?: number;
  };

  const videoJobs = new Map<string, VideoGenerationJob>();
  const pruneVideoJobs = () => {
    const cutoff = Date.now() - 4 * 60 * 60_000;
    for (const [id, job] of videoJobs) {
      if (new Date(job.updatedAt).getTime() < cutoff) videoJobs.delete(id);
    }
  };

  function publicVideoJob(req: Request, job: VideoGenerationJob) {
    const creditsUsed = getVideoGenerationCredits(job.modelId, job.resolution, job.seconds);
    return {
      id: job.id,
      status: job.status,
      progress: job.status === 'succeeded' ? 100 : job.progress,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      videoUrl: job.videoPath ? toPublicAssetUrl(req, job.videoPath) : undefined,
      modelId: job.modelId,
      modelName: VIDEO_MODEL_LABELS[job.modelId] || job.modelId,
      error: job.error,
      creditsUsed: job.status === 'succeeded' ? creditsUsed : 0,
      creditsRemaining: job.creditsRemaining,
    };
  }

  async function runVideoJob(jobId: string) {
    const job = videoJobs.get(jobId);
    if (!job) return;
    const requestStartedAt = Date.now();
    const metricConfiguration = `${job.resolution} / ${job.seconds}s / ${job.ratio}`;
    const creditsUsed = getVideoGenerationCredits(job.modelId, job.resolution, job.seconds);
    const recordVideoRequest = async (modelId: string, success: boolean, durationMs: number, errorMessage = '', videoPath = '') => {
      try {
        const requestId = await recordGenerationRequest({
          modelId,
          provider: 'Junliai',
          configuration: metricConfiguration,
          durationMs,
          success,
          errorMessage,
          sourceModel: VIDEO_MODEL_LABELS[modelId] || modelId,
          prompt: job.prompt,
          requestContext: {
            userId: job.userId,
            username: job.username,
            creditsUsed,
          },
        });
        if (success && requestId && videoPath) {
          await updateGenerationRequestImage(requestId, videoPath);
        }
      } catch (recordError) {
        console.warn('[video-generation] failed to save request record:', recordError);
      }
    };
    const update = (patch: Partial<VideoGenerationJob>) => {
      Object.assign(job, patch, { updatedAt: nowIso() });
    };
    update({ status: 'processing', progress: 8 });
    try {
      const created = await createJunliaiVideoTask(job);
      update({ progress: 12 });
      const videoPath = await waitForJunliaiVideo(created.taskId, (progress) => update({ progress }));
      let creditsRemaining = 0;
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        await db.incrementUsedCredits(job.userId, creditsUsed);
        await db.syncInviteCodeBalanceForUser(job.userId);
        creditsRemaining = (await db.getUserCredits(job.userId)).remainingCredits;
      } else {
        creditsRemaining = await withWriteDb((db) => {
          ensureSchema(db);
          db.run('UPDATE user_credits SET used_credits = used_credits + ?, updated_at = ? WHERE user_id = ?', [
            creditsUsed,
            nowIso(),
            job.userId,
          ]);
          syncInviteCodeBalanceForUser(db, job.userId);
          return getUserCredits(db, job.userId).remainingCredits;
        });
      }

      const apiRequestMs = Math.max(0, Date.now() - requestStartedAt);
      try {
        if (USE_SUPABASE) {
          const db = await getSupabaseDb();
          await db.insertGeneration({
            userId: job.userId,
            username: job.username,
            prompt: job.prompt,
            modelId: job.modelId,
            modelName: VIDEO_MODEL_LABELS[job.modelId] || job.modelId,
            dimensions: job.ratio,
            imageSize: job.resolution,
            imagePath: videoPath,
            creditsUsed,
            apiRequestMs,
            referenceImages: [],
            createdAt: job.createdAt,
          });
        } else {
          await withWriteDb((db) => {
            ensureSchema(db);
            db.run(
              `
                INSERT INTO generations (
                  user_id, username, prompt, model_id, model_name, dimensions,
                  image_size, image_path, credits_used, api_request_ms, reference_images, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              [
                job.userId,
                job.username,
                job.prompt,
                job.modelId,
                VIDEO_MODEL_LABELS[job.modelId] || job.modelId,
                job.ratio,
                job.resolution,
                videoPath,
                creditsUsed,
                apiRequestMs,
                '[]',
                job.createdAt,
              ],
            );
          });
        }
      } catch (historyError) {
        console.warn('[video-generation] failed to save history:', historyError);
      }
      void providerMetrics?.record({
        modelId: job.modelId,
        provider: 'Junliai',
        configuration: metricConfiguration,
        durationMs: apiRequestMs,
        success: true,
      });
      await recordVideoRequest(job.modelId, true, apiRequestMs, '', videoPath);
      update({ status: 'succeeded', progress: 100, videoPath, creditsRemaining, completedAt: nowIso() });
    } catch (error) {
      console.error('[video-generation]', error);
      const durationMs = Math.max(0, Date.now() - requestStartedAt);
      const errorMessage = sanitizeExternalErrorMessage(
        error instanceof Error ? error.message : 'Video generation failed',
        '视频生成失败，本次不会扣除积分',
      );
      void providerMetrics?.record({
        modelId: job.modelId,
        provider: 'Junliai',
        configuration: metricConfiguration,
        durationMs,
        success: false,
      });
      await recordVideoRequest(job.modelId, false, durationMs, errorMessage);
      update({
        status: 'failed',
        error: errorMessage,
        completedAt: nowIso(),
      });
    }
  }

  app.post('/api/generate/video/jobs', requireAuth, async (req, res) => {
    pruneVideoJobs();
    const modelId = normalizeString(req.body?.modelId) as VideoModelId;
    const prompt = normalizeString(req.body?.prompt).slice(0, 8_000);
    const ratio = normalizeString(req.body?.ratio) as VideoGenerationJob['ratio'];
    const resolution = normalizeString(req.body?.resolution) as VideoGenerationJob['resolution'];
    const seconds = Number(req.body?.seconds) as VideoDurationSeconds;
    const rawReferences = Array.isArray(req.body?.referenceImages) ? req.body.referenceImages : [];
    const referenceImages = rawReferences.slice(0, 2).map((item: unknown, index: number) => {
      const value = asPlainObject(item);
      return {
        name: normalizeString(value.name) || `video-reference-${index + 1}.png`,
        mimeType: normalizeString(value.mimeType) || 'image/png',
        data: normalizeString(value.data),
      };
    }).filter((item: ReferenceUploadInput) => item.data.startsWith('data:image/') && item.data.length <= 28_000_000);
    if (!prompt) {
      res.status(400).json({ error: '请输入视频提示词' });
      return;
    }
    if (!supportsVideoConfiguration(modelId, resolution, ratio, seconds)) {
      res.status(400).json({ error: '当前视频模型不支持所选比例、分辨率或时长' });
      return;
    }
    const routing = await providerRouting!.get();
    const routeEnabled = modelId === VIDEO_MODEL_GEMINI_ID
      ? routing.junliaiGeminiVeo31
      : routing.junliaiFireflyVideo;
    if (!routeEnabled) {
      res.status(503).json({ error: `管理员已关闭 ${VIDEO_MODEL_LABELS[modelId] || modelId} 接口` });
      return;
    }
    if (!JUNLIAI_API_KEY) {
      res.status(503).json({ error: '视频生成接口尚未配置' });
      return;
    }
    try {
      const credits = USE_SUPABASE
        ? await (await getSupabaseDb()).getUserCredits(req.authUser!.userId)
        : await withReadDb((db) => {
            ensureSchema(db);
            return getUserCredits(db, req.authUser!.userId);
          });
      const creditsUsed = getVideoGenerationCredits(modelId, resolution, seconds);
      if (credits.remainingCredits < creditsUsed) {
        res.status(402).json({ error: `当前积分不足，${resolution} 视频需要 ${creditsUsed} 积分` });
        return;
      }
      const now = nowIso();
      const job: VideoGenerationJob = {
        id: `video_${Date.now()}_${randomHex(6)}`,
        userId: req.authUser!.userId,
        username: req.authUser!.username,
        status: 'queued',
        progress: 3,
        modelId,
        prompt,
        ratio,
        resolution,
        seconds,
        referenceImages,
        createdAt: now,
        updatedAt: now,
      };
      videoJobs.set(job.id, job);
      void runVideoJob(job.id);
      res.status(202).json({ job: publicVideoJob(req, job) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '创建视频任务失败' });
    }
  });

  app.get('/api/generate/video/jobs/:id', requireAuth, (req, res) => {
    pruneVideoJobs();
    const job = videoJobs.get(normalizeString(req.params.id));
    if (!job || job.userId !== req.authUser!.userId) {
      res.status(404).json({ error: '视频任务不存在' });
      return;
    }
    res.json({ job: publicVideoJob(req, job) });
  });

  app.post('/api/generate', requireAuth, async (req, res) => {
    const prompt = normalizeString(req.body?.prompt);
    const model = normalizeString(req.body?.model);
    const dimensions = normalizeString(req.body?.dimensions) || '1:1';
    const requestedImageSize = normalizeString(req.body?.imageSize);
    const requestedQuality = normalizeString(req.body?.quality).toLowerCase();
    const optimizeChineseText = Boolean(req.body?.optimizeChineseText);
    const billAiEnhancement = resolveAiEnhancementBillingRequested(req.body || {});
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
      let imageSize = await normalizeRoutedImageSize(requestedImageSize, modelId);
      const quality = modelId === 'gpt-image-2' ? normalizeGptQuality(requestedQuality, imageSize) : '';
      const effectiveOptimizeChineseText = shouldEnhanceNanoBanana(modelId, imageSize, optimizeChineseText);
      const effectiveBillAiEnhancement = shouldEnhanceNanoBanana(modelId, imageSize, billAiEnhancement);
      let creditsUsed = getModelCredits(modelId, imageSize, quality)
        + getNanoBananaEnhancementCredits(modelId, imageSize, effectiveBillAiEnhancement);

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
      let apiRequestMs = 0;
      const requestContext: { userId: string; username: string; creditsUsed: number; successfulRequestId?: string } = {
        userId: req.authUser!.userId,
        username: req.authUser!.username,
        creditsUsed,
      };
      try {
        const apiRequestStartedAt = Date.now();
        const generatedImageSource = await callImageGeneration({
          prompt,
          modelId,
          ratio,
          imageSize,
          quality,
          optimizeChineseText: effectiveOptimizeChineseText,
          images: uniqueModelReferenceImages,
          requestContext,
        });
        apiRequestMs = Math.max(0, Date.now() - apiRequestStartedAt);
        imagePath = await persistGeneratedImage(generatedImageSource);
        await updateGenerationRequestImage(requestContext.successfulRequestId, imagePath);
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
          apiRequestMs,
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
                api_request_ms,
                reference_images,
                created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              apiRequestMs,
              serializeReferenceImages(referenceImages),
              createdAt,
            ],
          );
        });
      }

      res.json({ image: toPublicGeneratedImagePayload(req, payload) });
    } catch (error) {
      console.error('[generate]', error);
      const message = error instanceof Error ? sanitizeExternalErrorMessage(error.message, 'Generate failed') : 'Generate failed';
      const status = getPublicApiErrorStatus(message);
      res.status(status).json({ error: message });
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
          api_request_ms: row.api_request_ms,
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
            SELECT id, user_id, username, prompt, model_id, model_name, dimensions, image_size, image_path, credits_used, api_request_ms, reference_images, created_at
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

        const [generationSummaries, registeredUsers, creditRows, apiKeys] = await Promise.all([
          db.getGenerationSummaries(),
          db.getRegisteredUsers(),
          db.getAllCreditRows(),
          readPublicApiKeyRecords(),
        ]);
        const apiKeyById = new Map(apiKeys.map((item) => [item.id, item]));
        const creditsByUserId = new Map<string, CreditValues>(
          creditRows.map((row) => [
            row.user_id,
            { totalCredits: row.total_credits, usedCredits: row.used_credits },
          ]),
        );

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
            apiKeyId?: string;
            quotaSource?: 'key' | 'account';
            ownerUserId?: string;
            ownerUsername?: string;
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
          const apiKeyId = summary.userId.startsWith('api-key:')
            ? summary.userId.slice('api-key:'.length)
            : '';
          const apiKey = apiKeyId ? apiKeyById.get(apiKeyId) : undefined;
          const apiKeyCredits = apiKey
            ? resolveApiKeyDisplayCredits(
                apiKey,
                apiKey.ownerUserId ? creditsByUserId.get(apiKey.ownerUserId) : undefined,
              )
            : undefined;
          userMap.set(summary.userId, {
            userId: summary.userId,
            username: current?.username || summary.username,
            generations: summary.generations,
            creditsUsed: summary.creditsUsed,
            totalCredits: apiKeyCredits?.totalCredits ?? current?.totalCredits ?? 0,
            usedCredits: apiKeyCredits?.usedCredits ?? current?.usedCredits ?? 0,
            remainingCredits: apiKeyCredits?.remainingCredits ?? current?.remainingCredits ?? 0,
            apiKeyId: apiKey?.id,
            quotaSource: apiKeyCredits?.quotaSource,
            ownerUserId: apiKey?.ownerUserId,
            ownerUsername: apiKey?.ownerUsername,
            lastGeneratedAt: summary.lastGeneratedAt,
          });
        }

        const users = [...userMap.values()].sort(
          (left, right) => right.creditsUsed - left.creditsUsed || right.generations - left.generations,
        );

        const { records: genRecords, total: recordsTotal } = await db.getGenerationRequests(recordsPage, recordsPageSize);
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
          api_request_ms: row.api_request_ms,
          reference_images: row.reference_images,
          created_at: row.created_at,
          result_status: row.result_status,
          result_message: row.result_message,
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
        const apiKeys = normalizeApiKeyRecords(
          parseJsonSetting(getSetting(db, PUBLIC_API_KEYS_SETTING_KEY, '[]'), []),
        );
        const apiKeyById = new Map(apiKeys.map((item) => [item.id, item]));
        const creditsByUserId = new Map<string, CreditValues>(
          creditRows.map((row) => [
            String(row.user_id || ''),
            {
              totalCredits: Number(row.total_credits || 0),
              usedCredits: Number(row.used_credits || 0),
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
            apiKeyId?: string;
            quotaSource?: 'key' | 'account';
            ownerUserId?: string;
            ownerUsername?: string;
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
          const apiKeyId = summary.userId.startsWith('api-key:')
            ? summary.userId.slice('api-key:'.length)
            : '';
          const apiKey = apiKeyId ? apiKeyById.get(apiKeyId) : undefined;
          const apiKeyCredits = apiKey
            ? resolveApiKeyDisplayCredits(
                apiKey,
                apiKey.ownerUserId ? creditsByUserId.get(apiKey.ownerUserId) : undefined,
              )
            : undefined;
          userMap.set(summary.userId, {
            userId: summary.userId,
            username: current?.username || summary.username,
            generations: summary.generations,
            creditsUsed: summary.creditsUsed,
            totalCredits: apiKeyCredits?.totalCredits ?? current?.totalCredits ?? 0,
            usedCredits: apiKeyCredits?.usedCredits ?? current?.usedCredits ?? 0,
            remainingCredits: apiKeyCredits?.remainingCredits ?? current?.remainingCredits ?? 0,
            apiKeyId: apiKey?.id,
            quotaSource: apiKeyCredits?.quotaSource,
            ownerUserId: apiKey?.ownerUserId,
            ownerUsername: apiKey?.ownerUsername,
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
              FROM generation_requests
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
              g.api_request_ms,
              g.reference_images,
              g.result_status,
              g.result_message,
              g.created_at,
            FROM generation_requests g
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

  app.get('/api/user/api-keys', requireAuth, async (req, res) => {
    try {
      const keys = (await readPublicApiKeyRecords())
        .filter((record) => record.billingMode === 'account' && record.ownerUserId === req.authUser!.userId)
        .map(userApiKeyRecord);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ keys });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch API keys failed' });
    }
  });

  app.post('/api/user/api-keys', requireAuth, async (req, res) => {
    try {
      const payload = await withPublicApiKeyMutationLock(() =>
        createUserApiKeyUnlocked(
          normalizeString(req.body?.name),
          req.authUser!.userId,
          req.authUser!.username,
        ),
      );
      res.status(201).json({ apiKey: payload.plainKey, key: userApiKeyRecord(payload.record) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Create API key failed' });
    }
  });

  for (const action of ['pause', 'resume', 'revoke'] as const) {
    app.post(`/api/user/api-keys/:id/${action}`, requireAuth, async (req, res) => {
      try {
        const record = await withPublicApiKeyMutationLock(() =>
          updateOwnedUserApiKeyUnlocked(normalizeString(req.params.id), req.authUser!.userId, action),
        );
        if (!record) {
          res.status(404).json({ error: 'API key not found' });
          return;
        }
        res.json({ key: userApiKeyRecord(record) });
      } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Update API key failed' });
      }
    });
  }

  app.post('/api/user/api-keys/:id/rotate', requireAuth, async (req, res) => {
    try {
      const payload = await withPublicApiKeyMutationLock(async () => {
        const records = await readPublicApiKeyRecords();
        const oldRecord = records.find(
          (record) =>
            record.id === normalizeString(req.params.id) &&
            record.ownerUserId === req.authUser!.userId &&
            record.billingMode === 'account',
        );
        if (!oldRecord || oldRecord.revokedAt) return null;
        await updateOwnedUserApiKeyUnlocked(oldRecord.id, req.authUser!.userId, 'revoke');
        return createUserApiKeyUnlocked(
          oldRecord.name,
          req.authUser!.userId,
          req.authUser!.username,
          oldRecord.id,
        );
      });
      if (!payload) {
        res.status(404).json({ error: 'API key not found or already revoked' });
        return;
      }
      res.status(201).json({ apiKey: payload.plainKey, key: userApiKeyRecord(payload.record) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Rotate API key failed' });
    }
  });

  app.get('/api/admin/api-keys', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const keys = await readPublicApiKeyRecords();
      res.json({ keys: await publicApiKeyRecordsForAdmin(keys) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch API keys failed' });
    }
  });

  app.post('/api/public/api-key-balance', async (req, res) => {
    const apiKey = normalizeString(req.body?.apiKey);
    if (!apiKey || apiKey.length > 200) {
      res.status(400).json({ error: '请输入有效的 API Key' });
      return;
    }

    try {
      const balance = await getPublicApiKeyBalance(apiKey);
      if (!balance) {
        res.status(401).json({ error: 'API Key 无效或已停用' });
        return;
      }

      res.setHeader('Cache-Control', 'no-store');
      res.json({ balance });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '查询 API Key 额度失败' });
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

      res.json({ key: (await publicApiKeyRecordsForAdmin([key]))[0] });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Revoke API key failed' });
    }
  });

  app.post('/api/admin/api-keys/:id/deduct', requireAuth, requireAdmin, async (req, res) => {
    const credits = Math.floor(Number(req.body?.credits));

    if (!Number.isFinite(credits) || credits <= 0) {
      res.status(400).json({ error: 'Credits must be a positive number' });
      return;
    }

    try {
      const payload = await deductPublicApiKeyCredits(normalizeString(req.params.id), credits);
      if (!payload) {
        res.status(404).json({ error: 'API key not found' });
        return;
      }

      res.json({
        key: publicApiKeyRecord(payload.record),
        deductedCredits: payload.deductedCredits,
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Deduct API key credits failed' });
    }
  });

  app.post('/api/admin/api-keys/:id/recharge', requireAuth, requireAdmin, async (req, res) => {
    const credits = Math.floor(Number(req.body?.credits));

    if (!Number.isFinite(credits) || credits <= 0) {
      res.status(400).json({ error: 'Credits must be a positive number' });
      return;
    }

    try {
      const payload = await rechargePublicApiKeyCredits(normalizeString(req.params.id), credits);
      if (!payload) {
        res.status(404).json({ error: 'API key not found' });
        return;
      }

      res.json({
        key: publicApiKeyRecord(payload.record),
        rechargedCredits: payload.rechargedCredits,
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Recharge API key credits failed' });
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

  app.put('/api/admin/provider-routing', requireAuth, requireAdmin, async (req, res) => {
    try {
      const patch: ProviderRoutingPatch = {};
      if (req.body?.image2Routes && typeof req.body.image2Routes === 'object') {
        patch.image2Routes = req.body.image2Routes;
      }
      if (req.body?.bananaRoutes && typeof req.body.bananaRoutes === 'object') {
        patch.bananaRoutes = req.body.bananaRoutes;
      }
      if (typeof req.body?.junliaiGeminiVeo31 === 'boolean') {
        patch.junliaiGeminiVeo31 = req.body.junliaiGeminiVeo31;
      }
      if (typeof req.body?.junliaiFireflyVideo === 'boolean') {
        patch.junliaiFireflyVideo = req.body.junliaiFireflyVideo;
      }
      if (Object.keys(patch).length === 0) {
        res.status(400).json({ error: '至少需要提交一组有效的渠道顺序或接口开关' });
        return;
      }

      const next = await providerRouting!.update(patch);
      await imageProviderRouter?.resetCircuit();
      imageChannelFailover.reset();
      res.json({ providerRouting: next });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '更新上游接口开关失败' });
    }
  });

  app.get('/api/admin/dashboard', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const [imageStorage, providerMetricRows, providerRiskRows, routing] = await Promise.all([
        getImageStorageStats(),
        providerMetrics?.getToday() || Promise.resolve([]),
        providerRiskMonitor?.getToday() || Promise.resolve([]),
        providerRouting!.get(),
      ]);

      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        const [adminCredits, dashboardCounts] = await Promise.all([
          db.getAdminCreditSummary(),
          db.getAdminDashboardCounts(),
        ]);
        const todayKey = formatDateKeyInTimeZone(new Date());
        const todayRecords = dashboardCounts.recentRecords.filter(
          (item) => formatDateKeyInTimeZone(item.created_at) === todayKey,
        );

        res.json({
          stats: {
            todayRecordCount: todayRecords.length,
            todayCreditsUsed: todayRecords.reduce((sum, item) => sum + Number(item.credits_used || 0), 0),
            inviteUsageRate: dashboardCounts.inviteCodeCount > 0
              ? Math.round((dashboardCounts.usedInviteCodeCount / dashboardCounts.inviteCodeCount) * 100)
              : 0,
            lowCreditUserCount: dashboardCounts.lowCreditUserCount,
            userCount: dashboardCounts.userCount,
            inviteCodeCount: dashboardCounts.inviteCodeCount,
            recordCount: dashboardCounts.recordCount,
            usedInviteCodeCount: dashboardCounts.usedInviteCodeCount,
          },
          imageStorage,
          providerMetrics: providerMetricRows,
          providerRisks: providerRiskRows,
          providerRouting: routing,
          adminCredits,
          visionaryDocSync: getVisionaryDocSyncStatus(),
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
          providerMetrics: providerMetricRows,
          providerRisks: providerRiskRows,
          providerRouting: routing,
          adminCredits: getAdminCreditSummary(db),
          visionaryDocSync: getVisionaryDocSyncStatus(),
        };
      });

      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch admin dashboard failed' });
    }
  });

  app.post('/api/admin/image-cleanup', requireAuth, requireAdmin, async (req, res) => {
    try {
      const requestedRetentionDays = Number(req.body?.retentionDays ?? ORIGINAL_IMAGE_RETENTION_DAYS);
      const retentionDays = requestedRetentionDays === 0.5 || requestedRetentionDays === 2
        ? requestedRetentionDays
        : ORIGINAL_IMAGE_RETENTION_DAYS;
      const deletedGeneratedFiles = await purgeExpiredGeneratedFiles(retentionDays);
      const deletedReferenceFiles = await purgeExpiredReferenceFiles(1);
      const diskPressure = await enforceDiskPressure(`manual-${retentionDays}d`);
      const result = {
        cutoffIso: subtractDaysIso(retentionDays),
        deletedGenerations: 0,
        deletedImages: 0,
        deletedReferenceFiles,
        deletedGeneratedFiles,
        deletedThumbnailFiles: 0,
        ...diskPressure,
      };
      const imageStorage = await getImageStorageStats();
      res.json({
        cleanup: {
          retentionDays,
          ...result,
        },
        imageStorage,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Image cleanup failed' });
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
        const [{ codes, total }, adminCredits] = await Promise.all([
          db.listInviteCodes(page, pageSize, { status, sort, search }),
          db.getAdminCreditSummary(),
        ]);
        const redeemedUserIds = [
          ...new Set(codes.map((item) => normalizeString(item.redeemed_by)).filter(Boolean)),
        ];
        const redeemedUsers = await db.getInviteCodeRedeemSummaries(redeemedUserIds);
        const usersById = new Map(
          redeemedUsers.map((item) => [
            item.user_id,
            {
              username: item.username,
              creditsUsed: Number(item.credits_used || 0),
            },
          ]),
        );
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
          db.getRecentGenerationUsageRows(24 * 7),
        ]);
        const matchedInviteUserIds = new Set(matchedInvites.codes.map((item) => normalizeString(item.redeemed_by)).filter(Boolean));
        const trendByUserId = new Map<string, number[]>();
        for (const record of trendRecords) {
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

  app.get('/api/admin/users/:userId/invite-redemptions', requireAuth, requireAdmin, async (req, res) => {
    const userId = normalizeString(req.params.userId);
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    try {
      const rows = USE_SUPABASE
        ? await (await getSupabaseDb()).getInviteRedemptionsForUser(userId)
        : await withReadDb((db) => {
            ensureSchema(db);
            return runQuery<Record<string, unknown>>(
              db,
              `SELECT code, credits, issued_credits, created_at, redeemed_at
               FROM invite_codes
               WHERE redeemed_by = ? AND redeemed_at IS NOT NULL
               ORDER BY datetime(redeemed_at) DESC, datetime(created_at) DESC`,
              [userId],
            );
          });

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        redemptions: rows.map((row) => ({
          code: String(row.code || ''),
          credits: Math.max(0, Number(row.issued_credits || row.credits || 0)),
          redeemedAt: String(row.redeemed_at || ''),
          createdAt: String(row.created_at || ''),
        })),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch invite redemptions failed' });
    }
  });

  app.post('/api/admin/users/:userId/recharge', requireAuth, requireAdmin, async (req, res) => {
    const userId = normalizeString(req.params.userId);
    const requestedCredits = Math.floor(Number(req.body?.credits));
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }
    if (!Number.isFinite(requestedCredits) || requestedCredits <= 0) {
      res.status(400).json({ error: '充值积分必须是大于 0 的整数' });
      return;
    }

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        const [adminCredits, creditRows] = await Promise.all([
          db.getAdminCreditSummary(),
          db.getAllCreditRows(),
        ]);

        const target = creditRows.find((item) => item.user_id === userId);
        if (!target) {
          res.status(404).json({ error: '用户积分账户不存在' });
          return;
        }
        const isAdminTarget = String(target.username || '').toLowerCase() === 'admin';
        if (!isAdminTarget && adminCredits.remainingCredits < requestedCredits) {
          res.status(400).json({ error: `admin 剩余积分不足，当前剩余 ${adminCredits.remainingCredits}` });
          return;
        }

        await db.setUserTotalCredits(userId, target.total_credits + requestedCredits);
        await db.syncInviteCodeBalanceForUser(userId);
        if (!isAdminTarget) await db.adjustAdminTotalCredits(-requestedCredits);

        res.json({
          credits: await db.getUserCredits(userId),
          adminCredits: await db.getAdminCreditSummary(),
          rechargedCredits: requestedCredits,
        });
        return;
      }

      const payload = await withWriteDb((db) => {
        ensureSchema(db);
        const target = getOne<Record<string, unknown>>(
          db,
          'SELECT username, total_credits, used_credits FROM user_credits WHERE user_id = ?',
          [userId],
        );
        if (!target) throw new Error('用户积分账户不存在');

        const adminCredits = getAdminCreditSummary(db);
        const isAdminTarget = String(target.username || '').toLowerCase() === 'admin';
        if (!isAdminTarget && adminCredits.remainingCredits < requestedCredits) {
          throw new Error(`admin 剩余积分不足，当前剩余 ${adminCredits.remainingCredits}`);
        }

        const currentCredits = toCreditSummary(target);
        setUserTotalCredits(db, userId, currentCredits.totalCredits + requestedCredits);
        syncInviteCodeBalanceForUser(db, userId);
        if (!isAdminTarget) adjustAdminTotalCredits(db, -requestedCredits);
        return {
          credits: getUserCredits(db, userId),
          adminCredits: getAdminCreditSummary(db),
          rechargedCredits: requestedCredits,
        };
      });
      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : '用户充值失败';
      res.status(message.includes('不存在') ? 404 : 400).json({ error: message });
    }
  });

  app.post('/api/admin/users/:userId/deduct', requireAuth, requireAdmin, async (req, res) => {
    const userId = normalizeString(req.params.userId);
    const requestedCredits = Math.floor(Number(req.body?.credits));
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }
    if (!Number.isFinite(requestedCredits) || requestedCredits <= 0) {
      res.status(400).json({ error: '扣除积分必须是大于 0 的整数' });
      return;
    }

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        const creditRows = await db.getAllCreditRows();

        const target = creditRows.find((item) => item.user_id === userId);
        if (!target) {
          res.status(404).json({ error: '用户积分账户不存在' });
          return;
        }
        const remainingCredits = Math.max(0, Number(target.total_credits || 0) - Number(target.used_credits || 0));
        if (requestedCredits > remainingCredits) {
          res.status(400).json({ error: `扣除积分不能超过用户剩余积分 ${remainingCredits}` });
          return;
        }

        // 人工扣除按“已使用”计入，保留用户总积分，只减少剩余额度。
        await db.incrementUsedCredits(userId, requestedCredits);
        await db.syncInviteCodeBalanceForUser(userId);
        res.json({
          credits: await db.getUserCredits(userId),
          adminCredits: await db.getAdminCreditSummary(),
          deductedCredits: requestedCredits,
        });
        return;
      }

      const payload = await withWriteDb((db) => {
        ensureSchema(db);
        const target = getOne<Record<string, unknown>>(
          db,
          'SELECT total_credits, used_credits FROM user_credits WHERE user_id = ?',
          [userId],
        );
        if (!target) throw new Error('用户积分账户不存在');

        const currentCredits = toCreditSummary(target);
        if (requestedCredits > currentCredits.remainingCredits) {
          throw new Error(`扣除积分不能超过用户剩余积分 ${currentCredits.remainingCredits}`);
        }
        // 人工扣除按“已使用”计入，保留用户总积分，只减少剩余额度。
        incrementUserUsedCredits(db, userId, requestedCredits);
        syncInviteCodeBalanceForUser(db, userId);
        return {
          credits: getUserCredits(db, userId),
          adminCredits: getAdminCreditSummary(db),
          deductedCredits: requestedCredits,
        };
      });
      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : '用户积分扣除失败';
      res.status(message.includes('不存在') ? 404 : 400).json({ error: message });
    }
  });

  app.delete('/api/admin/users/:userId', requireAuth, requireAdmin, async (req, res) => {
    const userId = normalizeString(req.params.userId);
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        const [creditRows, invites] = await Promise.all([
          db.getAllCreditRows(),
          db.getInviteCodesRedeemedByUser(userId),
        ]);

        const target = creditRows.find((item) => item.user_id === userId);
        if (!target) {
          res.status(404).json({ error: '用户不存在' });
          return;
        }
        const returnedCredits = Math.max(
          0,
          Number(target.total_credits || 0) - Number(target.used_credits || 0),
        );
        const deletedInviteCodes = invites.map((invite) => String(invite.code));

        await db.deleteUserAccountData(userId);
        if (String(target.username || '').toLowerCase() !== 'admin' && returnedCredits > 0) {
          await db.adjustAdminTotalCredits(returnedCredits);
        }
        res.json({
          ok: true,
          returnedCredits,
          deletedInviteCodes,
          adminCredits: await db.getAdminCreditSummary(),
        });
        return;
      }

      const payload = await withWriteDb((db) => {
        ensureSchema(db);
        const target = getOne<Record<string, unknown>>(
          db,
          'SELECT username, total_credits, used_credits FROM user_credits WHERE user_id = ?',
          [userId],
        );
        if (!target) throw new Error('用户不存在');

        const credits = toCreditSummary(target);
        const deletedInviteCodes = runQuery<Record<string, unknown>>(
          db,
          'SELECT code FROM invite_codes WHERE redeemed_by = ?',
          [userId],
        ).map((item) => String(item.code));

        db.run('DELETE FROM images WHERE user_id = ?', [userId]);
        db.run('DELETE FROM generations WHERE user_id = ?', [userId]);
        db.run('DELETE FROM invite_codes WHERE redeemed_by = ?', [userId]);
        db.run('DELETE FROM user_credits WHERE user_id = ?', [userId]);
        db.run('DELETE FROM users WHERE CAST(id AS TEXT) = ?', [userId]);
        db.run('DELETE FROM user_migrations WHERE supabase_user_id = ?', [userId]);
        if (String(target.username || '').toLowerCase() !== 'admin' && credits.remainingCredits > 0) {
          adjustAdminTotalCredits(db, credits.remainingCredits);
        }
        return {
          ok: true,
          returnedCredits: credits.remainingCredits,
          deletedInviteCodes,
          adminCredits: getAdminCreditSummary(db),
        };
      });
      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除用户失败';
      res.status(message.includes('不存在') ? 404 : 400).json({ error: message });
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
        const [pagePayload, statsPayload, optionsPayload] = await Promise.all([
          db.getGenerationRequests(page, pageSize, options),
          Promise.resolve({ rows: [], total: 0 }),
          db.getGenerationRequestFilterOptions(),
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
          api_request_ms: row.api_request_ms,
          reference_images: row.reference_images,
          created_at: row.created_at,
          result_status: row.result_status,
          result_message: row.result_message,
        });
        const records = pagePayload.records.map(toRecord);
        const statRecords = statsPayload.rows.map((row) => ({
          createdAt: row.created_at,
          creditsUsed: Number(row.credits_used || 0),
          modelName: row.model_name,
        }));

        res.json({
          records: records.map((item) => toPublicGeneration(req, item)),
          recordsPage: toPagination(page, pageSize, pagePayload.total),
          stats: summarizeRecordStatRows(statRecords),
          modelOptions: optionsPayload.modelOptions,
          resolutionOptions: optionsPayload.resolutionOptions,
        });
        return;
      }

      const payload = await withReadDb((db) => {
        ensureSchema(db);
        const where = ["username != 'demo'"];
        const params: unknown[] = [];
        if (options.search) {
          where.push('(username LIKE ? OR user_id LIKE ? OR prompt LIKE ?)');
          const keyword = `%${options.search}%`;
          params.push(keyword, keyword, keyword);
        }
        if (options.model && options.model !== 'all') {
          where.push('model_name = ?');
          params.push(options.model);
        }
        if (options.resolution && options.resolution !== 'all') {
          const [dimensions, imageSize] = options.resolution.split(' / ').map((item) => item.trim());
          if (dimensions) { where.push('dimensions = ?'); params.push(dimensions); }
          if (imageSize) { where.push('image_size = ?'); params.push(imageSize); }
        }
        if (options.range && options.range !== 'all') {
          const hours = options.range === '24h' ? 24 : options.range === '7d' ? 168 : options.range === '30d' ? 720 : 0;
          if (hours) { where.push('datetime(created_at) >= datetime(?)'); params.push(new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()); }
        }
        const clause = `WHERE ${where.join(' AND ')}`;
        const total = Number(getOne<{ total: number }>(db, `SELECT COUNT(*) AS total FROM generation_requests ${clause}`, params)?.total || 0);
        const records = runQuery<Record<string, unknown>>(
          db,
          `SELECT * FROM generation_requests ${clause} ORDER BY datetime(created_at) DESC, id DESC LIMIT ? OFFSET ?`,
          [...params, pageSize, (page - 1) * pageSize],
        ).map(toGeneration);
        const optionsRows = runQuery<Record<string, unknown>>(db, "SELECT model_name, dimensions, image_size FROM generation_requests WHERE username != 'demo'");
        return {
          records,
          total,
          modelOptions: [...new Set(optionsRows.map((row) => String(row.model_name || '')).filter(Boolean))].sort(),
          resolutionOptions: [...new Set(optionsRows.map((row) => {
            const dimensions = String(row.dimensions || '');
            const imageSize = String(row.image_size || '');
            return dimensions ? (imageSize ? `${dimensions} / ${imageSize}` : dimensions) : '';
          }).filter(Boolean))].sort(),
        };
      });
      res.json({
        records: payload.records.map((item) => toPublicGeneration(req, item)),
        recordsPage: toPagination(page, pageSize, payload.total),
        stats: summarizeRecordStats([]),
        modelOptions: payload.modelOptions,
        resolutionOptions: payload.resolutionOptions,
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

  app.post('/api/admin/invite-codes/batch', requireAuth, requireAdmin, async (req, res) => {
    const requestedCredits = Number(req.body?.credits);
    const requestedCount = Number(req.body?.count);

    if (!Number.isFinite(requestedCredits) || requestedCredits <= 0) {
      res.status(400).json({ error: 'Credits must be a positive number' });
      return;
    }

    if (!Number.isFinite(requestedCount) || requestedCount <= 0 || requestedCount > 100) {
      res.status(400).json({ error: 'Count must be between 1 and 100' });
      return;
    }

    try {
      const credits = Math.floor(requestedCredits);
      const count = Math.floor(requestedCount);
      const totalCredits = credits * count;

      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        await db.reclaimLowBalanceInviteCodes();

        const adminCredits = await db.getAdminCreditSummary();
        if (totalCredits > adminCredits.remainingCredits) {
          throw new Error(`Admin credits are not enough. Remaining: ${adminCredits.remainingCredits}`);
        }

        const codes: string[] = [];
        while (codes.length < count) {
          const code = generateInviteCode();
          if (codes.includes(code) || await db.getInviteCode(code)) continue;
          codes.push(code);
        }

        const inviteRows = await db.createInviteCodes(codes, credits, req.authUser!.username);
        await db.adjustAdminTotalCredits(-totalCredits);

        res.status(201).json({
          inviteCodes: inviteRows.map((invite) => toInviteCode({
            code: invite.code,
            credits: invite.credits,
            issued_credits: invite.issued_credits,
            created_by: invite.created_by,
            created_at: invite.created_at,
            redeemed_by: invite.redeemed_by,
            redeemed_at: invite.redeemed_at,
            low_balance_since: invite.low_balance_since,
          })),
          adminCredits: await db.getAdminCreditSummary(),
        });
        return;
      }

      const payload = await withWriteDb((db) => {
        ensureSchema(db);
        reclaimLowBalanceInviteCodes(db);
        const adminCredits = getAdminCreditSummary(db);

        if (totalCredits > adminCredits.remainingCredits) {
          throw new Error(`Admin credits are not enough. Remaining: ${adminCredits.remainingCredits}`);
        }

        const inviteCodes = Array.from({ length: count }, () => {
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

          const invite = getOne<Record<string, unknown>>(db, 'SELECT * FROM invite_codes WHERE code = ?', [code]);
          return invite ? toInviteCode(invite) : null;
        }).filter((item): item is ReturnType<typeof toInviteCode> => Boolean(item));

        adjustAdminTotalCredits(db, -totalCredits);

        return {
          inviteCodes,
          adminCredits: getAdminCreditSummary(db),
        };
      });

      res.status(201).json(payload);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Create invite codes failed' });
    }
  });

  app.delete('/api/admin/invite-codes/batch', requireAuth, requireAdmin, async (req, res) => {
    const codes: string[] = Array.from(new Set<string>(
      (Array.isArray(req.body?.codes) ? req.body.codes : [])
        .map((item) => normalizeString(item))
        .filter(Boolean),
    ));

    if (codes.length === 0) {
      res.status(400).json({ error: 'Invite codes are required' });
      return;
    }

    try {
      if (USE_SUPABASE) {
        const db = await getSupabaseDb();
        await db.reclaimLowBalanceInviteCodes();

        const invites = await db.getInviteCodesByCodes(codes);
        const inviteByCode = new Map(invites.map((invite) => [String(invite.code), invite]));
        const missingCode = codes.find((code) => !inviteByCode.has(code));
        if (missingCode) {
          res.status(404).json({ error: `Invite code not found: ${missingCode}` });
          return;
        }

        let creditsToReturnTotal = 0;
        for (const code of codes) {
          const invite = inviteByCode.get(code)!;
          let creditsToReturn = Math.max(0, Number(invite.credits || 0));
          const redeemedBy = normalizeString(invite.redeemed_by);

          if (redeemedBy) {
            const userCredits = await db.getUserCredits(redeemedBy);
            creditsToReturn = Math.min(creditsToReturn, userCredits.remainingCredits);
            if (creditsToReturn > 0) {
              await db.incrementUsedCredits(redeemedBy, creditsToReturn);
            }
          }

          creditsToReturnTotal += creditsToReturn;
        }

        await db.deleteInviteCodes(codes);
        if (creditsToReturnTotal > 0) {
          await db.adjustAdminTotalCredits(creditsToReturnTotal);
        }

        res.json({
          ok: true,
          deletedCodes: codes,
          adminCredits: await db.getAdminCreditSummary(),
        });
        return;
      }

      const payload = await withWriteDb((db) => {
        ensureSchema(db);
        reclaimLowBalanceInviteCodes(db);

        const invites = codes.map((code) => {
          const invite = getOne<Record<string, unknown>>(
            db,
            'SELECT code, credits, redeemed_by FROM invite_codes WHERE code = ?',
            [code],
          );
          if (!invite) {
            throw new Error(`Invite code not found: ${code}`);
          }
          return invite;
        });

        let creditsToReturnTotal = 0;
        for (const invite of invites) {
          let creditsToReturn = Math.max(0, Number(invite.credits || 0));
          const redeemedBy = normalizeString(invite.redeemed_by);

          if (redeemedBy) {
            const userCredits = getUserCredits(db, redeemedBy);
            creditsToReturn = Math.min(creditsToReturn, userCredits.remainingCredits);
            if (creditsToReturn > 0) {
              incrementUserUsedCredits(db, redeemedBy, creditsToReturn);
            }
          }

          creditsToReturnTotal += creditsToReturn;
        }

        for (const code of codes) {
          db.run('DELETE FROM invite_codes WHERE code = ?', [code]);
        }
        if (creditsToReturnTotal > 0) {
          adjustAdminTotalCredits(db, creditsToReturnTotal);
        }

        return {
          ok: true,
          deletedCodes: codes,
          adminCredits: getAdminCreditSummary(db),
        };
      });

      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete invite codes failed';
      if (message.startsWith('Invite code not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(400).json({ error: message });
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
            await db.incrementUsedCredits(redeemedBy, creditsToReturn);
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
            incrementUserUsedCredits(db, redeemedBy, creditsToReturn);
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

  app.post('/api/admin/invite-codes/:code/recharge', requireAuth, requireAdmin, async (req, res) => {
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

        const adminCredits = await db.getAdminCreditSummary();
        if (requestedCredits > adminCredits.remainingCredits) {
          throw new Error(`Admin credits are not enough. Remaining: ${adminCredits.remainingCredits}`);
        }

        const invite = await db.getInviteCode(code);
        if (!invite) {
          res.status(404).json({ error: 'Invite code not found' });
          return;
        }

        const nextCredits = Math.max(0, Number(invite.credits || 0)) + requestedCredits;
        const nextIssuedCredits = Math.max(0, Number(invite.issued_credits || invite.credits || 0)) + requestedCredits;
        const redeemedBy = normalizeString(invite.redeemed_by);

        await db.rechargeInviteCode(
          code,
          nextCredits,
          nextIssuedCredits,
          lowBalanceSinceForCredits(nextCredits, invite.low_balance_since),
        );

        if (redeemedBy) {
          const userCredits = await db.getUserCredits(redeemedBy);
          await db.setUserTotalCredits(redeemedBy, userCredits.totalCredits + requestedCredits);
          await db.syncInviteCodeBalanceForUser(redeemedBy);
        }

        await db.adjustAdminTotalCredits(-requestedCredits);
        res.json({
          ok: true,
          adminCredits: await db.getAdminCreditSummary(),
        });
        return;
      }

      const payload = await withWriteDb((db) => {
        ensureSchema(db);
        reclaimLowBalanceInviteCodes(db);

        const adminCredits = getAdminCreditSummary(db);
        if (requestedCredits > adminCredits.remainingCredits) {
          throw new Error(`Admin credits are not enough. Remaining: ${adminCredits.remainingCredits}`);
        }

        const invite = getOne<Record<string, unknown>>(
          db,
          'SELECT code, credits, issued_credits, redeemed_by, low_balance_since FROM invite_codes WHERE code = ?',
          [code],
        );

        if (!invite) {
          throw new Error('Invite code not found');
        }

        const nextCredits = Math.max(0, Number(invite.credits || 0)) + requestedCredits;
        const nextIssuedCredits = Math.max(0, Number(invite.issued_credits || invite.credits || 0)) + requestedCredits;
        const redeemedBy = normalizeString(invite.redeemed_by);

        db.run(
          'UPDATE invite_codes SET credits = ?, issued_credits = ?, low_balance_since = ? WHERE code = ?',
          [nextCredits, nextIssuedCredits, lowBalanceSinceForCredits(nextCredits, invite.low_balance_since), code],
        );

        if (redeemedBy) {
          const userCredits = getUserCredits(db, redeemedBy);
          setUserTotalCredits(db, redeemedBy, userCredits.totalCredits + requestedCredits);
          syncInviteCodeBalanceForUser(db, redeemedBy);
        }

        adjustAdminTotalCredits(db, -requestedCredits);

        return {
          ok: true,
          adminCredits: getAdminCreditSummary(db),
        };
      });

      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Recharge invite code failed';
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

          await db.incrementUsedCredits(redeemedBy, reclaimableCredits);
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

          incrementUserUsedCredits(db, redeemedBy, reclaimableCredits);
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
    app.all(/^\/(?:api|v1|openapi)(?:\/|$)/, (_req, res) => {
      res.status(404).json({ error: 'API endpoint not found' });
    });
    app.get(/^(?!\/(?:api|v1|openapi|uploads)(?:\/|$)).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  // 鈹€鈹€鈹€ 閿欒澶勭悊 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const rawStatus = Number(
      (error as { status?: unknown; statusCode?: unknown } | null)?.status ||
      (error as { statusCode?: unknown } | null)?.statusCode,
    );
    const status = Number.isFinite(rawStatus) && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
    const fallback = status === 400 ? '请求 JSON 格式不正确' : 'Unexpected server error';
    const message = error instanceof Error ? sanitizeExternalErrorMessage(error.message, fallback) : fallback;
    res.status(status).json({ error: message });
  });

  // 鈹€鈹€鈹€ 鍚姩鐩戝惉 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  const host = process.env.HOST || DEFAULT_HOST;
  const port = Number(process.env.PORT || DEFAULT_PORT);

  // Vercel Serverless 鐜涓嬩笉鍚姩鐩戝惉锛屽鍑?app
  if (IS_VERCEL) {
    return app;
  }

  const httpServer = app.listen(port, host, () => {
    console.log(`Visionary server listening on http://${host}:${port}`);
    if (typeof process.send === 'function') {
      process.send('ready');
    }
    // Maintenance must not delay the listener: a slow database or filesystem
    // cleanup should never make the reverse proxy see the app as unavailable.
    void runImageRetentionCleanup('startup').catch((error) => {
      console.error('[image-cleanup:startup] failed', error);
    });
    if (!IS_VERCEL) {
      setInterval(() => {
        void runImageRetentionCleanup('interval');
      }, IMAGE_CLEANUP_INTERVAL_MS);
    }
    setTimeout(() => void backfillGeneratedThumbnails(), 10_000);
  });
  const shutdown = () => {
    const forceExit = setTimeout(() => process.exit(1), 30_000);
    forceExit.unref();
    httpServer.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
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



