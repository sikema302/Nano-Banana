import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { createR2ObjectStorage } from '../server/r2-storage.js';

type VerifiableStorage = {
  verifyRoundTrip(): Promise<void>;
};

export async function verifyR2Storage(storage: VerifiableStorage, allowUnavailable = false) {
  try {
    await storage.verifyRoundTrip();
    return true;
  } catch (error) {
    if (!allowUnavailable) throw error;
    return false;
  }
}

const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (scriptPath === fileURLToPath(import.meta.url)) {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  dotenv.config({ path: path.join(rootDir, '.env.local') });
  dotenv.config({ path: path.join(rootDir, '.env') });

  const storage = createR2ObjectStorage();
  if (!storage) throw new Error('R2 is not configured');

  const available = await verifyR2Storage(storage, process.argv.includes('--allow-unavailable'));
  if (available) {
    console.log(`R2 verification succeeded for bucket ${storage.config.bucketName}.`);
  } else {
    console.warn(
      `R2 verification is temporarily unavailable for bucket ${storage.config.bucketName}; deployment will continue with local image fallback.`,
    );
  }
}
