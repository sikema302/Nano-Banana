import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateUselgVideo,
  normalizeVideoResolution,
  normalizeVideoAspect,
  normalizeVideoSeconds,
  VIDEO_DEFAULT_SECONDS,
  VIDEO_MAX_SECONDS,
} from './video-generation.js';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status });
}

test('normalizes resolution, aspect and seconds per model', () => {
  // minimax-h3：仅 768p/2K，比例 16:9/9:16/1:1
  assert.equal(normalizeVideoResolution('minimax-h3', '768p'), '768p');
  assert.equal(normalizeVideoResolution('minimax-h3', '1080p'), '768p');
  assert.equal(normalizeVideoResolution('minimax-h3', '2K'), '2K');
  assert.equal(normalizeVideoResolution('minimax-h3', '4K'), '768p');
  // grok-imagine-video-1.5：480p/720p，比例 5 种
  assert.equal(normalizeVideoResolution('grok-imagine-video-1.5', '720p'), '720p');
  assert.equal(normalizeVideoResolution('grok-imagine-video-1.5', '480p'), '480p');
  assert.equal(normalizeVideoResolution('grok-imagine-video-1.5', '2K'), '480p');
  assert.equal(normalizeVideoSeconds(5), 5);
  assert.equal(normalizeVideoSeconds(1), 4);
  assert.equal(normalizeVideoSeconds(99), VIDEO_MAX_SECONDS);
  assert.equal(normalizeVideoSeconds('x'), VIDEO_DEFAULT_SECONDS);
  assert.equal(normalizeVideoAspect('minimax-h3', '16:9'), '16:9');
  assert.equal(normalizeVideoAspect('minimax-h3', '9:16'), '9:16');
  assert.equal(normalizeVideoAspect('minimax-h3', '1:1'), '1:1');
  assert.equal(normalizeVideoAspect('minimax-h3', '21:9'), '16:9');
  assert.equal(normalizeVideoAspect('minimax-h3', '4:3'), '16:9');
  assert.equal(normalizeVideoAspect('grok-imagine-video-1.5', '4:3'), '4:3');
  assert.equal(normalizeVideoAspect('grok-imagine-video-1.5', '3:4'), '3:4');
  assert.equal(normalizeVideoAspect('grok-imagine-video-1.5', '21:9'), '16:9');
});

test('submits 全参MinimaxH3 with resolution and aspect_ratio', async () => {
  let submitUrl = '';
  let submitInit: RequestInit | undefined;
  let polls = 0;

  const result = await generateUselgVideo(
    { modelId: 'minimax-h3', prompt: '一只白鹭沿海骑车', resolution: '768p', aspect: '16:9', seconds: 6, referenceImages: ['https://example.com/ref.jpg'] },
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
    model: '全参MinimaxH3',
    prompt: '一只白鹭沿海骑车',
    seconds: 6,
    resolution: '768p',
    aspect_ratio: '16:9',
    reference_images: [{ url: 'https://example.com/ref.jpg' }],
  });
  assert.equal(polls, 1);
  assert.equal(result.model, '全参MinimaxH3');
  assert.equal(result.taskId, 'vidtask_123');
  assert.equal(result.contentType, 'video/mp4');
  assert.equal(result.buffer.toString(), 'mp4-bytes');
});

test('submits reference videos and audios as url arrays with caps applied', async () => {
  let submitInit: RequestInit | undefined;

  await generateUselgVideo(
    {
      modelId: 'minimax-h3',
      prompt: '带素材的短片',
      resolution: '2K',
      aspect: '9:16',
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
  assert.equal(body.model, '全参MinimaxH3');
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
    { modelId: 'minimax-h3', prompt: '短片', resolution: '2K', aspect: '16:9', seconds: 4, referenceImages: [] },
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
      { modelId: 'minimax-h3', prompt: '短片', resolution: '768p', aspect: '16:9', seconds: 5, referenceImages: [] },
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

test('omits reference_images when empty and always sends resolution + aspect_ratio', async () => {
  let body: Record<string, unknown> = {};
  await generateUselgVideo(
    { modelId: 'minimax-h3', prompt: '文生视频', resolution: '2K', aspect: '1:1', seconds: 5, referenceImages: [] },
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
  assert.equal(body.resolution, '2K');
  assert.equal(body.aspect_ratio, '1:1');
  // 新契约不再下发 size / quality
  assert.equal('size' in body, false);
  assert.equal('quality' in body, false);
});

test('passes through supported aspect ratios in the submit body', async () => {
  async function submitBody(resolution: '768p' | '2K', aspect: '16:9' | '9:16' | '1:1') {
    let body: Record<string, unknown> = {};
    await generateUselgVideo(
      { modelId: 'minimax-h3', prompt: 'p', resolution, aspect, seconds: 5, referenceImages: [] },
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

  const body2k = await submitBody('2K', '1:1');
  assert.equal(body2k.resolution, '2K');
  assert.equal(body2k.aspect_ratio, '1:1');
  // 任何情况下都只下发 model/resolution/aspect_ratio，不带 size / quality
  assert.equal('size' in body2k, false);
  assert.equal('quality' in body2k, false);

  const body768 = await submitBody('768p', '9:16');
  assert.equal(body768.resolution, '768p');
  assert.equal(body768.aspect_ratio, '9:16');
});

test('grok maps 480p→lite and 720p→按次 with image caps and no media references', async () => {
  const bodies: Record<string, Record<string, unknown>> = {};

  async function submit(
    resolution: '480p' | '720p',
    referenceImages: string[],
    referenceVideos: string[],
    referenceAudios: string[],
  ) {
    let body: Record<string, unknown> = {};
    await generateUselgVideo(
      {
        modelId: 'grok-imagine-video-1.5',
        prompt: 'grok 短片',
        resolution,
        aspect: '16:9',
        seconds: 6,
        referenceImages,
        referenceVideos,
        referenceAudios,
      },
      {
        baseUrl: 'https://api.ai-media.vip',
        apiKey: 'secret',
        sleepImpl: async () => {},
        fetchImpl: async (_url, init) => {
          if (init?.method === 'POST') {
            body = JSON.parse(String(init?.body));
            return jsonResponse({ id: `grok_${resolution}`, status: 'completed' });
          }
          return new Response(Buffer.from('v'), { status: 200, headers: { 'content-type': 'video/mp4' } });
        },
      },
    );
    bodies[resolution] = body;
  }

  await submit(
    '480p',
    Array.from({ length: 3 }, (_, i) => `https://example.com/i${i + 1}.jpg`),
    ['https://example.com/v.mp4'],
    ['https://example.com/a.mp3'],
  );
  await submit('720p', Array.from({ length: 9 }, (_, i) => `https://example.com/i${i + 1}.jpg`), [], []);

  const lite = bodies['480p'];
  assert.equal(lite.model, 'grok-imagine-video-1.5-lite');
  assert.equal(lite.resolution, '480p');
  // 480p 参考图最多 1 张
  assert.deepEqual(lite.reference_images, [{ url: 'https://example.com/i1.jpg' }]);
  // grok 不支持参考视频/音频，不下发对应字段
  assert.equal('reference_videos' in lite, false);
  assert.equal('reference_audios' in lite, false);

  const full = bodies['720p'];
  assert.equal(full.model, 'grok-imagine-video-1.5（按次）');
  assert.equal(full.resolution, '720p');
  // 720p 参考图最多 7 张
  assert.equal((full.reference_images as unknown[]).length, 7);
});