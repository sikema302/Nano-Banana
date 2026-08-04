import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPromoCouponPrefix,
  getPromoCouponSchedule,
  getPromoDiscountLabel,
  getPromoDiscountRate,
  normalizePromoDiscountPercent,
  pickPromoDiscountPercent,
} from './promo-coupon.js';

test('random coupon selection maps evenly to 95 and 90 percent price rates', () => {
  assert.equal(pickPromoDiscountPercent(0), 5);
  assert.equal(pickPromoDiscountPercent(1), 10);
  assert.equal(pickPromoDiscountPercent(254), 5);
  assert.equal(pickPromoDiscountPercent(255), 10);
});

test('coupon labels and prefixes match their discount', () => {
  assert.equal(getPromoDiscountRate(5), '9.5');
  assert.equal(getPromoDiscountLabel(5), '9.5 折');
  assert.equal(getPromoCouponPrefix(5), 'PIXORY95');
  assert.equal(getPromoDiscountRate(10), '9');
  assert.equal(getPromoDiscountLabel(10), '9 折');
  assert.equal(getPromoCouponPrefix(10), 'PIXORY90');
});

test('legacy or invalid values keep the existing 9 discount behavior', () => {
  assert.equal(normalizePromoDiscountPercent(10), 10);
  assert.equal(normalizePromoDiscountPercent(undefined), 10);
  assert.equal(normalizePromoDiscountPercent(99), 10);
});

test('coupon expires after 12 hours and waits at least two full days before another push', () => {
  const issuedAt = '2026-08-04T01:30:00.000Z';
  assert.deepEqual(getPromoCouponSchedule(issuedAt, 2), {
    expiresAt: '2026-08-04T13:30:00.000Z',
    nextEligibleAt: '2026-08-06T13:30:00.000Z',
  });
  assert.equal(getPromoCouponSchedule(issuedAt, 3).nextEligibleAt, '2026-08-07T13:30:00.000Z');
  assert.equal(getPromoCouponSchedule(issuedAt, 0).nextEligibleAt, '2026-08-06T13:30:00.000Z');
});
