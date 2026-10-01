# 侧栏三个分区增加「打包下载 / 压缩下载 / 全部舍弃」

## Context

创作页右侧的收藏区、备份区、丢弃区目前只有一个动作按钮（下载 / 全部合并 / 清空）。参考竞品截图，收藏区需要变成 **打包下载 + 压缩下载 + 全部舍弃** 三个并排的文字按钮，备份区需要加 **全部舍弃**。现状里 `downloadBatchImages` 只是把 N 张图错开触发 N 次单文件下载（浏览器会连弹 N 个下载），没有任何 zip 能力；`handleMergeAll` 更只是个 `window.alert` 占位实现。

目标：把「多图下载」做成一个真正的 zip 包，并让「全部舍弃」把图移进丢弃区。

## 已确认的决策

| 项 | 决定 |
| --- | --- |
| 「全部舍弃」语义 | **移到丢弃区**（可恢复），不是永久删除 |
| 打包实现位置 | **服务端**打包（前端只管发起 + 接收），复用后端已有的 `sharp` |
| 「压缩」含义 | 长边压到 **2048px**（`withoutEnlargement`）+ JPEG 质量 **72**（mozjpeg） |
| 按钮分配 | 收藏区：打包下载 / 压缩下载 / 全部舍弃；备份区：全部舍弃；丢弃区：不动，保持「清空」 |
| zip 依赖 | **不新增 npm 依赖**，用 Node 内置 `node:zlib` 手写 ZIP 容器（环境里没有 archiver/jszip/fflate，且我无法执行 npm install，缺模块会导致服务起不来） |

## 服务端改动

### 新增 `server/zip-archive.ts`（纯函数，无副作用）

```ts
export function crc32(buf: Buffer, seed?: number): number;
export function sanitizeZipEntryName(raw: string, fallback: string): string;
export function uniqueZipEntryName(name: string, used: Set<string>): string;
export function buildZipArchive(
  entries: Array<{ name: string; data: Buffer }>,
  modifiedAt?: Date,
): Buffer;
```

ZIP 字节布局（每个 entry 已知 CRC 与长度，**不使用 data descriptor**）：

- **Local file header**：`0x04034b50`、versionNeed=20、gpFlag=`0x0800`(UTF-8)、method=8(deflate) 或 0(store)、modTime、modDate、crc32、compSize、uncompSize、nameLen、extraLen=0、name
- **Central directory**：`0x02014b50`、versionMade=`(3<<8)|20`、versionNeed=20、flag、method、time、date、crc、compSize、uncompSize、nameLen、extra=0、comment=0、diskStart=0、internalAttr=0、externalAttr=`0x81A40000`(0644)、relOffset、name
- **EOCD**：`0x06054b50`、disk=0、cdDisk=0、entries×2、cdSize、cdOffset、commentLen=0

实现要点：

- 压缩用 `deflateRawSync(data, { level: 6 })`（**必须 `deflateRaw`**，ZIP 存的是裸 deflate 流，不能带 zlib 头）；若 `deflated.length >= data.length` 则退回 store（method=0）——JPEG/PNG/WebP 几乎必然走 store，省 CPU 且不会变大
- CRC-32 用多项式 `0xEDB88320`，模块加载时预生成 256 项表；`crc = 0xFFFFFFFF` 起，逐字节 `crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8)`，收尾 `(crc ^ 0xFFFFFFFF) >>> 0`，以 `writeUInt32LE` 小端写入
- DOS 时间：`time = (h<<11)|(m<<5)|(s>>1)`、`date = ((y-1980)<<9)|(mo<<5)|d`，年份钳制到 ≥1980
- 不需要 ZIP64：写入前断言 `entries.length <= 0xFFFF && totalSize < 0xFFFFFFFF`，超限抛错

### 新增 `server/zip-archive.test.ts`

沿用仓库既有 colocated 测试风格（`npm run test:server` 会跑 `server/*.test.ts`，用 `node:test`）。断言：EOCD/中央目录签名存在、`crc32(Buffer.from('hello')) === 0x3610a686`、store 与 deflate 两种模式各自能回读出原始字节。

### 修改 `server/index.ts`

**A. 顶部 import**：`buildZipArchive` 等；`sharp` 已在第 18 行顶层导入；`pooledFetch` 来自 `server/pooled-fetch.ts`。

**B. 新增路由**，插在 9235 行之后（紧跟现有单图下载接口，这样能直接复用同作用域内的 `recordDownloadTiming`）：

```ts
app.post('/api/user/assets/download-zip', requireDownloadAuth, async (req, res) => { ... });
```

请求体：`{ sources: string[], names?: string[], mode?: 'original' | 'compressed', suggestedName?: string }`

处理链：

1. 校验 `sources` 是非空数组，条数上限 `MAX_ZIP_SOURCES = 30`，超限返回 413
2. 逐源 `findOwnedAssetSource(req, source)`（index.ts:6198）做**归属校验**——查不到即视为无权/不存在，直接 404，防止越权打包别人的图
3. `mapWithConcurrency`（index.ts:8283，**已存在的本地函数，直接复用，不要新写**）以并发 4 取字节，每个源复刻现有单图接口的三段解析优先级：
   - `parseInlineDataAsset`（6230）→ 内联 `data:` 直接拿到 buffer
   - `resolveLocalAssetPath`（6239）→ `fs.readFile`
   - `resolveRemoteAssetUrl`（6252）→ **用 `pooledFetch(url, {}, { baseUrl, maxConcurrent, timeoutMs })`** 拉取（注意：`pooledFetch` 的信号量在响应头到达时就释放，只限制「抢 header」的并发，所以外层仍需 `mapWithConcurrency` 限流）
4. `mode === 'compressed'` 时逐张压缩：
   `sharp(buffer, { failOn: 'none', limitInputPixels: 1e8 }).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })`；`metadata.hasAlpha` → `.png({ compressionLevel: 9, palette: true })` 保留透明，否则 `.jpeg({ quality: 72, mozjpeg: true })`；SVG/GIF/AVIF/视频等 sharp 解不了的 **catch 后回退原始字节**
5. 条目名：`sanitizeZipEntryName` 做 `path.basename`（同时切 `/` 与 `\`）、去控制字符与 `..`、截断 100 字符，重名走 `uniqueZipEntryName` 加 `-2` 后缀，兜底 `image-N.ext`
6. 单个源失败只 `console.warn` 跳过（一张死链不该毁掉整包）；全部失败才返回 404
7. `buildZipArchive(...)` 得到 buffer 后：`Content-Type: application/zip`、`Content-Disposition: attachment; filename="<ASCII 安全名>.zip"`（沿用 9160 的 `replace(/[^a-zA-Z0-9._-]+/g,'-')` 防头注入）、`Cache-Control: private, no-store`、`res.send(buffer)`
8. 调一次 `recordDownloadTiming` 记聚合结果（bytes / lookupMs / readMs / totalMs / ok）

内存与体积：缓冲 N 张图 + 打包副本约 2×，硬上限 `MAX_ZIP_SOURCES = 30`、解压后总量 ≤ 200MB，超出 413。CRC 与中央目录要求先掌握全量，所以是「缓冲后 `res.send`」而非流式。`compression()` 中间件对 `application/zip` 不压缩（mime-db 标 `compressible:false`），不会双重压缩、Content-Length 保留。

## 前端改动

### `src/lib/api.ts`：新增 `downloadArchiveAsZip`

与 `downloadViaServer`（394 行）同构，POST `/api/user/assets/download-zip` 拿 blob：

```ts
export async function downloadArchiveAsZip(
  sources: string[],
  names: string[],
  mode: 'original' | 'compressed',
  suggestedName: string,
): Promise<Blob>;
```

沿用现有 `fetchWithTimeout` / `toApiUrl` / `getApiErrorMessage` / `parseJsonPayload` / `getToken`。**超时要单独放宽到约 180s**（打包 N 张图比单图慢，不能沿用 `DOWNLOAD_TIMEOUT_MS = 60_000`）。

### `src/App.tsx`

**A. `SidePanel` 支持多个动作**（组件在 1076 行）

保留原有 `actionLabel` / `onAction` / `onBatchDownload` 分支不动（丢弃区继续用它），新增可选 prop：

```ts
actions?: Array<{
  key: string;
  label: string;
  tone?: 'default' | 'danger';
  loading?: boolean;
  onClick: (selectedItems: SavedImage[]) => void;
}>;
```

传了 `actions` 时，在标题行右侧并排渲染这几个按钮，样式沿用本组件已改好的小号淡色文字按钮（`rounded-md px-2.5 py-1 text-[11px]`，`tone='danger'` 走 red 系）。未选中任何图时 `selectedItems` 传全量，选中了就只对选中的图操作——这样现有的缩略图勾选能力继续有用，并在有选中时显示一个「已选 N 张 · 取消选择」的小提示。

**B. 新增打包下载处理函数**

```ts
async function downloadPanelArchive(
  items: SavedImage[],
  mode: 'original' | 'compressed',
  label: string,
) { ... }
```

内部：`downloadArchiveAsZip(items.map(i => i.imageUrl), items.map(i => i.prompt), mode, label)` → 成功后用 `triggerBlobDownload` 或直接把返回的 blob 存盘；失败走 `setNotice`。用一个新的 `packagingMode: null | 'original' | 'compressed'` state 驱动按钮 loading，避免重复点击。

**C. 新增「全部舍弃」处理函数**

```ts
async function discardAll(items: SavedImage[], fromLabel: string) { ... }
```

- 先 `window.confirm`（仓库既有的确认方式，见 2421/3425 行等 8 处，不新造弹窗组件）
- `Promise.all(items.map((item) => moveImage({ imageId: item.id, category: 'discarded' })))`——与 `clearCategory`（6295）用 `Promise.all` 的既有写法一致
- 成功后同步三个本地列表：从 `favorites` / `backup` 里剔除，并把返回的 `response.image` 前插到 `discarded`（照抄 `saveDisplayImage` 6232-6246 的状态同步方式）
- `setNotice('已移入丢弃区 N 张')`

**注意**：现有函数名叫 `moveSavedImageToMain`（6265），但它实际做的是**把图设为当前主图**，不是分类迁移，别被名字误导、也不要复用它做「舍弃」。

**D. 调用点接线**（7403-7455 三处）

- 收藏区：传 `actions={[打包下载, 压缩下载, 全部舍弃]}`，替换原来的 `actionLabel="下载"`；打包/压缩对选中项或全量生效，全部舍弃走 `discardAll(sideFavoriteItems, ...)`
- 备份区：传 `actions={[全部舍弃]}`，替换原来的 `actionLabel="全部合并"` 与 `handleMergeAll`
- 丢弃区：完全不动

**E. 顺带清理**：`handleMergeAll`（6398）在替换后不再被引用，把它的占位 alert 实现一并删除，避免留死代码。

## 验证

1. 静态检查：`npm run lint`（即 `tsc --noEmit`）+ `npm run build`
2. ZIP 单元测试：`npm run test:server`，确认 CRC 与回读断言通过
3. 本地起服务：`npm run dev:all`
4. 端到端：
   - 收藏区放 3–5 张图 → 点「打包下载」→ 得到一个 `.zip`，用资源管理器解开，逐张能正常打开
   - 点「压缩下载」→ 解开后对比文件体积明显变小、像素尺寸长边 ≤2048、透明 PNG 仍保留透明
   - 勾选其中 2 张 → 再点打包下载 → 压缩包里只有这 2 张
   - 备份区点「全部舍弃」→ 确认后图从备份区消失、出现在丢弃区，刷新页面后分类仍然正确（验证服务端真的落库，不是只有前端状态）
   - 边界：空分区点击各按钮不应报错；断网时点打包下载应给出 `notice` 而不是静默失败
5. 部署：本次改了 `server/index.ts`，需要 `npm run deploy:server` 重启后端才生效

## 限制说明

当前环境没有 node/npm，我无法执行 `tsc`、`vite build` 或 `npm run test:server`，上述命令需要你在本地跑一遍。手写 ZIP 容器的 CRC 与偏移量是最容易出错的地方，`server/zip-archive.test.ts` 就是为了把这块钉住。
