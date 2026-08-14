#!/usr/bin/env bash
# ─── Admin 提交脚本 ───────────────────────────────────────────────────
# 由后台管理面板触发，提交并推送代码到 GitHub。
set -euo pipefail

PROJECT='/var/www/nano-banana'
BRANCH='main'
MESSAGE="${1:-}"

cd "$PROJECT"

# 如果本地有未提交的更改
if [ -n "$(git status --porcelain)" ]; then
  if [ -z "$MESSAGE" ]; then
    MESSAGE="deploy: admin update $(date '+%Y-%m-%d %H:%M')"
  fi
  echo "==> 提交更改: $MESSAGE"
  git add -A
  git commit -m "$MESSAGE"
else
  echo "==> 没有本地更改需要提交"
  MESSAGE="deploy: admin redeploy $(date '+%Y-%m-%d %H:%M')"
  git commit --allow-empty -m "$MESSAGE"
fi

echo "==> 推送到 origin/$BRANCH"
git push origin "$BRANCH"
echo "==> 提交完成"