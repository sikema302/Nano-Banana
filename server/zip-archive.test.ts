import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';

import { buildZipArchive, crc32, sanitizeZipEntryName, uniqueZipEntryName } from './zip-archive.js';

// 用最小 ZIP 解析器回读自建压缩包：既能验证 CRC 与中央目录偏移，也能验证两种压缩方式都能解出原字节。
function readZipEntries(archive: Buffer) {
  const eocdOffset = archive.length - 22;
  assert.equal(archive.readUInt32LE(eocdOffset), 0x06054b50, 'EOCD 签名不匹配');

  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);
  const entries: Array<{ name: string; method: number; data: Buffer }> = [];
  let cursor = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(archive.readUInt32LE(cursor), 0x02014b50, '中央目录签名不匹配');

    const method = archive.readUInt16LE(cursor + 10);
    const checksum = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const relativeOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');

    assert.equal(archive.readUInt32LE(relativeOffset), 0x04034b50, `${name} 的本地头签名不匹配`);
    const dataStart = relativeOffset + 30 + archive.readUInt16LE(relativeOffset + 26);
    const raw = archive.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);

    assert.equal(data.length, uncompressedSize, `${name} 的解压长度不一致`);
    assert.equal(crc32(data), checksum, `${name} 的 CRC 校验失败`);

    entries.push({ name, method, data });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

test('crc32 matches the reference value for a known input', () => {
  assert.equal(crc32(Buffer.from('hello')), 0x3610a686);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('stores entries that compression cannot shrink and deflates those it can', () => {
  const incompressible = randomBytes(4096);
  const compressible = Buffer.from('pixory-image-'.repeat(400));
  const archive = buildZipArchive(
    [
      { name: 'photo.jpg', data: incompressible },
      { name: 'plain.txt', data: compressible },
    ],
    new Date('2026-10-01T12:00:00Z'),
  );

  const entries = readZipEntries(archive);
  assert.deepEqual(entries.map((entry) => entry.name), ['photo.jpg', 'plain.txt']);

  // 随机字节压不动，应退回 store；重复文本应走 deflate
  assert.equal(entries[0].method, 0);
  assert.equal(entries[1].method, 8);
  assert.ok(entries[1].data.equals(compressible));
  assert.ok(entries[0].data.equals(incompressible));
});

test('keeps non-ascii entry names readable through the utf-8 flag', () => {
  const archive = buildZipArchive([{ name: '收藏-01.png', data: Buffer.from('demo') }]);
  assert.deepEqual(readZipEntries(archive).map((entry) => entry.name), ['收藏-01.png']);
});

test('produces a valid archive for an empty entry list', () => {
  const archive = buildZipArchive([]);
  assert.deepEqual(readZipEntries(archive), []);
  assert.equal(archive.length, 22);
});

test('sanitizes entry names so they cannot escape the archive root', () => {
  assert.equal(sanitizeZipEntryName('../../etc/passwd', 'image-1'), 'passwd');
  assert.equal(sanitizeZipEntryName('a\\b\\c.png', 'image-1'), 'c.png');
  assert.equal(sanitizeZipEntryName('/absolute/dir/photo.jpg', 'image-1'), 'photo.jpg');
  assert.equal(sanitizeZipEntryName('...', 'image-1'), 'image-1');
  assert.equal(sanitizeZipEntryName('   ', 'image-1'), 'image-1');
});

test('deduplicates repeated entry names', () => {
  const used = new Set<string>();
  assert.equal(uniqueZipEntryName('photo.jpg', used), 'photo.jpg');
  assert.equal(uniqueZipEntryName('photo.jpg', used), 'photo-2.jpg');
  assert.equal(uniqueZipEntryName('photo.jpg', used), 'photo-3.jpg');
});
