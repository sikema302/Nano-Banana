import assert from 'node:assert/strict';
import test from 'node:test';

import { createImageChannelFailover } from './image-channel-failover.js';

test('temporarily skips an explicitly failed first channel and restores configured priority after 30 seconds', () => {
  let now = 1_000;
  const failover = createImageChannelFailover({ cooldownMs: 30_000, now: () => now });
  const channels = ['cheap-first', 'second', 'last'];

  assert.deepEqual(failover.candidates('banana:1K', channels), channels);
  failover.markFailure('banana:1K', 'cheap-first');
  assert.deepEqual(failover.candidates('banana:1K', channels), ['second', 'last']);

  now += 29_999;
  assert.deepEqual(failover.candidates('banana:1K', channels), ['second', 'last']);
  now += 1;
  assert.deepEqual(failover.candidates('banana:1K', channels), channels);
});

test('keeps retrying in configured order when every channel is cooling down', () => {
  const failover = createImageChannelFailover({ cooldownMs: 30_000, now: () => 1_000 });
  const channels = ['first', 'second'];
  failover.markFailure('image2:2K', 'first');
  failover.markFailure('image2:2K', 'second');

  assert.deepEqual(failover.candidates('image2:2K', channels), channels);
});

test('success and admin reset immediately restore a channel', () => {
  const failover = createImageChannelFailover({ cooldownMs: 30_000, now: () => 1_000 });
  const channels = ['first', 'second'];
  failover.markFailure('banana:4K', 'first');
  failover.markSuccess('banana:4K', 'first');
  assert.deepEqual(failover.candidates('banana:4K', channels), channels);

  failover.markFailure('banana:4K', 'first');
  failover.reset();
  assert.deepEqual(failover.candidates('banana:4K', channels), channels);
});
