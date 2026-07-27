import assert from 'node:assert/strict';
import test from 'node:test';

import { createImageProviderRouter, type ImageGenerationInput, type PrimaryCircuitState } from './image-provider-router.js';

const input: ImageGenerationInput = {
  prompt: 'A lighthouse',
  modelId: 'gpt-image-2',
  ratio: '1:1',
  imageSize: 'STANDARD',
  quality: 'auto',
  optimizeChineseText: false,
  images: [],
};

function createStore() {
  let state: PrimaryCircuitState | null = null;
  return {
    get: async () => state,
    set: async (next: PrimaryCircuitState) => {
      state = next;
    },
    state: () => state,
  };
}

test('uses the primary Junliai image when it succeeds', async () => {
  const store = createStore();
  let fallbackCalls = 0;
  let request: { url: string; init?: RequestInit } | null = null;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => {
      fallbackCalls += 1;
      return 'fallback';
    },
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] }));
    },
  });

  assert.equal(await router.generate(input), 'data:image/png;base64,aW1hZ2U=');
  assert.equal(fallbackCalls, 0);
  assert.equal(request?.url, 'https://img.junliai.org/v1/images/generations');
  assert.deepEqual(JSON.parse(String(request?.init?.body)), {
    model: 'firefly-gpt-image-2',
    prompt: 'A lighthouse',
    size: '1024x1024',
    response_format: 'b64_json',
  });
});

test('uses the Junliai edits endpoint when reference images are present', async () => {
  const store = createStore();
  let requestBody: FormData | null = null;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => 'fallback',
    fetchImpl: async (_url, init) => {
      requestBody = init?.body as FormData;
      return new Response(JSON.stringify({ data: [{ url: 'https://images.example/edited.png' }] }));
    },
  });

  const result = await router.generate({
    ...input,
    imageSize: '2K',
    images: ['data:image/png;base64,aW1hZ2U='],
  });
  assert.equal(result, 'https://images.example/edited.png');
  assert.equal(requestBody?.get('model'), 'firefly-gpt-image-2');
  assert.equal(requestBody?.get('size'), '2048x2048');
  assert.equal(requestBody?.getAll('image').length, 1);
});

test('opens the persistent circuit on quota errors and skips repeated primary calls', async () => {
  const store = createStore();
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const attempts: Array<{ provider: string; success: boolean; configuration: string }> = [];
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => {
      fallbackCalls += 1;
      return 'fallback';
    },
    fetchImpl: async () => {
      primaryCalls += 1;
      return new Response(JSON.stringify({ error: { message: 'quota exhausted' } }), { status: 429 });
    },
    onAttempt: async ({ provider, success, configuration }) => {
      attempts.push({ provider, success, configuration });
    },
    now: () => 1_000,
  });

  assert.equal(await router.generate(input), 'fallback');
  assert.equal(await router.generate(input), 'fallback');
  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 2);
  assert.ok((store.state()?.openUntil || 0) > 1_000);
  assert.deepEqual(attempts, [
    { provider: 'Junliai', success: false, configuration: 'STANDARD / auto / 1:1' },
    { provider: 'Visionary', success: true, configuration: 'STANDARD / auto / 1:1' },
    { provider: 'Visionary', success: true, configuration: 'STANDARD / auto / 1:1' },
  ]);
});

test('keeps non-GPT models on the existing provider', async () => {
  const store = createStore();
  let primaryCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => 'visionary',
    fetchImpl: async () => {
      primaryCalls += 1;
      return new Response();
    },
  });

  assert.equal(await router.generate({ ...input, modelId: 'Nano_Banana_Pro' }), 'visionary');
  assert.equal(primaryCalls, 0);
});

test('does not call the fallback when the primary request times out with an uncertain result', async () => {
  const store = createStore();
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    timeoutMs: 10,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => {
      fallbackCalls += 1;
      return 'fallback';
    },
    fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }),
  });

  await assert.rejects(
    () => router.generate(input),
    /为避免重复扣费/,
  );
  assert.equal(fallbackCalls, 0);
  assert.equal(store.state()?.reason, 'uncertain');
  assert.equal(store.state()?.openUntil, 0);
});

test('calls the fallback when Junliai explicitly returns a server error', async () => {
  const store = createStore();
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => {
      fallbackCalls += 1;
      return 'fallback';
    },
    fetchImpl: async () => new Response(
      JSON.stringify({ error: { message: 'generation failed' } }),
      { status: 500 },
    ),
  });

  assert.equal(await router.generate(input), 'fallback');
  assert.equal(fallbackCalls, 1);
});

test('calls the fallback when Junliai returns success without an image', async () => {
  const store = createStore();
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => {
      fallbackCalls += 1;
      return 'fallback';
    },
    fetchImpl: async () => new Response(JSON.stringify({ data: [] })),
  });

  assert.equal(await router.generate(input), 'fallback');
  assert.equal(fallbackCalls, 1);
});
