import assert from 'node:assert/strict';
import test from 'node:test';

import { createProviderMetrics } from './provider-metrics.js';

test('aggregates GPT Image attempts into STANDARD, 2K, and 4K groups', async () => {
  const values = new Map<string, string>();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const timestamp = new Date().toISOString();
  const metrics = createProviderMetrics({
    store: {
      get: async (key, fallback) => values.get(key) || fallback,
      set: async (key, value) => {
        values.set(key, value);
      },
    },
  });

  await metrics.record({
    modelId: 'gpt-image-2',
    provider: 'Junliai',
    configuration: 'STANDARD / auto / 1:1',
    durationMs: 100,
    success: true,
    timestamp,
  });
  await metrics.record({
    modelId: 'gpt-image-2',
    provider: 'Junliai',
    configuration: '2K / high / 16:9',
    durationMs: 300,
    success: false,
    timestamp,
  });

  const rows = JSON.parse(values.get(`provider_metrics_daily_v1:${today}`) || '[]');
  assert.deepEqual(rows, [
    {
      modelId: 'gpt-image-2',
      provider: 'Junliai',
      configuration: 'STANDARD',
      callCount: 1,
      successCount: 1,
      failureCount: 0,
      totalResponseMs: 100,
    },
    {
      modelId: 'gpt-image-2',
      provider: 'Junliai',
      configuration: '2K',
      callCount: 1,
      successCount: 0,
      failureCount: 1,
      totalResponseMs: 300,
    },
  ]);

  assert.deepEqual(await metrics.getToday(), [
    {
      modelId: 'gpt-image-2',
      provider: 'Junliai',
      configuration: 'STANDARD',
      callCount: 1,
      successCount: 1,
      failureCount: 0,
      totalResponseMs: 100,
      averageResponseMs: 100,
    },
    {
      modelId: 'gpt-image-2',
      provider: 'Junliai',
      configuration: '2K',
      callCount: 1,
      successCount: 0,
      failureCount: 1,
      totalResponseMs: 300,
      averageResponseMs: 300,
    },
  ]);
});

test('combines Nano Banana metrics by 1K, 2K, and 4K', async () => {
  const values = new Map<string, string>();
  const metrics = createProviderMetrics({
    store: {
      get: async (key, fallback) => values.get(key) || fallback,
      set: async (key, value) => {
        values.set(key, value);
      },
    },
  });

  await metrics.record({
    modelId: 'Nano_Banana_Pro',
    provider: 'Junliai',
    configuration: '1K / default / 1:1',
    durationMs: 40_000,
    success: true,
  });
  await metrics.record({
    modelId: 'Nano_Banana_Pro',
    provider: 'Visionary',
    configuration: '2K / default / 1:1',
    durationMs: 70_000,
    success: true,
  });
  await metrics.record({
    modelId: 'Nano_Banana_Pro',
    provider: 'Visionary',
    configuration: '2K / default / 16:9',
    durationMs: 80_000,
    success: true,
  });
  await metrics.record({
    modelId: 'Nano_Banana_Pro',
    provider: 'Visionary',
    configuration: '4K / default / 16:9',
    durationMs: 170_000,
    success: true,
  });

  assert.deepEqual(await metrics.getToday(), [
    {
      modelId: 'Nano_Banana_Pro',
      provider: 'Junliai',
      configuration: '1K',
      callCount: 1,
      successCount: 1,
      failureCount: 0,
      totalResponseMs: 40_000,
      averageResponseMs: 40_000,
    },
    {
      modelId: 'Nano_Banana_Pro',
      provider: 'Visionary',
      configuration: '2K',
      callCount: 2,
      successCount: 2,
      failureCount: 0,
      totalResponseMs: 150_000,
      averageResponseMs: 75_000,
    },
    {
      modelId: 'Nano_Banana_Pro',
      provider: 'Visionary',
      configuration: '4K',
      callCount: 1,
      successCount: 1,
      failureCount: 0,
      totalResponseMs: 170_000,
      averageResponseMs: 170_000,
    },
  ]);
});

test('groups rows by model and route order instead of call count', async () => {
  const values = new Map<string, string>();
  const metrics = createProviderMetrics({
    store: {
      get: async (key, fallback) => values.get(key) || fallback,
      set: async (key, value) => {
        values.set(key, value);
      },
    },
  });
  const attempts = [
    { modelId: 'Nano_Banana_Pro', provider: 'Visionary', configuration: '2K', count: 20 },
    { modelId: 'gpt-image-2', provider: 'Visionary', configuration: '4K', count: 1 },
    { modelId: 'gpt-image-2', provider: 'Junliai · firefly-gpt-image-2', configuration: 'STANDARD', count: 2 },
    { modelId: 'gpt-image-2', provider: 'Junliai · gpt-image-2', configuration: 'STANDARD', count: 1 },
    { modelId: 'Nano_Banana_Pro', provider: 'Junliai · nano-banana-pro', configuration: '1K', count: 1 },
  ];
  for (const attempt of attempts) {
    for (let index = 0; index < attempt.count; index += 1) {
      await metrics.record({
        modelId: attempt.modelId,
        provider: attempt.provider,
        configuration: attempt.configuration,
        durationMs: 100,
        success: true,
      });
    }
  }

  assert.deepEqual((await metrics.getToday()).map((row) => [
    row.modelId,
    row.provider,
    row.configuration,
    row.callCount,
  ]), [
    ['gpt-image-2', 'Junliai · gpt-image-2', 'STANDARD', 1],
    ['gpt-image-2', 'Junliai · firefly-gpt-image-2', 'STANDARD', 2],
    ['gpt-image-2', 'Visionary', '4K', 1],
    ['Nano_Banana_Pro', 'Junliai · nano-banana-pro', '1K', 1],
    ['Nano_Banana_Pro', 'Visionary', '2K', 20],
  ]);
});
