import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import initSqlJs from 'sql.js';
import { Agent } from 'undici';

import { createEncryptedSqliteBackup } from '../server/sqlite-backup.js';

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

type MigrationTable = {
  name: string;
  primaryKey: string;
  select: string;
  insert: string;
  fallbackSelect?: string;
  defaults?: Record<string, unknown>;
  optional?: boolean;
};

const TABLES: MigrationTable[] = [
  {
    name: 'users',
    primaryKey: 'id',
    select: 'id,username,password_hash,email,created_at',
    insert: 'INSERT INTO users (id,username,password_hash,email,created_at) VALUES (?,?,?,?,?)',
  },
  {
    name: 'user_migrations',
    primaryKey: 'legacy_user_id',
    select: 'legacy_user_id,supabase_user_id,username,migrated_at',
    insert: 'INSERT INTO user_migrations (legacy_user_id,supabase_user_id,username,migrated_at) VALUES (?,?,?,?)',
  },
  {
    name: 'user_credits',
    primaryKey: 'user_id',
    select: 'user_id,username,total_credits,used_credits,created_at,updated_at',
    insert: 'INSERT INTO user_credits (user_id,username,total_credits,used_credits,created_at,updated_at) VALUES (?,?,?,?,?,?)',
  },
  {
    name: 'invite_codes',
    primaryKey: 'code',
    select: 'code,credits,issued_credits,created_by,created_at,redeemed_by,redeemed_at,low_balance_since',
    insert: 'INSERT INTO invite_codes (code,credits,issued_credits,created_by,created_at,redeemed_by,redeemed_at,low_balance_since) VALUES (?,?,?,?,?,?,?,?)',
  },
  {
    name: 'generations',
    primaryKey: 'id',
    select: 'id,user_id,username,prompt,model_id,model_name,dimensions,image_size,image_path,credits_used,api_request_ms,reference_images,created_at',
    fallbackSelect: 'id,user_id,username,prompt,model_id,model_name,dimensions,image_size,image_path,credits_used,reference_images,created_at',
    defaults: { api_request_ms: 0 },
    insert: 'INSERT INTO generations (id,user_id,username,prompt,model_id,model_name,dimensions,image_size,image_path,credits_used,api_request_ms,reference_images,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
  },
  {
    name: 'images',
    primaryKey: 'id',
    select: 'id,user_id,prompt,model_name,dimensions,image_path,category,reference_images,created_at',
    insert: 'INSERT INTO images (id,user_id,prompt,model_name,dimensions,image_path,category,reference_images,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  },
  {
    name: 'generation_requests',
    primaryKey: 'id',
    select: 'id,user_id,username,prompt,model_id,model_name,dimensions,image_size,image_path,credits_used,api_request_ms,reference_images,result_status,result_message,created_at',
    defaults: { api_request_ms: 0 },
    insert: 'INSERT INTO generation_requests (id,user_id,username,prompt,model_id,model_name,dimensions,image_size,image_path,credits_used,api_request_ms,reference_images,result_status,result_message,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    optional: true,
  },
  {
    name: 'app_settings',
    primaryKey: 'key',
    select: 'key,value,updated_at',
    insert: 'INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)',
  },
];

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config({ path: path.join(rootDir, '.env') });

const migrationDispatcher = new Agent({
  connections: 2,
  pipelining: 0,
  connect: { timeout: 10_000 },
  headersTimeout: 30_000,
  bodyTimeout: 30_000,
});

function requiredEnv(name: 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY') {
  const value = String(process.env[name] || '').trim().replace(/^["']|["']$/g, '');
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function migrationFetch(input: RequestInfo | URL, init?: RequestInit) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
        dispatcher: migrationDispatcher,
      } as RequestInit);
      const body = await response.arrayBuffer();
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Supabase migration request failed'));
}

function runQuery(db: SqlDatabase, sql: string, params: unknown[] = []) {
  const statement = db.prepare(sql, params);
  const rows: Record<string, unknown>[] = [];
  try {
    while (statement.step()) rows.push(statement.getAsObject());
  } finally {
    statement.free();
  }
  return rows;
}

function ensureSchema(db: SqlDatabase) {
  db.run('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, email TEXT, created_at TEXT NOT NULL)');
  db.run('CREATE TABLE user_migrations (legacy_user_id INTEGER PRIMARY KEY, supabase_user_id TEXT NOT NULL UNIQUE, username TEXT NOT NULL, migrated_at TEXT NOT NULL)');
  db.run("CREATE TABLE images (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, prompt TEXT NOT NULL, model_name TEXT NOT NULL, dimensions TEXT NOT NULL, image_path TEXT NOT NULL, category TEXT NOT NULL, reference_images TEXT NOT NULL, created_at TEXT NOT NULL)");
  db.run("CREATE TABLE generations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, username TEXT NOT NULL, prompt TEXT NOT NULL, model_id TEXT NOT NULL, model_name TEXT NOT NULL, dimensions TEXT NOT NULL, image_size TEXT NOT NULL DEFAULT '', image_path TEXT NOT NULL, credits_used INTEGER NOT NULL, api_request_ms INTEGER NOT NULL DEFAULT 0, reference_images TEXT NOT NULL, created_at TEXT NOT NULL)");
  db.run('CREATE TABLE user_credits (user_id TEXT PRIMARY KEY, username TEXT NOT NULL, total_credits INTEGER NOT NULL, used_credits INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
  db.run("CREATE TABLE generation_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, username TEXT NOT NULL, prompt TEXT NOT NULL, model_id TEXT NOT NULL, model_name TEXT NOT NULL, dimensions TEXT NOT NULL, image_size TEXT NOT NULL DEFAULT '', image_path TEXT NOT NULL DEFAULT '', credits_used INTEGER NOT NULL DEFAULT 0, api_request_ms INTEGER NOT NULL DEFAULT 0, reference_images TEXT NOT NULL DEFAULT '[]', result_status TEXT NOT NULL, result_message TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)");
  db.run('CREATE INDEX idx_generation_requests_created_at ON generation_requests(created_at DESC)');
  db.run('CREATE TABLE invite_codes (code TEXT PRIMARY KEY, credits INTEGER NOT NULL, issued_credits INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT NOT NULL, redeemed_by TEXT, redeemed_at TEXT, low_balance_since TEXT)');
  db.run('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)');
  db.run('CREATE INDEX images_user_category_created_idx ON images(user_id, category, created_at DESC, id DESC)');
  db.run('CREATE INDEX generations_user_created_idx ON generations(user_id, created_at DESC, id DESC)');
  db.run('CREATE INDEX generations_created_idx ON generations(created_at DESC, id DESC)');
  db.run('CREATE INDEX invite_codes_redeemed_by_idx ON invite_codes(redeemed_by)');
}

function rowValues(row: Record<string, unknown>, table: MigrationTable) {
  return table.select.split(',').map((column) => row[column] ?? table.defaults?.[column] ?? null);
}

function keyDigest(rows: Record<string, unknown>[], primaryKey: string) {
  const keys = rows.map((row) => String(row[primaryKey] ?? '')).sort((left, right) => left.localeCompare(right, 'en'));
  return crypto.createHash('sha256').update(JSON.stringify(keys)).digest('hex');
}

export function ensureUserIdentityMappings(sourceRows: Map<string, Record<string, unknown>[]>) {
  const users = sourceRows.get('users') || [];
  const migrations = [...(sourceRows.get('user_migrations') || [])];
  const mappedLegacyIds = new Set(migrations.map((row) => String(row.legacy_user_id ?? '')));
  const mappedExternalIds = new Set(migrations.map((row) => String(row.supabase_user_id ?? '')));

  for (const user of users) {
    const userId = String(user.id ?? '');
    if (!userId || mappedLegacyIds.has(userId)) continue;
    if (mappedExternalIds.has(userId)) {
      throw new Error(`Cannot synthesize identity mapping for user ${userId}: external ID is already mapped`);
    }
    migrations.push({
      legacy_user_id: user.id,
      supabase_user_id: userId,
      username: String(user.username || ''),
      migrated_at: String(user.created_at || new Date().toISOString()),
    });
    mappedLegacyIds.add(userId);
    mappedExternalIds.add(userId);
  }

  migrations.sort((left, right) => Number(left.legacy_user_id || 0) - Number(right.legacy_user_id || 0));
  sourceRows.set('user_migrations', migrations);
}

async function fetchTable(client: any, table: MigrationTable) {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 500;
  let select = table.select;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from(table.name)
      .select(select)
      .order(table.primaryKey, { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) {
      if (offset === 0 && table.fallbackSelect && /api_request_ms/i.test(error.message)) {
        select = table.fallbackSelect;
        offset -= pageSize;
        continue;
      }
      if (table.optional && (error.code === '42P01' || /does not exist/i.test(error.message))) return [];
      throw new Error(`Export ${table.name} failed: ${error.message}`);
    }
    const page = (data || []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export async function migrateSupabaseToSqlite(outputFile: string, backupDir: string) {
  const client = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: migrationFetch },
  });
  const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) });
  const db = new SQL.Database() as SqlDatabase;
  const sourceRows = new Map<string, Record<string, unknown>[]>();

  try {
    ensureSchema(db);
    const exported = await Promise.all(TABLES.map(async (table) => [table.name, await fetchTable(client, table)] as const));
    for (const [tableName, rows] of exported) sourceRows.set(tableName, rows);
    ensureUserIdentityMappings(sourceRows);

    db.run('BEGIN TRANSACTION');
    try {
      for (const table of TABLES) {
        for (const row of sourceRows.get(table.name) || []) db.run(table.insert, rowValues(row, table));
      }
      db.run('COMMIT');
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }

    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      const source = sourceRows.get(table.name) || [];
      const imported = runQuery(db, `SELECT ${table.primaryKey} FROM ${table.name} ORDER BY ${table.primaryKey} ASC`);
      if (source.length !== imported.length || keyDigest(source, table.primaryKey) !== keyDigest(imported, table.primaryKey)) {
        throw new Error(`Validation failed for ${table.name}: source=${source.length}, sqlite=${imported.length}`);
      }
      counts[table.name] = imported.length;
    }

    const sourceCredits = (sourceRows.get('user_credits') || []).reduce<{ total: number; used: number }>(
      (sum, row) => ({ total: sum.total + Number(row.total_credits || 0), used: sum.used + Number(row.used_credits || 0) }),
      { total: 0, used: 0 },
    );
    const [sqliteCredits] = runQuery(db, 'SELECT COALESCE(SUM(total_credits),0) AS total, COALESCE(SUM(used_credits),0) AS used FROM user_credits');
    if (sourceCredits.total !== Number(sqliteCredits?.total || 0) || sourceCredits.used !== Number(sqliteCredits?.used || 0)) {
      throw new Error('Credit aggregate validation failed');
    }

    const [integrity] = runQuery(db, 'PRAGMA integrity_check');
    if (String(integrity?.integrity_check || '') !== 'ok') throw new Error('SQLite integrity check failed');
    const bytes = Buffer.from(db.export());
    const resolvedOutput = path.resolve(outputFile);
    await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
    const temporaryPath = `${resolvedOutput}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, bytes, { mode: 0o600 });
    await fs.rename(temporaryPath, resolvedOutput);
    const backup = await createEncryptedSqliteBackup({
      sourceFile: resolvedOutput,
      backupDir,
      label: 'pre-migration-full',
      retentionCount: 5,
    });
    return { outputFile: resolvedOutput, bytes: bytes.length, counts, credits: sourceCredits, backup };
  } finally {
    db.close();
    await migrationDispatcher.close();
  }
}

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const backupIndex = args.indexOf('--backup-dir');
const outputFile = args[outputIndex + 1] || path.join(rootDir, 'data', 'app.sqlite.next');
const backupDir = args[backupIndex + 1] || path.join(rootDir, 'data', 'migration-backups');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await migrateSupabaseToSqlite(outputFile, backupDir), null, 2));
}
