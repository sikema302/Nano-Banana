import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { contentTypeForObjectKey, createR2ObjectStorage } from '../server/r2-storage.js';

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
const maxAgeDays = Math.max(0.04, Number(argumentValue('max-age-days', '3')) || 3);
const concurrency = Math.max(1, Math.min(8, Number(argumentValue('concurrency', '3')) || 3));
const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
const supportedImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

const storage = createR2ObjectStorage();
if (!storage) throw new Error('R2 is not configured');

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
let nextIndex = 0;
let uploadedFiles = 0;
let uploadedBytes = 0;
const failures: Array<{ key: string; error: string }> = [];

async function worker() {
  while (true) {
    const index = nextIndex;
    nextIndex += 1;
    const candidate = candidates[index];
    if (!candidate) return;

    try {
      const buffer = await fs.readFile(candidate.filePath);
      await storage.putVerifiedObject(candidate.key, buffer, contentTypeForObjectKey(candidate.key));
      if (deleteAfterUpload) await fs.unlink(candidate.filePath);
      uploadedFiles += 1;
      uploadedBytes += candidate.size;
      if (uploadedFiles % 25 === 0 || uploadedFiles === candidates.length) {
        console.log(`R2 migration progress: ${uploadedFiles}/${candidates.length} files.`);
      }
    } catch (error) {
      failures.push({
        key: candidate.key,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`[r2-migration] failed ${candidate.key}:`, failures.at(-1)?.error);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(
  JSON.stringify({
    bucket: storage.config.bucketName,
    discoveredFiles: candidates.length,
    uploadedFiles,
    uploadedBytes,
    deletedLocalCopies: deleteAfterUpload ? uploadedFiles : 0,
    failedFiles: failures.length,
  }),
);

if (failures.length > 0) process.exitCode = 1;
