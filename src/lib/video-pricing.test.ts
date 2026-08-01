import assert from 'node:assert/strict';
import test from 'node:test';
import { getVideoGenerationCredits, supportsVideoConfiguration } from './video-pricing.js';

test('charges Gemini Veo 3.1 at ten times its resolution and duration price', () => {
  assert.equal(getVideoGenerationCredits('gemini-veo31', '720p', 4), 150);
  assert.equal(getVideoGenerationCredits('gemini-veo31', '1080p', 6), 250);
  assert.equal(getVideoGenerationCredits('gemini-veo31', '1080p', 8), 300);
});

test('charges Firefly Video at ten times its resolution and duration price', () => {
  assert.equal(getVideoGenerationCredits('firefly-video', '720p', 5), 300);
  assert.equal(getVideoGenerationCredits('firefly-video', '1080p', 5), 350);
});

test('keeps the two video model capability sets independent', () => {
  assert.equal(supportsVideoConfiguration('gemini-veo31', '720p', '16:9', 4), true);
  assert.equal(supportsVideoConfiguration('gemini-veo31', '720p', '1:1', 4), false);
  assert.equal(supportsVideoConfiguration('firefly-video', '1080p', '1:1', 5), true);
  assert.equal(supportsVideoConfiguration('firefly-video', '1080p', '16:9', 8), false);
});
