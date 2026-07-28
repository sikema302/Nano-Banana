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
      configuration: '2K',
      callCount: 1,
      successCount: 0,
      failureCount: 1,
      totalResponseMs: 300,
      averageResponseMs: 300,
    },
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
  ]);
});

test('combines Nano Banana metrics by 2K and 4K only', async () => {
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
