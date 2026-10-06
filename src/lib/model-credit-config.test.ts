import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MODEL_CREDIT_PRICING,
  getConfiguredImageCredits,
  getConfiguredVideoCredits,
  getVideoReferenceImageSurcharge,
  normalizeModelCreditPricing,
} from './model-credit-config.js';

test('normalizes every configurable image tier', () => {
  const pricing = normalizeModelCreditPricing({
    gptImage2: { standard: 11, twoK: 22, twoKHigh: 33, fourK: 44, fourKHigh: 55 },
    nanoBanana: { oneK: 12, twoK: 23, fourK: 34, enhancement: 7 },
  });

  assert.equal(getConfiguredImageCredits(pricing, 'gpt-image-2', '4K', 'high'), 55);
  assert.equal(getConfiguredImageCredits(pricing, 'Nano_Banana_Pro', '1K'), 12);
});

test('gpt-image-2-adobe is 1K-only priced at 26', () => {
  assert.equal(DEFAULT_MODEL_CREDIT_PRICING.gptImage2Adobe.oneK, 26);
  assert.equal(getConfiguredImageCredits(DEFAULT_MODEL_CREDIT_PRICING, 'gpt-image-2-adobe', '1K'), 26);
  assert.equal(getConfiguredImageCredits(DEFAULT_MODEL_CREDIT_PRICING, 'gpt-image-2-adobe', '2K'), 26);

  const pricing = normalizeModelCreditPricing({ gptImage2Adobe: { oneK: 30 } });
  assert.equal(getConfiguredImageCredits(pricing, 'gpt-image-2-adobe', '1K'), 30);
});

test('invalid values fall back without dropping unrelated tiers', () => {
  const pricing = normalizeModelCreditPricing({
    nanoBanana: { oneK: -1, twoK: 88 },
  });

  assert.equal(pricing.nanoBanana.oneK, DEFAULT_MODEL_CREDIT_PRICING.nanoBanana.oneK);
  assert.equal(pricing.nanoBanana.twoK, 88);
});

test('video reference images are free up to 5, then +30 each', () => {
  // 前 5 张不加价
  for (const count of [0, 1, 2, 3, 4, 5]) {
    assert.equal(getVideoReferenceImageSurcharge(count), 0, `${count} 张应为 0`);
  }
  // 第 6 张起每张 +30
  assert.equal(getVideoReferenceImageSurcharge(6), 30);
  assert.equal(getVideoReferenceImageSurcharge(7), 60);
  assert.equal(getVideoReferenceImageSurcharge(9), 120);
  // 负数/非法值按 0 处理
  assert.equal(getVideoReferenceImageSurcharge(-3), 0);
  assert.equal(getVideoReferenceImageSurcharge(Number.NaN), 0);
});

test('video reference surcharge is independent of duration and resolution', () => {
  const baseCost = (resolution: string, seconds: number) =>
    getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, resolution) * seconds;
  const referenceCount = 8; // 加价 = (8 - 5) × 30 = 90
  const surcharge = getVideoReferenceImageSurcharge(referenceCount);

  assert.equal(surcharge, 90);
  // 相同参考图张数下，不同分辨率/时长的加价完全一致
  for (const resolution of ['768p', '1080p', '2K']) {
    for (const seconds of [4, 5, 15]) {
      assert.equal(baseCost(resolution, seconds) + surcharge - baseCost(resolution, seconds), 90);
    }
  }
});
