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

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/models`
- `POST /api/generate`
- `GET /api/user/images`
- `POST /api/user/images/move`
- `DELETE /api/user/images/:id`
- `GET /api/user/history`
- `GET /api/admin/overview`
- `GET /api/health`
