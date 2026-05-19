import type { VercelRequest, VercelResponse } from '@vercel/node';

let cachedApp: any = null;
let initPromise: Promise<any> | null = null;

async function getApp() {
  if (cachedApp) return cachedApp;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 使用动态导入，避免构建时路径问题
    const { default: createApp } = await import('../server/index.js');
    cachedApp = await createApp;
    return cachedApp;
  })();

  return initPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error: any) {
    console.error('API Error:', error);
    const errorMessage = error?.message || error?.code || 'Unknown error';
    res.status(500).json({ 
      error: 'Internal Server Error',
      details: errorMessage,
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
}
