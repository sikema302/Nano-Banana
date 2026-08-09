import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FLUX_BANANA_FLASH_MODEL,
  FLUX_BANANA_PRO_MODEL,
  generateFluxBanana,
  selectFluxBananaModel,
} from './flux-banana.js';

test('selects the required Flux model for each banana resolution', () => {
  assert.equal(selectFluxBananaModel('1K'), FLUX_BANANA_FLASH_MODEL);
  assert.equal(selectFluxBananaModel('2K'), FLUX_BANANA_FLASH_MODEL);
  assert.equal(selectFluxBananaModel('4K'), FLUX_BANANA_PRO_MODEL);
});

test('calls the native Gemini image endpoint and reads inlineData', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const result = await generateFluxBanana(
    {
      prompt: 'A clean product poster',
      ratio: '16:9',
      imageSize: '2K',
      images: ['data:image/png;base64,aW1hZ2U='],
    },
    {
      baseUrl: 'https://api.ai-media.vip',
      apiKey: 'secret',
      fetchImpl: async (url, init) => {
        requestUrl = String(url);
        requestInit = init;
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{ inlineData: { mimeType: 'image/webp', data: 'cmVzdWx0' } }],
            },
          }],
        }));
      },
    },
  );

  assert.equal(
    requestUrl,
    `https://api.ai-media.vip/v1beta/models/${FLUX_BANANA_FLASH_MODEL}:generateContent`,
  );
  assert.equal((requestInit?.headers as Record<string, string>)['x-goog-api-key'], 'secret');
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    contents: [{
      role: 'user',
      parts: [
        { text: 'A clean product poster' },
        { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } },
      ],
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
    },
  });
  assert.deepEqual(result, {
    source: 'data:image/webp;base64,cmVzdWx0',
    model: FLUX_BANANA_FLASH_MODEL,
  });
});

test('marks explicit Flux HTTP errors as safe for the next configured channel', async () => {
  await assert.rejects(
    () => generateFluxBanana(
      { prompt: 'Poster', ratio: '1:1', imageSize: '1K', images: [] },
      {
        baseUrl: 'https://api.ai-media.vip',
        apiKey: 'secret',
        fetchImpl: async () => new Response(
          JSON.stringify({ error: { message: 'quota exhausted' } }),
          { status: 429 },
        ),
      },
    ),
    (error: unknown) => Boolean((error as { safeToFallback?: unknown })?.safeToFallback),
  );
});

test('polls an accepted Flux task and downloads the completed image', async () => {
  const requests: string[] = [];
  const responses = [
    new Response(JSON.stringify({
      status: 'queued',
      task_id: 'imgtask_123',
      status_url: '/v1/images/tasks/imgtask_123?view=summary',
      poll_after_ms: 1,
      assets: [],
    }), { status: 202 }),
    new Response(JSON.stringify({
      status: 'running',
      task_id: 'imgtask_123',
      status_url: '/v1/images/tasks/imgtask_123?view=summary',
      poll_after_ms: 1,
      assets: [],
    })),
    new Response(JSON.stringify({
      status: 'success',
      task_id: 'imgtask_123',
      assets: [{ url: 'https://media.ai-media.vip/result.png' }],
    })),
    new Response(Uint8Array.from([137, 80, 78, 71]), {
      headers: { 'content-type': 'image/png' },
    }),
  ];

  const result = await generateFluxBanana(
    { prompt: 'Poster', ratio: '1:1', imageSize: '1K', images: [] },
    {
      baseUrl: 'https://api.ai-media.vip',
      apiKey: 'secret',
      sleepImpl: async () => undefined,
      fetchImpl: async (url, init) => {
        requests.push(`${init?.method || 'GET'} ${String(url)} ${(init?.headers as Record<string, string> | undefined)?.['x-goog-api-key'] || ''}`);
        const response = responses.shift();
        if (!response) throw new Error('Unexpected request');
        return response;
      },
    },
  );

  assert.deepEqual(result, {
    source: 'data:image/png;base64,iVBORw==',
    model: FLUX_BANANA_FLASH_MODEL,
  });
  assert.deepEqual(requests.slice(1), [
    'GET https://api.ai-media.vip/v1/images/tasks/imgtask_123?view=summary secret',
    'GET https://api.ai-media.vip/v1/images/tasks/imgtask_123?view=summary secret',
    'GET https://media.ai-media.vip/result.png ',
  ]);
});

test('allows failover only after an accepted Flux task explicitly fails', async () => {
  await assert.rejects(
    () => generateFluxBanana(
      { prompt: 'Poster', ratio: '1:1', imageSize: '4K', images: [] },
      {
        baseUrl: 'https://api.ai-media.vip',
        apiKey: 'secret',
        sleepImpl: async () => undefined,
        fetchImpl: async (_url, init) => init?.method === 'POST'
          ? new Response(JSON.stringify({
            status: 'queued',
            task_id: 'imgtask_failed',
            status_url: '/v1/images/tasks/imgtask_failed',
          }), { status: 202 })
          : new Response(JSON.stringify({ status: 'failed', error: 'Image task failed' })),
      },
    ),
    (error: unknown) => {
      const tagged = error as { safeToFallback?: unknown; sourceModel?: unknown };
      return tagged.safeToFallback === true && tagged.sourceModel === FLUX_BANANA_PRO_MODEL;
    },
  );
});

test('does not fail over when an accepted Flux task has an uncertain result', async () => {
  await assert.rejects(
    () => generateFluxBanana(
      { prompt: 'Poster', ratio: '1:1', imageSize: '1K', images: [] },
      {
        baseUrl: 'https://api.ai-media.vip',
        apiKey: 'secret',
        sleepImpl: async () => undefined,
        fetchImpl: async (_url, init) => init?.method === 'POST'
          ? new Response(JSON.stringify({
            status: 'queued',
            task_id: 'imgtask_uncertain',
            status_url: '/v1/images/tasks/imgtask_uncertain',
          }), { status: 202 })
          : new Response(JSON.stringify({ status: 'client_disconnected' })),
      },
    ),
    (error: unknown) => (error as { safeToFallback?: unknown })?.safeToFallback === false,
  );
});
