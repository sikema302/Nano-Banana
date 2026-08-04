import assert from 'node:assert/strict';
import test from 'node:test';
import { findCreationActivityStageIndex } from './creation-activity';

test('places creation activity in the first empty stove', () => {
  assert.equal(findCreationActivityStageIndex(
    ['image-1', 'image-2', null, null, null],
    { batchCount: 1, loading: false, activeGenerationStageIndex: -1 },
  ), 2);
});

test('skips the stove currently generating an image', () => {
  assert.equal(findCreationActivityStageIndex(
    [null, 'image-1', 'image-2', null, null],
    { batchCount: 1, loading: true, activeGenerationStageIndex: 0 },
  ), 3);
});

test('hides creation activity when every stove is occupied', () => {
  assert.equal(findCreationActivityStageIndex(
    ['image-1', 'image-2', 'image-3', 'image-4', 'image-5'],
    { batchCount: 1, loading: false, activeGenerationStageIndex: -1 },
  ), -1);
});

test('hides creation activity for batch generation', () => {
  assert.equal(findCreationActivityStageIndex(
    [null, null, null, null, null],
    { batchCount: 2, loading: false, activeGenerationStageIndex: -1 },
  ), -1);
});
