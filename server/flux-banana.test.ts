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

test('submits banana through the async images task API like gpt-image-2', async () => {
  const requests: string[] = [];
  let submitInit: RequestInit | undefined;
  const responses = [
    new Response(JSON.stringify({
      status: 'queued',
      task_id: 'imgtask_b1',
      status_url: '/v1/images/tasks/imgtask_b1?view=summary',
      poll_after_ms: 1,
      assets: [],
    }), { status: 202 }),
    new Response(JSON.stringify({
      status: 'succeeded',
      task_id: 'imgtask_b1',
      assets: [{ signed_url: 'https://media.ai-media.vip/signed-result.png?sig=abc' }],
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
        requests.push(`${init?.method || 'GET'} ${String(url)}`);
        if (requests.length === 1) submitInit = init;
        const response = responses.shift();
        if (!response) throw new Error('Unexpected request');
        return response;
      },
    },
  );

  assert.equal(requests[0], 'POST https://api.ai-media.vip/v1/images/generations');
  const headers = submitInit?.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(String(submitInit?.body)), {
    model: FLUX_BANANA_FLASH_MODEL,
    prompt: 'Poster',
    size: '1024x1024',
    n: 1,
    async: true,
  });
  assert.deepEqual(result, {
    source: 'data:image/png;base64,iVBORw==',
    model: FLUX_BANANA_FLASH_MODEL,
  });
  // 资产下载走 signed_url（跨源、不带凭据）。
  assert.equal(requests[2], 'GET https://media.ai-media.vip/signed-result.png?sig=abc');
});

test('sends reference images to the async edits endpoint as multipart', async () => {
  const requests: string[] = [];
  let submitInit: RequestInit | undefined;
  const responses = [
    new Response(JSON.stringify({
      status: 'queued',
      task_id: 'imgtask_e1',
      status_url: '/v1/images/tasks/imgtask_e1?view=summary',
      poll_after_ms: 1,
      assets: [],
    }), { status: 202 }),
    new Response(JSON.stringify({
      status: 'succeeded',
      task_id: 'imgtask_e1',
      assets: [{ b64_json: 'cmVzdWx0', mime_type: 'image/webp' }],
    })),
  ];

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
      sleepImpl: async () => undefined,
      fetchImpl: async (url, init) => {
        requests.push(String(url));
        if (requests.length === 1) submitInit = init;
        const response = responses.shift();
        if (!response) throw new Error('Unexpected request');
        return response;
      },
    },
  );

  assert.equal(requests[0], 'https://api.ai-media.vip/v1/images/edits');
  const form = submitInit?.body as FormData;
  assert.equal(form.get('model'), FLUX_BANANA_FLASH_MODEL);
  assert.equal(form.get('prompt'), 'A clean product poster');
  assert.equal(form.get('size'), '2048x1152');
  assert.equal(form.get('async'), 'true');
  assert.ok(form.get('image'));
  assert.deepEqual(result, {
    source: 'data:image/webp;base64,cmVzdWx0',
    model: FLUX_BANANA_FLASH_MODEL,
  });
});

test('falls back to the native Gemini endpoint when the images task API is missing', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
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
        calls.push({ url: String(url), init });
        if (calls.length === 1) return new Response('not found', { status: 404 });
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

  assert.equal(calls[0].url, 'https://api.ai-media.vip/v1/images/edits');
  assert.equal(
    calls[1].url,
    `https://api.ai-media.vip/v1beta/models/${FLUX_BANANA_FLASH_MODEL}:streamGenerateContent?alt=sse`,
  );
  const nativeInit = calls[1].init;
  assert.equal((nativeInit?.headers as Record<string, string>)['x-goog-api-key'], 'secret');
  assert.deepEqual(JSON.parse(String(nativeInit?.body)), {
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

test('falls back to the native endpoint when the gateway rejects the model on the images API', async () => {
  const urls: string[] = [];
  const result = await generateFluxBanana(
    { prompt: 'Poster', ratio: '1:1', imageSize: '1K', images: [] },
    {
      baseUrl: 'https://api.ai-media.vip',
      apiKey: 'secret',
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (urls.length === 1) {
          return new Response(JSON.stringify({ error: { message: 'model not supported on this endpoint' } }), { status: 400 });
        }
        return new Response(JSON.stringify({
          candidates: [{
            content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'cmVzdWx0' } }] },
          }],
        }));
      },
    },
  );

  assert.deepEqual(urls, [
    'https://api.ai-media.vip/v1/images/generations',
    `https://api.ai-media.vip/v1beta/models/${FLUX_BANANA_FLASH_MODEL}:streamGenerateContent?alt=sse`,
  ]);
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

test('treats moderation rejections from the task API as non-fallback failures', async () => {
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

test('reads the generated image from an SSE stream response on the native fallback', async () => {
  const urls: string[] = [];
  const sse = [
    'data: {"candidates":[{"content":{"parts":[{"text":"working on it"}]}}]}',
    '',
    'data: {"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"cmVzdWx0"}}]}}]}',
    '',
    '',
  ].join('\n');

  const result = await generateFluxBanana(
    { prompt: 'Poster', ratio: '1:1', imageSize: '1K', images: [] },
    {
      baseUrl: 'https://api.ai-media.vip',
      apiKey: 'secret',
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (urls.length === 1) return new Response('not found', { status: 404 });
        return new Response(sse, { headers: { 'content-type': 'text/event-stream' } });
      },
    },
  );

  assert.equal(
    urls[1],
    `https://api.ai-media.vip/v1beta/models/${FLUX_BANANA_FLASH_MODEL}:streamGenerateContent?alt=sse`,
  );
  assert.deepEqual(result, {
    source: 'data:image/png;base64,cmVzdWx0',
    model: FLUX_BANANA_FLASH_MODEL,
  });
});

test('falls back to the sync endpoint when the stream endpoint is missing', async () => {
  const urls: string[] = [];
  const result = await generateFluxBanana(
    { prompt: 'Poster', ratio: '1:1', imageSize: '1K', images: [] },
    {
      baseUrl: 'https://api.ai-media.vip',
      apiKey: 'secret',
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (urls.length <= 2) return new Response('not found', { status: 404 });
        return new Response(JSON.stringify({
          candidates: [{
            content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'cmVzdWx0' } }] },
          }],
        }));
      },
    },
  );

  assert.deepEqual(urls, [
    'https://api.ai-media.vip/v1/images/generations',
    `https://api.ai-media.vip/v1beta/models/${FLUX_BANANA_FLASH_MODEL}:streamGenerateContent?alt=sse`,
    `https://api.ai-media.vip/v1beta/models/${FLUX_BANANA_FLASH_MODEL}:generateContent`,
  ]);
  assert.deepEqual(result, {
    source: 'data:image/png;base64,cmVzdWx0',
    model: FLUX_BANANA_FLASH_MODEL,
  });
});

test('treats moderation errors inside the SSE stream as non-fallback failures', async () => {
  const responses = [
    new Response('not found', { status: 404 }),
    new Response(
      'data: {"error":{"message":"Content blocked by safety policy"}}\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    ),
  ];
  await assert.rejects(
    () => generateFluxBanana(
      { prompt: 'Poster', ratio: '1:1', imageSize: '1K', images: [] },
      {
        baseUrl: 'https://api.ai-media.vip',
        apiKey: 'secret',
        fetchImpl: async () => {
          const response = responses.shift();
          if (!response) throw new Error('Unexpected request');
          return response;
        },
      },
    ),
    (error: unknown) => {
      const tagged = error as { safeToFallback?: unknown; message?: unknown };
      return tagged.safeToFallback === false
        && String(tagged.message || '').includes('Content moderation rejected');
    },
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
