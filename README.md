# Pixory Studio

Pixory Studio is a full-stack image generation app with a React + Vite frontend and an Express backend. It supports prompt-based generation, reference image uploads, user auth, invite codes, saved image buckets, admin tools, and SQLite-backed production persistence.

## Stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Node.js, Express, TSX
- Database: SQLite in production; Supabase remains available as an optional provider and migration source
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
DATABASE_PROVIDER=sqlite
VISIONARY_API_KEY=your_fallback_visionary_key
VISIONARY_BANANA_PRO_API_KEY=your_banana_pro_key
VISIONARY_GPT_IMAGE_2_API_KEY=your_gpt_image_2_standard_key
VISIONARY_GPT_IMAGE_2_HD_API_KEY=your_gpt_image_2_2k_4k_key
JWT_SECRET=your_random_secret
ADMIN_USERNAMES=admin
IMAGE_RETENTION_DAYS=2
IMAGE_CLEANUP_INTERVAL_MS=21600000
ALLOW_MULTI_DEVICE_LOGIN=true
GENERATION_MAX_PENDING=100
GENERATION_MAX_CONCURRENCY=3
VIDEO_MAX_CONCURRENCY=1
```

### Database backups

In SQLite mode, the server creates an encrypted, compressed snapshot of `data/app.sqlite` on startup when the latest backup is older than six hours and every 24 hours afterward. Backups are stored in `data/sqlite-backups`, verified after creation, and the newest 14 files are retained.

The business-data commands below remain available for Supabase mode. They include users, credits, invite codes, text-only generation metadata, API keys, and app settings, while intentionally excluding image bytes and image/reference fields.

```bash
npm run backup:data
npm run verify:backup -- data/business-backups/<backup-file>
npm run restore:data -- --file data/business-backups/<backup-file>       # dry run
npm run restore:data -- --file data/business-backups/<backup-file> --confirm
```

Set `BACKUP_ENCRYPTION_KEY` to a stable private value so SQLite and business-data backups remain decryptable after credential rotation. Otherwise the server derives encryption from `JWT_SECRET` or `SUPABASE_SERVICE_ROLE_KEY`.

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- `VITE_*` variables are safe for the frontend build.
- Visionary routing uses `VISIONARY_BANANA_PRO_API_KEY` for Nano Banana Pro, `VISIONARY_GPT_IMAGE_2_API_KEY` for GPT-image-2 Plus standard, and `VISIONARY_GPT_IMAGE_2_HD_API_KEY` for GPT-image-2 Plus 2K/4K. `VISIONARY_API_KEY` remains a fallback.
- GPT-image-2 pricing is checked against Visionary's machine-readable configuration every 72 hours. Valid pricing changes are applied without a redeploy; broader API documentation changes are flagged in the admin dashboard for review. Configure the interval with `VISIONARY_DOC_SYNC_INTERVAL_HOURS`.
- Image retention defaults to 2 days. `IMAGE_CLEANUP_INTERVAL_MS` controls how often the server reruns cleanup.
- Image and video generation share a resource-aware admission queue. By default, at most three generation tasks run at once and at most one can be a video task. New work pauses after CPU reaches 85%, memory reaches 85% (or available memory falls below 300 MB), or event-loop lag reaches 200 ms for five consecutive two-second samples. Work resumes after ten healthy samples; in-flight work is never interrupted. `/api/health` and `/api/ready` expose the current `loadControl` status.
- The R2 migration defaults to two workers and waits on the same CPU, memory, and event-loop pressure thresholds before starting each file.
- Keep `DATABASE_PROVIDER=sqlite` on the persistent production server. Do not use SQLite on Vercel's ephemeral filesystem.

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

## Database migration

Production was migrated from Supabase to SQLite. To create and validate a new SQLite snapshot from a Supabase source without replacing the active database, run:

```bash
npm run db:migrate:sqlite -- --output data/app.sqlite.next --backup-dir data/migration-backups
```

The production workflow performs the final protected switch only for a push whose commit message contains `[migrate-sqlite]`; it does not repeat the migration when production already reports SQLite. The reverse synchronization command remains available for disaster recovery or a deliberate provider rollback:

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
website and immediately returns Pixory's own task ID. Every request follows the
enabled channel order configured for its model and resolution. Explicit channel
failures move seamlessly to the next configured choice without changing public
model names, request/response formats, task IDs, polling endpoints, or billing.
Task metadata is bound to the API key that created it and
survives server restarts through the configured database. Public API results are
not copied into local storage or R2: upstream HTTPS result URLs are returned
directly, while inline Base64 results are kept only in a short-lived in-memory
cache so clients should fetch them promptly. Generation metadata remains visible
in admin history without an image path. Failed tasks automatically refund
reserved credits.

A failed channel is skipped only briefly for the same resolution, ratio, and
quality, then automatically returns to its configured cost priority. Prompt-policy
and reference-image errors never penalize a channel or alter the configured order.

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
