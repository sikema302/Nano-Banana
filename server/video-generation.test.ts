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
  // minimax-h3：720p/1080p（2026-10-28 新文档），比例 16:9/9:16
  assert.equal(normalizeVideoResolution('minimax-h3', '720p'), '720p');
  assert.equal(normalizeVideoResolution('minimax-h3', '1080p'), '1080p');
  assert.equal(normalizeVideoResolution('minimax-h3', '2K'), '720p');
  assert.equal(normalizeVideoResolution('minimax-h3', '768p'), '720p');
  assert.equal(normalizeVideoResolution('minimax-h3', '4K'), '720p');
  // grok-imagine-video-1.5：480p/720p，比例 5 种
  assert.equal(normalizeVideoResolution('grok-imagine-video-1.5', '720p'), '720p');
  assert.equal(normalizeVideoResolution('grok-imagine-video-1.5', '480p'), '480p');
  assert.equal(normalizeVideoResolution('grok-imagine-video-1.5', '2K'), '480p');
  assert.equal(normalizeVideoSeconds(5), 5);
  assert.equal(normalizeVideoSeconds(1), 3);
  assert.equal(normalizeVideoSeconds(99), VIDEO_MAX_SECONDS);
  assert.equal(normalizeVideoSeconds('x'), VIDEO_DEFAULT_SECONDS);
  // 优化版（君临通道）只支持 4–15 整数秒：3 秒会被钳到 4，避免上游 400 invalid request body
  assert.equal(normalizeVideoSeconds(3, 'minimax-h3-optimized'), 4);
  assert.equal(normalizeVideoSeconds(4, 'minimax-h3-optimized'), 4);
  assert.equal(normalizeVideoSeconds(15, 'minimax-h3-optimized'), 15);
  assert.equal(normalizeVideoSeconds(20, 'minimax-h3-optimized'), 15);
  assert.equal(normalizeVideoSeconds('x', 'minimax-h3-optimized'), VIDEO_DEFAULT_SECONDS);
  // 其余模型下限仍为 3
  assert.equal(normalizeVideoSeconds(3, 'minimax-h3'), 3);
  assert.equal(normalizeVideoAspect('minimax-h3', '16:9'), '16:9');
  assert.equal(normalizeVideoAspect('minimax-h3', '9:16'), '9:16');
  assert.equal(normalizeVideoAspect('minimax-h3', '1:1'), '16:9');
  assert.equal(normalizeVideoAspect('minimax-h3', '21:9'), '16:9');
  assert.equal(normalizeVideoAspect('minimax-h3', '4:3'), '16:9');
  assert.equal(normalizeVideoAspect('grok-imagine-video-1.5', '4:3'), '4:3');
  assert.equal(normalizeVideoAspect('grok-imagine-video-1.5', '3:4'), '3:4');
  assert.equal(normalizeVideoAspect('grok-imagine-video-1.5', '21:9'), '16:9');
  // minimax-h3-768p：只有 768p 一档，比例 16:9/9:16/1:1
  assert.equal(normalizeVideoResolution('minimax-h3-768p', '768p'), '768p');
  assert.equal(normalizeVideoResolution('minimax-h3-768p', '2K'), '768p');
  assert.equal(normalizeVideoAspect('minimax-h3-768p', '16:9'), '16:9');
  assert.equal(normalizeVideoAspect('minimax-h3-768p', '21:9'), '16:9');
});

test('submits MiniMax H3 with resolution and aspect_ratio', async () => {
  let submitUrl = '';
  let submitInit: RequestInit | undefined;
  let polls = 0;

  const result = await generateUselgVideo(
    { modelId: 'minimax-h3', prompt: '一只白鹭沿海骑车', resolution: '720p', aspect: '16:9', seconds: 6, referenceImages: ['https://example.com/ref.jpg'] },
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
    model: 'minimax-h3',
    prompt: '一只白鹭沿海骑车',
    seconds: 6,
    resolution: '720p',
    aspect_ratio: '16:9',
    reference_images: [{ url: 'https://example.com/ref.jpg' }],
  });
  assert.equal(polls, 1);
  assert.equal(result.model, 'minimax-h3');
  assert.equal(result.taskId, 'vidtask_123');
  assert.equal(result.contentType, 'video/mp4');
  assert.equal(result.buffer.toString(), 'mp4-bytes');
});

test('omits reference_videos and reference_audios for minimax-h3', async () => {
  let submitInit: RequestInit | undefined;

  await generateUselgVideo(
    {
      modelId: 'minimax-h3',
      prompt: '带素材的短片',
      resolution: '1080p',
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
  assert.equal(body.model, 'minimax-h3');
  // 2026-10-28 新文档：minimax-h3 不支持参考视频/音频，即使传入也不下发
  assert.equal('reference_videos' in body, false);
  assert.equal('reference_audios' in body, false);
});

test('polls until completed then downloads', async () => {
  const statuses = ['queued', 'processing', 'completed'];
  let statusCalls = 0;
  let downloadCalls = 0;

  await generateUselgVideo(
    { modelId: 'minimax-h3', prompt: '短片', resolution: '1080p', aspect: '16:9', seconds: 4, referenceImages: [] },
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
      { modelId: 'minimax-h3', prompt: '短片', resolution: '720p', aspect: '16:9', seconds: 5, referenceImages: [] },
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
    { modelId: 'minimax-h3', prompt: '文生视频', resolution: '1080p', aspect: '9:16', seconds: 5, referenceImages: [] },
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
  assert.equal(body.resolution, '1080p');
  assert.equal(body.aspect_ratio, '9:16');
  // 新契约不再下发 size / quality
  assert.equal('size' in body, false);
  assert.equal('quality' in body, false);
});

test('passes through supported aspect ratios in the submit body', async () => {
  async function submitBody(resolution: '720p' | '1080p', aspect: '16:9' | '9:16') {
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

  const body1080 = await submitBody('1080p', '16:9');
  assert.equal(body1080.resolution, '1080p');
  assert.equal(body1080.aspect_ratio, '16:9');
  // 任何情况下都只下发 model/resolution/aspect_ratio，不带 size / quality
  assert.equal('size' in body1080, false);
  assert.equal('quality' in body1080, false);

  const body720 = await submitBody('720p', '9:16');
  assert.equal(body720.resolution, '720p');
  assert.equal(body720.aspect_ratio, '9:16');
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
test('junliai channel: string media arrays + reference_mode=asset + upper-case resolution', async () => {
  let body: Record<string, unknown> = {};
  const result = await generateUselgVideo(
    {
      modelId: 'minimax-h3-optimized',
      prompt: '保持 <Picture 1> 的外貌，参考 <Video 1> 的动作',
      resolution: '768p',
      aspect: '16:9',
      // 优化版下限是 4 秒，传 3 应被钳制
      seconds: 3,
      referenceImages: ['https://example.com/p1.jpg'],
      referenceVideos: ['https://example.com/v1.mp4'],
      referenceAudios: ['https://example.com/a1.mp3'],
    },
    {
      baseUrl: 'https://img.junliai.org',
      apiKey: 'secret',
      provider: 'junliai',
      sleepImpl: async () => {},
      fetchImpl: async (url, init) => {
        const u = String(url);
        if (init?.method === 'POST') {
          assert.equal(u, 'https://img.junliai.org/v1/videos');
          body = JSON.parse(String(init?.body));
          return jsonResponse({ id: 'task_1', status: 'queued' });
        }
        // 完成态直接给带临时凭证的 url，应优先下载该地址而不是 /content
        if (u === 'https://cdn.example.com/out.mp4') {
          return new Response(Buffer.from('mp4-bytes'), { status: 200, headers: { 'content-type': 'video/mp4' } });
        }
        return jsonResponse({ id: 'task_1', status: 'completed', url: 'https://cdn.example.com/out.mp4' });
      },
    },
  );

  assert.equal(body.model, 'minimax-h3-optimized');
  assert.equal(body.seconds, 4);
  assert.equal(body.resolution, '768P');
  assert.equal(body.aspect_ratio, '16:9');
  // 君临要求 URL 字符串数组，不是 uselg 的 [{ url }] 对象数组
  assert.deepEqual(body.reference_images, ['https://example.com/p1.jpg']);
  assert.deepEqual(body.reference_videos, ['https://example.com/v1.mp4']);
  assert.deepEqual(body.reference_audios, ['https://example.com/a1.mp3']);
  assert.equal(body.reference_mode, 'asset');
  assert.equal(result.contentType, 'video/mp4');
  assert.equal(result.model, 'minimax-h3-optimized');
});

test('junliai channel omits reference_mode when no media is provided', async () => {
  let body: Record<string, unknown> = {};
  await generateUselgVideo(
    {
      modelId: 'minimax-h3-optimized',
      prompt: '海边的日落，镜头缓慢推进',
      resolution: '768p',
      aspect: '9:16',
      seconds: 5,
      referenceImages: [],
    },
    {
      baseUrl: 'https://img.junliai.org',
      apiKey: 'secret',
      provider: 'junliai',
      sleepImpl: async () => {},
      fetchImpl: async (_url, init) => {
        if (init?.method === 'POST') {
          body = JSON.parse(String(init?.body));
          return jsonResponse({ id: 'task_2', status: 'completed', url: 'https://cdn.example.com/out.mp4' });
        }
        return new Response(Buffer.from('mp4-bytes'), { status: 200, headers: { 'content-type': 'video/mp4' } });
      },
    },
  );

  assert.equal('reference_images' in body, false);
  assert.equal('reference_mode' in body, false);
  assert.equal(body.seconds, 5);
  assert.equal(body.resolution, '768P');
  assert.equal(body.aspect_ratio, '9:16');
});
