import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { createBusinessDataBackup, verifyBusinessDataBackup } from '../server/business-backup.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config({ path: path.join(rootDir, '.env') });

const args = process.argv.slice(2);
const verifyIndex = args.indexOf('--verify');

const result = verifyIndex >= 0
  ? await verifyBusinessDataBackup(args[verifyIndex + 1] || '')
  : await createBusinessDataBackup();

console.log(JSON.stringify(result, null, 2));
