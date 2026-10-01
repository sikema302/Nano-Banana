import { deflateRawSync } from 'node:zlib';
import path from 'node:path';

// 手写 ZIP 容器：项目里没有 zip 依赖，用 node:zlib 的裸 deflate 流自己拼包，
// 避免为此新增一个运行期依赖（缺模块会导致服务直接起不来）。

const ZIP_LOCAL_HEADER_SIG = 0x04034b50;
const ZIP_CENTRAL_HEADER_SIG = 0x02014b50;
const ZIP_EOCD_SIG = 0x06054b50;
// 文件名统一按 UTF-8 编码，中文名不会乱码
const ZIP_FLAG_UTF8 = 0x0800;
const ZIP_METHOD_STORE = 0;
const ZIP_METHOD_DEFLATE = 8;
const ZIP_VERSION = 20;
const ZIP_EXTERNAL_ATTR_FILE_0644 = 0x81a40000;
const MAX_ENTRIES = 0xffff;
const MAX_ENTRY_NAME_BYTES = 0xffff;
const MAX_OFFSET = 0xffffffff;
const MAX_ENTRY_NAME_LENGTH = 100;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer, seed = 0): number {
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (let index = 0; index < buf.length; index += 1) {
    crc = (CRC32_TABLE[(crc ^ buf[index]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// 服务端只写包不解包，不存在 zip-slip；但仍要保证条目名不越界、不带路径分隔符，
// 否则解包方在 Windows 上可能写出目录结构。
export function sanitizeZipEntryName(raw: string, fallback: string) {
  const flat = String(raw ?? '').replace(/\\/g, '/');
  const cleaned = path
    .basename(flat)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, MAX_ENTRY_NAME_LENGTH);
  return cleaned || fallback;
}

export function uniqueZipEntryName(name: string, used: Set<string>) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }

  const dotIndex = name.lastIndexOf('.');
  const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex) : '';
  let index = 2;
  let candidate = `${stem}-${index}${extension}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${stem}-${index}${extension}`;
  }
  used.add(candidate);
  return candidate;
}

function dosDateTime(value: Date) {
  const year = Math.max(value.getFullYear(), 1980);
  const time = (value.getHours() << 11) | (value.getMinutes() << 5) | (value.getSeconds() >> 1);
  const date = ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate();
  return { time, date };
}

export function buildZipArchive(
  entries: Array<{ name: string; data: Buffer }>,
  modifiedAt: Date = new Date(),
): Buffer {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`压缩包条目过多（${entries.length}），超出 ZIP 上限 ${MAX_ENTRIES}`);
  }

  const { time, date } = dosDateTime(modifiedAt);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    if (name.length > MAX_ENTRY_NAME_BYTES) {
      throw new Error(`压缩包条目名过长：${entry.name}`);
    }

    // 每个条目的 CRC 与长度都已确定，因此不使用 data descriptor，头部直接写实值
    const checksum = crc32(entry.data);
    const deflated = deflateRawSync(entry.data, { level: 6 });
    // 压缩后反而变大时退回 store：JPEG/PNG/WebP 基本都是这种情况
    const useDeflate = deflated.length < entry.data.length;
    const method = useDeflate ? ZIP_METHOD_DEFLATE : ZIP_METHOD_STORE;
    const payload = useDeflate ? deflated : entry.data;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(ZIP_LOCAL_HEADER_SIG, 0);
    local.writeUInt16LE(ZIP_VERSION, 4);
    local.writeUInt16LE(ZIP_FLAG_UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(ZIP_CENTRAL_HEADER_SIG, 0);
    central.writeUInt16LE((3 << 8) | ZIP_VERSION, 4);
    central.writeUInt16LE(ZIP_VERSION, 6);
    central.writeUInt16LE(ZIP_FLAG_UTF8, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(ZIP_EXTERNAL_ATTR_FILE_0644, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralOffset = offset;
  const centralSize = centralDirectory.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(ZIP_EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  const totalSize = centralOffset + centralSize + eocd.length;
  if (centralOffset > MAX_OFFSET || totalSize > MAX_OFFSET) {
    throw new Error('压缩包体积超过 4GiB，需要 ZIP64 支持');
  }

  return Buffer.concat([...localParts, centralDirectory, eocd], totalSize);
}
