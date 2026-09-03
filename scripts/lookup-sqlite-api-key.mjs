// Read-only lookup on the server's SQLite DB (data/app.sqlite).
// Run from the project dir on the server:
//   node scripts/lookup-sqlite-api-key.mjs 1619b65681eac479
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');
const targetId = (process.argv[2] || '').trim();
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = process.argv[3] || path.join(projectRoot, 'data', 'app.sqlite');

if (!targetId) {
  console.error('Usage: node scripts/lookup-sqlite-api-key.mjs <apiKeyId> [path-to-app.sqlite]');
  process.exit(2);
}
if (!fs.existsSync(dbFile)) {
  console.error(`DB file not found: ${dbFile}`);
  process.exit(2);
}

const handle = await initSqlJs({
  locateFile: (f) => require.resolve(`sql.js/dist/${f}`),
});
const db = new handle.Database(new Uint8Array(fs.readFileSync(dbFile)));

function rows(sql) {
  const res = db.exec(sql);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
}
function one(sql) {
  return rows(sql)[0] || null;
}

console.log('\n===== 1. app_settings 里搜 string =====');
const hitRows = rows(
  `SELECT key, length(value) AS len FROM app_settings WHERE value LIKE '%${targetId}%' OR key LIKE '%${targetId}%'`,
);
if (!hitRows.length) console.log('该字符串未出现在任何 app_settings 里。');
else for (const r of hitRows) console.log(`  key=${r.key}  value_len=${r.len}`);

console.log('\n===== 2. generation_requests 里的对应请求 =====');
const genRows = rows(
  `SELECT id, user_id, username, model_name, image_size, credits_used, result_status, created_at, substr(prompt,1,40) AS prompt
   FROM generation_requests
   WHERE user_id LIKE '%${targetId}%' OR username LIKE '%${targetId}%'
   ORDER BY created_at DESC LIMIT 50`,
);
if (!genRows.length) console.log('generation_requests 里没有匹配。');
else for (const r of genRows) console.log(`  [${r.created_at}] ${r.model_name} ${r.image_size} ${r.credits_used}cr ${r.result_status} | user_id=${r.user_id} username=${r.username} | ${r.prompt}`);

console.log('\n===== 3. public_api_keys_v1 记录 =====');
const setting = one(`SELECT value FROM app_settings WHERE key = 'public_api_keys_v1'`);
if (!setting) {
  console.log('该库没有 public_api_keys_v1 设置。');
} else {
  let records = [];
  try { records = JSON.parse(setting.value); } catch (e) { console.log('解析失败:', e.message); records = []; }
  const m = records.filter((r) =>
    r.id === targetId ||
    String(r.name || '').includes(targetId) ||
    String(r.keyPreview || '').includes(targetId),
  );
  if (!m.length) {
    console.log(`没有匹配此 key 的记录（当前共 ${records.length} 条 key）。`);
  } else {
    for (const r of m) console.log(JSON.stringify(r, null, 2));
  }
}

console.log('\n===== 4. 该库整体概况 =====');
const c = one(
  `SELECT (SELECT COUNT(*) FROM users) AS users,
          (SELECT COUNT(*) FROM generation_requests) AS gen_requests,
          (SELECT COUNT(*) FROM user_credits) AS credits`,
);
console.log(`  users=${c.users}  gen_requests=${c.gen_requests}  user_credits=${c.credits}`);

db.close();
process.exit(0);