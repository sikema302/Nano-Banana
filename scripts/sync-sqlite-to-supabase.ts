import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import initSqlJs from 'sql.js';
import { createClient } from '@supabase/supabase-js';

type SqlDatabase = {
  prepare: (sql: string, params?: unknown[]) => {
    step: () => boolean;
    getAsObject: () => Record<string, unknown>;
    free: () => void;
  };
  close: () => void;
};

type SupabaseAdminClient = {
  from: (tableName: string) => any;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dbFile = path.join(rootDir, 'data', 'app.sqlite');
const require = createRequire(import.meta.url);

dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config({ path: path.join(rootDir, '.env') });

function normalizeEnvValue(value: string | undefined) {
  return typeof value === 'string' ? value.trim().replace(/^["']|["']$/g, '') : '';
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

async function upsertTable(
  supabase: SupabaseAdminClient,
  tableName: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  if (rows.length === 0) {
    console.log(`${tableName}: 0 rows`);
    return;
  }

  const chunkSize = 500;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase.from(tableName).upsert(chunk, { onConflict });
    if (error) {
      throw new Error(`${tableName}: ${error.message}`);
    }
  }

  console.log(`${tableName}: ${rows.length} rows`);
}

async function main() {
  const supabaseUrl = normalizeEnvValue(process.env.SUPABASE_URL);
  const serviceRoleKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local');
  }

  const sqliteBytes = await fs.readFile(dbFile);
  const SQL = await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
  });
  const db = new SQL.Database(sqliteBytes) as SqlDatabase;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const readiness = await supabase.from('users').select('id', { count: 'exact', head: true }).limit(1);
  if (readiness.error) {
    throw new Error(`Supabase schema is not ready: ${readiness.error.message}. Run supabase/migrations/20260426000000_init_bananas_ai.sql first.`);
  }

  try {
    await upsertTable(supabase, 'users', runQuery(db, 'select id, username, password_hash, email, created_at from users'), 'id');
    await upsertTable(
      supabase,
      'user_migrations',
      runQuery(db, 'select legacy_user_id, supabase_user_id, username, migrated_at from user_migrations'),
      'legacy_user_id',
    );
    await upsertTable(
      supabase,
      'user_credits',
      runQuery(db, 'select user_id, username, total_credits, used_credits, created_at, updated_at from user_credits'),
      'user_id',
    );
    await upsertTable(
      supabase,
      'invite_codes',
      runQuery(db, 'select code, credits, created_by, created_at, redeemed_by, redeemed_at from invite_codes'),
      'code',
    );
    await upsertTable(
      supabase,
      'generations',
      runQuery(
        db,
        'select id, user_id, username, prompt, model_id, model_name, dimensions, image_size, image_path, credits_used, reference_images, created_at from generations',
      ),
      'id',
    );
    await upsertTable(
      supabase,
      'images',
      runQuery(db, 'select id, user_id, prompt, model_name, dimensions, image_path, category, reference_images, created_at from images'),
      'id',
    );
    await upsertTable(supabase, 'app_settings', runQuery(db, 'select key, value, updated_at from app_settings'), 'key');
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
