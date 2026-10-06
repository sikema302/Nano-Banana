import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GENERATION_FAILURE_MESSAGES,
  generationFailureDetail,
  generationFailureMessage,
  resolveGenerationFailureStage,
} from './generation-failure.js';

test('attributes a plain upstream failure to the upstream stage', () => {
  assert.equal(
    resolveGenerationFailureStage({ upstreamSucceeded: false, imagePersisted: false, creditsCharged: false }),
    'upstream',
  );
});

test('separates "image never reached storage" from "image stored but not charged"', () => {
  // 上游已出图但图没落盘：用户没图、也确实没扣款。
  assert.equal(
    resolveGenerationFailureStage({ upstreamSucceeded: true, imagePersisted: false, creditsCharged: false }),
    'persist',
  );
  // 图落盘了但没扣款：账务问题，图通常还在。
  assert.equal(
    resolveGenerationFailureStage({ upstreamSucceeded: true, imagePersisted: true, creditsCharged: false }),
    'charge',
  );
  assert.equal(
    resolveGenerationFailureStage({ upstreamSucceeded: true, imagePersisted: true, creditsCharged: true }),
    'post-charge',
  );
});

test('ignores a persisted image when the upstream itself failed', () => {
  // 上游没成功就不该报「上游已出图」，否则会误导后台去找不存在的图。
  assert.equal(
    resolveGenerationFailureStage({ upstreamSucceeded: false, imagePersisted: true, creditsCharged: false }),
    'upstream',
  );
});

test('never claims a charge happened when credits were not charged', () => {
  const messages = [GENERATION_FAILURE_MESSAGES.persist, GENERATION_FAILURE_MESSAGES.charge];
  for (const message of messages) {
    assert.ok(!message.includes('已扣除积分'), `不应声称已扣款: ${message}`);
  }
  assert.ok(GENERATION_FAILURE_MESSAGES.persist.includes('未扣积分'));
  assert.ok(GENERATION_FAILURE_MESSAGES.charge.includes('图片已保存'));
});

test('keeps the upstream classification message only for the upstream stage', () => {
  const fallback = '当前模型太拥挤了，请稍后重试或试试其他模型';
  assert.equal(generationFailureMessage('upstream', fallback), fallback);
  assert.equal(generationFailureMessage('persist', fallback), GENERATION_FAILURE_MESSAGES.persist);
  assert.equal(generationFailureMessage('charge', fallback), GENERATION_FAILURE_MESSAGES.charge);
});

test('preserves the raw technical cause in error_detail', () => {
  assert.equal(
    generationFailureDetail('persist', 'Download generated image failed (404)'),
    'stage=persist Download generated image failed (404)',
  );
  // 上游空错误不能变成一个无法检索的空 detail。
  assert.equal(generationFailureDetail('charge', '   '), 'stage=charge unknown error');
});

test('classifies an indeterminate upstream as its own stage', () => {
  // 异步任务超时/状态未知：任务可能仍在上游跑，绝不能和普通 upstream 失败混为一谈。
  assert.equal(
    resolveGenerationFailureStage({
      upstreamSucceeded: false,
      imagePersisted: false,
      creditsCharged: false,
      upstreamIndeterminate: true,
    }),
    'indeterminate',
  );
});

test('keeps the legacy upstream stage when the indeterminate flag is absent', () => {
  // 缺省 false：既有调用点行为必须完全不变。
  assert.equal(
    resolveGenerationFailureStage({ upstreamSucceeded: false, imagePersisted: false, creditsCharged: false }),
    'upstream',
  );
});

test('the indeterminate message states no charge and ignores the raw upstream text', () => {
  assert.ok(GENERATION_FAILURE_MESSAGES.indeterminate.includes('未扣除积分'));
  assert.ok(!GENERATION_FAILURE_MESSAGES.indeterminate.includes('已扣除积分'));
  assert.equal(
    generationFailureMessage('indeterminate', 'raw upstream error'),
    GENERATION_FAILURE_MESSAGES.indeterminate,
  );
  assert.equal(
    generationFailureDetail('indeterminate', 'polling window exhausted'),
    'stage=indeterminate polling window exhausted',
  );
});
