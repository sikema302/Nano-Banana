import assert from 'node:assert/strict';
import test from 'node:test';

import initSqlJs from 'sql.js';

import { ADMIN_OVERVIEW_RECORDS_SQL } from './sqlite-admin-queries.js';

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
