import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MODEL_CREDIT_PRICING,
  getConfiguredImageCredits,
  getConfiguredVideoCredits,
  normalizeModelCreditPricing,
} from './model-credit-config.js';

test('normalizes every configurable image and video tier', () => {
  const pricing = normalizeModelCreditPricing({
    gptImage2: { standard: 11, twoK: 22, twoKHigh: 33, fourK: 44, fourKHigh: 55 },
    nanoBanana: { oneK: 12, twoK: 23, fourK: 34, enhancement: 7 },
    seedream: { twoK: 18, fourK: 20 },
    video: {
      'gemini-veo31': { '720p:4': 101 },
      'firefly-video': { '1080p:5': 202 },
    },
  });

  assert.equal(getConfiguredImageCredits(pricing, 'gpt-image-2', '4K', 'high'), 55);
  assert.equal(getConfiguredImageCredits(pricing, 'Nano_Banana_Pro', '1K'), 12);
  assert.equal(getConfiguredImageCredits(pricing, 'Seedream_4', '2K'), 18);
  assert.equal(getConfiguredImageCredits(pricing, 'Seedream_4', '4K'), 20);
  assert.equal(getConfiguredVideoCredits(pricing, 'gemini-veo31', '720p', 4), 101);
  assert.equal(getConfiguredVideoCredits(pricing, 'firefly-video', '1080p', 5), 202);
  assert.equal(getConfiguredVideoCredits(pricing, 'seedance2.5', '720p', 5), 87);
});

test('invalid values fall back without dropping unrelated tiers', () => {
  const pricing = normalizeModelCreditPricing({
    nanoBanana: { oneK: -1, twoK: 88 },
    video: { 'gemini-veo31': { '720p:4': 0, '720p:6': 777 } },
  });

  assert.equal(pricing.nanoBanana.oneK, DEFAULT_MODEL_CREDIT_PRICING.nanoBanana.oneK);
  assert.equal(pricing.nanoBanana.twoK, 88);
  assert.equal(pricing.video['gemini-veo31']['720p:4'], DEFAULT_MODEL_CREDIT_PRICING.video['gemini-veo31']['720p:4']);
  assert.equal(pricing.video['gemini-veo31']['720p:6'], 777);
});
