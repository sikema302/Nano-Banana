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

test('submits banana through the Gemini native generateContent endpoint (non-streaming)', async () => {
  let submitInit: RequestInit | undefined;
  let submitUrl = '';

  const result = await generateFluxBanana(
    { prompt: 'Poster', ratio: '1:1', imageSize: '1K', images: [] },
    {
      baseUrl: 'https://api.ai-media.vip',
      apiKey: 'secret',
      fetchImpl: async (url, init) => {
        submitUrl = String(url);
        submitInit = init;
        return new Response(JSON.stringify({
          candidates: [{
            content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'cmVzdWx0' } }] },
          }],
        }));
      },
    },
  );

  assert.equal(
    submitUrl,
    `https://api.ai-media.vip/v1beta/models/${FLUX_BANANA_FLASH_MODEL}:generateContent`,
  );
  const headers = submitInit?.headers as Record<string, string>;
  assert.equal(headers['x-goog-api-key'], 'secret');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(String(submitInit?.body)), {
    contents: [{ role: 'user', parts: [{ text: 'Poster' }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: '1:1', imageSize: '1K' },
    },
  });
  assert.deepEqual(result, {
    source: 'data:image/png;base64,cmVzdWx0',
    model: FLUX_BANANA_FLASH_MODEL,
  });
});

test('sends reference images as inlineData parts in the native request body', async () => {
  let submitInit: RequestInit | undefined;

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
      fetchImpl: async (_url, init) => {
        submitInit = init;
        return new Response(JSON.stringify({
          candidates: [{
            content: { parts: [{ inlineData: { mimeType: 'image/webp', data: 'cmVzdWx0' } }] },
          }],
        }));
      },
    },
  );

  assert.deepEqual(JSON.parse(String(submitInit?.body)), {
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

test('reads the image from the snake_case inline_data field', async () => {
  const result = await generateFluxBanana(
    { prompt: 'Poster', ratio: '1:1', imageSize: '1K', images: [] },
    {
      baseUrl: 'https://api.ai-media.vip',
      apiKey: 'secret',
      fetchImpl: async () => new Response(JSON.stringify({
        candidates: [{
          content: { parts: [{ inline_data: { mime_type: 'image/png', data: 'cmVzdWx0' } }] },
        }],
      })),
    },
  );

  assert.deepEqual(result, {
    source: 'data:image/png;base64,cmVzdWx0',
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

test('treats moderation rejections as non-fallback failures', async () => {
  await assert.rejects(
    () => generateFluxBanana(
      { prompt: 'Poster', ratio: '1:1', imageSize: '1K', images: [] },
      {
        baseUrl: 'https://api.ai-media.vip',
        apiKey: 'secret',
        fetchImpl: async () => new Response(
          JSON.stringify({ error: { message: 'content blocked by safety policy' } }),
          { status: 400 },
        ),
      },
    ),
    (error: unknown) => {
      const tagged = error as { safeToFallback?: unknown; message?: unknown };
      return tagged.safeToFallback === false
        && String(tagged.message || '').includes('Content moderation rejected');
    },
  );
});

test('polls an accepted async task and downloads the completed image', async () => {
  const requests: string[] = [];
  const responses = [
    new Response(JSON.stringify({
      status: 'queued',
      task_id: 'imgtask_123',
      status_url: '/v1/images/tasks/imgtask_123',
      poll_after_ms: 1,
      assets: [],
    }), { status: 202 }),
    new Response(JSON.stringify({
      status: 'running',
      task_id: 'imgtask_123',
      status_url: '/v1/images/tasks/imgtask_123',
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
  assert.deepEqual(requests, [
    `POST https://api.ai-media.vip/v1beta/models/${FLUX_BANANA_FLASH_MODEL}:generateContent secret`,
    'GET https://api.ai-media.vip/v1/images/tasks/imgtask_123 secret',
    'GET https://api.ai-media.vip/v1/images/tasks/imgtask_123 secret',
    'GET https://media.ai-media.vip/result.png ',
  ]);
});

test('constructs the poll URL from task_id when status_url is absent', async () => {
  const requests: string[] = [];
  const responses = [
    new Response(JSON.stringify({
      status: 'queued',
      task_id: 'imgtask_nourl',
      poll_after_ms: 1,
      assets: [],
    }), { status: 202 }),
    new Response(JSON.stringify({
      status: 'success',
      task_id: 'imgtask_nourl',
      assets: [{ b64_json: 'cmVzdWx0', mime_type: 'image/webp' }],
    })),
  ];

  const result = await generateFluxBanana(
    { prompt: 'Poster', ratio: '1:1', imageSize: '1K', images: [] },
    {
      baseUrl: 'https://api.ai-media.vip',
      apiKey: 'secret',
      sleepImpl: async () => undefined,
      fetchImpl: async (url) => {
        requests.push(String(url));
        const response = responses.shift();
        if (!response) throw new Error('Unexpected request');
        return response;
      },
    },
  );

  assert.equal(requests[1], 'https://api.ai-media.vip/v1/images/tasks/imgtask_nourl');
  assert.deepEqual(result, {
    source: 'data:image/webp;base64,cmVzdWx0',
    model: FLUX_BANANA_FLASH_MODEL,
  });
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

test('keeps polling through an uncertain status until the task completes', async () => {
  const requests: string[] = [];
  const responses = [
    new Response(JSON.stringify({
      status: 'queued',
      task_id: 'imgtask_unc',
      status_url: '/v1/images/tasks/imgtask_unc',
      poll_after_ms: 1,
      assets: [],
    }), { status: 202 }),
    new Response(JSON.stringify({
      status: 'uncertain',
      task_id: 'imgtask_unc',
      error: 'Image result is temporarily uncertain; please query this task again later and do not submit a duplicate request',
      assets: [],
    })),
    new Response(JSON.stringify({
      status: 'success',
      task_id: 'imgtask_unc',
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
      fetchImpl: async (url) => {
        requests.push(String(url));
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
    'https://api.ai-media.vip/v1/images/tasks/imgtask_unc',
    'https://api.ai-media.vip/v1/images/tasks/imgtask_unc',
    'https://media.ai-media.vip/result.png',
  ]);
});

test('recovers when a task reports a transient failed status then succeeds', async () => {
  const responses = [
    new Response(JSON.stringify({
      status: 'queued',
      task_id: 'imgtask_tr',
      status_url: '/v1/images/tasks/imgtask_tr',
      poll_after_ms: 1,
      assets: [],
    }), { status: 202 }),
    new Response(JSON.stringify({
      status: 'failed',
      task_id: 'imgtask_tr',
      error: 'Image generation failed; please check the request or try again later',
      assets: [],
    })),
    new Response(JSON.stringify({
      status: 'success',
      task_id: 'imgtask_tr',
      assets: [{ url: 'https://media.ai-media.vip/ok.png' }],
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
      fetchImpl: async () => {
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
});

test('keeps polling through transient HTTP poll errors until the task completes', async () => {
  const responses = [
    new Response(JSON.stringify({
      status: 'queued',
      task_id: 'imgtask_http',
      status_url: '/v1/images/tasks/imgtask_http',
      poll_after_ms: 1,
      assets: [],
    }), { status: 202 }),
    new Response(JSON.stringify({ error: { message: 'temporarily unavailable' } }), { status: 503 }),
    new Response(JSON.stringify({
      status: 'success',
      task_id: 'imgtask_http',
      assets: [{ url: 'https://media.ai-media.vip/http.png' }],
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
      fetchImpl: async () => {
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
});
