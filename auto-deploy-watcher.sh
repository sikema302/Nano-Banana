#!/usr/bin/env bash
# ─── 自动部署守护脚本 ─────────────────────────────────────────────────────
# 由 cron 每 30 秒调用一次。完全独立于业务进程，业务挂了也能部署。
# 检查 .deploy-incoming 目录，发现新发布包就自动部署。

set -euo pipefail

PROJECT="/var/www/nano-banana"
INCOMING="$PROJECT/.deploy-incoming"
LOG_FILE="/tmp/nano-banana-deploy.log"
STATUS_FILE="/tmp/nano-banana-deploy.status"
LOCK_FILE="/tmp/nano-banana-deploy.lock"

# 防止 cron 任务重叠执行
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

mkdir -p "$INCOMING"

# 找到最新的发布包
ARCHIVE=$(ls -1t "$INCOMING"/release-*.tar.gz 2>/dev/null | head -1)
if [ -z "$ARCHIVE" ]; then
  exit 0
fi

# 原子操作：改名防止重复处理
DEPLOYING="$INCOMING/.deploying-$(date +%s).tar.gz"
mv "$ARCHIVE" "$DEPLOYING"

echo "===== $(date '+%Y-%m-%d %H:%M:%S') 发现新发布包，开始部署 =====" > "$LOG_FILE"
echo 'running' > "$STATUS_FILE"

# 执行部署脚本
if bash "$PROJECT/deploy.sh" "$DEPLOYING" >> "$LOG_FILE" 2>&1; then
  echo "0" > "$STATUS_FILE"
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') 部署成功 =====" >> "$LOG_FILE"
else
  echo "1" > "$STATUS_FILE"
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') 部署失败 =====" >> "$LOG_FILE"
fi

# 清理已处理的包
rm -f "$DEPLOYING"

# 清理超过 1 小时的旧文件
find "$INCOMING" -name 'release-*.tar.gz' -mmin +60 -delete 2>/dev/null || true

# 清理超过 48 小时的 .deploying 残留（可能因为脚本崩溃遗留）
find "$INCOMING" -name '.deploying-*.tar.gz' -mmin +2880 -delete 2>/dev/null || true