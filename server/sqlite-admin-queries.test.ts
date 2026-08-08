import assert from 'node:assert/strict';
import test from 'node:test';

import initSqlJs from 'sql.js';

import {
  ADMIN_OVERVIEW_RECORDS_SQL,
  ADMIN_USERS_SQL,
  ADMIN_USER_USAGE_TRENDS_SQL,
  buildSqliteAdminUsersPage,
} from './sqlite-admin-queries.js';

test('SQLite admin overview records query executes and excludes demo rows', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE generation_requests (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      prompt TEXT NOT NULL,
      model_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      dimensions TEXT NOT NULL,
      image_size TEXT NOT NULL,
      image_path TEXT NOT NULL,
      credits_used INTEGER NOT NULL,
      api_request_ms INTEGER NOT NULL,
      reference_images TEXT NOT NULL,
      result_status TEXT NOT NULL,
      result_message TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  const values = [
    1, 'user-1', 'member', 'prompt', 'model', 'Model', '1:1', '1K', '/image.png',
    1, 10, '[]', 'succeeded', '', '2026-08-08T00:00:00.000Z',
  ];
  db.run('INSERT INTO generation_requests VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', values);
  db.run('INSERT INTO generation_requests VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    2, 'demo', 'demo', 'prompt', 'model', 'Model', '1:1', '1K', '', 0, 0, '[]', 'succeeded', '',
    '2026-08-08T00:00:01.000Z',
  ]);

  const statement = db.prepare(ADMIN_OVERVIEW_RECORDS_SQL, [10, 0]);
  const rows: Record<string, unknown>[] = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  db.close();

  assert.equal(rows.length, 1);
  assert.equal(rows[0].username, 'member');
});

test('SQLite admin users query returns migrated users with credits, invites, usage, and search', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL)');
  db.run('CREATE TABLE user_migrations (legacy_user_id INTEGER PRIMARY KEY, supabase_user_id TEXT NOT NULL)');
  db.run(`CREATE TABLE user_credits (
    user_id TEXT PRIMARY KEY, username TEXT NOT NULL, total_credits INTEGER NOT NULL, used_credits INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE generations (
    id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, username TEXT NOT NULL,
    credits_used INTEGER NOT NULL, created_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE invite_codes (
    code TEXT PRIMARY KEY, created_at TEXT NOT NULL, redeemed_by TEXT, redeemed_at TEXT
  )`);

  db.run("INSERT INTO users VALUES (1, 'member')");
  db.run("INSERT INTO user_migrations VALUES (1, 'user-uuid')");
  db.run("INSERT INTO user_credits VALUES ('user-uuid', 'member', 100, 25)");
  db.run("INSERT INTO invite_codes VALUES ('CODE-OLD', '2026-08-01T00:00:00.000Z', 'user-uuid', '2026-08-01T00:00:00.000Z')");
  db.run("INSERT INTO invite_codes VALUES ('CODE-NEW', '2026-08-02T00:00:00.000Z', 'user-uuid', '2026-08-02T00:00:00.000Z')");
  db.run("INSERT INTO generations VALUES (1, 'user-uuid', 'member', 7, '2026-08-08T12:00:00.000Z')");
  db.run("INSERT INTO generations VALUES (2, 'api-key:key-1', 'external key', 3, '2026-08-09T12:00:00.000Z')");

  function query(sql: string) {
    const statement = db.prepare(sql);
    const rows: Record<string, unknown>[] = [];
    while (statement.step()) rows.push(statement.getAsObject());
    statement.free();
    return rows;
  }

  const rows = query(ADMIN_USERS_SQL);
  const trendRows = query(ADMIN_USER_USAGE_TRENDS_SQL);
  db.close();

  const result = buildSqliteAdminUsersPage({
    rows,
    trendRows,
    apiKeys: [{ id: 'key-1', totalCredits: 50, usedCredits: 10 }],
    search: 'code-old',
    sort: 'recent-desc',
    page: 1,
    pageSize: 10,
    now: new Date('2026-08-09T18:00:00.000Z').getTime(),
  });

  assert.equal(rows.length, 2);
  assert.equal(result.total, 1);
  assert.equal(result.users[0].userId, 'user-uuid');
  assert.equal(result.users[0].username, 'member');
  assert.equal(result.users[0].inviteCode, 'CODE-NEW');
  assert.equal(result.users[0].generations, 1);
  assert.equal(result.users[0].creditsUsed, 7);
  assert.equal(result.users[0].remainingCredits, 75);
  assert.deepEqual(result.users[0].usageTrend, [0, 0, 0, 0, 0, 7, 0]);

  const apiKeyResult = buildSqliteAdminUsersPage({
    rows,
    trendRows,
    apiKeys: [{ id: 'key-1', totalCredits: 50, usedCredits: 10 }],
    search: 'api-key:key-1',
    sort: 'recent-desc',
    page: 1,
    pageSize: 10,
    now: new Date('2026-08-09T18:00:00.000Z').getTime(),
  });
  assert.equal(apiKeyResult.users[0].apiKeyId, 'key-1');
  assert.equal(apiKeyResult.users[0].remainingCredits, 40);
});
