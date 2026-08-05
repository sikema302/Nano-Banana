import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePublicApiProviderRouting } from './public-api-routing.js';

test('legacy Junliai-only API keys now follow website routing', () => {
  assert.equal(normalizePublicApiProviderRouting('junliai_only'), undefined);
  assert.equal(normalizePublicApiProviderRouting(undefined), undefined);
});
