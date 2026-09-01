import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPublicImageError, publicImageErrorMessage } from './public-image-error.js';

test('classifies sensitive prompts without exposing provider details', () => {
  assert.deepEqual(classifyPublicImageError('nano-banana content_policy violation from upstream'), {
    category: 'sensitive_prompt',
    message: '注意提示词或图片敏感信息，请修改重试哦～',
  });
  assert.deepEqual(classifyPublicImageError('provider request failed: adobe content rejected: {"error_code":"image_unsafe"}'), {
    category: 'sensitive_prompt',
    message: '注意提示词或图片敏感信息，请修改重试哦～',
  });
  assert.equal(publicImageErrorMessage('image_unsafe detected'), '注意提示词或图片敏感信息，请修改重试哦～');
});

test('keeps unsupported / unpriced parameters specific instead of hiding as sensitive', () => {
  assert.equal(
    publicImageErrorMessage('unsupported or unpriced parameters for this model'),
    '当前使用的参数或模型不支持，请调整后重试',
  );
  assert.equal(publicImageErrorMessage('unsupported size value 9999x9999'), '当前使用的参数或模型不支持，请调整后重试');
});

test('gives generic image generation failures a neutral, non-sensitive message', () => {
  assert.equal(
    publicImageErrorMessage('Image generation failed; please check the request or try again later'),
    '图像生成失败，请稍后重试或修改提示词',
  );
});

test('keeps reference image errors useful and specific', () => {
  assert.equal(publicImageErrorMessage('A maximum of 6 reference images is supported'), '最多支持 6 张参考图，请减少后重试');
  assert.equal(publicImageErrorMessage('Each reference image must be 25 MB or smaller'), '参考图尺寸或大小不符合要求，请调整后重试');
  assert.equal(publicImageErrorMessage('HEIC format is not supported for reference image'), '参考图格式不支持，请使用 JPG/PNG 格式');
  assert.equal(publicImageErrorMessage('Invalid reference image data URL'), '参考图格式或数据无效，请更换后重试');
  assert.equal(publicImageErrorMessage('Unable to load reference image (404)'), '参考图读取失败，请检查图片或链接后重试');
});

test('separates real service failures from congestion and hides routing', () => {
  assert.equal(
    publicImageErrorMessage('Database system is shutting down'),
    '图像服务暂时不可用，请稍后重试',
  );
  assert.equal(publicImageErrorMessage('IMAGE_SERVICE_UNAVAILABLE'), '图片服务器暂时不可用，请稍后重试');
  assert.equal(publicImageErrorMessage('503 service unavailable from Visionary'), '当前模型太拥挤了，请稍后重试或试试其他模型');
  assert.equal(publicImageErrorMessage('504 Gateway Timeout'), '当前模型太拥挤了，请稍后重试或试试其他模型');
  assert.equal(publicImageErrorMessage('fetch failed: ECONNRESET'), '当前模型太拥挤了，请稍后重试或试试其他模型');
  const busy = publicImageErrorMessage('gpt-image-2 quota exhausted; switching to Visionary fallback');
  assert.equal(busy, '当前模型太拥挤了，请稍后重试或试试其他模型');
  assert.doesNotMatch(busy, /gpt|visionary|switch|fallback/i);
});

test('keeps API key and credit request errors actionable without internal details', () => {
  assert.equal(publicImageErrorMessage('API Key is invalid or revoked'), 'API Key 无效或不可用，请检查后重试');
  assert.equal(publicImageErrorMessage('API Key has insufficient credits'), '积分不足，请充值后重试');
});
