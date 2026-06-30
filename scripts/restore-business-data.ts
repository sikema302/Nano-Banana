import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import {
  BUSINESS_BACKUP_TABLES,
  readBusinessDataBackup,
  type BusinessBackupTable,
} from '../server/business-backup.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config({ path: path.join(rootDir, '.env') });

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
const filePath = args[fileIndex + 1];
if (!filePath) throw new Error('Usage: npm run restore:data -- --file <backup-file> [--confirm]');

const payload = await readBusinessDataBackup(filePath);
const counts = Object.fromEntries(BUSINESS_BACKUP_TABLES.map((table) => [table, payload.tables[table].length]));

if (!args.includes('--confirm')) {
  console.log(JSON.stringify({ dryRun: true, createdAt: payload.createdAt, excluded: payload.excluded, counts }, null, 2));
  console.log('No data was changed. Add --confirm to restore missing or overwritten business rows.');
  process.exit(0);
}

const url = String(process.env.SUPABASE_URL || '').trim();
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const conflictColumns: Record<BusinessBackupTable, string> = {
  users: 'id',
  user_migrations: 'legacy_user_id',
  user_credits: 'user_id',
  invite_codes: 'code',
  generations: 'id',
  app_settings: 'key',
};

for (const table of BUSINESS_BACKUP_TABLES) {
  const rows = table === 'generations'
    ? payload.tables[table].map((row) => ({ ...row, image_path: '', reference_images: '[]' }))
    : payload.tables[table];
  for (let offset = 0; offset < rows.length; offset += 500) {
    const { error } = await client
      .from(table)
      .upsert(rows.slice(offset, offset + 500), {
        onConflict: conflictColumns[table],
        ignoreDuplicates: table === 'generations',
      });
    if (error) throw new Error(`Restore ${table} failed: ${error.message}`);
  }
}

console.log(JSON.stringify({ restored: true, createdAt: payload.createdAt, excluded: payload.excluded, counts }, null, 2));
