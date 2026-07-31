import assert from 'node:assert/strict';
import test from 'node:test';

import { applyProviderRoutingToImageSize, createProviderRouting } from './provider-routing.js';

const defaults = {
  junliaiGptImage2Economy: true,
  junliaiGptImage2: true,
  junliaiNanoBanana: true,
  junliaiFireflyVideo: true,
};

test('loads provider routing defaults and persists partial updates', async () => {
  const values = new Map<string, string>();
  const routing = createProviderRouting({
    defaults,
    store: {
      get: async (key, fallback) => values.get(key) ?? fallback,
      set: async (key, value) => {
        values.set(key, value);
      },
    },
  });

  assert.deepEqual(await routing.get(), defaults);
  assert.deepEqual(await routing.update({ junliaiNanoBanana: false }), {
    ...defaults,
    junliaiNanoBanana: false,
  });
  assert.deepEqual(JSON.parse(values.get('provider_routing_v1') || '{}'), {
    ...defaults,
    junliaiNanoBanana: false,
  });
});

test('ignores unknown persisted values and keeps explicit false values', async () => {
  const routing = createProviderRouting({
    defaults,
    store: {
      get: async () => JSON.stringify({
        junliaiGptImage2: false,
        junliaiNanoBanana: 'off',
      }),
      set: async () => undefined,
    },
  });

  assert.deepEqual(await routing.get(), {
    junliaiGptImage2Economy: false,
    junliaiGptImage2: false,
    junliaiNanoBanana: true,
    junliaiFireflyVideo: true,
  });
});

test('migrates the legacy GPT switch to both independent GPT routes', async () => {
  const routing = createProviderRouting({
    defaults,
    store: {
      get: async () => JSON.stringify({
        junliaiGptImage2: false,
        junliaiNanoBanana: true,
        junliaiFireflyVideo: true,
      }),
      set: async () => undefined,
    },
  });

  assert.deepEqual(await routing.get(), {
    ...defaults,
    junliaiGptImage2Economy: false,
    junliaiGptImage2: false,
  });
});

test('removes Nano Banana 1K when the Junliai banana route is disabled', () => {
  assert.equal(
    applyProviderRoutingToImageSize('Nano_Banana_Pro', '1K', {
      ...defaults,
      junliaiNanoBanana: false,
    }),
    '2K',
  );
  assert.equal(
    applyProviderRoutingToImageSize('Nano_Banana_Pro', '4K', {
      ...defaults,
      junliaiNanoBanana: false,
    }),
    '4K',
  );
});
