import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import {
  downloadGeneratedImage,
  isValidImageBuffer,
  verifyPublicGeneratedImage,
} from './generated-image-download.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJ8AAAAASUVORK5CYII=',
  'base64',
);

test('validates image signatures instead of trusting file extensions', () => {
  assert.equal(isValidImageBuffer(png, 'image/png'), true);
  assert.equal(isValidImageBuffer(Buffer.from('{"error":"not an image"}'), 'image/png'), false);
});

test('retries an archived image URL until real image bytes are available', async () => {
  let attempts = 0;
  const server = http.createServer((_req, res) => {
    attempts += 1;
    if (attempts < 3) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '原图还在归档，请稍后重试。' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(png);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const result = await downloadGeneratedImage(`http://127.0.0.1:${address.port}/image`, [0, 1, 1]);
    assert.equal(attempts, 3);
    assert.equal(result.buffer.equals(png), true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('rejects a successful HTTP response that contains JSON instead of an image', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream result is invalid' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    await assert.rejects(
      downloadGeneratedImage(`http://127.0.0.1:${address.port}/image`, [0]),
      /upstream result is invalid/,
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('retries a temporarily missing public image and verifies its byte size', async () => {
  let attempts = 0;
  const server = http.createServer((_req, res) => {
    attempts += 1;
    if (attempts === 1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not propagated yet' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(png);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const result = await verifyPublicGeneratedImage(
      `http://127.0.0.1:${address.port}/image`,
      png.byteLength,
      [0, 1],
    );
    assert.equal(attempts, 2);
    assert.equal(result.buffer.equals(png), true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('rejects a public image whose bytes differ from the uploaded object', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(png);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    await assert.rejects(
      verifyPublicGeneratedImage(`http://127.0.0.1:${address.port}/image`, png.byteLength + 1, [0]),
      /size mismatch/,
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('times out and retries when a generated image response stalls', async () => {
  let attempts = 0;
  const server = http.createServer((_req, res) => {
    attempts += 1;
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.write(png.subarray(0, 8));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    await assert.rejects(
      downloadGeneratedImage(`http://127.0.0.1:${address.port}/image`, [0, 1], 20),
      /abort|timeout/i,
    );
    assert.equal(attempts, 2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
