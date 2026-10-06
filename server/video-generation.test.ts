import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateUselgVideo,
  normalizeVideoResolution,
  normalizeVideoAspect,
  normalizeVideoSeconds,
  resolveVideoSizeParams,
  VIDEO_MODELS,
  VIDEO_DEFAULT_SECONDS,
  VIDEO_MAX_SECONDS,
} from './video-generation.js';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status });
}

test('normalizes resolution and seconds to supported bounds', () => {
  assert.equal(normalizeVideoResolution('768p'), '768p');
  assert.equal(normalizeVideoResolution('1080p'), '1080p');
  assert.equal(normalizeVideoResolution('2K'), '2K');
  assert.equal(normalizeVideoResolution('4K'), '768p');
  assert.equal(normalizeVideoSeconds(5), 5);
  assert.equal(normalizeVideoSeconds(1), 4);
  assert.equal(normalizeVideoSeconds(99), VIDEO_MAX_SECONDS);
  assert.equal(normalizeVideoSeconds('x'), VIDEO_DEFAULT_SECONDS);
  assert.equal(normalizeVideoAspect('16:9'), '16:9');
  assert.equal(normalizeVideoAspect('9:16'), '9:16');
  assert.equal(normalizeVideoAspect('1:1'), '1:1');
  assert.equal(normalizeVideoAspect('21:9'), '21:9');
  assert.equal(normalizeVideoAspect('4:3'), '16:9');
});

test('submits minimax_h3-768p with size and reference images', async () => {
  let submitUrl = '';
  let submitInit: RequestInit | undefined;
  let polls = 0;

  const result = await generateUselgVideo(
    { prompt: '一只白鹭沿海骑车', resolution: '768p', aspect: '16:9', seconds: 6, referenceImages: ['https://example.com/ref.jpg'] },
    {
      baseUrl: 'https://api.ai-media.vip',
      apiKey: 'secret',
      sleepImpl: async () => {},
      fetchImpl: async (url, init) => {
        const u = String(url);
        if (init?.method === 'POST') {
          submitUrl = u;
          submitInit = init;
          return jsonResponse({ id: 'vidtask_123', status: 'queued' });
        }
        if (u.endsWith('/content')) {
          return new Response(Buffer.from('mp4-bytes'), { status: 200, headers: { 'content-type': 'video/mp4' } });
        }
        polls += 1;
        return jsonResponse({ id: 'vidtask_123', status: 'completed' });
      },
    },
  );

  assert.equal(submitUrl, 'https://api.ai-media.vip/v1/videos');
  const headers = submitInit?.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer secret');
  assert.match(headers['Idempotency-Key'], /^[0-9a-f-]{36}$/);
  const body = JSON.parse(String(submitInit?.body));
  assert.deepEqual(body, {
    model: VIDEO_MODELS['768p'].model,
    prompt: '一只白鹭沿海骑车',
    seconds: 6,
    size: VIDEO_MODELS['768p'].size,
    reference_images: [{ url: 'https://example.com/ref.jpg' }],
  });
  assert.equal(polls, 1);
  assert.equal(result.model, 'minimax_h3-768p');
  assert.equal(result.taskId, 'vidtask_123');
  assert.equal(result.contentType, 'video/mp4');
  assert.equal(result.buffer.toString(), 'mp4-bytes');
});

test('submits reference videos and audios as url arrays with caps applied', async () => {
  let submitInit: RequestInit | undefined;

  await generateUselgVideo(
    {
      prompt: '带素材的短片',
      resolution: '1080p',
      aspect: '16:9',
      seconds: 5,
      referenceImages: [],
      referenceVideos: Array.from({ length: 5 }, (_, index) => `https://example.com/v${index + 1}.mp4`),
      referenceAudios: ['https://example.com/a1.mp3', 'data:audio/mpeg;base64,AAAA', 'https://example.com/a2.wav'],
    },
    {
      baseUrl: 'https://api.ai-media.vip',
      apiKey: 'secret',
      sleepImpl: async () => {},
      fetchImpl: async (_url, init) => {
        if (init?.method === 'POST') {
          submitInit = init;
          return jsonResponse({ id: 'vidtask_media', status: 'completed' });
        }
        return new Response(Buffer.from('mp4-bytes'), { status: 200, headers: { 'content-type': 'video/mp4' } });
      },
    },
  );

  const body = JSON.parse(String(submitInit?.body));
  // 参考视频最多 3 段：只保留前 3 个合法 HTTP(S) URL
  assert.deepEqual(body.reference_videos, [
    { url: 'https://example.com/v1.mp4' },
    { url: 'https://example.com/v2.mp4' },
    { url: 'https://example.com/v3.mp4' },
  ]);
  // data: URL 不是公网地址，会被过滤掉
  assert.deepEqual(body.reference_audios, [
    { url: 'https://example.com/a1.mp3' },
    { url: 'https://example.com/a2.wav' },
  ]);
});

test('polls until completed then downloads', async () => {
  const statuses = ['queued', 'processing', 'completed'];
  let statusCalls = 0;
  let downloadCalls = 0;

  await generateUselgVideo(
    { prompt: '短片', resolution: '2K', aspect: '16:9', seconds: 4, referenceImages: [] },
    {
      baseUrl: 'https://api.ai-media.vip/',
      apiKey: 'Bearer sk-test',
      sleepImpl: async () => {},
      fetchImpl: async (url, init) => {
        const u = String(url);
        if (init?.method === 'POST') {
          return jsonResponse({ id: 'vidtask_2k', status: 'queued' });
        }
        if (u.endsWith('/content')) {
          downloadCalls += 1;
          return new Response(Buffer.from('video'), { status: 200, headers: { 'content-type': 'video/mp4' } });
        }
        statusCalls += 1;
        const status = statuses[Math.min(statusCalls - 1, statuses.length - 1)];
        return jsonResponse({ id: 'vidtask_2k', status });
      },
    },
  );

  assert.ok(statusCalls >= 2, 'expected multiple status polls before completed');
  assert.equal(downloadCalls, 1);
});

test('throws when the task enters a failed state', async () => {
  await assert.rejects(
    generateUselgVideo(
      { prompt: '短片', resolution: '768p', aspect: '16:9', seconds: 5, referenceImages: [] },
      {
        baseUrl: 'https://api.ai-media.vip',
        apiKey: 'secret',
        sleepImpl: async () => {},
        fetchImpl: async (url, init) => {
          if (init?.method === 'POST') {
            return jsonResponse({ id: 'vidtask_f', status: 'queued' });
          }
          return jsonResponse({ id: 'vidtask_f', status: 'failed', message: '上游内容审核未通过' });
        },
      },
    ),
    /上游内容审核未通过/,
  );
});

test('omits reference_images when empty', async () => {
  let body: Record<string, unknown> = {};
  await generateUselgVideo(
    { prompt: '文生视频', resolution: '1080p', aspect: '16:9', seconds: 5, referenceImages: [] },
    {
      baseUrl: 'https://api.ai-media.vip',
      apiKey: 'secret',
      fetchImpl: async (_url, init) => {
        if (init?.method === 'POST') {
          body = JSON.parse(String(init?.body));
          return jsonResponse({ id: 'vidtask_1', status: 'completed' });
        }
        return new Response(Buffer.from('v'), { status: 200, headers: { 'content-type': 'video/mp4' } });
      },
    },
  );
  assert.equal('reference_images' in body, false);
  assert.equal(body.size, VIDEO_MODELS['1080p'].size);
});

test('resolves aspect: 16:9 uses tier size, other aspects use size map or aspect_ratio', async () => {
  async function submitBody(resolution: '768p' | '1080p' | '2K', aspect: '16:9' | '9:16' | '1:1' | '21:9') {
    let body: Record<string, unknown> = {};
    await generateUselgVideo(
      { prompt: 'p', resolution, aspect, seconds: 5, referenceImages: [] },
      {
        baseUrl: 'https://api.ai-media.vip',
        apiKey: 'secret',
        fetchImpl: async (_url, init) => {
          if (init?.method === 'POST') {
            body = JSON.parse(String(init?.body));
            return jsonResponse({ id: 'vidtask_a', status: 'completed' });
          }
          return new Response(Buffer.from('v'), { status: 200, headers: { 'content-type': 'video/mp4' } });
        },
      },
    );
    return body;
  }

  // 1080p：16:9/9:16/1:1 走文档 size 映射表，不带 aspect_ratio
  assert.equal((await submitBody('1080p', '16:9')).size, '1920x1080');
  assert.equal((await submitBody('1080p', '9:16')).size, '1080x1920');
  assert.equal((await submitBody('1080p', '1:1')).size, '1440x1440');
  assert.equal('aspect_ratio' in (await submitBody('1080p', '9:16')), false);
  // 1080p 21:9 无文档 size，改走 aspect_ratio（不带 size）
  const p1080_21 = await submitBody('1080p', '21:9');
  assert.equal(p1080_21.aspect_ratio, '21:9');
  assert.equal('size' in p1080_21, false);

  // 768p：16:9 用推荐 size；其他比例走 aspect_ratio
  assert.equal((await submitBody('768p', '16:9')).size, VIDEO_MODELS['768p'].size);
  const p768_916 = await submitBody('768p', '9:16');
  assert.equal(p768_916.aspect_ratio, '9:16');
  assert.equal('size' in p768_916, false);

  // 2K：16:9 用 "2K"；其他比例走 aspect_ratio
  assert.equal((await submitBody('2K', '16:9')).size, '2K');
  const p2k_11 = await submitBody('2K', '1:1');
  assert.equal(p2k_11.aspect_ratio, '1:1');
  assert.equal('size' in p2k_11, false);

  // 按上游文档：任何情况下都不传 resolution / quality
  const sample = await submitBody('1080p', '9:16');
  assert.equal('resolution' in sample, false);
  assert.equal('quality' in sample, false);
});

test('resolveVideoSizeParams never sends size and aspect_ratio together', () => {
  const combos: Array<['768p' | '1080p' | '2K', '16:9' | '9:16' | '1:1' | '21:9']> = [];
  for (const resolution of ['768p', '1080p', '2K'] as const) {
    for (const aspect of ['16:9', '9:16', '1:1', '21:9'] as const) {
      combos.push([resolution, aspect]);
      const params = resolveVideoSizeParams(resolution, aspect);
      assert.equal(Boolean(params.size) && Boolean(params.aspectRatio), false, `${resolution} ${aspect}`);
      assert.equal(Boolean(params.size) || Boolean(params.aspectRatio), true, `${resolution} ${aspect}`);
    }
  }
  assert.equal(combos.length, 12);
});
