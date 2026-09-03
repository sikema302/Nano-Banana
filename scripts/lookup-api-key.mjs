// Read-only lookup for a public API key identity. Reads creds from env;
// performs GETs only. Usage:
//   $env:SUPABASE_URL='https://xxx.supabase.co'; $env:SERVICE_ROLE_KEY='...'
//   node scripts/lookup-api-key.mjs 1619b65681eac479
const targetId = (process.argv[2] || '').trim();
const base = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
if (!base || !key) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY env var.');
  process.exit(2);
}
if (!targetId) {
  console.error('Usage: node scripts/lookup-api-key.mjs <apiKeyId>');
  process.exit(2);
}
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  Accept: 'application/json',
};

async function rest(path) {
  const res = await fetch(`${base}/rest/v1${path}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

async function main() {
  // 1) public_api_keys_v1 record
  const [setting] = await rest('/app_settings?key=eq.public_api_keys_v1&select=value');
  const records = JSON.parse(setting?.value || '[]') || [];
  const match = records.find((r) => r.id === targetId);

  console.log('\n===== API KEY RECORD =====');
  if (!match) {
    console.log(`NOT FOUND: no record with id=${targetId} in this environment.`);
  } else {
    const brief = { ...match };
    if (brief.encryptedKey) brief.encryptedKey = '(present)';
    console.log(JSON.stringify(brief, null, 2));
    console.log('\nownerUserId   :', match.ownerUserId || '(none -> standalone legacy key)');
    console.log('ownerUsername :', match.ownerUsername || '(none)');
    console.log('billingMode   :', match.billingMode || 'legacy');
    console.log('createdBy     :', match.createdBy);
    console.log('createdAt     :', match.createdAt);
  }

  // 2) request logs for this identity
  console.log('\n===== REQUEST LOGS =====');
  const rows = await rest(
    `/generation_requests?user_id=eq.api-key:${encodeURIComponent(targetId)}&select=id,user_id,username,model_name,dimensions,image_size,credits_used,created_at,result_status&order=created_at.desc&limit=50`,
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('No requests found for user_id=api-key:' + targetId);
  } else {
    for (const r of rows) {
      console.log(
        `${r.created_at}  ${r.model_name}  ${r.credits_used}cr  ${r.result_status}  ${r.username}`,
      );
    }
    console.log(`(total rows returned: ${rows.length})`);
  }

  // 3) all keys matching by plaintext api-<id> style naming (in case id was used as name)
  console.log('\n===== MATCH BY NAME/PREVIEW =====');
  const byName = records.filter(
    (r) => r.id === targetId || String(r.name || '').indexOf(targetId) >= 0,
  );
  if (byName.length === 0) console.log('No key records matched by name.');
  else for (const r of byName) console.log(`id=${r.id}  name=${r.name}  preview=${r.keyPreview}`);
}

main().catch((err) => {
  console.error('Lookup failed:', err.message);
  process.exit(1);
});