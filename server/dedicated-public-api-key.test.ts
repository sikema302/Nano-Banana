import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEDICATED_JUNLI_BANANA_KEY_HASH,
  dedicatedJunliBananaCredits,
  dedicatedJunliBananaPolicy,
  isDedicatedJunliBananaKeyHash,
} from './dedicated-public-api-key.js';

test('recognizes only the dedicated Junli Banana key hash', () => {
  assert.equal(isDedicatedJunliBananaKeyHash(DEDICATED_JUNLI_BANANA_KEY_HASH), true);
  assert.equal(isDedicatedJunliBananaKeyHash('different-key-hash'), false);
});

test('forces the dedicated key onto Nano Banana Pro without website routing', () => {
  assert.deepEqual(dedicatedJunliBananaPolicy(DEDICATED_JUNLI_BANANA_KEY_HASH, '1K', true), {
    modelId: 'Nano_Banana_Pro',
    upstreamModel: 'nano-banana-pro',
    imageSize: '1K',
    aiEnhancement: true,
    credits: 38,
    providerRouting: 'junliai_dedicated',
  });
  assert.equal(dedicatedJunliBananaPolicy('ordinary-key', '4K', true), null);
});

test('charges the dedicated Junli Banana prices plus optional AI enhancement', () => {
  assert.equal(dedicatedJunliBananaCredits('1K', false), 30);
  assert.equal(dedicatedJunliBananaCredits('2K', false), 30);
  assert.equal(dedicatedJunliBananaCredits('4K', false), 36);
  assert.equal(dedicatedJunliBananaCredits('1K', true), 38);
  assert.equal(dedicatedJunliBananaCredits('2K', true), 38);
  assert.equal(dedicatedJunliBananaCredits('4K', true), 44);
});
