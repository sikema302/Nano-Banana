#!/usr/bin/env bash
# ─── Nano Banana 零停机部署脚本 ───────────────────────────────────────
# 由 webhook 端点 /api/deploy 触发，不依赖 SSH。
# 用法: bash deploy.sh <release.tar.gz>

# 使用硬编码路径，避免环境变量为空导致静默失败
LOG_FILE="/tmp/nano-banana-deploy.log"
STATUS_FILE="/tmp/nano-banana-deploy.status"

# 第一步：立即写入初始状态和日志
echo 'running' > "$STATUS_FILE" 2>/dev/null
echo '[deploy] 脚本开始' >> "$LOG_FILE" 2>/dev/null

# 所有输出重定向到日志文件
exec >> "$LOG_FILE" 2>&1

set -euo pipefail

# 确保任何错误都会写入状态文件
_write_status() {
  local code="${1:-1}"
  echo "$code" > "$STATUS_FILE" 2>/dev/null
}
trap '_write_status 1' ERR
trap '_write_status $?' EXIT

ARCHIVE="${1:-/tmp/nano-banana-release.tar.gz}"
PROJECT='/var/www/nano-banana'
BACKUPS="$PROJECT/.deploy-backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

log() { echo "[deploy $TIMESTAMP] $*"; }

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

  if [ -s "$SECRETS_DIR/deploy-secret" ]; then
    deploy_secret="$(cat "$SECRETS_DIR/deploy-secret")"
    touch .env.local
    (grep -v '^DEPLOY_SECRET=' .env.local 2>/dev/null || true) > .env.local.next
    printf 'DEPLOY_SECRET="%s"\n' "$deploy_secret" >> .env.local.next
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

# 并发限制 & 资源阈值
touch .env.local
# 清理旧值
for var in PUBLIC_ASYNC_CONCURRENCY PUBLIC_ASYNC_MAX_PENDING \
           GENERATION_MAX_CONCURRENCY GENERATION_MAX_PENDING \
           VIDEO_MAX_CONCURRENCY \
           RESOURCE_CPU_PAUSE_PERCENT RESOURCE_CPU_RESUME_PERCENT \
           RESOURCE_MEMORY_PAUSE_PERCENT RESOURCE_EVENT_LOOP_PAUSE_MS; do
  sed -i "/^${var}=/d" .env.local
done
# 异步 API 并发
printf 'PUBLIC_ASYNC_CONCURRENCY="6"\n'    >> .env.local
printf 'PUBLIC_ASYNC_MAX_PENDING="200"\n'  >> .env.local
# 生图并发
printf 'GENERATION_MAX_CONCURRENCY="16"\n'  >> .env.local
printf 'GENERATION_MAX_PENDING="200"\n'     >> .env.local
# 生视频并发
printf 'VIDEO_MAX_CONCURRENCY="3"\n'        >> .env.local
# 资源压力阈值（取消 CPU 暂停，保留内存和 EventLoop 保护）
printf 'RESOURCE_CPU_PAUSE_PERCENT="100"\n'   >> .env.local
printf 'RESOURCE_CPU_RESUME_PERCENT="95"\n'   >> .env.local
printf 'RESOURCE_MEMORY_PAUSE_PERCENT="88"\n' >> .env.local
printf 'RESOURCE_EVENT_LOOP_PAUSE_MS="500"\n' >> .env.local
chmod 600 .env.local

# ─── 安装依赖 ─────────────────────────────────────────────────────────
# 杀掉可能残留的 npm 进程（上次部署失败可能留下的）
pkill -f 'npm ci' 2>/dev/null || true
pkill -f 'npm install' 2>/dev/null || true

DEPENDENCY_STAMP='node_modules/.pixory-package-lock.sha256'
CURRENT_LOCK_HASH="$(sha256sum package-lock.json | awk '{print $1}')"
INSTALLED_LOCK_HASH="$(cat "$DEPENDENCY_STAMP" 2>/dev/null || true)"

if [ ! -x node_modules/.bin/tsx ] || [ "$CURRENT_LOCK_HASH" != "$INSTALLED_LOCK_HASH" ]; then
  log "安装依赖..."

  # 优先使用淘宝镜像，超时 10 分钟
  if timeout --signal=TERM --kill-after=30s 600 npm ci --registry=https://registry.npmmirror.com 2>/dev/null; then
    log "npm ci 成功 (npmmirror)"
  elif timeout --signal=TERM --kill-after=30s 600 npm ci 2>/dev/null; then
    log "npm ci 成功 (官方源)"
  else
    log "npm ci 失败，尝试 cnpm..."
    if command -v cnpm >/dev/null 2>&1; then
      cnpm install --production=false 2>/dev/null || { log "cnpm 也失败了"; finish 1; }
    else
      log "npm ci 超时或失败"
      finish 1
    fi
  fi

  printf '%s' "$CURRENT_LOCK_HASH" > "$DEPENDENCY_STAMP"
else
  log "依赖未变化，跳过 npm ci"
fi

# ─── 发布包已包含构建产物 ─────────────────────────────────────────────
# GitHub Actions 已完成 npm ci、lint、测试和前端构建；这里直接使用 dist，
# 避免服务器重复安装构建工具并再次构建，显著缩短部署时间。
if [ ! -d dist ]; then
  log "错误: 发布包缺少 dist 构建产物"
  finish 1
fi
log "使用发布包中的 dist，跳过服务器端重复构建"

# ─── 验证 R2 存储 ─────────────────────────────────────────────────────
log "验证 R2 存储连接..."
timeout --signal=TERM --kill-after=10s 90s npm run storage:r2:verify -- --allow-unavailable || true

# ─── 同步 Nginx 配置 ───────────────────────────────────────────────────
NGINX_CONF="$PROJECT/deploy/nginx-schat.conf"
NGINX_TARGET="/www/server/panel/vhost/nginx/schat.top.conf"
if [ -f "$NGINX_CONF" ]; then
  if ! cmp -s "$NGINX_CONF" "$NGINX_TARGET" 2>/dev/null; then
    log "更新 Nginx 配置..."
    cp "$NGINX_CONF" "$NGINX_TARGET"
    if nginx -t 2>/dev/null; then
      nginx -s reload 2>/dev/null || service nginx reload 2>/dev/null || true
      log "Nginx 配置已更新并重载"
    else
      log "警告: Nginx 配置语法错误，跳过重载"
    fi
  else
    log "Nginx 配置未变化，跳过"
  fi
fi

# ─── 重启服务 ───────────────────────────────────────────────────────
	# 先写成功状态，防止 PM2 重启时误杀 deploy.sh 导致状态丢失
	# 所有部署实质性工作（解压/密钥/依赖/Nginx）已在此前完成
	printf '0\n' > "$STATUS_FILE"
	log "部署文件阶段完成，开始重启服务..."

	if ! pm2 describe nano-banana >/dev/null 2>&1; then
	  # 首次启动
	  pm2 start server/index.ts \
	    --name nano-banana \
	    --interpreter ./node_modules/.bin/tsx \
	    -i 1
	else
	  # 确保单实例（集群模式下后台调度器保持单例）
	  PM2_INSTANCE_COUNT="$(pm2 jlist | node -e "let raw=''; process.stdin.on('data', chunk => raw += chunk); process.stdin.on('end', () => console.log(JSON.parse(raw).filter(item => item.name === 'nano-banana').length));")"
	  if [ "$PM2_INSTANCE_COUNT" -gt 1 ]; then
	    pm2 scale nano-banana 1
	  fi

	  # 使用 setsid 在新会话中运行 restart，完全脱离当前进程组
	  # 避免 PM2 杀掉旧进程时波及 deploy.sh
	  setsid bash -c 'pm2 restart nano-banana --update-env' &
	  RESTART_PID=$!
	  RESTART_OK=0
	  for i in $(seq 1 90); do
	    if ! kill -0 $RESTART_PID 2>/dev/null; then
	      wait $RESTART_PID && RESTART_OK=1
	      break
	    fi
	    sleep 1
	  done
	  if [ "$RESTART_OK" -eq 0 ]; then
	    kill -KILL $RESTART_PID 2>/dev/null || true
	    wait $RESTART_PID 2>/dev/null || true
	    log "restart 超时，尝试强制恢复..."
	    pm2 delete nano-banana 2>/dev/null || true
	    pm2 start server/index.ts \
	      --name nano-banana \
	      --interpreter ./node_modules/.bin/tsx \
	      -i 1
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
	      exit 0
	    fi
	  else
	    CONSECUTIVE_READY=0
	  fi
	  sleep 2
	done

	log "错误: 就绪检查超时，但文件部署已完成"
	printf '1\n' > "$STATUS_FILE"
	exit 1