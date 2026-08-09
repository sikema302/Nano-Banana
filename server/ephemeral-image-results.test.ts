import assert from 'node:assert/strict';
import test from 'node:test';

import { durablePublicImageResultSource, EphemeralImageResultCache } from './ephemeral-image-results.js';

test('persists only upstream HTTP image references', () => {
  assert.equal(durablePublicImageResultSource(' https://images.example/result.png '), 'https://images.example/result.png');
  assert.equal(durablePublicImageResultSource('data:image/png;base64,aW1hZ2U='), '');
  assert.equal(durablePublicImageResultSource('/uploads/generated/result.png'), '');
});

test('keeps inline API image results only in a bounded expiring memory cache', () => {
  let currentTime = 1_000;
  const cache = new EphemeralImageResultCache(100, 2, () => currentTime);
  cache.set('first', 'data:image/png;base64,Zmlyc3Q=');
  cache.set('second', 'data:image/png;base64,c2Vjb25k');
  cache.set('third', 'data:image/png;base64,dGhpcmQ=');

  assert.equal(cache.get('first'), '');
  assert.match(cache.get('second'), /^data:image\//);

  currentTime += 101;
  assert.equal(cache.get('second'), '');
  assert.equal(cache.get('third'), '');
});
