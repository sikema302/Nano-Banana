import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureUserIdentityMappings } from '../scripts/migrate-supabase-to-sqlite.js';

test('adds stable SQLite identity mappings for Supabase users', () => {
  const rows = new Map<string, Record<string, unknown>[]>([
    ['users', [
      { id: 1, username: 'existing', created_at: '2026-01-01T00:00:00.000Z' },
      { id: 2, username: 'newer', created_at: '2026-02-01T00:00:00.000Z' },
    ]],
    ['user_migrations', [
      { legacy_user_id: 1, supabase_user_id: 'external-1', username: 'existing', migrated_at: '2026-01-01T00:00:00.000Z' },
    ]],
  ]);

  ensureUserIdentityMappings(rows);

  assert.deepEqual(rows.get('user_migrations'), [
    { legacy_user_id: 1, supabase_user_id: 'external-1', username: 'existing', migrated_at: '2026-01-01T00:00:00.000Z' },
    { legacy_user_id: 2, supabase_user_id: '2', username: 'newer', migrated_at: '2026-02-01T00:00:00.000Z' },
  ]);
});

test('rejects an ambiguous synthesized identity mapping', () => {
  const rows = new Map<string, Record<string, unknown>[]>([
    ['users', [{ id: 2, username: 'collision', created_at: '2026-01-01T00:00:00.000Z' }]],
    ['user_migrations', [
      { legacy_user_id: 1, supabase_user_id: '2', username: 'existing', migrated_at: '2026-01-01T00:00:00.000Z' },
    ]],
  ]);

  assert.throws(() => ensureUserIdentityMappings(rows), /external ID is already mapped/);
});
