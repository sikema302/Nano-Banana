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
  const states = new Map<string, PrimaryCircuitState>();
  return {
    get: async (upstreamModel = 'default') => states.get(upstreamModel) || null,
    set: async (next: PrimaryCircuitState, upstreamModel = 'default') => {
      states.set(upstreamModel, next);
    },
    state: (upstreamModel?: string) => upstreamModel
      ? states.get(upstreamModel) || null
      : states.values().next().value || null,
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

test('uses the cheaper Junliai gpt-image-2 first for STANDARD requests', async () => {
  const store = createStore();
  const requestedModels: string[] = [];
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    primaryModelChains: {
      'gpt-image-2': ['gpt-image-2', 'firefly-gpt-image-2'],
    },
    primaryModelCapabilities: {
      'gpt-image-2': {
        imageSizes: ['STANDARD', '1K'],
        ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        maxImages: 6,
      },
      'firefly-gpt-image-2': {
        imageSizes: ['STANDARD', '1K', '2K', '4K'],
        maxImages: 6,
      },
    },
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => {
      fallbackCalls += 1;
      return 'visionary';
    },
    fetchImpl: async (_url, init) => {
      requestedModels.push(JSON.parse(String(init?.body)).model);
      return new Response(JSON.stringify({ data: [{ url: 'https://images.example/economy.png' }] }));
    },
  });

  assert.equal(await router.generate(input), 'https://images.example/economy.png');
  assert.deepEqual(requestedModels, ['gpt-image-2']);
  assert.equal(fallbackCalls, 0);
});

test('falls through from Junliai gpt-image-2 to Firefly and keeps their circuits separate', async () => {
  const store = createStore();
  const requestedModels: string[] = [];
  const attempts: Array<{ provider: string; success: boolean }> = [];
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    primaryModelChains: {
      'gpt-image-2': ['gpt-image-2', 'firefly-gpt-image-2'],
    },
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => {
      fallbackCalls += 1;
      return 'visionary';
    },
    fetchImpl: async (_url, init) => {
      const model = JSON.parse(String(init?.body)).model;
      requestedModels.push(model);
      if (model === 'gpt-image-2') {
        return new Response(JSON.stringify({ error: { message: 'insufficient balance' } }), { status: 402 });
      }
      return new Response(JSON.stringify({ data: [{ url: 'https://images.example/firefly.png' }] }));
    },
    onAttempt: async ({ provider, success }) => {
      attempts.push({ provider, success });
    },
    now: () => 1_000,
  });

  assert.equal(await router.generate(input), 'https://images.example/firefly.png');
  assert.equal(await router.generate(input), 'https://images.example/firefly.png');
  assert.deepEqual(requestedModels, ['gpt-image-2', 'firefly-gpt-image-2', 'firefly-gpt-image-2']);
  assert.equal(fallbackCalls, 0);
  assert.ok((store.state('gpt-image-2')?.openUntil || 0) > 1_000);
  assert.equal(store.state('firefly-gpt-image-2'), null);
  assert.deepEqual(attempts, [
    { provider: 'Junliai · gpt-image-2', success: false },
    { provider: 'Junliai · firefly-gpt-image-2', success: true },
    { provider: 'Junliai · firefly-gpt-image-2', success: true },
  ]);
});

test('falls through both Junliai models to Visionary after explicit failures', async () => {
  const store = createStore();
  const requestedModels: string[] = [];
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    primaryModelChains: {
      'gpt-image-2': ['gpt-image-2', 'firefly-gpt-image-2'],
    },
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => {
      fallbackCalls += 1;
      return 'visionary';
    },
    fetchImpl: async (_url, init) => {
      requestedModels.push(JSON.parse(String(init?.body)).model);
      return new Response(JSON.stringify({ error: { message: 'generation failed' } }), { status: 500 });
    },
  });

  assert.equal(await router.generate(input), 'visionary');
  assert.deepEqual(requestedModels, ['gpt-image-2', 'firefly-gpt-image-2']);
  assert.equal(fallbackCalls, 1);
});

test('independently skips either Junliai GPT model when its route is disabled', async () => {
  const createRouter = (enabledModels: Set<string>, requestedModels: string[]) => createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    primaryModelChains: {
      'gpt-image-2': ['gpt-image-2', 'firefly-gpt-image-2'],
    },
    isPrimaryModelEnabled: async (_request, upstreamModel) => enabledModels.has(upstreamModel),
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store: createStore(),
    fallback: async () => 'visionary',
    fetchImpl: async (_url, init) => {
      const model = JSON.parse(String(init?.body)).model;
      requestedModels.push(model);
      return model === 'gpt-image-2'
        ? new Response(JSON.stringify({ error: { message: 'generation failed' } }), { status: 500 })
        : new Response(JSON.stringify({ data: [{ url: 'https://images.example/firefly.png' }] }));
    },
  });

  const fireflyOnlyCalls: string[] = [];
  const fireflyOnly = createRouter(new Set(['firefly-gpt-image-2']), fireflyOnlyCalls);
  assert.equal(await fireflyOnly.generate(input), 'https://images.example/firefly.png');
  assert.deepEqual(fireflyOnlyCalls, ['firefly-gpt-image-2']);

  const economyOnlyCalls: string[] = [];
  const economyOnly = createRouter(new Set(['gpt-image-2']), economyOnlyCalls);
  assert.equal(await economyOnly.generate(input), 'visionary');
  assert.deepEqual(economyOnlyCalls, ['gpt-image-2']);
});

test('skips the cheaper STANDARD-only model for 2K and unsupported ratios', async () => {
  const store = createStore();
  const requestedModels: string[] = [];
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    primaryModelChains: {
      'gpt-image-2': ['gpt-image-2', 'firefly-gpt-image-2'],
    },
    primaryModelCapabilities: {
      'gpt-image-2': {
        imageSizes: ['STANDARD', '1K'],
        ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      },
      'firefly-gpt-image-2': {
        imageSizes: ['STANDARD', '1K', '2K', '4K'],
      },
    },
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => 'visionary',
    fetchImpl: async (_url, init) => {
      requestedModels.push(JSON.parse(String(init?.body)).model);
      return new Response(JSON.stringify({ data: [{ url: 'https://images.example/firefly.png' }] }));
    },
  });

  await router.generate({ ...input, imageSize: '2K' });
  await router.generate({ ...input, ratio: '3:2' });
  assert.deepEqual(requestedModels, ['firefly-gpt-image-2', 'firefly-gpt-image-2']);
});

test('bypasses Junliai when a request exceeds the documented reference-image limit', async () => {
  const store = createStore();
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    primaryModelChains: {
      'gpt-image-2': ['gpt-image-2', 'firefly-gpt-image-2'],
    },
    primaryModelCapabilities: {
      'gpt-image-2': { maxImages: 6 },
      'firefly-gpt-image-2': { maxImages: 6 },
    },
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => {
      fallbackCalls += 1;
      return 'visionary';
    },
    fetchImpl: async () => {
      primaryCalls += 1;
      return new Response(JSON.stringify({ data: [{ url: 'https://images.example/unexpected.png' }] }));
    },
  });

  assert.equal(await router.generate({
    ...input,
    images: Array.from({ length: 7 }, () => 'data:image/png;base64,aW1hZ2U='),
  }), 'visionary');
  assert.equal(primaryCalls, 0);
  assert.equal(fallbackCalls, 1);
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
    { provider: 'Junliai · firefly-gpt-image-2', success: false, configuration: 'STANDARD / auto / 1:1' },
    { provider: 'Visionary', success: true, configuration: 'STANDARD / auto / 1:1' },
    { provider: 'Visionary', success: true, configuration: 'STANDARD / auto / 1:1' },
  ]);
});

test('retries the first Junliai priority after a short cooldown and closes its circuit on recovery', async () => {
  const store = createStore();
  let currentTime = 1_000;
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    primaryModelChains: {
      'gpt-image-2': ['gpt-image-2', 'firefly-gpt-image-2'],
    },
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 30_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 300_000,
    store,
    fallback: async () => {
      fallbackCalls += 1;
      return 'visionary';
    },
    fetchImpl: async (_url, init) => {
      const model = JSON.parse(String(init?.body)).model;
      primaryCalls += 1;
      if (model === 'gpt-image-2' && primaryCalls === 1) {
        return new Response(JSON.stringify({ error: { message: 'quota exhausted' } }), { status: 429 });
      }
      return new Response(JSON.stringify({ data: [{ url: `https://images.example/${model}.png` }] }));
    },
    now: () => currentTime,
  });

  assert.equal(await router.generate(input), 'https://images.example/firefly-gpt-image-2.png');
  assert.equal(primaryCalls, 2);
  assert.equal(fallbackCalls, 0);

  currentTime += 30_000;
  assert.equal(await router.generate(input), 'https://images.example/firefly-gpt-image-2.png');
  assert.equal(primaryCalls, 3);

  currentTime += 30_001;
  assert.equal(await router.generate(input), 'https://images.example/gpt-image-2.png');
  assert.equal(primaryCalls, 4);
  assert.equal(store.state('gpt-image-2')?.openUntil, 0);
});

test('uses the mapped Junliai nano-banana-pro model at 1K', async () => {
  const store = createStore();
  let primaryCalls = 0;
  let fallbackCalls = 0;
  let request: { url: string; init?: RequestInit } | null = null;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    primaryModels: {
      'gpt-image-2': 'firefly-gpt-image-2',
      Nano_Banana_Pro: 'nano-banana-pro',
    },
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => {
      fallbackCalls += 1;
      return 'visionary';
    },
    fetchImpl: async (url, init) => {
      primaryCalls += 1;
      request = { url: String(url), init };
      return new Response(JSON.stringify({ data: [{ url: 'https://images.example/nano.png' }] }));
    },
  });

  assert.equal(
    await router.generate({ ...input, modelId: 'Nano_Banana_Pro', imageSize: '1K' }),
    'https://images.example/nano.png',
  );
  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 0);
  assert.equal(request?.url, 'https://img.junliai.org/v1/images/generations');
  assert.deepEqual(JSON.parse(String(request?.init?.body)), {
    model: 'nano-banana-pro',
    prompt: 'A lighthouse',
    size: '1024x1024',
    response_format: 'b64_json',
  });
});

test('Nano Banana 1K reports 2K guidance and never calls the fallback after a Junliai failure', async () => {
  const store = createStore();
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    primaryModels: {
      Nano_Banana_Pro: 'nano-banana-pro',
    },
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => {
      fallbackCalls += 1;
      return 'visionary-lite';
    },
    fetchImpl: async () => {
      primaryCalls += 1;
      return new Response(JSON.stringify({ error: { message: 'service unavailable' } }), { status: 503 });
    },
  });

  await assert.rejects(
    router.generate({ ...input, modelId: 'Nano_Banana_Pro', imageSize: '1K' }),
    /1K.*2K/,
  );
  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 0);
});

test('Nano Banana 1K reports 2K guidance when the Junliai route is unavailable', async () => {
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: '',
    authorization: '',
    primaryModel: 'firefly-gpt-image-2',
    primaryModels: {
      Nano_Banana_Pro: 'nano-banana-pro',
    },
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store: createStore(),
    fallback: async () => {
      fallbackCalls += 1;
      return 'visionary-lite';
    },
  });

  await assert.rejects(
    router.generate({ ...input, modelId: 'Nano_Banana_Pro', imageSize: '1K' }),
    /1K.*2K/,
  );
  assert.equal(fallbackCalls, 0);
});

test('uses the mapped Junliai nano-banana-pro edits endpoint for reference images', async () => {
  const store = createStore();
  let requestUrl = '';
  let requestBody: FormData | null = null;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    primaryModels: {
      Nano_Banana_Pro: 'nano-banana-pro',
    },
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => 'visionary',
    fetchImpl: async (url, init) => {
      requestUrl = String(url);
      requestBody = init?.body as FormData;
      return new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] }));
    },
  });

  assert.equal(
    await router.generate({
      ...input,
      modelId: 'Nano_Banana_Pro',
      imageSize: '1K',
      ratio: '16:9',
      images: ['data:image/png;base64,aW1hZ2U='],
    }),
    'data:image/png;base64,aW1hZ2U=',
  );
  assert.equal(requestUrl, 'https://img.junliai.org/v1/images/edits');
  assert.equal(requestBody?.get('model'), 'nano-banana-pro');
  assert.equal(requestBody?.get('size'), '1280x720');
  assert.equal(requestBody?.getAll('image').length, 1);
});

test('bypasses Junliai when the selected model route is disabled', async () => {
  const store = createStore();
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'secret',
    primaryModel: 'firefly-gpt-image-2',
    primaryModels: {
      Nano_Banana_Pro: 'nano-banana-pro',
    },
    isPrimaryEnabled: async (request) => request.modelId !== 'Nano_Banana_Pro',
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store,
    fallback: async () => {
      fallbackCalls += 1;
      return 'visionary';
    },
    fetchImpl: async () => {
      primaryCalls += 1;
      return new Response(JSON.stringify({ data: [{ url: 'https://images.example/nano.png' }] }));
    },
  });

  assert.equal(await router.generate({ ...input, modelId: 'Nano_Banana_Pro' }), 'visionary');
  assert.equal(primaryCalls, 0);
  assert.equal(fallbackCalls, 1);
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

test('a Junliai-only API key never switches to another model or fallback provider', async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: 'https://img.junliai.org',
    authorization: 'test-key',
    primaryModel: 'firefly-gpt-image-2',
    primaryModelChains: {
      'gpt-image-2': ['gpt-image-2', 'firefly-gpt-image-2'],
    },
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store: {
      get: async () => null,
      set: async () => undefined,
    },
    fetchImpl: async () => {
      primaryCalls += 1;
      return new Response(JSON.stringify({ error: { message: 'upstream failed' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    fallback: async () => {
      fallbackCalls += 1;
      return 'fallback';
    },
  });

  await assert.rejects(
    router.generate({
      prompt: 'test',
      modelId: 'gpt-image-2',
      ratio: '1:1',
      imageSize: '1K',
      quality: '',
      optimizeChineseText: false,
      images: [],
      providerRouting: 'junliai_only',
    }),
    /provider switching is disabled/i,
  );
  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 0);
});

test('a Junliai-only API key does not fall back when the Junliai route is unavailable', async () => {
  let fallbackCalls = 0;
  const router = createImageProviderRouter({
    baseUrl: '',
    authorization: '',
    primaryModel: 'firefly-gpt-image-2',
    timeoutMs: 1_000,
    failureThreshold: 3,
    transientCooldownMs: 60_000,
    quotaCooldownMs: 60_000,
    authCooldownMs: 60_000,
    store: {
      get: async () => null,
      set: async () => undefined,
    },
    fallback: async () => {
      fallbackCalls += 1;
      return 'fallback';
    },
  });

  await assert.rejects(
    router.generate({
      prompt: 'test',
      modelId: 'gpt-image-2',
      ratio: '1:1',
      imageSize: '1K',
      quality: '',
      optimizeChineseText: false,
      images: [],
      providerRouting: 'junliai_only',
    }),
    /provider switching is disabled/i,
  );
  assert.equal(fallbackCalls, 0);
});
