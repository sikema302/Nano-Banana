import assert from 'node:assert/strict';
import test from 'node:test';

import { generateSchatImage, schatImageSize } from './schat-image.js';

const baseInput = {
  prompt: 'A clean product photo',
  ratio: '1:1',
  imageSize: '1K',
  images: [] as string[],
};

test('calls Schat GPT Image 2 generations and parses b64_json', async () => {
  let request: { url: string; init?: RequestInit } | null = null;
  const source = await generateSchatImage(baseInput, {
    baseUrl: 'https://www.schat.top/v1',
    apiKey: 'secret',
    model: 'gpt-image-2',
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify({ data: [{ b64_json: 'aW1h Z2U=' }] }));
    },
  });

  assert.equal(source, 'data:image/png;base64,aW1hZ2U=');
  assert.equal(request?.url, 'https://www.schat.top/v1/images/generations');
  assert.equal((request?.init?.headers as Record<string, string>).Authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(String(request?.init?.body)), {
    model: 'gpt-image-2',
    prompt: baseInput.prompt,
    size: '1024x1024',
  });
});

test('uses the configured nano-banana-2 model as a compatible 1K channel', async () => {
  let body: Record<string, unknown> = {};
  await generateSchatImage({ ...baseInput, ratio: '16:9' }, {
    baseUrl: 'https://www.schat.top',
    apiKey: 'secret',
    model: 'nano-banana-2',
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: [{ b64_json: 'cmVzdWx0' }] }));
    },
  });
  assert.equal(body.model, 'nano-banana-2');
  assert.equal(body.size, '1280x720');
});

test('maps Seedream 2K and 4K ratios to explicit pixel sizes', () => {
  assert.equal(schatImageSize('2K', '3:2'), '2400x1600');
  assert.equal(schatImageSize('2K', '9:16'), '1152x2048');
  assert.equal(schatImageSize('4K', '16:9'), '4096x2304');
  assert.equal(schatImageSize('4K', '21:9'), '5040x2160');
});

test('sends multiple reference images through repeated image[] fields', async () => {
  let requestBody: FormData | null = null;
  await generateSchatImage({
    ...baseInput,
    imageSize: '2K',
    images: ['data:image/png;base64,aW1hZ2Ux', 'data:image/jpeg;base64,aW1hZ2Uy'],
  }, {
    baseUrl: 'https://www.schat.top/v1',
    apiKey: 'secret',
    model: 'seedream-4',
    fetchImpl: async (url, init) => {
      assert.equal(String(url), 'https://www.schat.top/v1/images/edits');
      requestBody = init?.body as FormData;
      return new Response(JSON.stringify({ data: [{ b64_json: 'cmVzdWx0' }] }));
    },
  });

  assert.equal(requestBody?.get('model'), 'seedream-4');
  assert.equal(requestBody?.get('size'), '2048x2048');
  assert.equal(requestBody?.getAll('image[]').length, 2);
  assert.equal(requestBody?.getAll('image').length, 0);
});

test('marks completed HTTP failures safe for channel failover', async () => {
  for (const status of [400, 503]) {
    await assert.rejects(
      () => generateSchatImage(baseInput, {
        baseUrl: 'https://www.schat.top/v1',
        apiKey: 'secret',
        model: 'gpt-image-2',
        fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'busy' } }), { status }),
      }),
      (error: unknown) => {
        const tagged = error as { safeToFallback?: unknown; status?: unknown };
        return tagged.safeToFallback === true && tagged.status === status;
      },
    );
  }
});

test('suppresses failover when a sent request times out with an uncertain result', async () => {
  await assert.rejects(
    () => generateSchatImage(baseInput, {
      baseUrl: 'https://www.schat.top/v1',
      apiKey: 'secret',
      model: 'gpt-image-2',
      timeoutMs: 5,
      fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    }),
    (error: unknown) => (error as { safeToFallback?: unknown }).safeToFallback === false,
  );
});
