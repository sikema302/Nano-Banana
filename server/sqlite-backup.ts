import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const SQLITE_BACKUP_MAGIC = Buffer.from('PXSQL1');

type CreateSqliteBackupOptions = {
  sourceFile: string;
  backupDir?: string;
  label?: string;
  retentionCount?: number;
};

type SqliteBackupSchedulerOptions = CreateSqliteBackupOptions & {
  intervalHours?: number;
  startupMaxAgeHours?: number;
};

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function backupSecret() {
  const value = String(
    process.env.BACKUP_ENCRYPTION_KEY ||
      process.env.JWT_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      '',
  ).trim();
  if (!value) throw new Error('BACKUP_ENCRYPTION_KEY, JWT_SECRET, or SUPABASE_SERVICE_ROLE_KEY is required');
  return crypto.createHash('sha256').update(`pixory-sqlite-backup:${value}`).digest();
}

function safeLabel(value: string | undefined) {
  return String(value || 'sqlite').trim().replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'sqlite';
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sha256(value: Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function encryptSqlite(sqliteBytes: Buffer) {
  const compressed = await gzipAsync(sqliteBytes, { level: 9 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', backupSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return Buffer.concat([SQLITE_BACKUP_MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

async function decryptSqlite(encryptedBytes: Buffer) {
  const headerLength = SQLITE_BACKUP_MAGIC.length + 12 + 16;
  if (
    encryptedBytes.length <= headerLength ||
    !encryptedBytes.subarray(0, SQLITE_BACKUP_MAGIC.length).equals(SQLITE_BACKUP_MAGIC)
  ) {
    throw new Error('Invalid encrypted SQLite backup');
  }

  const ivStart = SQLITE_BACKUP_MAGIC.length;
  const tagStart = ivStart + 12;
  const encryptedStart = tagStart + 16;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    backupSecret(),
    encryptedBytes.subarray(ivStart, tagStart),
  );
  decipher.setAuthTag(encryptedBytes.subarray(tagStart, encryptedStart));
  const compressed = Buffer.concat([
    decipher.update(encryptedBytes.subarray(encryptedStart)),
    decipher.final(),
  ]);
  return gunzipAsync(compressed);
}

async function listBackups(backupDir: string, label: string) {
  try {
    return (await fs.readdir(backupDir))
      .filter((name) => name.startsWith(`${label}-`) && name.endsWith('.sqlite.gz.enc'))
      .sort()
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function verifyEncryptedSqliteBackup(filePath: string) {
  const encryptedBytes = await fs.readFile(path.resolve(filePath));
  const sqliteBytes = await decryptSqlite(encryptedBytes);
  if (sqliteBytes.length < 16 || sqliteBytes.subarray(0, 16).toString('utf8') !== 'SQLite format 3\u0000') {
    throw new Error('Decrypted backup is not a SQLite database');
  }
  return { filePath: path.resolve(filePath), bytes: sqliteBytes.length, sha256: sha256(sqliteBytes) };
}

export async function createEncryptedSqliteBackup(options: CreateSqliteBackupOptions) {
  const sourceFile = path.resolve(options.sourceFile);
  const backupDir = path.resolve(options.backupDir || path.join('data', 'sqlite-backups'));
  const label = safeLabel(options.label);
  const retentionCount = positiveInteger(options.retentionCount, 14);
  const sqliteBytes = await fs.readFile(sourceFile);
  if (sqliteBytes.length < 16 || sqliteBytes.subarray(0, 16).toString('utf8') !== 'SQLite format 3\u0000') {
    throw new Error(`${sourceFile} is not a SQLite database`);
  }

  await fs.mkdir(backupDir, { recursive: true });
  const filePath = path.join(backupDir, `${label}-${timestamp()}.sqlite.gz.enc`);
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, await encryptSqlite(sqliteBytes), { mode: 0o600 });
  await fs.rename(temporaryPath, filePath);

  const verification = await verifyEncryptedSqliteBackup(filePath);
  if (verification.sha256 !== sha256(sqliteBytes)) throw new Error('SQLite backup checksum validation failed');

  const files = await listBackups(backupDir, label);
  await Promise.all(files.slice(retentionCount).map((name) => fs.unlink(path.join(backupDir, name))));
  return verification;
}

async function latestBackupAgeMs(backupDir: string, label: string) {
  const [latest] = await listBackups(backupDir, label);
  if (!latest) return Number.POSITIVE_INFINITY;
  const stats = await fs.stat(path.join(backupDir, latest));
  return Date.now() - stats.mtimeMs;
}

export function startSqliteBackupScheduler(options: SqliteBackupSchedulerOptions) {
  const backupDir = path.resolve(options.backupDir || path.join('data', 'sqlite-backups'));
  const label = safeLabel(options.label);
  const intervalHours = positiveInteger(options.intervalHours ?? process.env.SQLITE_BACKUP_INTERVAL_HOURS, 24);
  const startupMaxAgeHours = positiveInteger(
    options.startupMaxAgeHours ?? process.env.SQLITE_BACKUP_STARTUP_MAX_AGE_HOURS,
    6,
  );
  const intervalMs = intervalHours * 60 * 60 * 1_000;
  let backupRun: Promise<unknown> | null = null;

  const run = async (force: boolean) => {
    if (!force && (await latestBackupAgeMs(backupDir, label)) < startupMaxAgeHours * 60 * 60 * 1_000) return;
    if (backupRun) return backupRun;
    backupRun = createEncryptedSqliteBackup({ ...options, backupDir, label }).finally(() => {
      backupRun = null;
    });
    const result = await backupRun;
    console.log('SQLite backup completed:', result);
  };

  void run(false).catch((error) => console.error('SQLite backup failed:', error));
  const timer = setInterval(() => {
    void run(true).catch((error) => console.error('SQLite backup failed:', error));
  }, intervalMs);
  timer.unref();
  return timer;
}
