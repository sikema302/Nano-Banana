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
ALLOW_MULTI_DEVICE_LOGIN=true
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

Recommended one-click deploy:

```bash
npm run deploy:prod -- -Message "describe this release"
```

What it does:

1. Commits local changes when the worktree is dirty.
2. Pushes `main` to GitHub with a GitHub IP fallback for unstable local network routing.
3. Waits for the `Deploy production` GitHub Actions run to finish.
4. Verifies `https://pixory.top/api/health`.

Useful variants:

```bash
npm run deploy:prod:check -- -Message "describe this release"
npm run deploy:prod:force -- -Message "redeploy production"
npm run rollback:server
npm run rollback:server:list
```

Direct SSH deploy commands are kept as fallback only:

```bash
npm run deploy:server
npm run deploy:server:fast
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

Pixory submits generation through the same server-side model gateway used by the
website and immediately returns Pixory's own task ID. GPT Image requests use the
configured primary provider first and automatically fall back to Visionary when
the primary provider is unavailable or quota-limited. Provider switching does
not change public model names, request/response formats, task IDs, polling
endpoints, or billing. Tasks are bound to the API key that created them, survive
server restarts through the configured database, and persist the completed image
locally before returning it. Failed tasks automatically refund reserved credits.

### Submit async task

```http
POST /v1/async/images/generations
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
  "id": "pxgen_1783562400000_a1b2c3d4e5f6",
  "taskId": "pxgen_1783562400000_a1b2c3d4e5f6",
  "object": "image.generation.task",
  "status": "queued",
  "generationStatus": "pending",
  "results": [],
  "progress": 0,
  "retryAfterSeconds": 3,
  "usage": {
    "creditsUsed": 48,
    "remainingCredits": 952
  }
}
```

### Query async status

```http
GET /v1/async/images/generations/:id
X-API-Key: your_public_api_key
```

**Response (queued):**

```json
{
  "id": "pxgen_1783562400000_a1b2c3d4e5f6",
  "taskId": "pxgen_1783562400000_a1b2c3d4e5f6",
  "status": "queued",
  "generationStatus": "pending",
  "results": [],
  "progress": 0,
  "retryAfterSeconds": 3
}
```

**Response (succeeded):**

```json
{
  "id": "pxgen_1783562400000_a1b2c3d4e5f6",
  "taskId": "pxgen_1783562400000_a1b2c3d4e5f6",
  "status": "succeeded",
  "generationStatus": "succeeded",
  "progress": 100,
  "retryAfterSeconds": 0,
  "results": [
    {
      "url": "https://your-domain.com/uploads/generated/..."
    }
  ]
}
```

Batch polling is available at `POST /v1/async/images/generations/status` with body `{ "ids": ["pxgen_..."] }`.

### Polling example (JavaScript)

```javascript
const submit = await fetch('https://your-domain.com/v1/async/images/generations', {
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

let result = await submit.json();

while (result.status === 'queued' || result.status === 'running') {
  await new Promise((r) => setTimeout(r, (result.retryAfterSeconds || 5) * 1000));
  const query = await fetch(`https://your-domain.com/v1/async/images/generations/${result.id}`, {
    headers: { 'X-API-Key': 'your_public_api_key' },
  });
  result = await query.json();
}

if (result.status !== 'succeeded') throw new Error(result.error || 'Generation failed');
console.log(result.results[0].url);
```

---

## Removed Legacy Public API

Legacy sync and compatibility image endpoints are no longer supported. Existing clients must migrate to:

- `POST /v1/async/images/generations`
- `GET /v1/async/images/generations/:id`
- `POST /v1/async/images/generations/status`

Removed endpoints return `410 Gone` with migration guidance.
