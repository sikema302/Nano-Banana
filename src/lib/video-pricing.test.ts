import assert from 'node:assert/strict';
import test from 'node:test';
import { getVideoGenerationCredits } from './video-pricing.js';

test('uses the configured Firefly video price for each resolution', () => {
  assert.equal(getVideoGenerationCredits('720p'), 150);
  assert.equal(getVideoGenerationCredits('1080p'), 175);
});
