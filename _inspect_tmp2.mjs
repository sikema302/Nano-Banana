import fs from 'node:fs';

const envFile = fs.readFileSync('d:/photo/.env.local', 'utf8');
const env = {};
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = (m[2] || '').replace(/^"|"$/g, '');
}

const base = (env.USSELG_BASE_URL || 'https://uselg.top/v1').replace(/\/+$/, '');
const key = env.USSELG_STANDARD_KEY || '';

function magic(buf) {
  const h = [...buf.subarray(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  return h;
}
function sniff(buf) {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'PNG';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'JPEG';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'WEBP';
  const ascii = buf.subarray(0, 64).toString('utf8').trimStart();
  if (ascii.startsWith('<')) return 'HTML-ish';
  return 'UNKNOWN';
}

// 1) 生成一张
console.log(`POST ${base}/images/generations`);
const post = await fetch(`${base}/images/generations`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: env.USSELG_MODEL || 'gpt-image-2', prompt: '一只橘猫', size: '1024x1024' }),
});
console.log('gen HTTP', post.status, post.statusText);
const text = await post.text();
console.log('body:', text.slice(0, 800));
let url = '';
try { url = JSON.parse(text)?.data?.[0]?.url || ''; } catch { url = ''; }
console.log('\nsource URL:', url || '(none)');

if (url) {
  // 2) 无鉴权下载（模拟后端 downloadGeneratedImage）
  const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } });
  const buf = Buffer.from(await r.arrayBuffer());
  console.log('\ndownload HTTP', r.status);
  console.log('Content-Type:', r.headers.get('content-type'));
  console.log('bytes:', buf.length, '| type=', sniff(buf), '| magic=', magic(buf));
}