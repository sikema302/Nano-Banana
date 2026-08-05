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
    optimizeChineseText: false,
    client_request_id: 'stable-request-id',
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
    (error: unknown) => {
      assert.doesNotMatch(String((error as Error)?.message || ''), /lite|visionary/i);
      assert.equal((error as { safeToFallback?: unknown })?.safeToFallback, true);
      return true;
    },
  );
});

test('retries transient polling errors without submitting a duplicate Lite task', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const warnings: string[] = [];
  const responses = [
    new Response(JSON.stringify({
      data: [{ status: 'submitted', task_id: 'task-lite-retry', retry_after: 1 }],
    })),
    new Response(JSON.stringify({
      error: { message: 'temporary status gateway error' },
    }), { status: 502 }),
    new Response(JSON.stringify({
      data: {
        id: 'task-lite-retry',
        status: 'completed',
        result: {
          images: [{ url: ['https://visionary.beer/generated/retry.png'] }],
        },
      },
    })),
  ];

  const result = await generateVisionaryNanoLite(
    { prompt: 'Poster', ratio: '1:1', images: [] },
    {
      baseUrl: 'https://visionary.beer',
      apiKey: 'secret',
      requestId: 'retry-request-id',
      sleep: async () => undefined,
      logger: { warn: (message) => warnings.push(String(message)) },
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init });
        return responses.shift() || new Response(null, { status: 500 });
      },
    },
  );

  assert.equal(result, 'https://visionary.beer/generated/retry.png');
  assert.equal(requests.filter((request) => request.init?.method === 'POST').length, 1);
  assert.equal(requests.filter((request) => request.init?.method === 'GET').length, 2);
  assert.match(warnings[0], /task-lite-retry.*temporary status gateway error/);
});

test('includes the polling phase and task ID after repeated status failures', async () => {
  const responses = [
    new Response(JSON.stringify({
      data: [{ status: 'submitted', task_id: 'task-lite-poll-failed', retry_after: 1 }],
    })),
    new Response(JSON.stringify({ error: { message: 'gateway one' } }), { status: 502 }),
    new Response(JSON.stringify({ error: { message: 'gateway two' } }), { status: 502 }),
  ];

  await assert.rejects(
    () => generateVisionaryNanoLite(
      { prompt: 'Poster', ratio: '1:1', images: [] },
      {
        baseUrl: 'https://visionary.beer',
        apiKey: 'secret',
        maxPollErrors: 2,
        sleep: async () => undefined,
        logger: { warn: () => undefined },
        fetchImpl: async () => responses.shift() || new Response(null, { status: 500 }),
      },
    ),
    (error: unknown) => {
      assert.doesNotMatch(String((error as Error)?.message || ''), /lite|visionary/i);
      assert.equal((error as { safeToFallback?: unknown })?.safeToFallback, false);
      return true;
    },
  );
});
