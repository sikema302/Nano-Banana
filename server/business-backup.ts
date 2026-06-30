import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';

import { createClient } from '@supabase/supabase-js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const BACKUP_MAGIC = Buffer.from('PXBK1');
const DEFAULT_PAGE_SIZE = 1_000;

export const BUSINESS_BACKUP_TABLES = [
  'users',
  'user_migrations',
  'user_credits',
  'invite_codes',
  'generations',
  'app_settings',
] as const;

export type BusinessBackupTable = (typeof BUSINESS_BACKUP_TABLES)[number];

const TABLE_ORDER_COLUMNS: Record<BusinessBackupTable, string> = {
  users: 'id',
  user_migrations: 'legacy_user_id',
  user_credits: 'user_id',
  invite_codes: 'code',
  generations: 'id',
  app_settings: 'key',
};

const TABLE_SELECT_COLUMNS: Record<BusinessBackupTable, string> = {
  users: '*',
  user_migrations: '*',
  user_credits: '*',
  invite_codes: '*',
  generations: 'id,user_id,username,prompt,model_id,model_name,dimensions,image_size,credits_used,api_request_ms,created_at',
  app_settings: '*',
};
const GENERATION_COLUMNS_WITHOUT_REQUEST_TIME =
  'id,user_id,username,prompt,model_id,model_name,dimensions,image_size,credits_used,created_at';

export type BusinessBackupPayload = {
  formatVersion: 2;
  createdAt: string;
  source: 'supabase';
  excluded: [
    'images',
    'uploads/generated',
    'uploads/references',
    'generations.image_path',
    'generations.reference_images',
  ];
  tables: Record<BusinessBackupTable, Array<Record<string, unknown>>>;
  manifest: Record<BusinessBackupTable, { rows: number; sha256: string }>;
};

type BackupOptions = {
  backupDir?: string;
  retentionCount?: number;
};

function requiredEnv(name: 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY') {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required for business data backups`);
  return value;
}

function backupSecret() {
  const value = String(
    process.env.BACKUP_ENCRYPTION_KEY ||
      process.env.JWT_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      '',
  ).trim();
  if (!value) throw new Error('BACKUP_ENCRYPTION_KEY, JWT_SECRET, or SUPABASE_SERVICE_ROLE_KEY is required');
  return crypto.createHash('sha256').update(`pixory-business-backup:${value}`).digest();
}

function resolveBackupDir(backupDir?: string) {
  const configured = backupDir || process.env.BUSINESS_BACKUP_DIR || path.join('data', 'business-backups');
  return path.resolve(configured);
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hashRows(rows: Array<Record<string, unknown>>) {
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function createSupabaseAdmin() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchAllRows(
  client: ReturnType<typeof createSupabaseAdmin>,
  table: BusinessBackupTable,
) {
  const rows: Array<Record<string, unknown>> = [];
  const pageSize = positiveInteger(process.env.BUSINESS_BACKUP_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  let selectColumns = TABLE_SELECT_COLUMNS[table];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(selectColumns)
      .order(TABLE_ORDER_COLUMNS[table], { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error && table === 'generations' && error.message.includes('api_request_ms')) {
      selectColumns = GENERATION_COLUMNS_WITHOUT_REQUEST_TIME;
      offset -= pageSize;
      continue;
    }
    if (error) throw new Error(`Backup ${table} failed: ${error.message}`);

    const page = (data || []) as unknown as Array<Record<string, unknown>>;
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

async function buildPayload(): Promise<BusinessBackupPayload> {
  const client = createSupabaseAdmin();
  const entries: Array<readonly [BusinessBackupTable, Array<Record<string, unknown>>]> = [];
  for (const table of BUSINESS_BACKUP_TABLES) {
    entries.push([table, await fetchAllRows(client, table)] as const);
  }
  const tables = Object.fromEntries(entries) as BusinessBackupPayload['tables'];
  const manifest = Object.fromEntries(
    BUSINESS_BACKUP_TABLES.map((table) => [table, { rows: tables[table].length, sha256: hashRows(tables[table]) }]),
  ) as BusinessBackupPayload['manifest'];

  return {
    formatVersion: 2,
    createdAt: new Date().toISOString(),
    source: 'supabase',
    excluded: [
      'images',
      'uploads/generated',
      'uploads/references',
      'generations.image_path',
      'generations.reference_images',
    ],
    tables,
    manifest,
  };
}

async function encryptPayload(payload: BusinessBackupPayload) {
  const compressed = await gzipAsync(Buffer.from(JSON.stringify(payload)), { level: 9 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', backupSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return Buffer.concat([BACKUP_MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

async function decryptPayload(fileBuffer: Buffer): Promise<BusinessBackupPayload> {
  const headerLength = BACKUP_MAGIC.length + 12 + 16;
  if (fileBuffer.length <= headerLength || !fileBuffer.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    throw new Error('Invalid business backup file');
  }

  const ivStart = BACKUP_MAGIC.length;
  const tagStart = ivStart + 12;
  const encryptedStart = tagStart + 16;
  const decipher = crypto.createDecipheriv('aes-256-gcm', backupSecret(), fileBuffer.subarray(ivStart, tagStart));
  decipher.setAuthTag(fileBuffer.subarray(tagStart, encryptedStart));
  const compressed = Buffer.concat([decipher.update(fileBuffer.subarray(encryptedStart)), decipher.final()]);
  const payload = JSON.parse((await gunzipAsync(compressed)).toString('utf8')) as BusinessBackupPayload;
  validatePayload(payload);
  return payload;
}

function validatePayload(payload: BusinessBackupPayload) {
  if (payload.formatVersion !== 2 || payload.source !== 'supabase') throw new Error('Unsupported backup format');
  for (const exclusion of ['images', 'generations.image_path', 'generations.reference_images']) {
    if (!(payload.excluded as string[])?.includes(exclusion)) throw new Error('Backup exclusion manifest is invalid');
  }

  for (const table of BUSINESS_BACKUP_TABLES) {
    const rows = payload.tables?.[table];
    const manifest = payload.manifest?.[table];
    if (!Array.isArray(rows) || !manifest) throw new Error(`Backup table ${table} is missing`);
    if (manifest.rows !== rows.length || manifest.sha256 !== hashRows(rows)) {
      throw new Error(`Backup table ${table} failed checksum validation`);
    }
  }

  if ('images' in (payload.tables as Record<string, unknown>)) throw new Error('Backup unexpectedly contains images');
  for (const row of payload.tables.generations) {
    if ('image_path' in row || 'reference_images' in row) {
      throw new Error('Backup unexpectedly contains generation image data');
    }
  }
}

function backupFileName(createdAt: string) {
  return `business-${createdAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}.json.gz.enc`;
}

async function listBackupFiles(backupDir: string) {
  try {
    return (await fs.readdir(backupDir))
      .filter((name) => /^business-\d{8}T\d{6}Z\.json\.gz\.enc$/.test(name))
      .sort()
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function pruneBackups(backupDir: string, retentionCount: number) {
  const files = await listBackupFiles(backupDir);
  await Promise.all(files.slice(retentionCount).map((name) => fs.unlink(path.join(backupDir, name))));
}

export async function readBusinessDataBackup(filePath: string) {
  return decryptPayload(await fs.readFile(path.resolve(filePath)));
}

export async function verifyBusinessDataBackup(filePath: string) {
  const payload = await readBusinessDataBackup(filePath);
  return {
    filePath: path.resolve(filePath),
    createdAt: payload.createdAt,
    excluded: payload.excluded,
    counts: Object.fromEntries(BUSINESS_BACKUP_TABLES.map((table) => [table, payload.tables[table].length])),
  };
}

export async function createBusinessDataBackup(options: BackupOptions = {}) {
  const backupDir = resolveBackupDir(options.backupDir);
  const retentionCount = positiveInteger(
    options.retentionCount ?? process.env.BUSINESS_BACKUP_RETENTION_COUNT,
    30,
  );
  await fs.mkdir(backupDir, { recursive: true });

  const payload = await buildPayload();
  const filePath = path.join(backupDir, backupFileName(payload.createdAt));
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, await encryptPayload(payload), { mode: 0o600 });
  await fs.rename(temporaryPath, filePath);

  const verification = await verifyBusinessDataBackup(filePath);
  await pruneBackups(backupDir, retentionCount);
  return verification;
}

async function latestBackupAgeMs(backupDir: string) {
  const [latest] = await listBackupFiles(backupDir);
  if (!latest) return Number.POSITIVE_INFINITY;
  const stat = await fs.stat(path.join(backupDir, latest));
  return Date.now() - stat.mtimeMs;
}

let backupRun: Promise<unknown> | null = null;

function runBackupOnce(options: BackupOptions) {
  if (backupRun) return backupRun;
  backupRun = createBusinessDataBackup(options).finally(() => {
    backupRun = null;
  });
  return backupRun;
}

export function startBusinessDataBackupScheduler(options: BackupOptions = {}) {
  const backupDir = resolveBackupDir(options.backupDir);
  const intervalHours = positiveInteger(process.env.BUSINESS_BACKUP_INTERVAL_HOURS, 24);
  const startupMaxAgeHours = positiveInteger(process.env.BUSINESS_BACKUP_STARTUP_MAX_AGE_HOURS, 6);
  const intervalMs = intervalHours * 60 * 60 * 1_000;

  const runScheduledBackup = async (force: boolean) => {
    if (!force && (await latestBackupAgeMs(backupDir)) < startupMaxAgeHours * 60 * 60 * 1_000) return;
    const result = await runBackupOnce({ ...options, backupDir });
    console.log('Business data backup completed:', result);
  };

  void runScheduledBackup(false).catch((error) => console.error('Business data backup failed:', error));
  const timer = setInterval(() => {
    void runScheduledBackup(true).catch((error) => console.error('Business data backup failed:', error));
  }, intervalMs);
  timer.unref();
  return timer;
}
