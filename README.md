# BANANAS AI Studio

基于原始截图风格实现的本地全栈 AI 图像生成网站。当前版本通过后端接入 Visionary / Banana 生图接口，支持本地用户、邀请码登录、历史记录、分类管理和管理员概览。

## 技术栈

- 前端：React + Vite + Tailwind CSS
- 后端：Node.js + Express
- 用户系统：本地 SQLite + JWT
- 图片数据：SQLite（通过 `sql.js` 持久化到本地文件）
- 图片生成：服务端调用 Visionary / Banana API

## 当前实现

- 全中文三栏工作台界面，保留原始截图的布局气质
- 注册 / 登录 / 退出
- 用户信息存储在本地 SQLite
- 支持邀请码登录
- 本地图片数据继续保存在 `SQLite`
- 模型选择：`GPT Image 2`、`Nano Banana2`、`Nano Banana Pro`
- 提示词生成图片，支持比例 `Auto`、`16:9`、`9:16`、`1:1`、`3:2`、`2:3`
- 参考图片上传、预览、删除，最多 3 张
- 主展示区生成中状态、生成结果展示、下载、满意 / 备份 / 丢弃
- 收藏区、备份区、丢弃区联动
- “全部合并”按钮可点击，会弹窗列出当前图片
- 本地数据库与本地图片文件持久化，重启后仍会保留

## 环境变量

在 `.env.local` 中配置：

```env
VISIONARY_API_KEY="your_optional_mock_key"
INVITE_CODES="BANANA2026"
ADMIN_USERNAMES="admin,HANYUN,hanyun"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_PUBLISHABLE_KEY="your_publishable_key"
SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your_publishable_key"
```

说明：

- `SUPABASE_SERVICE_ROLE_KEY` 只在服务端使用，不能暴露到前端
- 前端只会读取 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`

## 启动方式

先安装依赖：

```bash
npm install
```

一键同时启动前后端：

```bash
npm run dev:all
```

如果你想分开启动：

```bash
npm run dev:server
npm run dev
```

## Supabase 数据库部署

1. 在 Supabase 项目的 SQL Editor 执行 `supabase/migrations/20260426000000_init_bananas_ai.sql`
2. 确认 `.env.local` 已配置 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`
3. 同步本地 SQLite 数据到 Supabase：

```bash
npm run db:sync:supabase
```

说明：服务端仍保留本地 SQLite 读写作为运行时数据源；上面的迁移和同步脚本会把当前数据库结构与已有数据部署到 Supabase，方便后续切换运行时数据源或做云端备份。

前端地址：

```text
http://localhost:3000
```

后端地址：

```text
http://localhost:3001
```

## 构建与检查

类型检查：

```bash
npm run lint
```

前端生产构建：

```bash
npm run build
```

## 本地数据目录

- 数据库文件：`data/app.sqlite`
- 生成图片：`uploads/generated`
- 参考图片：`uploads/references`
- 演示示例图：`uploads/examples`

## 主要接口

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/models`
- `POST /api/generate`
- `GET /api/user/images?category=`
- `POST /api/user/images/move`
- `DELETE /api/user/images/:id`
- `GET /api/health`

说明：

- 除登录 / 注册 / 健康检查外，其余接口都需要 `Bearer Token`
- `POST /api/generate` 返回标准 JSON，不会再出现 `Unexpected end of JSON input`
- 生成后的图片默认不写入分类，只有点击“满意 / 备份 / 丢弃”后才进入数据库

## 用户迁移说明

当前版本不再使用本地 `users` 表作为登录源，而是：

1. 服务启动时读取本地旧用户
2. 将旧用户迁移到 Supabase Auth
3. 保留原始 `bcrypt` 密码哈希
4. 将本地图片记录的 `user_id` 映射到新的 Supabase 用户 ID

这样做的结果是：

- 登录注册都走 Supabase Auth
- 图片数据仍然是本地持久化
- 老的本地图片不会丢

## 后续接入真实模型的建议

当前后端已经为生成逻辑预留了统一入口：`POST /api/generate`。

如果后续接入真实模型，可直接替换 `server/index.ts` 中的模拟 SVG 生图逻辑，保留以下结构不变：

- 前端请求参数：`prompt`、`model`、`dimensions`、`reference_images`
- 后端响应结构：`{ image: { prompt, modelName, dimensions, imagePath, referenceImages, createdAt } }`
- 图片分类接口和本地图片数据库结构无需重写
