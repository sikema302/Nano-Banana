# 服务器切换为纯 SQLite（含 R2 异地备份）— 可执行部署步骤

> 目标：将生产环境 `/var/www/nano-banana` 从 `DATABASE_PROVIDER=supabase` 原子切换到 `sqlite`，
> 数据采用**服务器自主迁移**（从 Supabase 拉取最新数据到本机 `data/app.sqlite`），并启用 R2 异地加密备份。
> 全程遵循现有 deploy.sh 零停机机制，具备秒级回滚。目标耗时约 15–20 分钟。

---

## 0. 前置确认（只读，不改变状态）

```bash
cd /var/www/nano-banana
PROJECT=/var/www/nano-banana
echo "== 当前数据库提供者 =="
grep -E '^(DATABASE_PROVIDER|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|JUNLIAI_BASE_URL)=' .env.local
echo "== 本地库现状 =="
ls -lh data/app.sqlite 2>/dev/null || echo "本机无 app.sqlite（Supabase 权威，正常）"
echo "== R2 是否已配置（异地备份前提）=="
grep -E '^R2_(ACCOUNT_ID|BUCKET_NAME)=' .env.local || echo "R2 未配置——切换仍可完成，但 R2 异地上传会惰性跳过（需部署后补配）"
echo "== 确认线上进程名与健康检查地址 =="
pm2 jlist 2>/dev/null | grep -o '"name":"[^"]*"' | head -5   # 期望含 nano-banana
```

**判定标准**
- `DATABASE_PROVIDER` 应为 `supabase`（本次要改为 `sqlite`）。
- `SUPABASE_SERVICE_ROLE_KEY` 必须存在（迁移脚本需要）。
- 存在 `nano-banana` 进程；健康地址为 `https://pixory.top/api/ready`。

> 若 `DATABASE_PROVIDER` 已是 `sqlite`，说明此前已切换过，请先人工确认再继续，避免重复迁移。

---

## 1. 发布最新代码 + 备份现场（可随时回退）

先在本工作区触发一次部署到服务器，确保服务器拿到含迁移脚本、SQLite/R2 支持的最新代码（本仓库 `scripts/migrate-supabase-to-sqlite.ts`、`server/r2-backup.ts` 均已就绪）。

触发方式（本工作区）：
```powershell
# 方式 A：推送空提交触发 GitHub Actions "Deploy production"
git add -A
git commit --allow-empty -m "chore: prep server sqlite migration (scripts+migration)"
git push origin main
# 方式 B：在服务器手工执行等价入口
# bash deploy.sh   # 需服务器可访问仓库 release 包
```

发布完成后，在服务器做现场快照（**必须在切换前**）：
```bash
cd /var/www/nano-banana
TS=$(date +%Y%m%d%H%M%S)
cp .env.local ".env.local.bak-supabase-$TS"            && chmod 600 ".env.local.bak-supabase-$TS"
[ -f data/app.sqlite ] && cp data/app.sqlite "data/app.sqlite.bak-supabase-$TS"
echo "== 快照完成 =="
ls -lh .env.local.bak-supabase-* data/app.sqlite.bak-supabase-* 2>/dev/null
```

此时进程仍是 supabase 权威，线上不受影响。

---

## 2. 服务器自主迁移（核心，校验通过才产出）

```bash
cd /var/www/nano-banana
npm run db:migrate:sqlite 2>&1 | tee /tmp/sqlite-migrate.log
```

**预期输出**（各表行数 + 校验 + 加密备份路径 + sha256）：
```json
{
  "outputFile": "/var/www/nano-banana/data/app.sqlite.next",
  "bytes": 16642048,
  "counts": { "users": 817, "invite_codes": 1080, "generation_requests": 7000, "...": "..." },
  "backup": { "filePath": "/var/www/nano-banana/data/migration-backups/pre-migration-full-....sqlite.gz.enc", "sha256": "..." }
}
```

**成功判定**
- 命令退出码为 `0`，且末尾输出了完整 JSON（含 `counts` 与 `backup`）。
- `data/app.sqlite.next` 已生成（非空）。
- `data/migration-backups/pre-migration-full-*.sqlite.gz.enc` 已生成。

> 脚本内置 4 级校验：各表行数一致、主键摘要一致、积分合计一致、`PRAGMA integrity_check=ok`。
> 任何校验失败会**自动中止**，且不会覆盖现有 `data/app.sqlite`，安全。
> 若脚本报网络错误，检查 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 与服务器出网连通性，修复后重跑即可。

---

## 3. 原子切换（零停机，秒级可逆）

```bash
cd /var/www/nano-banana
set -euo pipefail

# 3.1 保留旧库兜底（若存在）
[ -f data/app.sqlite ] && mv data/app.sqlite data/app.sqlite.bak-pre-sqlite
# 3.2 用迁移库原子替换（同目录 mv，进程运行中重启也不冲突）
mv data/app.sqlite.next data/app.sqlite
chmod 600 data/app.sqlite

# 3.3 切换数据库提供者（deploy.sh 不会覆盖该项，仅本次手动改）
sed -i 's/^DATABASE_PROVIDER="supabase"/DATABASE_PROVIDER="sqlite"/' .env.local
chmod 600 .env.local

# 3.4 核对结果
echo "== DATABASE_PROVIDER =="
grep '^DATABASE_PROVIDER=' .env.local
echo "== 新库信息 =="
ls -lh data/app.sqlite
```

**成功判定**
- `DATABASE_PROVIDER="sqlite"`。
- `data/app.sqlite` 为迁移后的非空文件（约 15MB+）。

---

## 4. 触发发布（走既有零停机链路）

```bash
cd /var/www/nano-banana
# 若 CI 已完成发布，仅需重启进程使 .env 生效：
timeout --signal=TERM --kill-after=5s 30s pm2 restart nano-banana --update-env
# 若此前未通过 CI 发布新代码，则先 bash deploy.sh（内含写 running 状态 → restart → 超时 delete+start 兜底）
```

> 不推荐使用 `pm2 reload --wait-ready`（历史已知会挂起，本项目未发送 ready 信号）。
> 用 deploy.sh 内部的重启逻辑或上面的 `pm2 restart --update-env` 均可，二者都满足零停机。

---

## 5. 验证

```bash
# 5.1 健康检查（连读 3 次成功）
for i in $(seq 1 6); do
  curl -fsS --connect-timeout 5 --max-time 15 https://pixory.top/api/ready && echo && break
  sleep 3
done

# 5.2 后端确认 provider（可通过日志/管理后台数据概览）
pm2 logs nano-banana --lines 50 --nostream | grep -iE 'sqlite|provider' || true

# 5.3 R2 异地备份（R2 已配时应自动随每日备份上传）
sleep 2  # 等待调度器首轮
ls -lh data/sqlite-backups/ | tail -5        # 出现 daily-*.sqlite.gz.enc
# 在 Cloudflare R2 控制台确认 backups/sqlite/daily/*.enc 已存在（R2 已配时）
```

**判定标准**
- 健康检查通过。
- 管理后台数据（用户数、生图记录、积分）自本地 SQLite 正常读出（数值应与迁移 `counts` 一致）。
- 若 R2 已配：`data/sqlite-backups/` 与 R2 均出现加密备份文件；R2 未配则本地备份仍正常、异地静默跳过（见阶段 0 备注）。

---

## 6. 回滚预案（任意阶段失败/异常可在 15 分钟内恢复）

```bash
cd /var/www/nano-banana
set -euo pipefail

# 恢复到 Supabase 权威（Supabase 数据始终在远端，不丢数据）
sed -i 's/^DATABASE_PROVIDER="sqlite"/DATABASE_PROVIDER="supabase"/' .env.local
chmod 600 .env.local
# 还原本地库快照（可选；Supabase 权威时本地库非必需）
NEWEST_BAK=$(ls -t data/app.sqlite.bak-supabase-* 2>/dev/null | head -1)
[ -n "$NEWEST_BAK" ] && mv "$NEWEST_BAK" data/app.sqlite

pm2 restart nano-banana --update-env
echo "== 已回滚到 supabase =="
grep '^DATABASE_PROVIDER=' .env.local
```

> 若只是想撤销"切换"而保留 SQLite 已迁移数据：替换上表第 1 步为 `mv data/app.sqlite.bak-pre-sqlite data/app.sqlite`。

---

## 7. 附：关键文件与命令速查

| 事项 | 路径/命令 |
|------|-----------|
| 项目目录 | `/var/www/nano-banana` |
| 迁移脚本 | `npm run db:migrate:sqlite`（`scripts/migrate-supabase-to-sqlite.ts`） |
| 关键库 | `/var/www/nano-banana/data/app.sqlite` |
| 配置 | `/var/www/nano-banana/.env.local` |
| 配置快照 | `.env.local.bak-supabase-<时间戳>` |
| 旧库快照 | `data/app.sqlite.bak-supabase-<时间戳>` / `bak-pre-sqlite` |
| 迁移加密备份 | `data/migration-backups/pre-migration-full-*.sqlite.gz.enc` |
| 每日异地备份 | 本地 `data/sqlite-backups/daily-*` → R2 `backups/sqlite/daily/*` |
| 线上入口 | `https://pixory.top/api/ready` |

---

## 8. 注意事项

- **执行顺序不可颠倒**：先 阶段1 快照 → 阶段2 迁移 → 阶段3 切换 → 阶段4 发布。
- **不覆盖线上数据**：迁移产出 `.next` 并在校验通过后才替换；替换用 `mv` 原子操作。
- **R2 非阻塞**：即使服务器暂未配 `R2_*`，切换和开启 SQLite 都不受影响（惰性跳过），可后续补配再自动异地。
- **deploy.sh 行为**：它只更新固定 key（nano-lite/flux/schat/deploy-secret/R2_*），不会改动 `DATABASE_PROVIDER` 与 `SUPABASE_*`；`data/` 目录不会被 deploy.sh 清理。