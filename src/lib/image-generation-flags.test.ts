import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAiEnhancementRequestFlags,
  resolveAiEnhancementBillingRequested,
} from './image-generation-flags';

test('AI enhancement selection is billed while the backend parameter stays false', () => {
  assert.deepEqual(getAiEnhancementRequestFlags(true), {
    optimizeChineseText: false,
    billAiEnhancement: true,
  });
});

test('server billing supports the new flag and legacy requests', () => {
  assert.equal(resolveAiEnhancementBillingRequested({ billAiEnhancement: true, optimizeChineseText: false }), true);
  assert.equal(resolveAiEnhancementBillingRequested({ optimizeChineseText: true }), true);
  assert.equal(resolveAiEnhancementBillingRequested({ optimizeChineseText: false }), false);
});
