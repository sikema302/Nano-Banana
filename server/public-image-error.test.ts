import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPublicImageError, publicImageErrorMessage, sanitizeUpstreamErrorForDisplay } from './public-image-error.js';

test('classifies sensitive prompts without exposing provider details', () => {
  assert.deepEqual(classifyPublicImageError('nano-banana content_policy violation from upstream'), {
    category: 'sensitive_prompt',
    message: '提示词或参考图未通过内容审核，请修改后重试',
  });
  assert.deepEqual(classifyPublicImageError('provider request failed: adobe content rejected: {"error_code":"image_unsafe"}'), {
    category: 'sensitive_prompt',
    message: '提示词或参考图未通过内容审核，请修改后重试',
  });
  assert.equal(publicImageErrorMessage('image_unsafe detected'), '提示词或参考图未通过内容审核，请修改后重试');
});

test('treats Chinese content-review rejections as sensitive prompt, not congestion', () => {
  const cases = [
    '内容未通过安全审核，请调整提示词或参考素材后再试',
    '1304513464@qq.com内容未通过安全审核，请调整提示词或参考素材后再试',
    '内容未通过审核',
    '提示词触发安全审核拦截',
  ];
  for (const raw of cases) {
    assert.deepEqual(classifyPublicImageError(raw), {
      category: 'sensitive_prompt',
      message: '提示词或参考图未通过内容审核，请修改后重试',
    });
    assert.equal(publicImageErrorMessage(raw), '提示词或参考图未通过内容审核，请修改后重试');
  }
});

test('treats flux/gemini upstream 400 moderation as a terminating sensitive prompt', () => {
  assert.deepEqual(classifyPublicImageError('Content moderation rejected: gemini upstream error: 400'), {
    category: 'sensitive_prompt',
    message: '提示词或参考图未通过内容审核，请修改后重试',
  });
  assert.equal(publicImageErrorMessage('gemini upstream error: 400'), '提示词或参考图未通过内容审核，请修改后重试');
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
  // 真实但可读的上游错误：透出语义、清掉渠道/供应商/模型名，而不是笼统的「太拥挤」。
  const busy = publicImageErrorMessage('gpt-image-2 quota exhausted; switching to Visionary fallback');
  assert.match(busy, /quota exhausted/i);
  assert.doesNotMatch(busy, /gpt|visionary|switch|fallback|junliai|渠道/i);
  assert.notEqual(busy, '当前模型太拥挤了，请稍后重试或试试其他模型');
  // 纯技术噪声（清洗后只剩状态码/连接词）仍回退到中性文案。
  assert.equal(publicImageErrorMessage('some unknown upstream glitch'), 'some unknown glitch');
});

test('extracts the embedded upstream JSON message instead of the raw envelope', () => {
  const raw = 'request failed: 任务已明确失败: custom rejected request parameters: 422 '
    + '{"error":{"code":10001,"message":"当前提示词暂时无法生成，请更换提示词后重试","type":"invalid_request_error"}} (HTTP 502)';
  // 用户端：不再被外层包装的 HTTP 502 带偏成「太拥挤」。
  assert.equal(publicImageErrorMessage(raw), '当前提示词暂时无法生成，请更换提示词后重试');
  assert.deepEqual(classifyPublicImageError(raw), {
    category: 'busy',
    message: '当前提示词暂时无法生成，请更换提示词后重试',
  });
  // 后台展示（result_message）：同样只展示 message。
  assert.equal(sanitizeUpstreamErrorForDisplay(raw), '当前提示词暂时无法生成，请更换提示词后重试');
});

test('decodes escaped JSON string content in the embedded message', () => {
  assert.equal(
    publicImageErrorMessage('failed: {"error":{"message":"第一行\\n第二行 \\"引号\\""}}'),
    '第一行 第二行 "引号"',
  );
});

test('never surfaces internal or technical embedded messages to users', () => {
  assert.equal(
    publicImageErrorMessage('failed: {"error":{"message":"database connection terminated unexpectedly"}}'),
    '图像服务暂时不可用，请稍后重试',
  );
});

test('keeps API key and credit request errors actionable without internal details', () => {
  assert.equal(publicImageErrorMessage('API Key is invalid or revoked'), 'API Key 无效或不可用，请检查后重试');
  assert.equal(publicImageErrorMessage('API Key has insufficient credits'), '积分不足，请充值后重试');
});
