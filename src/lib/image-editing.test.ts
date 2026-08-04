import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImageEditPrompt } from './image-editing';

test('buildImageEditPrompt keeps only the selected visual constraints', () => {
  assert.equal(
    buildImageEditPrompt(' 把背景改成海边 ', new Set(['person', 'composition'])),
    '保持原图人物身份、面部特征、发型和姿势不变。保持原图构图、镜头视角和画面比例不变。用户修改要求：把背景改成海边',
  );
});

test('buildImageEditPrompt supports an unconstrained edit', () => {
  assert.equal(
    buildImageEditPrompt('整体变成水彩风格', []),
    '用户修改要求：整体变成水彩风格',
  );
});
