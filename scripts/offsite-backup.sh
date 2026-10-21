#!/usr/bin/env bash
# ─── pixory 异地容灾备份：主服务器 → 雨云香港机（154.9.24.91） ────────────
# 在主服务器（23.141.172.73）上以 cron / 宝塔计划任务执行。
#
# 推送内容：
#   1) data/sqlite-backups/*.enc  —— 数据库加密快照（核心资产，增量同步）
#   2) .env.local                 —— 密钥与渠道配置（丢了要全部重配）
# 雨云端自动清理超过 RAINYUN_KEEP_DAYS 天的旧快照，默认保留 90 天。
#
# 首次使用前（主服务器宝塔终端执行一次）：
#   ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519        # 已有密钥可跳过
#   ssh-copy-id -p 22 root@154.9.24.91                      # 输入雨云密码
#   ssh -p 22 root@154.9.24.91 "mkdir -p /www/backup/pixory"
#   bash /var/www/nano-banana/scripts/offsite-backup.sh     # 手动跑一次验证
#
# 然后在宝塔 → 计划任务 → 添加 Shell 脚本，每天凌晨执行：
#   bash /var/www/nano-banana/scripts/offsite-backup.sh
#
# 可用环境变量覆盖默认值：
#   RAINYUN_HOST / RAINYUN_PORT / RAINYUN_USER / RAINYUN_DIR / RAINYUN_KEEP_DAYS

set -euo pipefail

RAINYUN_HOST="${RAINYUN_HOST:-154.9.24.91}"
RAINYUN_PORT="${RAINYUN_PORT:-22}"
RAINYUN_USER="${RAINYUN_USER:-root}"
RAINYUN_DIR="${RAINYUN_DIR:-/www/backup/pixory}"
RAINYUN_KEEP_DAYS="${RAINYUN_KEEP_DAYS:-90}"

PROJECT="/var/www/nano-banana"
LOG_FILE="${LOG_FILE:-/tmp/pixory-offsite-backup.log}"
REMOTE="$RAINYUN_USER@$RAINYUN_HOST"
SSH_OPTS=(-p "$RAINYUN_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o BatchMode=yes)

exec >> "$LOG_FILE" 2>&1
echo "[$(date '+%F %T')] ===== offsite backup start ====="

if [ ! -d "$PROJECT/data/sqlite-backups" ]; then
  echo "[offsite] ERROR: $PROJECT/data/sqlite-backups 不存在"
  exit 1
fi

# 1) 数据库加密快照（增量：只传新增/变化的 .enc）
rsync -az --timeout=600 -e "ssh ${SSH_OPTS[*]}" \
  "$PROJECT/data/sqlite-backups/" "$REMOTE:$RAINYUN_DIR/sqlite-backups/"
echo "[offsite] sqlite-backups synced"

# 2) 环境配置（覆盖为最新，雨云端限权）
ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p $RAINYUN_DIR/env && chmod 700 $RAINYUN_DIR/env"
rsync -az -e "ssh ${SSH_OPTS[*]}" "$PROJECT/.env.local" "$REMOTE:$RAINYUN_DIR/env/env.local"
ssh "${SSH_OPTS[@]}" "$REMOTE" "chmod 600 $RAINYUN_DIR/env/env.local"
echo "[offsite] env synced"

# 3) 雨云端清理过期快照（保留最近 RAINYUN_KEEP_DAYS 天）
ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "find $RAINYUN_DIR/sqlite-backups -name '*.enc' -type f -mtime +$RAINYUN_KEEP_DAYS -delete 2>/dev/null || true"

echo "[$(date '+%F %T')] ===== offsite backup done ====="
