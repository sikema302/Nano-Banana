import assert from 'node:assert/strict';
import test from 'node:test';

import { requestSourceLabel } from './request-source-label.js';

test('includes the managed image channel and its actual upstream model', () => {
  assert.equal(
    requestSourceLabel('Flux · gemini-3-pro-image-preview', 'gemini-3-pro-image-preview'),
    'Flux · gemini-3-pro-image-preview',
  );
  assert.equal(requestSourceLabel('Visionary', 'nano-banana-2-lite'), 'Visionary · nano-banana-2-lite');
  assert.equal(
    requestSourceLabel('Junliai · nano-banana-2', 'nano-banana-2'),
    'Junli · nano-banana-2',
  );
});
