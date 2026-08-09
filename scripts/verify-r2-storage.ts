import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { createR2ObjectStorage } from '../server/r2-storage.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config({ path: path.join(rootDir, '.env') });

const storage = createR2ObjectStorage();
if (!storage) {
  throw new Error('R2 is not configured');
}

await storage.verifyRoundTrip();
console.log(`R2 verification succeeded for bucket ${storage.config.bucketName}.`);
