import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPublicImageError, publicImageErrorMessage } from './public-image-error.js';

test('classifies sensitive prompts without exposing provider details', () => {
  assert.deepEqual(classifyPublicImageError('nano-banana content_policy violation from upstream'), {
    category: 'sensitive_prompt',
    message: '提示词包含敏感信息，请修改后重试',
  });
});

test('keeps reference image errors useful and specific', () => {
  assert.equal(publicImageErrorMessage('A maximum of 6 reference images is supported'), '最多支持 6 张参考图，请减少后重试');
  assert.equal(publicImageErrorMessage('Each reference image must be 25 MB or smaller'), '参考图单张不能超过 25MB，请压缩后重试');
  assert.equal(publicImageErrorMessage('Invalid reference image data URL'), '参考图格式或数据无效，请更换后重试');
  assert.equal(publicImageErrorMessage('Unable to load reference image (404)'), '参考图读取失败，请检查图片或链接后重试');
});

test('separates real service failures from congestion and hides routing', () => {
  assert.equal(publicImageErrorMessage('503 service unavailable from Visionary'), '图像服务暂时不可用，请稍后重试');
  const busy = publicImageErrorMessage('gpt-image-2 quota exhausted; switching to Visionary fallback');
  assert.equal(busy, '当前模型过于拥挤，请使用其他模型');
  assert.doesNotMatch(busy, /gpt|visionary|switch|fallback/i);
});

test('keeps API key and credit request errors actionable without internal details', () => {
  assert.equal(publicImageErrorMessage('API Key is invalid or revoked'), 'API Key 无效或不可用，请检查后重试');
  assert.equal(publicImageErrorMessage('API Key has insufficient credits'), '积分不足，请充值后重试');
});
