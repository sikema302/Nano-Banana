import assert from 'node:assert/strict';
import test from 'node:test';

import { createProviderMetrics } from './provider-metrics.js';

test('aggregates provider attempts by model, interface, and configuration', async () => {
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
    modelId: 'gpt-image-2',
    provider: 'Junliai',
    configuration: 'STANDARD / auto / 1:1',
    durationMs: 100,
    success: true,
    timestamp: '2026-07-27T01:00:00+08:00',
  });
  await metrics.record({
    modelId: 'gpt-image-2',
    provider: 'Junliai',
    configuration: 'STANDARD / auto / 1:1',
    durationMs: 300,
    success: false,
    timestamp: '2026-07-27T02:00:00+08:00',
  });

  const rows = JSON.parse(values.get('provider_metrics_daily_v1:2026-07-27') || '[]');
  assert.deepEqual(rows, [{
    modelId: 'gpt-image-2',
    provider: 'Junliai',
    configuration: 'STANDARD / auto / 1:1',
    callCount: 2,
    successCount: 1,
    failureCount: 1,
    totalResponseMs: 400,
  }]);

  assert.deepEqual(await metrics.getToday(), [{
    modelId: 'gpt-image-2',
    provider: 'Junliai',
    configuration: 'STANDARD / auto / 1:1',
    callCount: 2,
    successCount: 1,
    failureCount: 1,
    totalResponseMs: 400,
    averageResponseMs: 200,
  }]);
});
