import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

import { readR2Config } from '../server/r2-storage.js';

// 一次性配置：允许站点源跨域 GET 桶内对象，浏览器才能直连 R2 下载图片。
// 默认放行主站与 www 变体，可用 R2_CORS_ORIGINS=https://a.com,https://b.com 覆盖。
const DEFAULT_ORIGINS = 'https://pixory.top,https://www.pixory.top';

const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (scriptPath === fileURLToPath(import.meta.url)) {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  dotenv.config({ path: path.join(rootDir, '.env.local') });
  dotenv.config({ path: path.join(rootDir, '.env') });

  const config = readR2Config();
  if (!config) throw new Error('R2 is not configured');

  const origins = (process.env.R2_CORS_ORIGINS || DEFAULT_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const client = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  await client.send(
    new PutBucketCorsCommand({
      Bucket: config.bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: ['GET', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['Content-Length', 'Content-Type'],
            MaxAgeSeconds: 86_400,
          },
        ],
      },
    }),
  );

  const verify = await client.send(new GetBucketCorsCommand({ Bucket: config.bucketName }));
  console.log(`R2 CORS configured for bucket ${config.bucketName}:`, JSON.stringify(verify.CORSRules));
}
