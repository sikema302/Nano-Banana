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

test('uses the primary Chat2API image when it succeeds', async () => {
  const store = createStore();
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'http://chat2api',
    authorization: 'secret',
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
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: '![generated](https://images.example/result.png)' } }],
    })),
  });

  assert.equal(await router.generate(input), 'https://images.example/result.png');
  assert.equal(fallbackCalls, 0);
});

test('opens the persistent circuit on quota errors and skips repeated primary calls', async () => {
  const store = createStore();
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'http://chat2api',
    authorization: 'secret',
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
    now: () => 1_000,
  });

  assert.equal(await router.generate(input), 'fallback');
  assert.equal(await router.generate(input), 'fallback');
  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 2);
  assert.ok((store.state()?.openUntil || 0) > 1_000);
});

test('keeps non-GPT models on the existing provider', async () => {
  const store = createStore();
  let primaryCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'http://chat2api',
    authorization: 'secret',
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
