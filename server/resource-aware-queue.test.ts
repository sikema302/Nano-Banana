import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QueueCapacityError,
  ResourceAwareWorkQueue,
  ResourcePressureGate,
  type ResourceSnapshot,
  type WorkAdmissionGate,
} from './resource-aware-queue.js';

function snapshot(patch: Partial<ResourceSnapshot> = {}): ResourceSnapshot {
  return {
    cpuPercent: 20,
    memoryUsedPercent: 40,
    availableMemoryMb: 1_000,
    eventLoopLagMs: 10,
    sampledAt: new Date().toISOString(),
    ...patch,
  };
}

test('pauses only after sustained pressure and resumes with hysteresis', () => {
  const gate = new ResourcePressureGate({
    cpuPausePercent: 85,
    cpuResumePercent: 65,
    memoryPausePercent: 85,
    memoryResumePercent: 75,
    minAvailableMemoryMb: 300,
    resumeAvailableMemoryMb: 500,
    eventLoopPauseMs: 200,
    eventLoopResumeMs: 100,
    pauseSamples: 2,
    resumeSamples: 3,
  });

  assert.equal(gate.observe(snapshot({ cpuPercent: 92 })).paused, false);
  assert.equal(gate.observe(snapshot({ cpuPercent: 91 })).paused, true);
  assert.deepEqual(gate.status().reasons, ['cpu']);
  assert.equal(gate.observe(snapshot({ cpuPercent: 70 })).paused, true);
  assert.equal(gate.observe(snapshot()).paused, true);
  assert.equal(gate.observe(snapshot()).paused, true);
  assert.equal(gate.observe(snapshot()).paused, false);
});

test('memory and event-loop pressure also close the admission gate', () => {
  const gate = new ResourcePressureGate({
    cpuPausePercent: 85,
    cpuResumePercent: 65,
    memoryPausePercent: 85,
    memoryResumePercent: 75,
    minAvailableMemoryMb: 300,
    resumeAvailableMemoryMb: 500,
    eventLoopPauseMs: 200,
    eventLoopResumeMs: 100,
    pauseSamples: 1,
    resumeSamples: 1,
  });

  assert.deepEqual(gate.observe(snapshot({ availableMemoryMb: 250 })).reasons, ['memory']);
  assert.equal(gate.observe(snapshot()).paused, false);
  assert.deepEqual(gate.observe(snapshot({ eventLoopLagMs: 250 })).reasons, ['event-loop']);
});

class FakeGate implements WorkAdmissionGate {
  paused = false;
  listeners = new Set<() => void>();
  isPaused() { return this.paused; }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    for (const listener of this.listeners) listener();
  }
}

test('queues work while pressured and respects global and per-kind concurrency', async () => {
  const gate = new FakeGate();
  gate.setPaused(true);
  const queue = new ResourceAwareWorkQueue(gate, 2, 5, { video: 1 });
  const started: string[] = [];
  const releases = new Map<string, () => void>();
  const work = (id: string, kind: string) => queue.enqueue(id, kind, async () => {
    started.push(id);
    await new Promise<void>((resolve) => releases.set(id, resolve));
  });

  const first = work('video-1', 'video');
  const second = work('video-2', 'video');
  const third = work('image-1', 'image');
  assert.deepEqual(started, []);
  assert.equal(queue.position('video-1'), 1);

  gate.setPaused(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ['video-1', 'image-1']);
  releases.get('image-1')?.();
  releases.get('video-1')?.();
  await Promise.all([first, third]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ['video-1', 'image-1', 'video-2']);
  releases.get('video-2')?.();
  await second;
  queue.dispose();
});

test('rejects new work when the waiting queue is full', async () => {
  const gate = new FakeGate();
  gate.setPaused(true);
  const queue = new ResourceAwareWorkQueue(gate, 1, 1);
  void queue.enqueue('first', 'image', async () => undefined);
  await assert.rejects(
    queue.enqueue('second', 'image', async () => undefined),
    (error: unknown) => error instanceof QueueCapacityError && error.capacity === 1,
  );
  queue.dispose();
});
