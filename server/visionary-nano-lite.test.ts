import assert from 'node:assert/strict';
import test from 'node:test';

import { generateVisionaryNanoLite } from './visionary-nano-lite.js';

test('submits and polls nano-banana-2-lite as a fixed 1K fallback', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const responses = [
    new Response(JSON.stringify({
      code: 200,
      data: [{ status: 'submitted', task_id: 'task-lite-1', retry_after: 3 }],
    })),
    new Response(JSON.stringify({
      code: 200,
      data: {
        id: 'task-lite-1',
        status: 'completed',
        result: {
          images: [{ url: ['https://visionary.beer/generated/lite.png'] }],
        },
      },
    })),
  ];
  const sleeps: number[] = [];

  const result = await generateVisionaryNanoLite(
    {
      prompt: 'A compact product poster',
      ratio: '16:9',
      images: ['https://images.example/reference.png'],
    },
    {
      baseUrl: 'https://visionary.beer',
      apiKey: 'secret',
      requestId: 'stable-request-id',
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init });
        return responses.shift() || new Response(null, { status: 500 });
      },
    },
  );

  assert.equal(result, 'https://visionary.beer/generated/lite.png');
  assert.deepEqual(sleeps, [3_000]);
  assert.equal(requests[0].url, 'https://visionary.beer/v1/images/generations');
  assert.equal(requests[0].init?.headers && (requests[0].init.headers as Record<string, string>)['Idempotency-Key'], 'stable-request-id');
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    model: 'nano-banana-2-lite',
    prompt: 'A compact product poster',
    images: ['https://images.example/reference.png'],
    size: '16:9',
    resolution: '1K',
  });
  assert.equal(requests[1].url, 'https://visionary.beer/v1/tasks/task-lite-1');
});

test('surfaces a failed nano-banana-2-lite task', async () => {
  const responses = [
    new Response(JSON.stringify({
      data: [{ status: 'submitted', task_id: 'task-lite-failed', retry_after: 1 }],
    })),
    new Response(JSON.stringify({
      data: {
        id: 'task-lite-failed',
        status: 'failed',
        error: { message: 'upstream generation rejected' },
      },
    })),
  ];

  await assert.rejects(
    () => generateVisionaryNanoLite(
      { prompt: 'Poster', ratio: '1:1', images: [] },
      {
        baseUrl: 'https://visionary.beer',
        apiKey: 'secret',
        sleep: async () => undefined,
        fetchImpl: async () => responses.shift() || new Response(null, { status: 500 }),
      },
    ),
    /upstream generation rejected/,
  );
});
