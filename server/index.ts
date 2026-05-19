import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

// ─── 环境检测 ───────────────────────────────────────────────────────

const IS_VERCEL = Boolean(process.env.VERCEL);

// ─── 动态导入模块（避免 Vercel 构建时加载） ─────────────────────────

// sql.js 只在非 Vercel 环境下使用
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initSqlJs: any = null;

async function getSqlJs() {
  if (!initSqlJs && !IS_VERCEL) {
    const sql = await import('sql.js');
    initSqlJs = sql.default;
  }
  return initSqlJs;
}

// Supabase 数据库层只在 Vercel 环境下使用
let supabaseDb: typeof import('./supabase-db.js') | null = null;

async function getSupabaseDb() {
  if (!supabaseDb) {
    supabaseDb = await import('./supabase-db.js');
  }
  return supabaseDb;
}

// ─── 类型定义 ───────────────────────────────────────────────────────

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

type GeneratedImagePayload = {
  prompt: string;
  modelName: string;
  dimensions: string;
  imageSize?: string;
  imagePath: string;
  referenceImages: string[];
  createdAt: string;
  fallbackUsed?: boolean;
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

// ─── 路径常量（本地开发环境使用） ───────────────────────────────────

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

dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

// ─── 环境变量 ───────────────────────────────────────────────────────

const VISIONARY_API_BASE_URL = (process.env.VISIONARY_API_BASE_URL || 'https://visionary.beer').replace(/\/+$/, '');
const VISIONARY_IMAGE_SIZE = process.env.VISIONARY_IMAGE_SIZE || '2K';
const SUPABASE_URL = normalizeEnvValue(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
const DATABASE_PROVIDER = normalizeEnvValue(process.env.DATABASE_PROVIDER || 'sqlite').toLowerCase();
const CORS_ORIGIN = normalizeEnvValue(process.env.CORS_ORIGIN);
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
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

// ─── SQLite 初始化（仅本地环境） ───────────────────────────────────

const require = createRequire(import.meta.url);

// sql.js 初始化（只在非 Vercel 环境）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlJsReady: Promise<any> | null = null;

async function getSqlJsReady() {
  if (!sqlJsReady && !IS_VERCEL) {
    const sql = await import('sql.js');
    sqlJsReady = sql.default({
      locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`),
    });
  }
  return sqlJsReady!;
}

// ─── 常量 ───────────────────────────────────────────────────────────

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
    id: 'gemini-2.0-flash',
    name: 'Gemini Image',
    description: 'Google Gemini 通用模型。',
    creditsCost: 0,
  },
  {
    id: 'Nano_Banana_Pro',
    name: 'Nano Banana Pro',
    description: 'Higher quality Banana image generation.',
    creditsCost: 20,
  },
  {
    id: 'Nano_Banana_2',
    name: 'Nano Banana2',
    description: 'Fast Banana image generation with 2K output.',
    creditsCost: 17,
  },
  {
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    description: 'General image generation with automatic ratio support.',
    creditsCost: 20,
  },
] as const;

const tokenSecret = process.env.JWT_SECRET || process.env.VISIONARY_API_KEY || 'visionary-local-dev-secret';
let writeQueue = Promise.resolve();

// ─── 通用辅助函数 ───────────────────────────────────────────────────

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEnvValue(value: string | undefined) {
  return typeof value === 'string' ? value.trim().replace(/^["']|["']$/g, '') : '';
}

function nowIso() {
  return new Date().toISOString();
}

/** Vercel 兼容的随机字节生成 */
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

/** Vercel 兼容的 SHA256 摘要 */
function sha256Digest(input: string): string {
  if (IS_VERCEL) {
    // 简单哈希替代，仅用于生成 invite user id，不需要密码学安全
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

function toCreditSummary(row: Record<string, unknown> | null) {
  const totalCredits = Number(row?.total_credits || 0);
  const usedCredits = Number(row?.used_credits || 0);
  return {
    totalCredits,
    usedCredits,
    remainingCredits: Math.max(0, totalCredits - usedCredits),
  };
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

function getModelCredits(modelId: string) {
  if (modelId === 'gpt-image-2') return 20;
  if (modelId === 'Nano_Banana_Pro') return 20;
  if (modelId === 'Nano_Banana_2') return 17;
  return 1;
}

function normalizeImageSize(value: string, modelId: string) {
  if (isGeminiModel(modelId)) return '';
  if (modelId !== 'Nano_Banana_Pro') return modelId === 'gpt-image-2' ? '' : VISIONARY_IMAGE_SIZE;
  return value === '4K' ? '4K' : '2K';
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
  if (modelId === 'nano-banana2') return 'Nano_Banana_2';
  if (modelId === 'dalle3-mini' || modelId === 'sdxl') return 'Nano_Banana_2';
  return models.some((item) => item.id === modelId) ? modelId : 'Nano_Banana_Pro';
}

function isGeminiModel(modelId: string) {
  return modelId === 'gemini-2.0-flash';
}

function normalizeRatio(value: string, modelId: string) {
  const supported = ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'];
  if (value === 'auto') {
    return modelId === 'gpt-image-2' ? 'auto' : '1:1';
  }
  return supported.includes(value) ? value : '1:1';
}

function generateInviteCode() {
  return `BANANA-${randomHex(4).toUpperCase()}`;
}

// ─── SQLite 辅助函数（仅本地环境使用） ──────────────────────────────

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
  return DATABASE_PROVIDER === 'supabase';
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

    const redeemedBy = invite.redeemed_by ? String(invite.redeemed_by) : '';
    if (redeemedBy) {
      const userCredits = getUserCredits(db, redeemedBy);
      setUserTotalCredits(db, redeemedBy, userCredits.usedCredits);
    }

    db.run('UPDATE invite_codes SET credits = 0, low_balance_since = NULL WHERE code = ?', [String(invite.code)]);
    adjustAdminTotalCredits(db, creditsToReturn);
  }
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

// ─── 获取用户积分（统一接口） ───────────────────────────────────────

async function getPublicUser(user: AuthUser) {
  if (IS_VERCEL) {
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

// ─── Gemini API ─────────────────────────────────────────────────────

const GEMINI_API_KEY = normalizeString(process.env.GEMINI_API_KEY);

async function callGeminiGeneration({
  prompt,
  ratio,
}: {
  prompt: string;
  ratio: string;
}): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const aspectRatioMap: Record<string, string> = {
    '1:1': '1:1',
    '16:9': '16:9',
    '9:16': '9:16',
    '4:3': '4:3',
    '3:4': '3:4',
    '3:2': '3:2',
    '2:3': '2:3',
  };
  const geminiRatio = aspectRatioMap[ratio] || '1:1';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Generate an image based on this prompt: ${prompt}. Aspect ratio: ${geminiRatio}. Only output the image, no text.`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    const errMsg = String(
      (payload?.error as Record<string, unknown>)?.message ||
      `Gemini API request failed (${response.status})`,
    );
    const isQuotaError =
      response.status === 429 ||
      String(errMsg).toLowerCase().includes('quota') ||
      String(errMsg).toLowerCase().includes('rate limit') ||
      String(errMsg).toLowerCase().includes('resource exhausted');
    const error = new Error(errMsg) as Error & { code?: string; isQuotaError?: boolean };
    error.code = 'GEMINI_QUOTA_EXCEEDED';
    error.isQuotaError = isQuotaError;
    throw error;
  }

  const candidates = payload?.candidates as Array<Record<string, unknown>> | undefined;
  if (!candidates || candidates.length === 0) {
    throw new Error('Gemini API returned no candidates');
  }

  const parts = candidates[0].content as Record<string, unknown>;
  const partsArray = parts?.parts as Array<Record<string, unknown>> | undefined;

  if (!partsArray) {
    throw new Error('Gemini API returned no content parts');
  }

  for (const part of partsArray) {
    if (part.inlineData) {
      const inlineData = part.inlineData as { mimeType: string; data: string };
      return `data:${inlineData.mimeType};base64,${inlineData.data}`;
    }
  }

  throw new Error('Gemini API returned no image in response');
}

function isGeminiQuotaError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'isQuotaError' in error) {
    return (error as { isQuotaError: boolean }).isQuotaError === true;
  }
  return false;
}

// ─── Visionary API ──────────────────────────────────────────────────

async function callVisionaryGeneration({
  prompt,
  modelId,
  ratio,
  imageSize,
  images,
}: {
  prompt: string;
  modelId: string;
  ratio: string;
  imageSize: string;
  images: string[];
}) {
  const apiKey = normalizeString(process.env.VISIONARY_API_KEY);
  if (!apiKey) {
    throw new Error('VISIONARY_API_KEY is not configured');
  }

  const body = {
    prompt,
    model: modelId,
    ratio,
    imageSize: modelId === 'gpt-image-2' ? undefined : imageSize,
    images,
  };

  const response = await fetch(`${VISIONARY_API_BASE_URL}/openapi/v1/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Idempotency-Key': `req_${Date.now()}_${randomHex(8)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as VisionaryGenerationResponse | null;
  if (!response.ok) {
    const message = payload?.error || payload?.failure_reason || `Visionary API request failed (${response.status})`;
    throw new Error(message);
  }

  const imageUrl = payload?.results?.find((item) => item.url || item.content)?.url || payload?.results?.[0]?.content;
  if (!imageUrl) {
    throw new Error(`Visionary API returned no image URL${payload?.id ? `, response id: ${payload.id}` : ''}`);
  }

  return imageUrl;
}

// ─── SVG 占位图 ─────────────────────────────────────────────────────

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
  )}" font-family="Segoe UI, Arial, sans-serif" font-weight="700">BANANAS AI</text>
  <text x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.26)}" fill="rgba(255,255,255,0.95)" font-size="${Math.round(
    Math.min(width, height) * 0.068,
  )}" font-family="Segoe UI, Arial, sans-serif" font-weight="700">${safePrompt}</text>
  <text x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.34)}" fill="rgba(255,255,255,0.72)" font-size="${Math.round(
    Math.min(width, height) * 0.03,
  )}" font-family="Consolas, monospace">${safeModel} / ${dimensions}</text>
</svg>`.trim();
}

// ─── 参考图片持久化 ────────────────────────────────────────────────

function fileExtensionFromMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/svg+xml') return 'svg';
  return 'png';
}

async function persistReferenceImages(referenceImages: ReferenceUploadInput[]) {
  // Vercel 环境下不保存参考图片到本地文件系统，直接返回原始 data URL
  if (IS_VERCEL) {
    return referenceImages
      .slice(0, 3)
      .map((item) => normalizeString(item.data))
      .filter(Boolean);
  }

  const output: string[] = [];

  for (const item of referenceImages.slice(0, 3)) {
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

// ─── 服务器启动 ─────────────────────────────────────────────────────

async function start() {
  // 本地环境初始化
  if (!IS_VERCEL) {
    await ensureRuntimeDirectories();
    await restoreSqliteFromSupabase();
    await ensureRuntimeSchema();
  } else {
    // Vercel 环境：初始化 Supabase schema
    const db = await getSupabaseDb();
    await db.ensureRuntimeSchema();
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
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '20mb' }));

  // 静态文件服务仅本地环境
  if (!IS_VERCEL) {
    app.use('/uploads', express.static(UPLOADS_DIR));
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      userStorage: IS_VERCEL ? 'Supabase' : 'SQLite',
    });
  });

  // ─── 注册 ─────────────────────────────────────────────────────────

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
      if (IS_VERCEL) {
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

      // SQLite 模式
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

  // ─── 登录 ─────────────────────────────────────────────────────────

  app.post('/api/auth/login', async (req, res) => {
    const username = normalizeString(req.body?.username);
    const password = normalizeString(req.body?.password);

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    try {
      if (IS_VERCEL) {
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

      // SQLite 模式
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

  // ─── 邀请码登录 ───────────────────────────────────────────────────

  app.post('/api/auth/invite', async (req, res) => {
    const code = normalizeString(req.body?.code).toUpperCase();

    if (!code) {
      res.status(400).json({ error: 'Invite code is required' });
      return;
    }

    try {
      if (IS_VERCEL) {
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

        const digest = sha256Digest(code);
        const userId = redeemedBy || `invite-${digest}`;
        const username = `invite-${code.slice(-4).toLowerCase()}`;

        if (!redeemedBy) {
          await db.redeemInviteCode(code, userId);
          await db.ensureUserCredits(userId, username, credits);
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

      // SQLite 模式
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

  // ─── 获取当前用户 ─────────────────────────────────────────────────

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    if (IS_VERCEL) {
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

  // ─── 模型列表 ─────────────────────────────────────────────────────

  app.get('/api/models', requireAuth, (_req, res) => {
    res.json({ models });
  });

  // ─── 图片生成 ─────────────────────────────────────────────────────

  app.post('/api/generate', requireAuth, async (req, res) => {
    const prompt = normalizeString(req.body?.prompt);
    const model = normalizeString(req.body?.model);
    const dimensions = normalizeString(req.body?.dimensions) || '1:1';
    const requestedImageSize = normalizeString(req.body?.imageSize);
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
      let creditsUsed = getModelCredits(modelId);
      let fallbackUsed = false;

      if (isGeminiModel(modelId)) {
        if (!GEMINI_API_KEY) {
          modelId = 'Nano_Banana_2';
          ratio = normalizeRatio(dimensions, modelId);
          modelName = modelNameFromId(modelId);
          imageSize = normalizeImageSize(requestedImageSize, modelId);
          creditsUsed = getModelCredits(modelId);
          fallbackUsed = true;
        }
      }

      // 积分检查
      if (creditsUsed > 0) {
        if (IS_VERCEL) {
          const db = await getSupabaseDb();
          await db.reclaimLowBalanceInviteCodes();
          await db.ensureUserCredits(req.authUser!.userId, req.authUser!.username, 0);
          const credits = await db.getUserCredits(req.authUser!.userId);
          if (credits.remainingCredits < creditsUsed) {
            throw new Error(`积分不足，本次需要 ${creditsUsed} 积分，当前剩余 ${credits.remainingCredits} 积分`);
          }
        } else {
          await withWriteDb((db) => {
            ensureSchema(db);
            reclaimLowBalanceInviteCodes(db);
            ensureUserCredits(db, req.authUser!.userId, req.authUser!.username, 0);
            const credits = getUserCredits(db, req.authUser!.userId);
            if (credits.remainingCredits < creditsUsed) {
              throw new Error(`积分不足，本次需要 ${creditsUsed} 积分，当前剩余 ${credits.remainingCredits} 积分`);
            }
          });
        }
      }

      const referenceImages = await persistReferenceImages(referenceImagesInput);
      const createdAt = nowIso();
      let imagePath: string;

      if (isGeminiModel(modelId)) {
        try {
          imagePath = await callGeminiGeneration({
            prompt,
            ratio,
          });
        } catch (geminiError) {
          if (isGeminiQuotaError(geminiError)) {
            const fallbackModelId = 'Nano_Banana_2';
            const fallbackCredits = getModelCredits(fallbackModelId);

            if (IS_VERCEL) {
              const db = await getSupabaseDb();
              await db.reclaimLowBalanceInviteCodes();
              await db.ensureUserCredits(req.authUser!.userId, req.authUser!.username, 0);
              const credits = await db.getUserCredits(req.authUser!.userId);
              if (credits.remainingCredits < fallbackCredits) {
                throw new Error(
                  `Gemini 额度已用完，自动切换到 ${modelNameFromId(fallbackModelId)} 但积分不足（需要 ${fallbackCredits} 积分，当前剩余 ${credits.remainingCredits} 积分）。请充值或选择其他模型。`,
                );
              }
            } else {
              await withWriteDb((db) => {
                ensureSchema(db);
                reclaimLowBalanceInviteCodes(db);
                ensureUserCredits(db, req.authUser!.userId, req.authUser!.username, 0);
                const credits = getUserCredits(db, req.authUser!.userId);
                if (credits.remainingCredits < fallbackCredits) {
                  throw new Error(
                    `Gemini 额度已用完，自动切换到 ${modelNameFromId(fallbackModelId)} 但积分不足（需要 ${fallbackCredits} 积分，当前剩余 ${credits.remainingCredits} 积分）。请充值或选择其他模型。`,
                  );
                }
              });
            }

            modelId = fallbackModelId;
            ratio = normalizeRatio(dimensions, modelId);
            modelName = modelNameFromId(modelId);
            imageSize = normalizeImageSize(requestedImageSize, modelId);
            creditsUsed = fallbackCredits;
            fallbackUsed = true;

            imagePath = await callVisionaryGeneration({
              prompt,
              modelId,
              ratio,
              imageSize,
              images: referenceImagesInput
                .map((item) => normalizeString(item.data))
                .filter((item) => item.startsWith('data:image/') || item.startsWith('http://') || item.startsWith('https://')),
            });
          } else {
            throw geminiError;
          }
        }
      } else {
        imagePath = await callVisionaryGeneration({
          prompt,
          modelId,
          ratio,
          imageSize,
          images: referenceImagesInput
            .map((item) => normalizeString(item.data))
            .filter((item) => item.startsWith('data:image/') || item.startsWith('http://') || item.startsWith('https://')),
        });
      }

      const payload: GeneratedImagePayload = {
        prompt,
        modelName,
        dimensions: ratio,
        imageSize,
        imagePath,
        referenceImages,
        createdAt,
        fallbackUsed,
      };

      // 扣除积分
      if (creditsUsed > 0) {
        if (IS_VERCEL) {
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

      // 记录生成历史
      if (IS_VERCEL) {
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

      res.json({ image: payload });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Generate failed' });
    }
  });

  // ─── 生成历史 ─────────────────────────────────────────────────────

  app.get('/api/user/history', requireAuth, async (req, res) => {
    const userId = req.authUser!.userId;

    try {
      if (IS_VERCEL) {
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
        res.json({ history });
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

      res.json({ history });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch history failed' });
    }
  });

  // ─── 管理员概览 ───────────────────────────────────────────────────

  app.get('/api/admin/overview', requireAuth, requireAdmin, async (req, res) => {
    const recordsPage = parsePaginationValue(req.query.recordsPage, 1, 1, 100000);
    const recordsPageSize = parsePaginationValue(req.query.recordsPageSize, 20, 1, 100);
    const inviteCodesPage = parsePaginationValue(req.query.inviteCodesPage, 1, 1, 100000);
    const inviteCodesPageSize = parsePaginationValue(req.query.inviteCodesPageSize, 20, 1, 100);

    try {
      if (IS_VERCEL) {
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
          records,
          recordsPage: toPagination(recordsPage, recordsPageSize, recordsTotal),
          inviteCodes,
          inviteCodesPage: toPagination(inviteCodesPage, inviteCodesPageSize, inviteCodesTotal),
          adminCredits,
        });
        return;
      }

      // SQLite 模式
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

  // ─── 创建邀请码 ───────────────────────────────────────────────────

  app.post('/api/admin/invite-codes', requireAuth, requireAdmin, async (req, res) => {
    const requestedCredits = Number(req.body?.credits);

    if (!Number.isFinite(requestedCredits) || requestedCredits <= 0) {
      res.status(400).json({ error: 'Credits must be a positive number' });
      return;
    }

    try {
      if (IS_VERCEL) {
        const db = await getSupabaseDb();
        await db.reclaimLowBalanceInviteCodes();

        const adminCredits = await db.getAdminCreditSummary();
        const credits = Math.floor(requestedCredits);

        if (credits > adminCredits.remainingCredits) {
          throw new Error(`管理员剩余积分不足，当前剩余 ${adminCredits.remainingCredits} 积分`);
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

      // SQLite 模式
      const payload = await withWriteDb((db) => {
        ensureSchema(db);
        reclaimLowBalanceInviteCodes(db);
        const adminCredits = getAdminCreditSummary(db);
        const credits = Math.floor(requestedCredits);

        if (credits > adminCredits.remainingCredits) {
          throw new Error(`管理员剩余积分不足，当前剩余 ${adminCredits.remainingCredits} 积分`);
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

  // ─── 用户图片列表 ─────────────────────────────────────────────────

  app.get('/api/user/images', requireAuth, async (req, res) => {
    const category = normalizeString(req.query.category);
    const userId = req.authUser!.userId;

    if (category && !validateCategory(category)) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }

    try {
      if (IS_VERCEL) {
        const db = await getSupabaseDb();
        const images = await db.getUserImages(userId, category || undefined);
        res.json({
          images: images.map((row) => toSavedImage({
            id: row.id,
            prompt: row.prompt,
            model_name: row.model_name,
            dimensions: row.dimensions,
            image_path: row.image_path,
            category: row.category,
            reference_images: row.reference_images,
            created_at: row.created_at,
          })),
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

      res.json({ images });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Fetch images failed' });
    }
  });

  // ─── 保存/移动图片 ────────────────────────────────────────────────

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
      if (IS_VERCEL) {
        const db = await getSupabaseDb();

        if (typeof imageId === 'number') {
          // Vercel 环境下 imageId 是 UUID 字符串，但前端可能传 number
          // 尝试通过字符串 ID 查找
          const existing = await db.getImageById(String(imageId), userId);
          if (!existing) {
            res.json({ image: null });
            return;
          }

          await db.updateImageCategory(String(imageId), userId, category);
          res.json({
            image: toSavedImage({
              id: existing.id,
              prompt: existing.prompt,
              model_name: existing.model_name,
              dimensions: existing.dimensions,
              image_path: existing.image_path,
              category,
              reference_images: existing.reference_images,
              created_at: existing.created_at,
            }),
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
          image: toSavedImage({
            id: savedImage.id,
            prompt: savedImage.prompt,
            model_name: savedImage.model_name,
            dimensions: savedImage.dimensions,
            image_path: savedImage.image_path,
            category: savedImage.category,
            reference_images: savedImage.reference_images,
            created_at: savedImage.created_at,
          }),
        });
        return;
      }

      // SQLite 模式
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

      res.json({ image: savedImage ? toSavedImage(savedImage) : null });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Save image failed' });
    }
  });

  // ─── 删除图片 ─────────────────────────────────────────────────────

  app.delete('/api/user/images/:id', requireAuth, async (req, res) => {
    const id = req.params.id;
    const userId = req.authUser!.userId;

    try {
      if (IS_VERCEL) {
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

  // ─── 静态文件服务（仅本地环境） ───────────────────────────────────

  if (hasDistBuild) {
    app.use(express.static(DIST_DIR));
    app.get(/^(?!\/api(?:\/|$)|\/uploads(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  // ─── 错误处理 ─────────────────────────────────────────────────────

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    res.status(500).json({ error: message });
  });

  // ─── 启动监听 ─────────────────────────────────────────────────────

  const host = process.env.HOST || DEFAULT_HOST;
  const port = Number(process.env.PORT || DEFAULT_PORT);

  // Vercel Serverless 环境下不启动监听，导出 app
  if (IS_VERCEL) {
    return app;
  }

  app.listen(port, host, () => {
    console.log(`Visionary server listening on http://${host}:${port}`);
  });
  return app;
}

const serverPromise = start();

// 本地开发时直接启动
if (!IS_VERCEL) {
  serverPromise.catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// Vercel Serverless 导出
export default serverPromise;
