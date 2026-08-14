import assert from 'node:assert/strict';
import test from 'node:test';
import { getVideoGenerationCredits, supportsVideoConfiguration } from './video-pricing.js';

test('charges Gemini Veo 3.1 at ten times its resolution and duration price', () => {
  assert.equal(getVideoGenerationCredits('gemini-veo31', '720p', 4), 150);
  assert.equal(getVideoGenerationCredits('gemini-veo31', '1080p', 6), 250);
  assert.equal(getVideoGenerationCredits('gemini-veo31', '1080p', 8), 300);
});

test('charges Grok Video at ten times its resolution and duration price', () => {
  assert.equal(getVideoGenerationCredits('grok-video', '720p', 6), 160);
  assert.equal(getVideoGenerationCredits('grok-video', '720p', 10), 200);
});

test('keeps the two video model capability sets independent', () => {
  assert.equal(supportsVideoConfiguration('gemini-veo31', '720p', '16:9', 4), true);
  assert.equal(supportsVideoConfiguration('gemini-veo31', '720p', '1:1', 4), false);
  assert.equal(supportsVideoConfiguration('grok-video', '720p', '16:9', 6), true);
  assert.equal(supportsVideoConfiguration('grok-video', '1080p', '16:9', 6), false);
});

test('maps Seedance 2.5 document credits to Pixory credits', () => {
  assert.equal(getVideoGenerationCredits('seedance2.5', '720p', 4), 60);
  assert.equal(getVideoGenerationCredits('seedance2.5', '720p', 5), 87);
  assert.equal(supportsVideoConfiguration('seedance2.5', '720p', '21:9', 29), true);
  assert.equal(supportsVideoConfiguration('seedance2.5', '1080p', '16:9', 5), false);
});
