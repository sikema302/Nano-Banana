import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MODEL_CREDIT_PRICING,
  getConfiguredImageCredits,
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
