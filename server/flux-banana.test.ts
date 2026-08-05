import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FLUX_BANANA_FLASH_MODEL,
  FLUX_BANANA_PRO_MODEL,
  generateFluxBanana,
  selectFluxBananaModel,
} from './flux-banana.js';

test('selects the required Flux model for each banana resolution', () => {
  assert.equal(selectFluxBananaModel('1K', () => 0.99), FLUX_BANANA_FLASH_MODEL);
  assert.equal(selectFluxBananaModel('2K', () => 0.1), FLUX_BANANA_PRO_MODEL);
  assert.equal(selectFluxBananaModel('2K', () => 0.9), FLUX_BANANA_FLASH_MODEL);
  assert.equal(selectFluxBananaModel('4K', () => 0.1), FLUX_BANANA_PRO_MODEL);
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
      random: () => 0.9,
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
