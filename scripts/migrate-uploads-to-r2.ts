import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { contentTypeForObjectKey, createR2ObjectStorage } from '../server/r2-storage.js';
import { SystemResourceMonitor } from '../server/resource-aware-queue.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uploadsDir = path.join(rootDir, 'uploads');
dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config({ path: path.join(rootDir, '.env') });

function argumentValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const deleteAfterUpload = process.argv.includes('--delete-after-upload');
const maxAgeDays = Math.max(0.04, Number(argumentValue('max-age-days', '2')) || 2);
const concurrency = Math.max(1, Math.min(16, Number(argumentValue('concurrency', '2')) || 2));
const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
const supportedImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

const storage = createR2ObjectStorage();
if (!storage) throw new Error('R2 is not configured');
const resourceMonitor = new SystemResourceMonitor(undefined, 2_000, 'r2-migration').start();

type UploadCandidate = {
  filePath: string;
  key: string;
  size: number;
};

async function discoverCandidates() {
  const candidates: UploadCandidate[] = [];
  for (const directoryName of ['generated', 'thumbnails']) {
    const directory = path.join(uploadsDir, directoryName);
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !supportedImageExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const filePath = path.join(directory, entry.name);
      const stats = await fs.stat(filePath).catch(() => null);
      if (!stats || stats.mtimeMs < cutoffTime) continue;
      candidates.push({ filePath, key: `${directoryName}/${entry.name}`, size: stats.size });
    }
  }
  return candidates;
}

const candidates = await discoverCandidates();
const existingObjects = await storage.listObjectSizes(['generated/', 'thumbnails/']);
const pendingCandidates: UploadCandidate[] = [];
let alreadyVerifiedFiles = 0;
let alreadyVerifiedBytes = 0;

for (const candidate of candidates) {
  if (existingObjects.get(candidate.key) !== candidate.size) {
    pendingCandidates.push(candidate);
    continue;
  }
  if (deleteAfterUpload) await fs.unlink(candidate.filePath);
  alreadyVerifiedFiles += 1;
  alreadyVerifiedBytes += candidate.size;
}

let nextIndex = 0;
let uploadedFiles = 0;
let uploadedBytes = 0;
const failures: Array<{ key: string; error: string }> = [];

function migrationErrorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return [record.name, record.Code, record.code, record.$metadata && JSON.stringify(record.$metadata)]
      .filter(Boolean)
      .join(' ') || 'Unknown R2 error';
  }
  return String(error || 'Unknown R2 error');
}

async function worker() {
  while (true) {
    const index = nextIndex;
    nextIndex += 1;
    const candidate = pendingCandidates[index];
    if (!candidate) return;

    try {
      await resourceMonitor.waitUntilAccepting();
      const buffer = await fs.readFile(candidate.filePath);
      await storage.putVerifiedObject(candidate.key, buffer, contentTypeForObjectKey(candidate.key));
      if (deleteAfterUpload) await fs.unlink(candidate.filePath);
      uploadedFiles += 1;
      uploadedBytes += candidate.size;
      const completedFiles = alreadyVerifiedFiles + uploadedFiles;
      if (uploadedFiles % 25 === 0 || uploadedFiles === pendingCandidates.length) {
        console.log(`R2 migration progress: ${completedFiles}/${candidates.length} files.`);
      }
    } catch (error) {
      failures.push({
        key: candidate.key,
        error: migrationErrorText(error),
      });
      console.error(`[r2-migration] failed ${candidate.key}:`, failures.at(-1)?.error);
    }
  }
}

try {
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
} finally {
  resourceMonitor.stop();
}
console.log(
  JSON.stringify({
    bucket: storage.config.bucketName,
    discoveredFiles: candidates.length,
    alreadyVerifiedFiles,
    alreadyVerifiedBytes,
    uploadedFiles,
    uploadedBytes,
    deletedLocalCopies: deleteAfterUpload ? alreadyVerifiedFiles + uploadedFiles : 0,
    failedFiles: failures.length,
  }),
);

if (failures.length > 0) process.exitCode = 1;
