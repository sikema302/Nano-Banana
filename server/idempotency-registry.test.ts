import assert from 'node:assert/strict';
import test from 'node:test';
import { IdempotencyRegistry } from './idempotency-registry';

test('reserves one job for repeated submissions with the same key', () => {
  const registry = new IdempotencyRegistry(60_000);
  assert.deepEqual(registry.reserve('user-1:submission-1', 'job-1'), { jobId: 'job-1', reused: false });
  assert.deepEqual(registry.reserve('user-1:submission-1', 'job-2'), { jobId: 'job-1', reused: true });
});

test('releases a failed reservation for retry', () => {
  const registry = new IdempotencyRegistry(60_000);
  registry.reserve('user-1:submission-2', 'job-1');
  registry.release('user-1:submission-2', 'job-1');
  assert.deepEqual(registry.reserve('user-1:submission-2', 'job-2'), { jobId: 'job-2', reused: false });
});
