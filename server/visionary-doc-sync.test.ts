import assert from 'node:assert/strict';
import test from 'node:test';

import { parseVisionaryGptImagePricing } from './visionary-doc-sync.js';

function pricingRows(overrides: Record<string, number> = {}) {
  return ['2K', '4K'].flatMap((imageSize) =>
    ['auto', 'low', 'medium', 'high'].map((quality) => ({
      publicModel: 'gpt-image-2',
      billingMode: 'standard',
      imageSize,
      quality,
      credits:
        overrides[`${imageSize}:${quality}`] ??
        (imageSize === '2K' ? (quality === 'high' ? 46 : 28) : quality === 'high' ? 48 : 34),
      priority: 100,
      isEnabled: true,
    })),
  );
}

test('parses the complete Visionary GPT Image pricing matrix', () => {
  assert.deepEqual(parseVisionaryGptImagePricing({ data: pricingRows() }), {
    standard: 20,
    twoK: 28,
    twoKHigh: 48,
    fourK: 34,
    fourKHigh: 48,
  });
});

test('rejects incomplete pricing so partial upstream responses cannot change billing', () => {
  assert.throws(
    () => parseVisionaryGptImagePricing({ data: pricingRows().slice(0, -1) }),
    /incomplete for 4K/,
  );
});

test('requires review when regular quality tiers diverge', () => {
  assert.throws(
    () => parseVisionaryGptImagePricing({ data: pricingRows({ '2K:medium': 35 }) }),
    /prices diverged/,
  );
});
