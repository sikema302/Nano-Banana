import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyReconciliationAttempt,
  createGenerationReconciler,
  indeterminateTaskError,
  isIndeterminateGenerationError,
  reconciliationExpired,
  resumeFromError,
  type GenerationResume,
  type ReconciliationEntry,
} from './generation-reconciliation.js';

type Entry = ReconciliationEntry & { resume: GenerationResume };

const silentLogger = { warn: () => {}, error: () => {} };

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    key: 'k1',
    jobId: 'job1',
    requestId: 'req1',
    startedAtMs: 0,
    resume: { kind: 'schat', taskId: 't1' },
    ...overrides,
  };
}

test('isIndeterminateGenerationError only matches the explicit indeterminate flag', () => {
  assert.equal(isIndeterminateGenerationError(indeterminateTaskError('x', { kind: 'schat', taskId: 't1' })), true);
  assert.equal(isIndeterminateGenerationError(new Error('x')), false);
  assert.equal(isIndeterminateGenerationError(Object.assign(new Error('x'), { safeToFallback: true })), false);
  assert.equal(isIndeterminateGenerationError(null), false);
});

test('resumeFromError returns null unless there is a resumable task id', () => {
  assert.equal(resumeFromError(new Error('x')), null);
  assert.equal(resumeFromError(indeterminateTaskError('x', { kind: 'schat', taskId: '' })), null);
  const withTask = resumeFromError(indeterminateTaskError('x', { kind: 'flux-banana', taskId: 'task-9', pollUrl: 'u' }));
  assert.equal(withTask?.taskId, 'task-9');
  assert.equal(withTask?.kind, 'flux-banana');
});

test('reconciliationExpired uses a bounded window', () => {
  assert.equal(reconciliationExpired(0, 999, 1000), false);
  assert.equal(reconciliationExpired(0, 1000, 1000), true);
});

test('classifyReconciliationAttempt: image => succeeded', () => {
  assert.deepEqual(classifyReconciliationAttempt({ imageSource: 'data:img' }), {
    status: 'succeeded',
    imageSource: 'data:img',
  });
});

test('classifyReconciliationAttempt: indeterminate error => still pending', () => {
  const outcome = classifyReconciliationAttempt({
    error: indeterminateTaskError('polling window exhausted', { kind: 'schat', taskId: 't1' }),
  });
  assert.equal(outcome.status, 'pending');
});

test('classifyReconciliationAttempt: safeToFallback error => confirmed failure', () => {
  const error = Object.assign(new Error('task cancelled'), { safeToFallback: true });
  assert.equal(classifyReconciliationAttempt({ error }).status, 'failed');
});

test('classifyReconciliationAttempt: unknown error => conservative pending', () => {
  // 未知错误不能当作上游明确失败，否则可能误退款后上游仍计费。
  assert.equal(classifyReconciliationAttempt({ error: new Error('ECONNRESET') }).status, 'pending');
});

test('reconciler delivers a late success and clears the entry', async () => {
  const calls: string[] = [];
  const reconciler = createGenerationReconciler<Entry>({
    resume: async () => 'https://cdn/late.png',
    onSuccess: async (entry, imageSource) => {
      calls.push(`success:${entry.key}:${imageSource}`);
    },
    onConfirmedFailure: async (entry, reason) => {
      calls.push(`failed:${entry.key}:${reason}`);
    },
    onExpired: async (entry) => {
      calls.push(`expired:${entry.key}`);
    },
    now: () => 0,
    windowMs: 1000,
    logger: silentLogger,
  });

  reconciler.register(makeEntry());
  await reconciler.tick();

  assert.deepEqual(calls, ['success:k1:https://cdn/late.png']);
  assert.equal(reconciler.size(), 0);
});

test('reconciler keeps polling while indeterminate and expires after the window', async () => {
  const calls: string[] = [];
  let nowMs = 0;
  const reconciler = createGenerationReconciler<Entry>({
    resume: async () => {
      throw indeterminateTaskError('still running', { kind: 'schat', taskId: 't1' });
    },
    onSuccess: async () => {},
    onConfirmedFailure: async (entry) => {
      calls.push(`failed:${entry.key}`);
    },
    onExpired: async (entry) => {
      calls.push(`expired:${entry.key}`);
    },
    now: () => nowMs,
    windowMs: 1000,
    logger: silentLogger,
  });

  reconciler.register(makeEntry());
  await reconciler.tick();
  // 窗口未到：条目保留，继续幂等续查。
  assert.equal(reconciler.size(), 1);
  assert.deepEqual(calls, []);

  nowMs = 1000;
  await reconciler.tick();
  assert.deepEqual(calls, ['expired:k1']);
  assert.equal(reconciler.size(), 0);
});

test('reconciler settles a confirmed upstream failure immediately', async () => {
  const calls: string[] = [];
  const reconciler = createGenerationReconciler<Entry>({
    resume: async () => {
      throw Object.assign(new Error('task cancelled upstream'), { safeToFallback: true });
    },
    onSuccess: async () => {
      calls.push('success');
    },
    onConfirmedFailure: async (entry, reason) => {
      calls.push(`failed:${entry.key}:${reason}`);
    },
    onExpired: async () => {
      calls.push('expired');
    },
    now: () => 0,
    windowMs: 1000,
    logger: silentLogger,
  });

  reconciler.register(makeEntry());
  await reconciler.tick();

  assert.deepEqual(calls, ['failed:k1:task cancelled upstream']);
  assert.equal(reconciler.size(), 0);
});

test('reconciler never replays a settled entry even if the handler fails', async () => {
  let resumeCalls = 0;
  const reconciler = createGenerationReconciler<Entry>({
    resume: async () => {
      resumeCalls += 1;
      return 'https://cdn/late.png';
    },
    onSuccess: async () => {
      throw new Error('debit failed');
    },
    onConfirmedFailure: async () => {},
    onExpired: async () => {},
    now: () => 0,
    windowMs: 1000,
    logger: silentLogger,
  });

  reconciler.register(makeEntry());
  await reconciler.tick();
  await reconciler.tick();

  // 先摘除再执行：即便 onSuccess 抛错也不在下个 tick 重放，避免重复扣款。
  assert.equal(resumeCalls, 1);
  assert.equal(reconciler.size(), 0);
});

test('reconciler register is idempotent per key', () => {
  const reconciler = createGenerationReconciler<Entry>({
    resume: async () => '',
    onSuccess: async () => {},
    onConfirmedFailure: async () => {},
    onExpired: async () => {},
    logger: silentLogger,
  });

  reconciler.register(makeEntry({ jobId: 'job-old' }));
  reconciler.register(makeEntry({ jobId: 'job-new' }));
  assert.equal(reconciler.size(), 1);
  assert.equal(reconciler.get('k1')?.jobId, 'job-new');
});
