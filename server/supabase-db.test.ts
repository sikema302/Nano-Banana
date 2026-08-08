import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

process.env.SUPABASE_REQUEST_TIMEOUT_MS = '1000';

test('Supabase timeout includes a stalled response body', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"unfinished":');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const { fetchSupabaseWithTimeout } = await import('./supabase-db.js');
    const startedAt = Date.now();

    await assert.rejects(
      fetchSupabaseWithTimeout(`http://127.0.0.1:${address.port}`, { method: 'POST' }),
      /Supabase POST request timed out or failed/,
    );
    const durationMs = Date.now() - startedAt;
    assert(durationMs >= 900, `request aborted too early after ${durationMs}ms`);
    assert(durationMs < 2_000, `stalled response body took ${durationMs}ms to abort`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
