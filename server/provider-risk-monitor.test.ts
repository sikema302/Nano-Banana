import assert from 'node:assert/strict';
import test from 'node:test';

import { createProviderRiskMonitor } from './provider-risk-monitor.js';

function createStore() {
  const values = new Map<string, string>();
  return {
    get: async (key: string, fallback: string) => values.get(key) || fallback,
    set: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test('marks an uncertain Junliai result followed by Visionary as suspected duplicate billing', async () => {
  const monitor = createProviderRiskMonitor({ store: createStore() });
  const base = {
    traceId: 'trace-1',
    modelId: 'gpt-image-2',
    configuration: '4K',
    durationMs: 900_000,
    success: false,
  };
  await monitor.record({ ...base, provider: 'Junliai', failureReason: 'uncertain' });
  await monitor.record({ ...base, provider: 'Visionary', durationMs: 70_000, success: true });

  const [record] = await monitor.getToday();
  assert.equal(record.riskLevel, 'suspected_duplicate');
  assert.equal(record.junliaiStatus, 'uncertain');
  assert.equal(record.visionaryStatus, 'success');
});

test('keeps an explicit Junliai failure followed by Visionary success as a normal fallback', async () => {
  const monitor = createProviderRiskMonitor({ store: createStore() });
  const base = {
    traceId: 'trace-2',
    modelId: 'gpt-image-2',
    configuration: '2K',
    durationMs: 10_000,
    success: false,
  };
  await monitor.record({ ...base, provider: 'Junliai', failureReason: 'quota' });
  await monitor.record({ ...base, provider: 'Visionary', durationMs: 60_000, success: true });

  const [record] = await monitor.getToday();
  assert.equal(record.riskLevel, 'normal');
  assert.match(record.riskReason, /正常回退/);
});
