import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyProviderRoutingToImageSize,
  createProviderRouting,
  enabledProviderIds,
  routingResolution,
  type ProviderRoutingConfig,
} from './provider-routing.js';

const defaults: ProviderRoutingConfig = {
  image2Routes: {
    '1K': [
      { id: 'junliai-economy', enabled: true },
      { id: 'junliai-firefly', enabled: true },
      { id: 'schat-gpt-image-2', enabled: false },
      { id: 'visionary', enabled: true },
    ],
    '2K': [
      { id: 'junliai-firefly', enabled: true },
      { id: 'schat-gpt-image-2', enabled: false },
      { id: 'visionary', enabled: true },
    ],
    '4K': [
      { id: 'junliai-firefly', enabled: true },
      { id: 'schat-gpt-image-2', enabled: false },
      { id: 'visionary', enabled: true },
    ],
  },
  bananaRoutes: {
    '1K': [
      { id: 'flux', enabled: true },
      { id: 'visionary', enabled: true },
      { id: 'junliai', enabled: true },
      { id: 'junliai-nano-banana-2', enabled: true },
      { id: 'schat-nano-banana-2', enabled: false },
    ],
    '2K': [
      { id: 'flux', enabled: true },
      { id: 'visionary', enabled: true },
      { id: 'junliai', enabled: true },
      { id: 'junliai-nano-banana-2', enabled: true },
    ],
    '4K': [
      { id: 'flux', enabled: true },
      { id: 'visionary', enabled: true },
      { id: 'junliai', enabled: true },
    ],
  },
  seedreamRoutes: {
    '1K': [],
    '2K': [{ id: 'schat-seedream-4', enabled: false }],
    '4K': [{ id: 'schat-seedream-4', enabled: false }],
  },
  grokImageRoutes: {
    '1K': [{ id: 'junliai-grok', enabled: true }],
    '2K': [{ id: 'junliai-grok', enabled: true }],
    '4K': [],
  },
  junliaiGeminiVeo31: true,
  junliaiGrokVideo: true,
  schatSeedance25: true,
};

test('persists independent provider order and switches for each resolution', async () => {
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

  const nextBananaRoutes = {
    ...defaults.bananaRoutes,
    '2K': [
      { id: 'junliai' as const, enabled: true },
      { id: 'flux' as const, enabled: false },
      { id: 'visionary' as const, enabled: true },
      { id: 'junliai-nano-banana-2' as const, enabled: true },
    ],
  };
  const updated = await routing.update({ bananaRoutes: nextBananaRoutes });

  assert.deepEqual(updated.bananaRoutes['2K'], nextBananaRoutes['2K']);
  assert.deepEqual(updated.bananaRoutes['1K'], defaults.bananaRoutes['1K']);
  assert.deepEqual(updated.image2Routes, defaults.image2Routes);
  assert.deepEqual(updated.seedreamRoutes, defaults.seedreamRoutes);
  assert.deepEqual(
    enabledProviderIds(updated.bananaRoutes['2K']),
    ['junliai', 'visionary', 'junliai-nano-banana-2'],
  );
  assert.deepEqual(JSON.parse(values.get('provider_routing_v1') || '{}'), updated);
});

test('normalizes duplicates, unknown channels, and missing channels per resolution', async () => {
  const routing = createProviderRouting({
    defaults,
    store: {
      get: async () => JSON.stringify({
        bananaRoutes: {
          '1K': [
            { id: 'visionary', enabled: false },
            { id: 'unknown', enabled: true },
            { id: 'visionary', enabled: true },
          ],
        },
      }),
      set: async () => undefined,
    },
  });

  const config = await routing.get();
  assert.deepEqual(config.bananaRoutes['1K'], [
    { id: 'visionary', enabled: false },
    { id: 'flux', enabled: true },
    { id: 'junliai', enabled: true },
    { id: 'junliai-nano-banana-2', enabled: true },
    { id: 'schat-nano-banana-2', enabled: false },
  ]);
  assert.deepEqual(config.bananaRoutes['2K'], defaults.bananaRoutes['2K']);
  assert.deepEqual(config.seedreamRoutes, defaults.seedreamRoutes);
});

test('migrates legacy switches into every compatible resolution route', async () => {
  const routing = createProviderRouting({
    defaults,
    store: {
      get: async () => JSON.stringify({
        junliaiGptImage2: false,
        junliaiNanoBanana: false,
        junliaiFireflyVideo: true,
      }),
      set: async () => undefined,
    },
  });

  const config = await routing.get();
  assert.equal(config.image2Routes['1K'].find((route) => route.id === 'junliai-economy')?.enabled, false);
  assert.equal(config.image2Routes['1K'].find((route) => route.id === 'junliai-firefly')?.enabled, false);
  assert.equal(config.image2Routes['4K'].find((route) => route.id === 'junliai-firefly')?.enabled, false);
  for (const resolution of ['1K', '2K', '4K'] as const) {
    assert.equal(config.bananaRoutes[resolution].find((route) => route.id === 'junliai')?.enabled, false);
  }
  assert.equal(
    config.bananaRoutes['1K'].find((route) => route.id === 'junliai-nano-banana-2')?.enabled,
    false,
  );
  assert.equal(
    config.bananaRoutes['2K'].find((route) => route.id === 'junliai-nano-banana-2')?.enabled,
    false,
  );
});

test('maps STANDARD to the independently managed 1K route', () => {
  assert.equal(routingResolution('STANDARD'), '1K');
  assert.equal(routingResolution('1K'), '1K');
  assert.equal(routingResolution('2K'), '2K');
  assert.equal(routingResolution('4K'), '4K');
  assert.equal(applyProviderRoutingToImageSize('Nano_Banana_Pro', '1K', defaults), '1K');
});
