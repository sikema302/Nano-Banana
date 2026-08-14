#!/usr/bin/env bash
# ─── Nano Banana 零停机部署脚本 ───────────────────────────────────────
# 由 webhook 端点 /api/deploy 触发，不依赖 SSH。
# 用法: bash deploy.sh <release.tar.gz>

set -euo pipefail

ARCHIVE="${1:-/tmp/nano-banana-release.tar.gz}"
PROJECT='/var/www/nano-banana'
BACKUPS="$PROJECT/.deploy-backups"
STATUS_FILE="${DEPLOY_STATUS_FILE:-/tmp/nano-banana-deploy.status}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

log() { printf '[deploy %s] %s\n' "$TIMESTAMP" "$*"; }

finish() {
  local exit_code="${1:-1}"
  log "部署结束, exit=$exit_code"
  printf '%s\n' "$exit_code" > "$STATUS_FILE"
  exit "$exit_code"
}

# ─── 前置检查 ─────────────────────────────────────────────────────────
if [ ! -f "$ARCHIVE" ]; then
  log "错误: 找不到发布包 $ARCHIVE"
  finish 1
fi

log "===== 开始部署 ====="
log "发布包: $ARCHIVE ($(du -sh "$ARCHIVE" | cut -f1))"

# ─── 备份当前部署 ─────────────────────────────────────────────────────
mkdir -p "$BACKUPS"
log "备份当前部署到 $BACKUPS/$TIMESTAMP-pre-deploy.tar.gz"
tar -czf "$BACKUPS/$TIMESTAMP-pre-deploy.tar.gz" \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./.runtime' \
  --exclude='./.deploy-backups' \
  --exclude='./uploads' \
  --exclude='./.uploads' \
  -C "$PROJECT" . 2>/dev/null || true

# 只保留最近 5 个备份
ls -1t "$BACKUPS"/*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f

# ─── 部署新版本 ───────────────────────────────────────────────────────
cd "$PROJECT"

# 清理旧文件（保留 node_modules、data、uploads 等运行时目录）
log "清理旧版本文件"
rm -rf dist server src scripts supabase api .github deploy.sh 2>/dev/null || true

log "解压发布包"
tar -xzf "$ARCHIVE" -C "$PROJECT"
rm -f "$ARCHIVE"

# ─── 处理密钥文件 ─────────────────────────────────────────────────────
SECRETS_DIR="$PROJECT/.secrets"
if [ -d "$SECRETS_DIR" ]; then
  log "处理密钥文件"

  if [ -s "$SECRETS_DIR/nano-lite-key" ]; then
    nano_lite_key="$(cat "$SECRETS_DIR/nano-lite-key")"
    touch .env.local
    (grep -v '^VISIONARY_NANO_LITE_API_KEY=' .env.local 2>/dev/null || true) > .env.local.next
    printf 'VISIONARY_NANO_LITE_API_KEY="%s"\n' "$nano_lite_key" >> .env.local.next
    mv .env.local.next .env.local
    chmod 600 .env.local
  fi

  if [ -s "$SECRETS_DIR/flux-banana-key" ]; then
    flux_banana_key="$(cat "$SECRETS_DIR/flux-banana-key")"
    touch .env.local
    (grep -v '^FLUX_BANANA_API_KEY=' .env.local 2>/dev/null || true) > .env.local.next
    printf 'FLUX_BANANA_API_KEY="%s"\n' "$flux_banana_key" >> .env.local.next
    mv .env.local.next .env.local
    chmod 600 .env.local
  fi

  if [ -s "$SECRETS_DIR/schat-key" ]; then
    schat_key="$(cat "$SECRETS_DIR/schat-key")"
    touch .env.local
    (grep -v '^SCHAT_API_KEY=' .env.local 2>/dev/null || true) > .env.local.next
    printf 'SCHAT_API_KEY="%s"\n' "$schat_key" >> .env.local.next
    mv .env.local.next .env.local
    chmod 600 .env.local
  fi

  if [ -s "$SECRETS_DIR/r2-env" ]; then
    touch .env.local
    (grep -v -E '^R2_(ACCOUNT_ID|ACCESS_KEY_ID|SECRET_ACCESS_KEY|BUCKET_NAME|PUBLIC_BASE_URL)=' .env.local 2>/dev/null || true) > .env.local.next
    cat "$SECRETS_DIR/r2-env" >> .env.local.next
    mv .env.local.next .env.local
    chmod 600 .env.local
  fi

  rm -rf "$SECRETS_DIR"
fi

# ─── 系统资源配置 ─────────────────────────────────────────────────────
# 防止 2GB 内存机器在图片生成高峰期 OOM
if ! swapon --show 2>/dev/null | grep -q '/swapfile'; then
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
fi
grep -q '^/swapfile none swap' /etc/fstab 2>/dev/null || echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 并发限制
touch .env.local
sed -i '/^PUBLIC_ASYNC_CONCURRENCY=/d' .env.local
printf 'PUBLIC_ASYNC_CONCURRENCY="2"\n' >> .env.local
sed -i '/^GENERATION_MAX_CONCURRENCY=/d' .env.local
printf 'GENERATION_MAX_CONCURRENCY="3"\n' >> .env.local
sed -i '/^VIDEO_MAX_CONCURRENCY=/d' .env.local
printf 'VIDEO_MAX_CONCURRENCY="1"\n' >> .env.local
chmod 600 .env.local

# ─── 安装依赖 ─────────────────────────────────────────────────────────
DEPENDENCY_STAMP='node_modules/.pixory-package-lock.sha256'
CURRENT_LOCK_HASH="$(sha256sum package-lock.json | awk '{print $1}')"
INSTALLED_LOCK_HASH="$(cat "$DEPENDENCY_STAMP" 2>/dev/null || true)"

if [ ! -x node_modules/.bin/tsx ] || [ "$CURRENT_LOCK_HASH" != "$INSTALLED_LOCK_HASH" ]; then
  log "安装依赖..."
  npm ci
  printf '%s' "$CURRENT_LOCK_HASH" > "$DEPENDENCY_STAMP"
else
  log "依赖未变化，跳过 npm ci"
fi

# ─── 构建前端 ─────────────────────────────────────────────────────────
log "构建前端..."
npm run build

# ─── 验证 R2 存储 ─────────────────────────────────────────────────────
log "验证 R2 存储连接..."
timeout --signal=TERM --kill-after=10s 90s npm run storage:r2:verify -- --allow-unavailable || true

# ─── 零停机重启 ───────────────────────────────────────────────────────
log "重启服务..."

if ! pm2 describe nano-banana >/dev/null 2>&1; then
  # 首次启动
  pm2 start server/index.ts \
    --name nano-banana \
    --interpreter ./node_modules/.bin/tsx \
    --exec-mode cluster -i 1 \
    --wait-ready --listen-timeout 60000
else
  # 确保单实例（集群模式下后台调度器保持单例）
  PM2_INSTANCE_COUNT="$(pm2 jlist | node -e "let raw=''; process.stdin.on('data', chunk => raw += chunk); process.stdin.on('end', () => console.log(JSON.parse(raw).filter(item => item.name === 'nano-banana').length));")"
  if [ "$PM2_INSTANCE_COUNT" -gt 1 ]; then
    pm2 scale nano-banana 1
  fi

  # reload 实现零停机：先启动新进程，等新进程就绪后再关闭旧进程
  if ! pm2 reload nano-banana --update-env --wait-ready --listen-timeout 60000; then
    log "reload 未就绪，降级为 restart"
    pm2 restart nano-banana --update-env
  fi
fi

pm2 save >/dev/null

# ─── 等待服务就绪 ─────────────────────────────────────────────────────
log "等待服务就绪..."
CONSECUTIVE_READY=0
for attempt in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:3001/api/ready 2>/dev/null; then
    echo
    CONSECUTIVE_READY=$((CONSECUTIVE_READY + 1))
    if [ "$CONSECUTIVE_READY" -ge 3 ]; then
      log "===== 部署成功 ====="
      log "备份: $BACKUPS/$TIMESTAMP-pre-deploy.tar.gz"
      finish 0
    fi
  else
    CONSECUTIVE_READY=0
  fi
  sleep 2
done

log "错误: 就绪检查超时"
finish 1