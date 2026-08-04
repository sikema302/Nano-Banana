import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPromoCouponPrefix,
  getPromoCouponSchedule,
  formatPromoCouponCountdown,
  getPromoDiscountLabel,
  getPromoDiscountRate,
  normalizePromoDiscountPercent,
  pickPromoDiscountPercent,
} from './promo-coupon.js';

test('random coupon selection gives 95 discount an 80 percent share', () => {
  assert.equal(pickPromoDiscountPercent(0), 5);
  assert.equal(pickPromoDiscountPercent(79), 5);
  assert.equal(pickPromoDiscountPercent(80), 10);
  assert.equal(pickPromoDiscountPercent(99), 10);
  const outcomes = Array.from({ length: 100 }, (_, index) => pickPromoDiscountPercent(index));
  assert.equal(outcomes.filter((discount) => discount === 5).length, 80);
  assert.equal(outcomes.filter((discount) => discount === 10).length, 20);
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

test('coupon countdown formats the live remaining time and stops at zero', () => {
  const now = new Date('2026-08-04T01:30:00.000Z').getTime();
  assert.equal(formatPromoCouponCountdown('2026-08-04T13:30:00.000Z', now), '12:00:00');
  assert.equal(formatPromoCouponCountdown('2026-08-04T02:31:02.000Z', now), '01:01:02');
  assert.equal(formatPromoCouponCountdown('2026-08-04T01:29:59.000Z', now), '00:00:00');
});
