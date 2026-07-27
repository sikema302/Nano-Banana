import assert from 'node:assert/strict';
import test from 'node:test';

import { getInviteRedemptionCredits, INVITE_REDEMPTION_ERRORS } from './invite-redemption.js';

test('returns the complete remaining invite balance for redemption', () => {
  assert.equal(getInviteRedemptionCredits({ credits: 500, redeemed_by: null }), 500);
});

test('rejects missing, empty, and previously redeemed invite codes', () => {
  assert.throws(() => getInviteRedemptionCredits(null), new RegExp(INVITE_REDEMPTION_ERRORS.notFound));
  assert.throws(
    () => getInviteRedemptionCredits({ credits: 0, redeemed_by: null }),
    new RegExp(INVITE_REDEMPTION_ERRORS.noCredits),
  );
  assert.throws(
    () => getInviteRedemptionCredits({ credits: 500, redeemed_by: 'user-1' }),
    new RegExp(INVITE_REDEMPTION_ERRORS.alreadyRedeemed),
  );
});

