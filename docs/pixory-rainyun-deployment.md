# Pixory Rainyun Deployment Guide

This document records the current production setup for `pixory.top`.

## Production endpoints

- App: `https://pixory.top`
- App: `https://www.pixory.top`
- Health check: `https://pixory.top/api/health`

## Server details

- Provider: Rainyun
- OS: Debian 12
- Public IP: `23.141.172.73`
- SSH port: `22`
- Project path: `/var/www/nano-banana`
- PM2 app name: `nano-banana`

## Runtime architecture

- Nginx listens on `80` and `443`
- Nginx proxies requests to `127.0.0.1:3001`
- PM2 runs `server/index.ts` through `tsx`
- The backend serves both API routes and the built frontend `dist`

## Domain and DNS

Current DNS records:

- `A @ -> 23.141.172.73`
- `A www -> 23.141.172.73`

If the domain stops working, first verify:

```bash
nslookup pixory.top 8.8.8.8
nslookup www.pixory.top 8.8.8.8
```

## SSL certificate

Certificate management uses `acme.sh`.

Installed paths:

- Full chain: `/www/server/panel/vhost/cert/pixory.top/fullchain.pem`
- Private key: `/www/server/panel/vhost/cert/pixory.top/privkey.pem`

acme.sh home:

- `/root/.acme.sh`

Manual renewal check:

```bash
~/.acme.sh/acme.sh --renew -d pixory.top --ecc
nginx -t
nginx -s reload
```

## Nginx config

Active site config:

- `/www/server/panel/vhost/nginx/photo-app.conf`

Current behavior:

- `http://pixory.top` redirects to `https://pixory.top`
- `https://pixory.top` and `https://www.pixory.top` proxy to `127.0.0.1:3001`
- API responses are not cached and allow long-running generation requests

Useful commands:

```bash
nginx -t
nginx -s reload
```

## Application environment

Main environment file:

- `/var/www/nano-banana/.env.local`

Important production variables:

```env
DATABASE_PROVIDER=sqlite
SUPABASE_URL=https://cpjsjdvbkspkopakmlnv.supabase.co
CORS_ORIGIN=http://23.141.172.73,http://pixory.top,http://www.pixory.top,https://pixory.top,https://www.pixory.top
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=<r2-access-key-id>
R2_SECRET_ACCESS_KEY=<r2-secret-access-key>
R2_BUCKET_NAME=<generated-image-bucket>
R2_PUBLIC_BASE_URL=https://<public-r2-domain>
```

Server-only secrets should remain only on the server:

- `SUPABASE_SERVICE_ROLE_KEY`
- `VISIONARY_BANANA_PRO_API_KEY`
- `VISIONARY_GPT_IMAGE_2_API_KEY`
- `VISIONARY_GPT_IMAGE_2_HD_API_KEY`
- `VISIONARY_API_KEY` as a fallback
- `JWT_SECRET`
- `BACKUP_ENCRYPTION_KEY`

The active database is `/var/www/nano-banana/data/app.sqlite`. Encrypted daily snapshots are written to `data/sqlite-backups`; keep the `data` directory on persistent storage and include it in host-level backups.

R2 is the primary generated-image store. The server downloads and validates the
provider result, uploads the original to R2, verifies its object size, and then
downloads the public R2 URL before reporting success. Thumbnail upload is also
verified and the frontend falls back to the original if a thumbnail is
temporarily unavailable. If the original upload, verification, or public read
fails, the generation is marked failed and its credits are refunded. The
temporary provider URL is never returned to the user.

Visionary key routing:

- Nano Banana Pro uses `VISIONARY_BANANA_PRO_API_KEY`.
- GPT-image-2 Plus standard uses `VISIONARY_GPT_IMAGE_2_API_KEY`.
- GPT-image-2 Plus 2K and 4K use `VISIONARY_GPT_IMAGE_2_HD_API_KEY`.

## Deploy flow

Recommended deploy path is GitHub Actions, not direct local SSH. This avoids local IP bans / SSH reset issues and gives one repeatable command.

Before the first deployment to this host, set the GitHub Actions secrets
`DEPLOY_SERVER_PASSWORD` (the current Rainyun root password) and `SCHAT_API_KEY`.
The workflow performs an SSH preflight against `23.141.172.73:22`; the admin panel
also reports the exact failed Actions step when a run cannot complete.

One-click production deploy:

```bash
npm run deploy:prod -- -Message "describe this release"
```

With local checks before pushing:

```bash
npm run deploy:prod:check -- -Message "describe this release"
```

Force a redeploy when there are no code changes:

```bash
npm run deploy:prod:force -- -Message "redeploy production"
```

What the one-click deploy script does:

1. Optionally runs local checks (`deploy:prod:check`).
2. Commits local changes when the worktree is dirty.
3. Pushes `main` to GitHub with a GitHub IP fallback for unstable local routing.
4. Waits for the `Deploy production` GitHub Actions workflow.
5. Verifies `https://pixory.top/api/health`.

Direct SSH deploy is kept as fallback. Important: the server's local frontend build has produced incomplete Tailwind CSS in the past. Use local build + upload instead of building the frontend on the server.

Normal direct SSH deploy:

```bash
npm run deploy:server
```

Fast direct SSH deploy:

```bash
npm run deploy:server:fast
```

What the direct SSH deploy script does:

1. Runs local checks and frontend build.
2. Packages tracked files plus untracked non-ignored files.
3. Uploads the package to the server.
4. Backs up the current server version.
5. Extracts the new package to `/var/www/nano-banana`.
6. Restarts PM2.
7. Verifies `/api/health`.

## Rollback

List backups:

```bash
npm run rollback:server:list
```

Rollback to the latest backup:

```bash
npm run rollback:server
```

Fast rollback without reinstall:

```bash
powershell -ExecutionPolicy Bypass -File scripts/rollback-server.ps1 -SkipInstall
```

Backup directory on the server:

- `/var/www/nano-banana/.deploy-backups`

## Health checks

Backend health:

```bash
curl https://pixory.top/api/health
```

Expected response:

```json
{"ok":true,"userStorage":"SQLite","databaseProvider":"sqlite","imageStorageProvider":"r2"}
```

R2 checks:

```bash
npm run storage:r2:verify
curl -I https://<public-r2-domain>/generated/<existing-file>
```

The verification command must complete successfully. A newly completed
generation should return an R2 URL, and that URL must return `200` with an image
`Content-Type` after PM2 restarts.

## Common issues

### Domain resolves but HTTPS fails

- Check DNS first.
- Confirm ports `80` and `443` are open.
- Re-run `nginx -t` and reload.
- Verify certificate files still exist in `/www/server/panel/vhost/cert/pixory.top`.

### Frontend looks unstyled or black

- Do not run a server-side frontend build and assume it is safe.
- Deploy with `npm run deploy:server` from the local machine that produces the known-good build.

### CORS errors

- Check `CORS_ORIGIN` in `/var/www/nano-banana/.env.local`.
- Restart PM2 after changes:

```bash
pm2 restart nano-banana --update-env
```

### Generation succeeds but the image does not load

- Confirm `/api/health` reports `imageStorageProvider: "r2"`.
- Run `npm run storage:r2:verify` on Rainyun to test write, `HEAD`, and delete access.
- Confirm the returned URL uses the configured `R2_PUBLIC_BASE_URL`.
- Run `curl -I` from Rainyun and from an affected client network against the exact returned URL.
- Check the R2 custom-domain DNS, certificate, public access, and CORS settings.

R2 delivery still uses Cloudflare's network. Domestic clients can therefore
still see latency or connection failures caused by their route to Cloudflare.
The application retries provider downloads and verifies R2 persistence, so
those client-side delivery failures no longer turn a temporary provider URL
into a successful charged result. Removing Cloudflare from the image delivery
path would require a different public origin or an origin proxy; keeping R2
cannot guarantee that every domestic route to Cloudflare is stable.

## PM2 commands

```bash
pm2 show nano-banana
pm2 logs nano-banana
pm2 restart nano-banana --update-env
pm2 save
```
