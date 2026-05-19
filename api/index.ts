import type { VercelRequest, VercelResponse } from '@vercel/node';
import serverPromise from '../server/index.js';

let cachedApp: Awaited<typeof serverPromise> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!cachedApp) {
    cachedApp = await serverPromise;
  }
  cachedApp(req, res);
}
