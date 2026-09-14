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
