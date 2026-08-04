import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSamePromoCouponClaim,
  orderPromoCouponCodes,
  parsePromoCouponCodeClaim,
  parsePromoCouponCodes,
  promoCouponCodeClaimKey,
  serializePromoCouponCodeClaim,
} from './promo-coupon-code-pool.js';

test('parsePromoCouponCodes ignores headers, blanks and duplicate codes', () => {
  assert.deepEqual(
    parsePromoCouponCodes('优惠券码\r\n1234567890\r\n\r\n1234567890\r\n0987654321\r\ninvalid'),
    ['1234567890', '0987654321'],
  );
});

test('orderPromoCouponCodes is deterministic and preserves every code', () => {
  const codes = ['1000000001', '1000000002', '1000000003', '1000000004'];
  const first = orderPromoCouponCodes(codes, 'user-1:coupon-1');
  const second = orderPromoCouponCodes(codes, 'user-1:coupon-1');
  assert.deepEqual(first, second);
  assert.deepEqual([...first].sort(), [...codes].sort());
});

test('claim keys do not expose the redemption code', () => {
  const code = '1234567890';
  const key = promoCouponCodeClaimKey(5, code);
  assert.match(key, /^promo_coupon_code_claim_v1:5:[a-f0-9]{32}$/);
  assert.equal(key.includes(code), false);
});

test('claim records can be recovered idempotently after a partial write', () => {
  const claim = {
    userId: 'user-1',
    couponId: 'PIXORY95-ABC123',
    discountPercent: 5 as const,
    claimedAt: '2026-08-04T08:00:00.000Z',
  };
  const parsed = parsePromoCouponCodeClaim(serializePromoCouponCodeClaim(claim));
  assert.deepEqual(parsed, claim);
  assert.equal(isSamePromoCouponClaim(parsed, claim), true);
  assert.equal(isSamePromoCouponClaim(parsed, { ...claim, userId: 'user-2' }), false);
});
