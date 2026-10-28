import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MODEL_CREDIT_PRICING,
  getConfiguredImageCredits,
  getConfiguredVideoCredits,
  getVideoReferenceImageSurcharge,
  normalizeModelCreditPricing,
} from './model-credit-config.js';

test('normalizes every configurable image tier', () => {
  const pricing = normalizeModelCreditPricing({
    gptImage2: { standard: 11, twoK: 22, twoKHigh: 33, fourK: 44, fourKHigh: 55 },
    nanoBanana: { oneK: 12, twoK: 23, fourK: 34, enhancement: 7 },
  });

  assert.equal(getConfiguredImageCredits(pricing, 'gpt-image-2', '4K', 'high'), 55);
  assert.equal(getConfiguredImageCredits(pricing, 'Nano_Banana_Pro', '1K'), 12);
});

test('gpt-image-2-adobe is 1K-only priced at 26', () => {
  assert.equal(DEFAULT_MODEL_CREDIT_PRICING.gptImage2Adobe.oneK, 26);
  assert.equal(getConfiguredImageCredits(DEFAULT_MODEL_CREDIT_PRICING, 'gpt-image-2-adobe', '1K'), 26);
  assert.equal(getConfiguredImageCredits(DEFAULT_MODEL_CREDIT_PRICING, 'gpt-image-2-adobe', '2K'), 26);

  const pricing = normalizeModelCreditPricing({ gptImage2Adobe: { oneK: 30 } });
  assert.equal(getConfiguredImageCredits(pricing, 'gpt-image-2-adobe', '1K'), 30);
});

test('Nano Banana 2.1 is tiered: 1K 26, 2K and 4K 28', () => {
  assert.deepEqual(DEFAULT_MODEL_CREDIT_PRICING.nanoBanana21, { oneK: 26, twoK: 28, fourK: 28 });
  assert.equal(getConfiguredImageCredits(DEFAULT_MODEL_CREDIT_PRICING, 'Nano_Banana_2_1', '1K'), 26);
  assert.equal(getConfiguredImageCredits(DEFAULT_MODEL_CREDIT_PRICING, 'Nano_Banana_2_1', '2K'), 28);
  assert.equal(getConfiguredImageCredits(DEFAULT_MODEL_CREDIT_PRICING, 'Nano_Banana_2_1', '4K'), 28);
  // 未指定/未知尺寸按 1K 计价（与默认出图尺寸一致）
  assert.equal(getConfiguredImageCredits(DEFAULT_MODEL_CREDIT_PRICING, 'Nano_Banana_2_1', ''), 26);
  // quality 参数不影响 2.1 定价
  assert.equal(getConfiguredImageCredits(DEFAULT_MODEL_CREDIT_PRICING, 'Nano_Banana_2_1', '4K', 'high'), 28);

  const pricing = normalizeModelCreditPricing({ nanoBanana21: { oneK: 30, twoK: 31, fourK: 32 } });
  assert.equal(getConfiguredImageCredits(pricing, 'Nano_Banana_2_1', '1K'), 30);
  assert.equal(getConfiguredImageCredits(pricing, 'Nano_Banana_2_1', '2K'), 31);
  assert.equal(getConfiguredImageCredits(pricing, 'Nano_Banana_2_1', '4K'), 32);
  // 非法值回落到默认档位
  const fallback = normalizeModelCreditPricing({ nanoBanana21: { oneK: -5, twoK: 0 } });
  assert.deepEqual(fallback.nanoBanana21, { oneK: 26, twoK: 28, fourK: 28 });
  // 旧结构（无 oneK/twoK/fourK）一律回落到默认分档，不会把 2K/4K 压回 26
  const legacy = normalizeModelCreditPricing({ nanoBanana21: { perImage: 25 } });
  assert.deepEqual(legacy.nanoBanana21, { oneK: 26, twoK: 28, fourK: 28 });
});

test('Grok Image is tiered 1K 20 / 2K 22', () => {
  assert.deepEqual(DEFAULT_MODEL_CREDIT_PRICING.grokImage, { oneK: 20, twoK: 22 });
  assert.equal(getConfiguredImageCredits(DEFAULT_MODEL_CREDIT_PRICING, 'Grok_Image', '1K'), 20);
  assert.equal(getConfiguredImageCredits(DEFAULT_MODEL_CREDIT_PRICING, 'Grok_Image', '2K'), 22);
  // 只有 1K / 2K 两档，未指定或未知尺寸按 2K 计价
  assert.equal(getConfiguredImageCredits(DEFAULT_MODEL_CREDIT_PRICING, 'Grok_Image', ''), 22);

  const pricing = normalizeModelCreditPricing({ grokImage: { oneK: 30, twoK: 31 } });
  assert.equal(getConfiguredImageCredits(pricing, 'Grok_Image', '1K'), 30);
  assert.equal(getConfiguredImageCredits(pricing, 'Grok_Image', '2K'), 31);
});

test('invalid values fall back without dropping unrelated tiers', () => {
  const pricing = normalizeModelCreditPricing({
    nanoBanana: { oneK: -1, twoK: 88 },
  });

  assert.equal(pricing.nanoBanana.oneK, DEFAULT_MODEL_CREDIT_PRICING.nanoBanana.oneK);
  assert.equal(pricing.nanoBanana.twoK, 88);
});

test('video reference images are free up to 5, then +30 each', () => {
  // 前 5 张不加价
  for (const count of [0, 1, 2, 3, 4, 5]) {
    assert.equal(getVideoReferenceImageSurcharge(count), 0, `${count} 张应为 0`);
  }
  // 第 6 张起每张 +30
  assert.equal(getVideoReferenceImageSurcharge(6), 30);
  assert.equal(getVideoReferenceImageSurcharge(7), 60);
  assert.equal(getVideoReferenceImageSurcharge(9), 120);
  // 负数/非法值按 0 处理
  assert.equal(getVideoReferenceImageSurcharge(-3), 0);
  assert.equal(getVideoReferenceImageSurcharge(Number.NaN), 0);
});

test('minimax video credits = per-second linear by resolution', () => {
  // minimax-h3：720p 30/秒、1080p 60/秒（2026-10-28 新文档按秒计费）
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'minimax-h3', '720p', 4), 120);
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'minimax-h3', '720p', 10), 300);
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'minimax-h3', '720p', 15), 450);
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'minimax-h3', '1080p', 10), 600);
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'minimax-h3', '1080p', 15), 900);
  // 非 1080p 一律按 720p 单价
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'minimax-h3', '768p', 5), 150);
  // 非法秒数按 0 处理
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'minimax-h3', '720p', 0), 0);
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'minimax-h3', '720p', Number.NaN), 0);
});

test('grok video credits: 480p 底价 180、720p 底价 320，超 10 秒每秒 +10', () => {
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'grok-imagine-video-1.5', '480p', 4), 180);
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'grok-imagine-video-1.5', '480p', 10), 180);
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'grok-imagine-video-1.5', '480p', 15), 230);
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'grok-imagine-video-1.5', '720p', 10), 320);
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'grok-imagine-video-1.5', '720p', 15), 370);
  // 非 720p 一律按 480p 底价
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'grok-imagine-video-1.5', '768p', 5), 180);
});

test('minimax-h3-768p video credits = per-second linear (48/s)', () => {
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'minimax-h3-768p', '768p', 5), 240);
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'minimax-h3-768p', '768p', 10), 480);
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'minimax-h3-768p', '768p', 15), 720);
  // 非法秒数按 0 处理
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'minimax-h3-768p', '768p', 0), 0);
  assert.equal(getConfiguredVideoCredits(DEFAULT_MODEL_CREDIT_PRICING, 'minimax-h3-768p', '768p', Number.NaN), 0);
});

test('normalizes nested minimax + grok video pricing', () => {
  const pricing = normalizeModelCreditPricing({
    video: {
      minimax: { p720PerSecond: 40, p1080PerSecond: 80 },
      grok: { p480Base: 150, p720Base: 300, excessPerSecond: 8 },
    },
  });
  assert.equal(pricing.video.minimax.p720PerSecond, 40);
  assert.equal(pricing.video.minimax.p1080PerSecond, 80);
  assert.equal(pricing.video.grok.p480Base, 150);
  assert.equal(pricing.video.grok.excessPerSecond, 8);
  assert.equal(getConfiguredVideoCredits(pricing, 'grok-imagine-video-1.5', '720p', 12), 316);
});

test('legacy flat video pricing falls back to current minimax defaults', () => {
  // 旧全参扁平结构（p768Base 等）对应的模型已下线，normalize 直接回退新默认值
  const pricing = normalizeModelCreditPricing({
    video: { p768Base: 111, twoKBase: 222, excessPerSecond: 33 } as never,
  });
  assert.equal(pricing.video.minimax.p720PerSecond, DEFAULT_MODEL_CREDIT_PRICING.video.minimax.p720PerSecond);
  assert.equal(pricing.video.minimax.p1080PerSecond, DEFAULT_MODEL_CREDIT_PRICING.video.minimax.p1080PerSecond);
  assert.equal(pricing.video.grok.p480Base, DEFAULT_MODEL_CREDIT_PRICING.video.grok.p480Base);
});

test('video reference surcharge is independent of duration and resolution', () => {
  const referenceCount = 8; // 加价 = (8 - 5) × 30 = 90
  const surcharge = getVideoReferenceImageSurcharge(referenceCount);

  assert.equal(surcharge, 90);
  // 相同参考图张数下，不同分辨率/时长的加价完全一致（固定 90）
  for (const resolution of ['768p', '2K']) {
    for (const seconds of [4, 5, 15]) {
      assert.equal(getVideoReferenceImageSurcharge(referenceCount), 90);
      assert.equal(getVideoReferenceImageSurcharge(referenceCount) - surcharge, 0);
    }
  }
});
