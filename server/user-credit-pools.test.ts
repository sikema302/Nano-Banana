import assert from 'node:assert/strict';
import test from 'node:test';

import {
  availableCreditsForBucket,
  debitCreditBalances,
  reconcileCreditBalances,
  refundCreditBalances,
} from './user-credit-pools.js';

test('migrates legacy remaining credits into the general bucket', () => {
  assert.deepEqual(reconcileCreditBalances({}, 120), { gpt: 0, banana: 0, general: 120 });
});

test('uses dedicated credits before general credits', () => {
  const result = debitCreditBalances({ gpt: 30, banana: 20, general: 50 }, 'gpt', 40);
  assert.deepEqual(result.balances, { gpt: 0, banana: 20, general: 40 });
  assert.deepEqual(result.debit, { gpt: 30, banana: 0, general: 10 });
  assert.equal(availableCreditsForBucket(result.balances, 'banana'), 60);
});

test('general-only work cannot spend model-specific credits', () => {
  assert.equal(availableCreditsForBucket({ gpt: 100, banana: 100, general: 4 }, 'general'), 4);
  assert.throws(
    () => debitCreditBalances({ gpt: 100, banana: 100, general: 4 }, 'general', 5),
    /INSUFFICIENT_BUCKET_CREDITS/,
  );
});

test('refund restores the exact source buckets', () => {
  const original = { gpt: 10, banana: 5, general: 10 };
  const charged = debitCreditBalances(original, 'gpt', 15);
  assert.deepEqual(refundCreditBalances(charged.balances, charged.debit), original);
});
