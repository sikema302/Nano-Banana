import assert from 'node:assert/strict';
import test from 'node:test';

import { getGptImageCredits, normalizeGptImageQuality } from './model-pricing.js';

test('uses the current GPT Image 2 quality pricing', () => {
  assert.equal(getGptImageCredits('STANDARD', 'high'), 20);
  assert.equal(getGptImageCredits('2K', 'low'), 28);
  assert.equal(getGptImageCredits('2K', 'medium'), 28);
  assert.equal(getGptImageCredits('2K', 'high'), 48);
  assert.equal(getGptImageCredits('4K', 'low'), 34);
  assert.equal(getGptImageCredits('4K', 'medium'), 34);
  assert.equal(getGptImageCredits('4K', 'high'), 48);
});

test('defaults missing high-resolution quality to auto instead of high', () => {
  assert.equal(normalizeGptImageQuality('', '4K'), 'auto');
  assert.equal(getGptImageCredits('4K', ''), 34);
});

test('supports a synchronized pricing matrix', () => {
  const pricing = { standard: 21, twoK: 30, twoKHigh: 50, fourK: 40, fourKHigh: 60 };
  assert.equal(getGptImageCredits('STANDARD', 'auto', pricing), 21);
  assert.equal(getGptImageCredits('2K', 'low', pricing), 30);
  assert.equal(getGptImageCredits('2K', 'high', pricing), 50);
  assert.equal(getGptImageCredits('4K', 'medium', pricing), 40);
  assert.equal(getGptImageCredits('4K', 'high', pricing), 60);
});
