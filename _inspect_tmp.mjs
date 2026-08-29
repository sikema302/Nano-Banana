import fs from 'node:fs';

const envFile = fs.readFileSync('d:/photo/.env.local', 'utf8');
const env = {};
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = (m[2] || '').replace(/^"|"$/g, '');
}
const base = (env.SUPABASE_URL || '').replace(/\/$/, '');
const key = env.SUPABASE_SERVICE_ROLE_KEY || '';

async function q(sqlUrl, label) {
  try {
    const res = await fetch(sqlUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
    });
    const txt = await res.text();
    console.log(`\n==== ${label} | HTTP ${res.status} (count ${res.headers.get('content-range') || '-'}) ====`);
    console.log(txt.slice(0, 6000));
  } catch (e) {
    console.log(`\n[ERR] ${label}:`, e.message);
  }
}

// 全局最新 gpt-image-2 请求（不限用户）
await q(
  `${base}/rest/v1/generation_requests?select=id,username,model_id,image_size,image_path,result_status,result_message,api_request_ms,created_at&model_id=eq.gpt-image-2&order=created_at.desc&limit=12`,
  'gpt-image-2 latest global',
);