import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveApiKeyDisplayCredits } from './api-key-credits.js';

test('account API keys display the owner account balance instead of stored zeroes', () => {
  assert.deepEqual(
    resolveApiKeyDisplayCredits(
      { totalCredits: 0, usedCredits: 0, billingMode: 'account', ownerUserId: '566' },
      { totalCredits: 2900, usedCredits: 1676 },
    ),
    {
      totalCredits: 2900,
      usedCredits: 1676,
      remainingCredits: 1224,
      quotaSource: 'account',
    },
  );
});

test('legacy API keys keep their independent balance', () => {
  assert.deepEqual(
    resolveApiKeyDisplayCredits(
      { totalCredits: 5000, usedCredits: 4700, billingMode: 'legacy' },
      { totalCredits: 2900, usedCredits: 1676 },
    ),
    {
      totalCredits: 5000,
      usedCredits: 4700,
      remainingCredits: 300,
      quotaSource: 'key',
    },
  );
});
