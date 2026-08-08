import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import initSqlJs from 'sql.js';

import { createEncryptedSqliteBackup, verifyEncryptedSqliteBackup } from './sqlite-backup.js';

test('creates and verifies an encrypted SQLite backup', async () => {
  const previousSecret = process.env.BACKUP_ENCRYPTION_KEY;
  process.env.BACKUP_ENCRYPTION_KEY = 'sqlite-backup-test-secret';
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixory-sqlite-backup-'));

  try {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL)');
    db.run('INSERT INTO users (id, username) VALUES (?, ?)', [1, 'backup-user']);
    const sourceFile = path.join(temporaryDir, 'app.sqlite');
    await fs.writeFile(sourceFile, db.export());
    db.close();

    const created = await createEncryptedSqliteBackup({
      sourceFile,
      backupDir: path.join(temporaryDir, 'backups'),
      label: 'test',
      retentionCount: 2,
    });
    const verified = await verifyEncryptedSqliteBackup(created.filePath);

    assert.equal(verified.sha256, created.sha256);
    assert.equal(verified.bytes, created.bytes);
    assert.match(path.basename(created.filePath), /^test-\d{8}T\d{6}Z\.sqlite\.gz\.enc$/);
  } finally {
    if (previousSecret === undefined) delete process.env.BACKUP_ENCRYPTION_KEY;
    else process.env.BACKUP_ENCRYPTION_KEY = previousSecret;
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
});
