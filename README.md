# Pixory Studio

Pixory Studio is a full-stack image generation app with a React + Vite frontend and an Express backend. It supports prompt-based generation, reference image uploads, user auth, invite codes, saved image buckets, admin tools, and Supabase-backed persistence.

## Stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Node.js, Express, TSX
- Database: Supabase
- Image provider: Visionary API
- Process/runtime: PM2 on Debian Linux

## Local development

Install dependencies:

```bash
npm install
```

Run frontend and backend together:

```bash
npm run dev:all
```

Or run them separately:

```bash
npm run dev:server
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

## Required environment variables

Example local configuration:

```env
NODE_ENV=development
PORT=3001
DATABASE_PROVIDER=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
VISIONARY_API_KEY=your_fallback_visionary_key
VISIONARY_BANANA_PRO_API_KEY=your_banana_pro_key
VISIONARY_GPT_IMAGE_2_API_KEY=your_gpt_image_2_standard_key
VISIONARY_GPT_IMAGE_2_HD_API_KEY=your_gpt_image_2_2k_4k_key
JWT_SECRET=your_random_secret
ADMIN_USERNAMES=admin
IMAGE_RETENTION_DAYS=7
IMAGE_CLEANUP_INTERVAL_MS=21600000
```

### Business data backups

When Supabase persistence is enabled, the server creates encrypted business-data backups on startup when needed and every 24 hours. Backups include users, credits, invite codes, text-only generation metadata, API keys, and app settings. The `images` table, generation image/reference fields, and all uploaded/generated image files are intentionally excluded.

```bash
npm run backup:data
npm run verify:backup -- data/business-backups/<backup-file>
npm run restore:data -- --file data/business-backups/<backup-file>       # dry run
npm run restore:data -- --file data/business-backups/<backup-file> --confirm
```

Backups are stored in `data/business-backups` and the newest 30 files are retained by default. Set `BACKUP_ENCRYPTION_KEY` to a stable private value when possible; otherwise the server derives encryption from `JWT_SECRET` or `SUPABASE_SERVICE_ROLE_KEY`.

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- `VITE_*` variables are safe for the frontend build.
- Visionary routing uses `VISIONARY_BANANA_PRO_API_KEY` for Nano Banana Pro, `VISIONARY_GPT_IMAGE_2_API_KEY` for GPT-image-2 Plus standard, and `VISIONARY_GPT_IMAGE_2_HD_API_KEY` for GPT-image-2 Plus 2K/4K. `VISIONARY_API_KEY` remains a fallback.
- GPT-image-2 pricing is checked against Visionary's machine-readable configuration every 72 hours. Valid pricing changes are applied without a redeploy; broader API documentation changes are flagged in the admin dashboard for review. Configure the interval with `VISIONARY_DOC_SYNC_INTERVAL_HOURS`.
- Image retention defaults to 7 days. `IMAGE_CLEANUP_INTERVAL_MS` controls how often the server reruns cleanup.
- Set `DATABASE_PROVIDER=supabase` for production on Linux servers.

## Build and checks

Type-check:

```bash
npm run lint
```

Frontend production build:

```bash
npm run build
```

## Deployment

This project is currently deployed on a Rainyun Debian server with PM2 and Nginx.

Useful commands:

```bash
npm run deploy:server
npm run deploy:server:fast
npm run rollback:server
npm run rollback:server:list
```

Detailed deployment, domain, SSL, and rollback notes:

- [Pixory Rainyun Deployment Guide](docs/pixory-rainyun-deployment.md)

## Supabase setup

Run the initial schema in Supabase SQL Editor:

```text
supabase/migrations/20260426000000_init_bananas_ai.sql
```

If needed, sync old local SQLite data into Supabase:

```bash
npm run db:sync:supabase
```

## API overview

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`

### Image Generation (Authenticated)

- `GET /api/models` — List available models and pricing
- `POST /api/generate` — Generate image (sync, requires login)

### User Assets

- `GET /api/user/images`
- `POST /api/user/images/move`
- `DELETE /api/user/images/:id`
- `GET /api/user/history`

### Admin

- `GET /api/admin/overview`
- `GET /api/health`

---

## Public API (Async)

Async endpoints return a `taskId` immediately and process generation in the background. Use the status endpoint to poll for results.

### Submit async task

```http
POST /api/v1/async/generate
Content-Type: application/json
X-API-Key: your_public_api_key
```

**Body:**

```json
{
  "prompt": "a cute cat wearing a space suit",
  "model": "gpt-image-2",
  "aspectRatio": "1:1",
  "imageSize": "2K",
  "quality": "high",
  "images": []
}
```

**Response (202 Accepted):**

```json
{
  "taskId": "16-5f3cf761-a4bb-486a-8016-77f490998f80",
  "status": "queued",
  "retryAfterSeconds": 3,
  "message": "Task accepted. Use GET /api/v1/async/status/:taskId to query result.",
  "usage": {
    "creditsUsed": 48,
    "remainingCredits": 952
  }
}
```

### Query async status

```http
GET /api/v1/async/status/:taskId?model=gpt-image-2&imageSize=2K
X-API-Key: your_public_api_key
```

**Response (queued):**

```json
{
  "taskId": "16-5f3cf761-a4bb-486a-8016-77f490998f80",
  "status": "queued",
  "progress": 0,
  "retryAfterSeconds": 3
}
```

**Response (succeeded):**

```json
{
  "taskId": "16-5f3cf761-a4bb-486a-8016-77f490998f80",
  "status": "succeeded",
  "progress": 100,
  "retryAfterSeconds": 0,
  "imageUrl": "https://visionary.beer/api/generations/..."
}
```

### Polling example (JavaScript)

```javascript
const submit = await fetch('https://your-domain.com/api/v1/async/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your_public_api_key',
  },
  body: JSON.stringify({
    prompt: 'a cute cat wearing a space suit',
    model: 'gpt-image-2',
    aspectRatio: '1:1',
    imageSize: '2K',
    quality: 'high',
  }),
});

const { taskId, retryAfterSeconds } = await submit.json();

let result;
while (true) {
  await new Promise((r) => setTimeout(r, retryAfterSeconds * 1000));
  const query = await fetch(`https://your-domain.com/api/v1/async/status/${taskId}?model=gpt-image-2&imageSize=2K`, {
    headers: { 'X-API-Key': 'your_public_api_key' },
  });
  result = await query.json();
  if (result.status === 'succeeded' || result.status === 'failed') break;
}

console.log(result.imageUrl); // final image URL
```

---

## Legacy Public API (Sync)

The following sync endpoints are still supported for backward compatibility, but may encounter timeouts for long generations. New integrations should use the async endpoints above.

- `POST /v1/api/generate` — GPT Image 2 (sync)
- `POST /v1/api/nano-banana` — Nano Banana Pro (sync)
- `POST /v1beta/models/:modelAction` — Gemini-compatible format (sync)
