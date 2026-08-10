import assert from 'node:assert/strict';
import test from 'node:test';

import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';

import {
  createR2ObjectStorage,
  legacyAssetObjectKey,
  readR2Config,
  thumbnailUrlForImage,
  type R2CommandClient,
} from './r2-storage.js';
import { verifyR2Storage } from '../scripts/verify-r2-storage.js';

const env = {
  R2_ACCOUNT_ID: 'account-id',
  R2_ACCESS_KEY_ID: 'access-key',
  R2_SECRET_ACCESS_KEY: 'secret-key',
  R2_BUCKET_NAME: 'images',
  R2_PUBLIC_BASE_URL: 'https://img.example.com/',
};

test('requires a complete R2 configuration while allowing local-only development', () => {
  assert.equal(readR2Config({}), null);
  assert.throws(
    () => readR2Config({ R2_ACCOUNT_ID: 'account-id' }),
    /R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL/,
  );
  assert.equal(readR2Config(env)?.publicBaseUrl, 'https://img.example.com');
});

test('deployment R2 checks remain strict unless local fallback is explicitly allowed', async () => {
  const unavailableStorage = {
    async verifyRoundTrip() {
      throw new Error('connect ETIMEDOUT');
    },
  };

  await assert.rejects(verifyR2Storage(unavailableStorage), /ETIMEDOUT/);
  assert.equal(await verifyR2Storage(unavailableStorage, true), false);
});

test('maps legacy and public generated image paths to stable object keys and thumbnails', () => {
  assert.equal(legacyAssetObjectKey('/uploads/generated/generated-1.png'), 'generated/generated-1.png');
  assert.equal(legacyAssetObjectKey('https://img.example.com/thumbnails/generated-1.webp'), 'thumbnails/generated-1.webp');
  assert.equal(legacyAssetObjectKey('/uploads/references/reference.png'), '');
  assert.equal(
    thumbnailUrlForImage('https://img.example.com/generated/generated-1.png', 'https://img.example.com'),
    'https://img.example.com/thumbnails/generated-1.webp',
  );
  assert.equal(
    thumbnailUrlForImage('/uploads/generated/generated-1.png', 'https://img.example.com'),
    '/uploads/thumbnails/generated-1.webp',
  );
});

test('verifies the uploaded object size before returning its public URL', async () => {
  const commands: unknown[] = [];
  const client: R2CommandClient = {
    async send(command) {
      commands.push(command);
      return command instanceof HeadObjectCommand ? { ContentLength: 3 } : {};
    },
  };
  const storage = createR2ObjectStorage(env, client);
  assert.ok(storage);
  const url = await storage.putVerifiedObject('generated/test.png', Buffer.from([1, 2, 3]));
  assert.equal(url, 'https://img.example.com/generated/test.png');
  assert.equal(commands[0] instanceof PutObjectCommand, true);
  assert.equal(commands[1] instanceof HeadObjectCommand, true);
});

test('rejects an upload when the remote object size does not match', async () => {
  const client: R2CommandClient = {
    async send(command) {
      return command instanceof HeadObjectCommand ? { ContentLength: 2 } : {};
    },
  };
  const storage = createR2ObjectStorage(env, client);
  assert.ok(storage);
  await assert.rejects(
    storage.putVerifiedObject('generated/test.png', Buffer.from([1, 2, 3])),
    /R2 verification failed/,
  );
});

test('lists existing object sizes across paginated prefixes for resumable migration', async () => {
  let page = 0;
  const client: R2CommandClient = {
    async send(command) {
      assert.equal(command instanceof ListObjectsV2Command, true);
      page += 1;
      if (page === 1) {
        return {
          Contents: [{ Key: 'generated/one.png', Size: 10 }],
          NextContinuationToken: 'next-page',
        };
      }
      return { Contents: [{ Key: 'generated/two.png', Size: 20 }] };
    },
  };
  const storage = createR2ObjectStorage(env, client);
  assert.ok(storage);
  const objects = await storage.listObjectSizes(['generated/']);
  assert.deepEqual([...objects.entries()], [
    ['generated/one.png', 10],
    ['generated/two.png', 20],
  ]);
});
