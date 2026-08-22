import fs from 'node:fs/promises';
import path from 'node:path';

import { createR2ObjectStorage } from './r2-storage.js';

export type R2BackupOptions = {
  backupDir: string;
  bucketPrefix: string;
  label?: string;
  retentionCount?: number;
  env?: NodeJS.ProcessEnv;
};

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function backupKeyPrefix(prefix: string, label: string) {
  const cleanPrefix = String(prefix || 'backups').replace(/^\/+|\/+$/g, '');
  return `${cleanPrefix}/${label}`;
}

async function listLocalBackups(backupDir: string, label: string) {
  try {
    const names = (await fs.readdir(backupDir)).filter((name) => name.startsWith(`${label}-`));
    names.sort();
    return names;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * Push the newest local encrypted backup under `backupDir` to Cloudflare R2 and
 * prune remote copies beyond `retentionCount`. Returns null when R2 is not
 * configured (local backups still proceed unaffected).
 */
export async function uploadLatestBackupToR2(options: R2BackupOptions) {
  const storage = createR2ObjectStorage(options.env);
  if (!storage) return null;

  const label = String(options.label || 'daily').trim() || 'daily';
  const retentionCount = positiveInteger(options.retentionCount ?? process.env.R2_BACKUP_RETENTION_COUNT, 30);
  const prefix = backupKeyPrefix(options.bucketPrefix, label);

  const names = await listLocalBackups(options.backupDir, label);
  const latestName = names[names.length - 1];
  if (!latestName) return null;

  const sourceFile = path.join(options.backupDir, latestName);
  const body = await fs.readFile(sourceFile);
  const key = `${prefix}/${latestName}`;
  const uploadedKey = await storage.putVerifiedObject(key, body, 'application/octet-stream');

  const remoteSizes = await storage.listObjectSizes([`${prefix}/`]);
  const remoteKeys = [...remoteSizes.keys()].sort().reverse();
  await Promise.all(
    remoteKeys.slice(retentionCount).map((oldKey) => storage.deleteObject(oldKey)),
  );

  return { uploadedKey, sourceFile, remoteCount: Math.min(remoteKeys.length, retentionCount) };
}