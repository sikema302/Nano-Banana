# 项目长期记忆 — Nano-Banana

## 部署 / CI

- 仓库:`github.com/sikema302/Nano-Banana`(公开),远程 origin,分支 main。
- 生产部署工作流:`.github/workflows/deploy-production.yml`("Deploy production"),push 到 main 或手动触发即部署到 23.141.172.73,pixory.top。
- CI 的 `Verify and build` 步骤 = `npm run lint`(`tsc --noEmit`)+ `npm run test:server` + `npm run build`(vite)。
  **改完代码本地必须跑这三步**,否则部署会在 Verify and build 阶段挂掉。
- 本地复现命令(用托管 node):
  `node node_modules/typescript/bin/tsc --noEmit`
  `node node_modules/tsx/dist/cli.mjs --test server/*.test.ts src/lib/*.test.ts`
  `node node_modules/vite/bin/vite.js build`
- 无 `gh` CLI;GitHub Actions 日志 API 需鉴权(403),只能靠本地复现定位失败原因。

## 环境限制(重要)

- 本机 sandbox 里 **git 无法执行**:任何方式调用 git.exe 都返回 127 / 0xC0000142(DLL 初始化失败),PowerShell 工具的输出也会被吞掉。
  → 涉及提交、推送、重跑 workflow 的操作只能让用户手动做;Agent 侧只负责改代码 + 本地验证。
- `dist/` 在 .gitignore 里,本地跑 `vite build` 不会污染工作区。

## 网络 / 服务器访问(重要)

- bash 沙箱 **没有直连外网**;唯一出网方式是本地 HTTP CONNECT 代理
  `http://127.0.0.1:49766`(环境变量 `http_proxy`/`https_proxy` 已设)。
  该代理**放行任意 host:port 的 CONNECT**(含 22),可当通用 TCP 隧道用。
- 隧道工具:`C:\Users\刘兆朋\.workbuddy\ssh-tunnel.mjs`
  → `node ssh-tunnel.mjs <listenPort> <targetHost> <targetPort>`,再 `ssh -p <listenPort> user@127.0.0.1`。
  注意:给 node 传路径要用 `C:/...`(用 `/c/...` 会变成 `d:\c\...` 报 MODULE_NOT_FOUND);
  后台常驻必须用 `run_in_background=true`,`&` 会随命令结束被杀。
- **SSH 登不上生产服务器 23.141.172.73**:22 端口 TCP 可连但 `kex_exchange_identification`
  阶段被 RST;同一条隧道连 github.com:22 正常 → 是服务器侧按来源 IP 拦截。
  源站 443 直连亦超时(疑似只放行 Cloudflare 回源)。
  → 需要服务器上的 shell 操作时,让用户在宝塔面板终端手动执行脚本。
- `WebFetch` 工具走宿主/云端网络,不受沙箱限制,能正常读 `https://pixory.top/api/health`。
- 生产环境自保逻辑:`DISK_WARNING_PERCENT=70`、`DISK_EMERGENCY_PERCENT=85`;
  磁盘 ≥85% 会按 mtime 删 `uploads/generated` 最旧原图直到降到 80%,日志打 `[disk-emergency:*]`。
- 只读磁盘诊断脚本:`scripts/disk-audit.sh`。

## 生图失败的口径与约定(重要)

- **失败必须按阶段归因**,不要再用「积分扣款状态暂时无法确认」这类笼统话:
  归因逻辑在 `server/generation-failure.ts`(纯函数 + `generation-failure.test.ts`)。
  阶段:`upstream`(上游没出图) / `persist`(图没落盘,也未扣款) / `charge`(图在、钱没扣)
  / `post-charge`(图在、钱已扣)。
- `generation_requests` 两个字段的分工:`result_message` = 人话结论(后台单元格),
  `error_detail` = 真实技术根因,格式 `stage=xxx <原始报错>`(后台 tooltip)。
  `markGenerationRequestFailed` **绝不能**用 message 覆盖 error_detail(旧代码就是这么埋掉根因的)。
- 生图主链路顺序(`/api/generate` 约 9230-9250 行):callImageGeneration → persistGeneratedImage
  → debitUserCredits → 写历史。「成功才扣款」是有意设计,失败只释放预留、从不扣款。
- `R2_LOCAL_FALLBACK`(默认 true):R2 重试 3 次全挂时把已生成的图写本地 `uploads/generated/`
  并照常交付(上游已计费,不能白丢)。计数与最近原因暴露在 `/api/health.generatedImageStorage`,
  日志 `[r2-fallback]`。置 false 恢复严格 R2-only。
- `/api/health` 是本项目最省事的线上只读探针;本地冒烟:`PORT=3999 node node_modules/tsx/dist/cli.mjs server/index.ts`。

