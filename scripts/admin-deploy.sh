#!/usr/bin/env bash
# ─── Admin 部署脚本 ───────────────────────────────────────────────────
# 由后台管理面板触发，提交代码并触发 GitHub Actions 部署。
# GitHub Actions 会通过 webhook 自动完成服务器端部署。
set -euo pipefail

PROJECT='/var/www/nano-banana'
BRANCH='main'
MESSAGE="${1:-}"
HEALTH_URL='https://pixory.top/api/ready'
TIMEOUT_MINUTES=25

cd "$PROJECT"

# 1. 提交本地更改
if [ -n "$(git status --porcelain)" ]; then
  if [ -z "$MESSAGE" ]; then
    MESSAGE="deploy: admin update $(date '+%Y-%m-%d %H:%M')"
  fi
  echo "==> 提交更改: $MESSAGE"
  git add -A
  git commit -m "$MESSAGE"
else
  if [ -z "$MESSAGE" ]; then
    MESSAGE="deploy: admin redeploy $(date '+%Y-%m-%d %H:%M')"
  fi
  echo "==> 创建空提交: $MESSAGE"
  git commit --allow-empty -m "$MESSAGE"
fi

# 2. 推送
HEAD_SHA=$(git rev-parse HEAD)
echo "==> 推送到 origin/$BRANCH ($HEAD_SHA)"
git push origin "$BRANCH"

# 3. 等待 GitHub Actions 部署完成
echo "==> 等待 GitHub Actions 部署..."
DEADLINE=$(($(date +%s) + TIMEOUT_MINUTES * 60))

# 等待 workflow run 出现
while [ $(date +%s) -lt $DEADLINE ]; do
  RUN_URL=$(curl -sS --connect-timeout 20 \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/sikema302/Nano-Banana/actions/runs?branch=$BRANCH&event=push&per_page=5" \
    2>/dev/null | node -e "
      let raw='';
      process.stdin.on('data', chunk => raw += chunk);
      process.stdin.on('end', () => {
        try {
          const data = JSON.parse(raw);
          const run = (data.workflow_runs || []).find(
            r => r.name === 'Deploy production' && r.head_sha === '$HEAD_SHA'
          );
          if (run) console.log(run.html_url + '|' + run.id);
        } catch {}
      });
    " 2>/dev/null || true)

  if [ -n "$RUN_URL" ]; then
    RUN_HTML_URL="${RUN_URL%%|*}"
    RUN_ID="${RUN_URL##*|}"
    echo "==> Deploy run: $RUN_HTML_URL"
    break
  fi
  echo "==> 等待 workflow run 出现..."
  sleep 8
done

if [ -z "${RUN_ID:-}" ]; then
  echo "==> 警告: 未检测到部署 workflow，但代码已推送。GitHub Actions 会自动处理。"
  exit 0
fi

# 轮询部署状态
while [ $(date +%s) -lt $DEADLINE ]; do
  RUN_STATUS=$(curl -sS --connect-timeout 20 \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/sikema302/Nano-Banana/actions/runs/$RUN_ID" \
    2>/dev/null | node -e "
      let raw='';
      process.stdin.on('data', chunk => raw += chunk);
      process.stdin.on('end', () => {
        try {
          const data = JSON.parse(raw);
          console.log(data.status + '|' + (data.conclusion || ''));
        } catch {}
      });
    " 2>/dev/null || true)

  STATUS="${RUN_STATUS%%|*}"
  CONCLUSION="${RUN_STATUS##*|}"
  echo "==> Deploy status: $STATUS conclusion=$CONCLUSION"

  if [ "$STATUS" = "completed" ]; then
    if [ "$CONCLUSION" = "success" ]; then
      echo "==> 部署成功!"
    else
      echo "==> 部署失败: $RUN_HTML_URL"
      exit 1
    fi
    break
  fi

  sleep 15
done

# 4. 健康检查
echo "==> 健康检查: $HEALTH_URL"
for i in $(seq 1 10); do
  if curl -fsS --connect-timeout 5 --max-time 15 "$HEALTH_URL" 2>/dev/null; then
    echo
    echo "==> 健康检查通过"
    exit 0
  fi
  sleep 3
done

echo "==> 健康检查未通过，但部署流程已完成"
exit 0