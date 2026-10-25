# 快速开始

<a id="quickstart"></a>

使用本站 API Key 接入图片、视频、文本和应用服务。先验证连接，再选择对应能力的接口。

<a id="prepare"></a>

## 接入准备

-   一个本站账号
    
-   一把可用的 API Key
    
-   选择要调用的模型或应用接口
    

<a id="api-key"></a>

## 1\. 创建 API Key

在工作台的 API 密钥页面创建密钥，并妥善保存。

[前往 API 密钥 →](/api-keys)

<a id="base-url"></a>

## 2\. 配置接口地址

OpenAI 兼容客户端的 Base URL 为 https://img.junliai.org/v1；手写 HTTP 请求时使用接口文档中的完整路径，避免重复拼接 /v1。Gemini 使用 /v1beta，MJ 使用本站根地址，应用接口使用各自文档给出的前缀。

<a id="first-call"></a>

## 3\. 验证连接与鉴权

先获取当前密钥可用的模型列表，确认连接与鉴权。

```bash
curl https://img.junliai.org/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

> 请勿在前端代码或公开仓库中暴露 API Key。

<a id="choose"></a>

## 4\. 选择接入能力

-   [图片生成与编辑](https://img.junliai.org/docs.md?page=images)
    
-   [视频生成](https://img.junliai.org/docs.md?page=video)
    
-   [文本对话](https://img.junliai.org/docs.md?page=text)
    
-   [MidJourney](https://img.junliai.org/docs.md?page=midjourney)
    
-   [ChatGPT 充值助手](https://img.junliai.org/docs.md?page=chatgpt-recharge)
    
-   [ChatGPT 退款助手](https://img.junliai.org/docs.md?page=chatgpt-refund)
    

# API Key 与权限

<a id="gateway-access"></a>

<a id="api-key-与权限"></a>

## 接口说明

在 [API 密钥](/api-keys) 页面为不同应用创建密钥，按需设置模型分组、累计消费上限、有效期和模型价格保护。所有密钥共享账户余额。不选分组可调用全部可用模型；选择分组后，模型列表与调用权限都限定在该分组内。

分组内的模型随管理员配置实时变化。调用组外模型返回 HTTP 403，OpenAI 兼容接口错误码为 `model_not_allowed`，不会扣费；空分组或已删除的分组没有可用模型，可在密钥编辑中重新选择或取消分组限制。

OpenAI 接口使用 `Authorization: Bearer YOUR_API_KEY`；Messages 也接受 `x-api-key`，Gemini 也接受 `x-goog-api-key`。密钥列表支持显示和复制完整值，脱敏预览不能用于调用。可用模型及协议以携带该密钥请求 `GET /v1/models` 的结果为准。

模型价格保护：图片按每张价格，视频按分辨率和时长计算的单次总价，按次文本按调用价格检查；按 token 文本可分别限制输入、输出和各类缓存单价（积分 / 百万 token），全部长上下文阶梯均须满足上限。未设置的模型或留空项不限价，0 仅接受免费调用，等于上限允许调用。超价返回 HTTP 400，错误码 `price_limit_exceeded`（Gemini 位于 `error.reason`），并附模型、价格项、当前价与上限；不执行请求、不扣费。排队任务提交和执行前均会检查，计费方式变更也会拒绝，需重新设置保护规则。

# 模型目录

<a id="models"></a>

<a id="模型目录"></a>

## 接口说明

GET /v1/models

下表保留已有模型的媒体能力与参考价格。各模型的可用接口及文本价格请在 [模型广场](/model-square) 查看；调用前携带密钥读取 `GET /v1/models` 确认访问范围。

 MODEL | 类型 | 能力 | 参考 | 价格 |
| --- | --- | --- | --- | --- |
 `gemini-nano-banana-2.1` 最新香蕉模型 | 图像 | 1K · 2K · 4K 比例 1:1 · 16:9 · 9:16 · 3:2 · 8:1 · 3:4 · 1:4 · 1:8 · 21:9 · 3:1 支持图生图 | 最多 10 张 | 8 积分 |
 `seedance-2.5` 不卡人脸，支持最多 30 张参考图和 10 段 MP3 音频，固定生成音轨。 | 视频 | 480p · 720p 比例 21:9 · 16:9 · 4:3 · 1:1 · 3:4 · 9:16 时长 4-25秒 | 参考图 | 50–80 积分/秒 |
 `veo-3.1-1080p` 最新一代gemini视频模型，支持1080p | 视频 | 1080p 比例 16:9 · 9:16 时长 8秒 | 参考图 · 首尾帧 | 12 积分/秒 |
 `nano-banana-pro` 适合品牌海报、信息图和需要保持主体一致的系列设计 | 图像 | 1K · 2K · 4K 比例 1:1 · 1:4 · 1:8 · 2:3 · 3:2 · 3:4 · 4:1 · 4:3 · 4:5 · 5:4 · 8:1 · 9:16 · 16:9 · 21:9 支持图生图 | 最多 10 张 | 8 积分 |
 `grok-imagine` | 图像 | 1K 比例 2:1 · 20:9 · 16:9 · 4:3 · 3:2 · 1:1 · 2:3 · 3:4 · 9:16 · 9:20 · 1:2 仅文生图 | — | 2 积分 |
 `imagine-2.0` | 图像 | 2K 比例 1:1 · 9:16 · 16:9 · 3:2 · 2:3 · 4:3 · 3:4 · 3:1 · 1:3 · 21:9 · 4:5 · 5:4 · 4:1 · 1:4 支持图生图 | 最多 4 张 | 3 积分 |
 `z-image-turbo` | 图像 | 2K 比例 1:1 · 4:3 · 3:4 · 1:3 · 3:1 · 2:3 · 3:2 · 9:16 · 16:9 仅文生图 | — | 5 积分 |
 `mj_zoom` | 图像 | 1K 比例 — 仅文生图 | — | 33 积分 |
 `mj_variation` | 图像 | 1K 比例 — 仅文生图 | — | 33 积分 |
 `mj_upscale_subtle` | 图像 | 1K 比例 — 仅文生图 | — | 33 积分 |
 `mj_upscale_subtile` | 图像 | 1K 比例 — 仅文生图 | — | 33 积分 |
 `mj_upscale_creative` | 图像 | 1K 比例 — 仅文生图 | — | 33 积分 |
 `mj_upscale` | 图像 | 1K 比例 — 仅文生图 | — | 13 积分 |
 `mj_reroll` | 图像 | 1K 比例 — 仅文生图 | — | 33 积分 |
 `mj_pan` | 图像 | 1K 比例 — 仅文生图 | — | 33 积分 |
 `mj_modal` | 图像 | 1K 比例 — 仅文生图 | — | 2 积分 |
 `mj_low_variation` | 图像 | 1K 比例 — 仅文生图 | — | 33 积分 |
 `mj_inpaint` | 图像 | 1K 比例 — 仅文生图 | — | 33 积分 |
 `mj_imagine` | 图像 | 1K 比例 — 仅文生图 | — | 33 积分 |
 `mj_high_variation` | 图像 | 1K 比例 — 仅文生图 | — | 13 积分 |
 `mj_describe` | 图像 | 1K 比例 — 仅文生图 | — | 12 积分 |
 `mj_custom_zoom` | 图像 | 1K 比例 — 仅文生图 | — | 33 积分 |
 `wan3.0-720p-mx10.5.0-gfapi` wans视频模型，官方api接口，支持720p | 视频 | 720p 比例 1:1 · 16:9 · 9:16 · 4:3 · 3:2 · 3:4 · 2:3 · 4:5 时长 4-30秒 · 8个档位 | 参考图 | 50 积分/秒 |
 `wan3.0-480p-mx10.5.0-gfapi` wan3视频模型，官方API接口，支持480p | 视频 | 480p 比例 1:1 · 16:9 · 9:16 时长 4-30秒 · 8个档位 | 参考图 | 30 积分/秒 |
 `wan3.0-1080p-mx10.5.0-gfapi` wan3视频模型，支持1080p，官方api接口 | 视频 | 1080p 比例 1:1 · 16:9 · 9:16 · 3:2 · 4:3 · 2:3 · 3:4 时长 4-30秒 · 8个档位 | 参考图 | 100 积分/秒 |
 `gpt-image-2-all` adobe渠道，全参数模型 | 图像 | 1K · 2K · 4K 比例 1:1 · 16:9 · 9:16 · 3:2 · 4:3 · 3:4 · 2:3 支持图生图 | 最多 10 张 | 9 积分 |
 `gpt-image-2.5-sunburst-all` adobe渠道，全参数模型 | 图像 | 1K · 2K · 4K 比例 1:1 · 16:9 · 9:16 · 3:2 · 4:3 · 3:4 · 2:3 支持图生图 | 最多 10 张 | 10 积分 |
 `gpt-image-2.5-flare-all` 全参数gpt-image-2模型，adobe渠道 | 图像 | 1K · 2K · 4K 比例 1:1 · 16:9 · 9:16 · 4:3 · 3:2 · 21:9 · 3:4 · 2:3 支持图生图 | 最多 10 张 | 8 积分 |
 `seedream-5.0-pro` | 图像 | 1K · 2K 比例 1:1 · 16:9 · 9:16 · 4:3 · 4:1 · 3:4 · 2:3 · 3:2 仅文生图 | — | 9 积分 |
 `gpt-6-sol` 通用文本处理与提示词优化 | 文本 | 协议以 /v1/models 声明为准 按 token 计费 | — | 输入 60 / 输出 300 积分/百万 token |
 `gpt-6.1-sol` 通用文本处理与提示词优化 | 文本 | 协议以 /v1/models 声明为准 按 token 计费 | — | 输入 60 / 输出 300 积分/百万 token |
 `kimi-k3` 通用文本处理与提示词优化 | 文本 | 协议以 /v1/models 声明为准 按 token 计费 | — | 输入 800 / 输出 4000 积分/百万 token |
 `gemini-3.8-flash` 通用文本处理与提示词优化 | 文本 | 协议以 /v1/models 声明为准 按 token 计费 | — | 输入 22.5 / 输出 112.5 积分/百万 token |
 `glm-5.3` 通用文本处理与提示词优化 | 文本 | 协议以 /v1/models 声明为准 按 token 计费 | — | 输入 440 / 输出 1540 积分/百万 token |
 `deepseek-v4.1-flash` 通用文本处理与提示词优化 | 文本 | 协议以 /v1/models 声明为准 按 token 计费 | — | 输入 80 / 输出 320 积分/百万 token |
 `claude-opus-5` 通用文本处理与提示词优化 | 文本 | 协议以 /v1/models 声明为准 按 token 计费 | — | 输入 500 / 输出 2500 积分/百万 token |
 `claude-fable-5-1` 通用文本处理与提示词优化 | 文本 | 协议以 /v1/models 声明为准 按 token 计费 | — | 输入 1000 / 输出 5000 积分/百万 token |
 `claude-sonnet-5-5` 通用文本处理与提示词优化 | 文本 | 协议以 /v1/models 声明为准 按 token 计费 | — | 输入 200 / 输出 1000 积分/百万 token |
 `claude-opus-5-5` 通用文本处理与提示词优化 | 文本 | 协议以 /v1/models 声明为准 按 token 计费 | — | 输入 400 / 输出 2000 积分/百万 token |
 `gpt-6-astra` 通用文本处理与提示词优化 | 文本 | 协议以 /v1/models 声明为准 按 token 计费 | — | 输入 300 / 输出 1500 积分/百万 token |
 `minimax-h3-optimized` 高稳定性，自部署版本，做了电商漫剧优化 | 视频 | — 比例 16:9 · 9:16 · 1:1 · 4:3 · 3:4 · 21:9 时长 4-15秒 | 参考图 · 首尾帧 | 10 积分/秒 |
 `veo-3.1-fast-1080p` | 视频 | 1080p 比例 16:9 · 9:16 时长 8秒 | 参考图 · 首尾帧 | 10 积分/秒 |
 `veo-3.1-fast` | 视频 | 720p 比例 16:9 · 9:16 时长 8秒 | 参考图 · 首尾帧 | 8 积分/秒 |
 `gpt-image-2.5-sunburst-firefly` adobe渠道，只支持medium质量 | 图像 | 1K · 2K · 4K 比例 1:1 · 16:9 · 9:16 · 5:4 · 4:3 · 3:2 · 3:1 · 3:4 · 2:3 支持图生图 | 最多 10 张 | 5 积分 |
 `gpt-auto` 通用文字助手，可以辅助整理绘图提示词 | 文本 | 协议以 /v1/models 声明为准 按次计费 | — | 0.1 积分/次 |
 `gpt-image-2.5-flare-firefly` adobe渠道，只支持medium质量 | 图像 | 1K · 2K · 4K 比例 1:1 · 16:9 · 9:16 · 4:3 · 3:2 · 3:4 · 2:3 支持图生图 | 最多 10 张 | 5 积分 |
 `gpt-image-2.5-flare` adobe渠道，图片质量 medium | 图像 | 1K 比例 1:1 · 16:9 · 9:16 · 5:4 · 4:3 · 3:2 · 4:5 · 3:4 支持图生图 | 最多 15 张 | 1 积分 思考 +1 积分/张 |
 `gpt-image-2.5-sunburst` 适合包含人物、物件与场景要求的主题创作 | 图像 | 1K 比例 1:1 · 16:9 · 9:16 · 4:3 · 21:9 · 3:1 · 4:5 · 3:4 · 1:4 支持图生图 | 最多 15 张 | 1 积分 思考 +1 积分/张 |
 `gpt-image-2.5` 适合日常设计、文章配图和视觉灵感探索 | 图像 | 1K 比例 1:1 · 16:9 · 9:16 · 5:4 · 4:3 · 3:2 · 21:9 · 8:1 · 4:5 · 3:4 · 2:3 · 1:3 支持图生图 | 最多 15 张 | 1 积分 思考 +1 积分/张 |
 `grok-image` 网页反代，和官网生图效果一致 | 图像 | 1K · 2K 比例 1:1 · 2:3 · 3:2 · 3:4 · 4:3 · 9:16 · 16:9 支持图生图 | 最多 3 张 | 1 积分 |
 `gpt-image-2-high` 高质量 gpt-image-2 模型 | 图像 | 1K · 2K · 4K 比例 1:1 · 5:4 · 9:16 · 21:9 · 16:9 · 4:3 · 3:2 · 4:5 · 3:4 · 2:3 支持图生图 | 最多 6 张 | 9 积分 |
 `veo-3.1` | 视频 | 720p 比例 16:9 · 9:16 时长 8秒 | 参考图 · 首尾帧 支持音轨 | 10 积分/秒 |
 `gpt-image-2` 适合概念设计、商品配图，以及根据具体要求修改已有画面 | 图像 | 1K 比例 1:1 · 16:9 · 9:16 · 4:3 · 3:4 支持图生图 | 最多 15 张 | 1 积分 思考 +1 积分/张 |
 `nano-banana-2` 适合日常设计、电商配图和同一主体的多场景创作 | 图像 | 1K · 2K · 4K 比例 1:1 · 1:4 · 1:8 · 2:3 · 3:2 · 3:4 · 4:1 · 4:3 · 4:5 · 5:4 · 8:1 · 9:16 · 16:9 · 21:9 支持图生图 | 最多 10 张 | 6 积分 |
 `firefly-gpt-image-2` adobe渠道，只支持medium质量 | 图像 | 1K · 2K · 4K 比例 1:1 · 5:4 · 9:16 · 21:9 · 16:9 · 4:3 · 3:2 · 4:5 · 3:4 · 2:3 支持图生图 | 最多 10 张 | 5 积分 |
 `grok-video` 网页反代，只支持6秒视频 | 视频 | 720p 比例 2:3 · 3:2 · 1:1 · 9:16 · 16:9 时长 6秒 | 无 | 2 积分/秒 |

实际扣费以请求参数、模型价格与账户规则为准。

 **列出模型**  `GET /v1/models`

```bash
curl https://img.junliai.org/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

# 积分与计费

<a id="user-balance"></a>

<a id="账户余额"></a>

## 账户余额

先确认账户可用积分

GET `/v1/user/balance` 查询账户余额

使用 API Key，获取账户余额与累计成功消费。

请求示例

```
curl 'https://img.junliai.org/v1/user/balance' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

响应示例200 OK

```
{
  "object": "user.balance",
  "balance": 120.5,
  "used": 30,
  "total": 150.5
}
```

`balance` 为可用积分；`used` 为累计成功消费，失败退款不计入；`total` 为两者之和，不代表累计充值。生成中的预扣费已从余额扣除，成功后才计入消费。

<a id="billing-rules"></a>

## 计费与退款

 **计费** 

生成前预扣积分；图像或视频生成失败会自动退回。视频计费方式由模型的 `video_billing_mode` 指定：`per_request` 按所选分辨率每条收费一次；`per_second`（默认）按单价乘以 `seconds` 计算。

 **文本** 

支持按次或按实际 token 结算，返回模型支持协议的原生 JSON / SSE。输入、输出和缓存分别计价；调用结束后未取得用量时自动释放预留，不扣费。

文本支持按 token 或按次计费，积分保留八位小数。按 token 请求会先预留额度，再按实际输入、输出、缓存用量结算；预留不是最终费用。停止或中断的请求自动按已收到的用量结算；未返回用量时自动释放预留、不扣费，可在“积分流水”查看明细并按密钥筛选。原生文本请求可传 `Idempotency-Key`；重复提交返回 409 和已有请求编号，不会重复扣费。

# WorkBuddy 接入

本文带你完成 WorkBuddy 的本站接入：先配置文本模型，再按需让 WorkBuddy 调用图片或视频接口。已有截图以 WorkBuddy V5.8.3 为例；不同版本的按钮位置可能略有变化，字段含义与本站接口地址保持一致。

<table style="min-width: 75px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th><p>你想完成的事</p></th><th><p>接入方式</p></th><th><p>从哪里开始</p></th></tr><tr><td><p>对话、写作、代码与任务规划</p></td><td><p>在 WorkBuddy 中添加本站文本模型</p></td><td><p>第 2 节</p></td></tr><tr><td><p>识别上传的图片</p></td><td><p>选用支持图片输入的文本模型，并开启对应能力</p></td><td><p>第 2 节的高级配置</p></td></tr><tr><td><p>生成或编辑图片</p></td><td><p>让 WorkBuddy 通过本地工具或技能调用本站图片 API</p></td><td><p>第 3 节</p></td></tr><tr><td><p>生成视频</p></td><td><p>让 WorkBuddy 提交视频任务、查询状态并下载结果</p></td><td><p>第 4 节</p></td></tr></tbody></table>

<a id="1-接入前的准备"></a>

## 1\. 接入前的准备

<a id="1-1-创建一把-workbuddy-专用密钥"></a>

### 1.1 创建一把 WorkBuddy 专用密钥

登录本站，进入 [API 密钥](/api-keys)，点击「创建密钥」，名称可填写 `WorkBuddy`，然后复制完整密钥。

-   只使用文本模型时，可将密钥绑定到「文字模型」分组。
    
-   还要调用图片或视频模型时，需要使用有相应模型权限的密钥。可以分别创建密钥，也可以不选分组，以访问账户可用的全部模型。
    
-   按需设置有效期、累计消费上限和模型价格保护；所有密钥共享账户余额。
    
-   配置时粘贴完整值。列表中的 `sk-••••••` 是脱敏显示，不能直接使用。
    

![在本站 API 密钥页面创建并复制 WorkBuddy 专用密钥](/admin/api/docs/wiki/assets/8dfe17e4-5801-4f88-942e-2a0c65bf3d89)

图 1：点击右上角「创建密钥」，创建后使用该行的「复制」。截图中的名称、余额和用量仅作界面示意。

<a id="1-2-选择文本模型并复制模型-id"></a>

### 1.2 选择文本模型并复制模型 ID

打开 [模型广场](/model-square)，选择「文字模型」分组，或切换到「文本」类型，查看当前可用模型、价格和状态。点击模型卡片中的「复制」，取得完整模型 ID。

例如，截图使用 `gpt-6-astra`。实际配置时以模型广场当前列出的 ID 为准，保留完整拼写、大小写和连字符，不自行添加前缀或版本后缀。

![在模型广场选择文字模型分组并复制完整模型 ID](/admin/api/docs/wiki/assets/0b9ecf2e-f516-4342-a111-ad2179a888f6)

图 2：箭头指向的是「模型 ID」复制按钮。原图标注的“完整域名”应理解为“完整模型 ID”；接口地址在下一节单独填写。

> 找不到文字模型时，先检查筛选条件。模型广场默认的「全部」类型在普通分组下隐藏文本模型；主动选择「文字模型」分组或「文本」类型即可查看。模型可见并不代表当前 API Key 有权限调用它。

<a id="1-3-确认账户余额与模型权限"></a>

### 1.3 确认账户余额与模型权限

在 [积分充值](/recharge) 查看余额并按需充值。密钥被禁用、已过期、达到消费上限或绑定了不包含目标模型的分组时，都无法正常调用。详细规则见 [API Key 与权限](https://img.junliai.org/docs.md?page=api-keys)。

<a id="2-在-workbuddy-中使用本站文本模型"></a>

## 2\. 在 WorkBuddy 中使用本站文本模型

<a id="2-1-打开自定义模型设置"></a>

### 2.1 打开自定义模型设置

1.  打开 WorkBuddy，点击左下角头像，进入「设置」。
    
2.  在设置中选择「模型」。
    
3.  点击「添加模型」，供应商选择「自定义 / Custom」。已有配置可以点击编辑图标修改。
    

![WorkBuddy 设置中的模型入口与添加模型按钮](/admin/api/docs/wiki/assets/b06096cf-cc55-4618-aafb-41769d5d777a)

图 3：按图中 1 → 2 → 3 的顺序进入添加模型页面。

<a id="2-2-填写接口地址-api-key-和模型名称"></a>

### 2.2 填写接口地址、API Key 和模型名称

<table style="min-width: 75px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th><p>配置项</p></th><th><p>填写内容</p></th><th><p>说明</p></th></tr><tr><td><p>供应商</p></td><td><p>自定义 / Custom</p></td><td><p>使用 OpenAI 兼容协议接入</p></td></tr><tr><td><p>接口地址</p></td><td><p><code>https://img.junliai.org/v1/chat/completions</code></p></td><td><p>完整文本对话接口地址</p></td></tr><tr><td><p>API Key</p></td><td><p>在本站复制的完整密钥</p></td><td><p>直接粘贴密钥，不添加 <code>Bearer </code>前缀</p></td></tr><tr><td><p>模型名称</p></td><td><p>从模型广场复制的完整模型 ID</p></td><td><p>例如截图中的 <code>gpt-6-astra</code></p></td></tr><tr><td><p>自定义协议</p></td><td><p>开启</p></td><td><p>让 WorkBuddy 直接使用已填写的完整地址</p></td></tr></tbody></table>

可复制的接口地址：

```text
https://img.junliai.org/v1/chat/completions
```

![WorkBuddy 自定义模型的接口地址、API Key、模型名称与高级配置](/admin/api/docs/wiki/assets/59af353b-5cf5-48c5-886d-14a471aa4c5c)

图 4：将图中的示例域名替换为上方本站地址。按照本文配置时，还需勾选「自定义协议」；原截图中该项尚未勾选。

> 本文采用“完整地址 + 开启自定义协议”的配置方式。不要把网站首页、文档链接或只有 `/v1` 的基础地址填进这个配置，也不要重复拼接 `/chat/completions`。

<a id="2-3-按模型能力设置高级配置"></a>

### 2.3 按模型能力设置高级配置

<table style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th><p>选项</p></th><th><p>如何设置</p></th></tr><tr><td><p>工具调用</p></td><td><p>让 WorkBuddy 读写文件、执行工具或完成多步任务时，需要选择支持工具调用的模型并开启该项。只勾选开关不会让模型获得原本不支持的能力。</p></td></tr><tr><td><p>图片输入</p></td><td><p>需要识别截图或照片时，选择支持图片输入的模型并开启。它表示“看图”，不等于图片生成。</p></td></tr><tr><td><p>思考模式</p></td><td><p>初次接入可先关闭，基本对话通过后再按所选模型支持情况开启。不要对所有模型统一勾选。</p></td></tr><tr><td><p>自定义协议</p></td><td><p>按本文使用完整接口地址时开启。</p></td></tr><tr><td><p>输入 / 输出</p></td><td><p>初次接入可留空，使用默认值；需要调整时，以模型支持的上下文和输出长度为准。</p></td></tr></tbody></table>

本站文本模型统一支持 `/v1/chat/completions`。不同模型的图片输入、工具调用、思考参数与上下文长度仍有差异，具体参见 [文本对话与原生协议](https://img.junliai.org/docs.md?page=text) 和模型详情。

<a id="2-4-测试连接-保存并选中模型"></a>

### 2.4 测试连接、保存并选中模型

1.  填写完成后点击「测试连接」。如果失败，按第 6 节检查接口地址、密钥、模型权限和余额。
    
2.  点击「保存」。
    
3.  回到对话页，在模型选择器的「自定义模型」中选中刚添加的模型。
    
4.  新建一个任务，发送一条简短消息，确认实际对话也能正常返回。
    

可使用下面的测试消息：

```text
请只回复“连接成功”，不要调用工具。
```

需要文件处理或多步任务时，再用一项简单操作验证工具能力，例如：

```text
请在我选定的工作目录中创建一个 workbuddy-test.txt 文件，写入“工具调用测试成功”，然后告诉我保存位置。
```

测试连接只说明该次检测通过；实际任务还可能涉及工具、图片输入或更长上下文，需要分别确认。测试及后续对话一旦发起模型调用，就可能产生本站费用。

<a id="2-5-添加或切换其他文本模型"></a>

### 2.5 添加或切换其他文本模型

重复「添加模型」流程，为每个模型填写对应的完整 ID。同一把 API Key 可以用于其权限范围内的多个模型。切换后先发一条简短消息验证；只有在对话中选中了本站自定义模型，相关文本请求才会使用这份配置。

<a id="3-通过-workbuddy-生成和编辑图片"></a>

## 3\. 通过 WorkBuddy 生成和编辑图片

<a id="3-1-先准备图片调用工具"></a>

### 3.1 先准备图片调用工具

文本模型负责理解需求、组织提示词和调用工具。生成图片还需要一个能向本站图片 API 发起请求的本地工具或 WorkBuddy 技能；仅添加文本模型并开启「图片输入」不会自动接入生图功能。

如果尚未配置，可以让 WorkBuddy 阅读本站公开文档并创建调用工具。根据所用版本，可在「专家·技能·连接器 → 技能 → 添加技能 → 创建技能」中描述需求。下面的说明也可作为任务需求交给 WorkBuddy，由其在你选定的目录中实现并说明安装步骤。

```text
请为我创建一个调用 Junli Studio 图片 API 的本地工具或 WorkBuddy 技能。

先阅读以下文档，再根据文档实现，不要猜测接口参数：
https://img.junliai.org/docs/images
https://img.junliai.org/docs/image-edit
https://img.junliai.org/docs/image-tasks
https://img.junliai.org/docs/image-results

要求：
1. API 基础地址使用 https://img.junliai.org/v1。
2. 密钥从本机环境变量 JUNLI_API_KEY 读取；请指导我在本机配置，不要让我把密钥发进聊天，也不要把密钥写入源码、技能正文或输出日志。
3. 先查询 /v1/models，确认模型 ID、密钥权限和支持的尺寸等参数。
4. 支持按文档提交文生图；参考图编辑按目标模型与对应文档实现。
5. 如果使用异步任务，保存任务 ID，持续查询至完成或失败，不能把“已提交”当成“生成成功”。
6. 成功后下载实际图片到我指定的目录，返回文件路径；失败时保留接口的具体错误说明。下载失败时先尝试重新下载已有结果，不重复提交生成。
7. 首次只完成工具创建和配置检查，列出一次生成需要的模型与参数，等我确认后再进行付费测试。
```

这里的 `JUNLI_API_KEY` 是供新建工具读取的本机环境变量名，并非 WorkBuddy 模型设置中的额外字段。工具读取的密钥需要包含图片模型权限；仅绑定「文字模型」的密钥不能直接用来生图。完成环境配置后，应确认 WorkBuddy 启动的工具进程能够读取该变量。

<a id="3-2-发起一次图片任务"></a>

### 3.2 发起一次图片任务

工具安装并启用后，可以这样描述需求，将占位内容换成你选定的模型与目录：

```text
请使用刚配置的 Junli Studio 图片工具，生成一张极简风格咖啡店宣传图。
模型：<从本站模型广场复制的图片模型 ID>
画面：暖色自然光、木质桌面、一杯拿铁，画面右侧留白，不添加文字。
比例：1:1；分辨率请选择该模型支持的一档。
生成前先列出最终模型、参数和当前价格；我确认后生成 1 张，下载到 <我的输出目录>。
```

需要修改已有图片时，提供参考图的本地路径或由工具支持的上传方式，并描述“保留什么、修改什么”。本地路径应由工具读取并转换成接口接受的文件或图像数据，不能直接当成服务器能访问的图片 URL。

<a id="3-3-选择正确的图片接口"></a>

### 3.3 选择正确的图片接口

<table style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th><p>需求</p></th><th><p>本站文档</p></th></tr><tr><td><p>普通文生图</p></td><td><p><a target="_blank" rel="noopener noreferrer" href="https://img.junliai.org/docs.md?page=images">生成图片</a>：<code>POST /v1/images/generations</code></p></td></tr><tr><td><p>参考图编辑</p></td><td><p><a target="_blank" rel="noopener noreferrer" href="https://img.junliai.org/docs.md?page=image-edit">编辑图片</a>：按模型支持的上传方式提交</p></td></tr><tr><td><p>较长时间的图片任务</p></td><td><p><a target="_blank" rel="noopener noreferrer" href="https://img.junliai.org/docs.md?page=image-tasks">异步图片任务</a>：<code>POST /v1/responses</code>，按文档设置后台任务并查询结果</p></td></tr><tr><td><p>获取和保存图片</p></td><td><p><a target="_blank" rel="noopener noreferrer" href="https://img.junliai.org/docs.md?page=image-results">图片结果与下载</a></p></td></tr><tr><td><p>MidJourney 生成、放大或变体</p></td><td><p><a target="_blank" rel="noopener noreferrer" href="https://img.junliai.org/docs.md?page=midjourney">MJ 接入概览</a>：使用 MJ 专用任务接口</p></td></tr></tbody></table>

MidJourney 的任务格式与普通图片接口不同。请在模型广场选择「MidJourney」分组查看对应模型，并让工具按 MJ 文档实现。

<a id="4-通过-workbuddy-生成视频"></a>

## 4\. 通过 WorkBuddy 生成视频

<a id="4-1-配置提交-查询和下载流程"></a>

### 4.1 配置提交、查询和下载流程

视频采用异步任务。WorkBuddy 的调用工具需要保存任务 ID，查询到完成后再下载；收到任务 ID 或 HTTP 200 都不代表视频已经生成成功。

可将下面的说明交给 WorkBuddy，为现有工具增加视频能力：

```text
请为本地 Junli Studio 调用工具增加视频功能。
先阅读：
https://img.junliai.org/docs/video
https://img.junliai.org/docs/video-results

基础地址为 https://img.junliai.org/v1，密钥继续从本机环境变量 JUNLI_API_KEY 读取。
请按文档实现：
1. 查询可用视频模型，核对该模型支持的分辨率、时长、比例及参考素材要求。
2. 使用 POST /v1/videos 提交任务，并立即记录返回的任务 ID。
3. 使用 GET /v1/videos/{id} 查询状态；等待期间适度间隔查询，不重新提交同一任务。
4. 完成后按文档下载结果；使用 /v1/videos/{id}/content 时，将响应作为视频二进制保存。
5. 如果任务失败，展示接口返回的具体原因；网络中断时先恢复已有任务的查询。
6. 返回最终视频文件路径与任务 ID。首次付费测试前先让我确认模型、时长、分辨率和费用。
```

<a id="4-2-提交创作需求"></a>

### 4.2 提交创作需求

```text
请使用 Junli Studio 视频工具制作一段咖啡产品短片。
模型：<从本站模型广场复制的视频模型 ID>
内容：镜头缓慢推近桌上的拿铁，杯口有轻微热气，暖色窗光，画面稳定。
从该模型支持的选项中，列出可用的时长、分辨率、画面比例及本次费用。
我确认后只提交 1 个任务，等待完成并下载到 <我的输出目录>。
```

图生视频还需要目标模型支持的参考图。不要把其他模型的时长、尺寸或素材限制直接套用过来。部分模型另有专用接口，应以模型详情及对应文档为准。

<a id="4-3-等待与取回结果"></a>

### 4.3 等待与取回结果

-   `queued`：任务已排队，继续查询。
    
-   `in_progress`：任务处理中，继续查询。
    
-   `completed`：任务已完成，可以获取结果。
    
-   `failed`：任务失败，查看返回的具体错误原因。
    

任务尚未完成时，内容下载接口可能返回 HTTP 409。若已生成成功但本地下载中断，优先用原任务 ID 或结果地址恢复下载。临时结果链接可能过期，完成后及时保存文件。

<a id="5-查看费用和使用记录"></a>

## 5\. 查看费用和使用记录

<table style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th><p>使用场景</p></th><th><p>在本站如何核对</p></th></tr><tr><td><p>文本对话、工具规划、多轮任务</p></td><td><p>在 <a target="_blank" rel="noopener noreferrer" href="/credit-usage">积分流水</a> 按 WorkBuddy 密钥筛选，查看模型、用量和费用</p></td></tr><tr><td><p>图片或视频生成</p></td><td><p>查看 <a target="_blank" rel="noopener noreferrer" href="/mylogs">生成日志</a> 中的任务与错误，并在积分流水核对扣费、退款</p></td></tr><tr><td><p>模型当前价格与可用状态</p></td><td><p>查看 <a target="_blank" rel="noopener noreferrer" href="/model-square">模型广场</a> 和 <a target="_blank" rel="noopener noreferrer" href="/status">实时监控</a></p></td></tr></tbody></table>

一次 WorkBuddy 任务可能包含多轮文本调用和一次或多次图片、视频生成，最终费用需要合并查看。文本支持按实际 token 或按次计费；图片、视频按所选模型与参数计费，以本站当前价格和积分流水为准。

文本调用不进入生成日志，也不在生成日志中保存对话内容。本站积分流水单独保留 30 天。预留费用不等于最终费用；退款及中断请求的结算规则见 [积分与计费](https://img.junliai.org/docs.md?page=billing)。WorkBuddy 客户端自身的套餐与功能规则以其产品说明为准。

<a id="6-常见问题与排查"></a>

## 6\. 常见问题与排查

<a id="测试连接失败或返回-404"></a>

### 测试连接失败或返回 404

先核对完整地址是否为 `https://img.junliai.org/v1/chat/completions`，并确认「自定义协议」已开启。检查是否多写了 `/v1`、重复了 `/chat/completions`，或误填了文档地址。地址正确后，再根据返回的错误文案确认模型 ID 与接口状态；不要把所有 404 都判断为密钥问题。

<a id="提示密钥无效-未授权或已过期"></a>

### 提示密钥无效、未授权或已过期

重新从本站 API 密钥页复制完整值，检查是否已禁用或过期。WorkBuddy 的 API Key 输入框只填写密钥，不填写 `Authorization:` 或 `Bearer` 。

<a id="提示无模型权限或-model_not_allowed"></a>

### 提示无模型权限或 `model_not_allowed`

检查密钥绑定的模型分组是否包含目标模型。文字模型密钥不能访问组外图片、视频模型。分组为空或已删除时限制仍然生效，需要在密钥编辑页重新选择分组或取消限制。

<a id="提示余额-消费上限或价格保护问题"></a>

### 提示余额、消费上限或价格保护问题

分别检查账户余额、该密钥累计消费上限和模型价格保护。`price_limit_exceeded` 表示当前模型价格超出了密钥设定的保护范围；先核对价格与保护项，再决定是否调整。提高 WorkBuddy 的输入或输出长度不会解除这些限制。

<a id="能聊天-但不能读写文件或调用工具"></a>

### 能聊天，但不能读写文件或调用工具

确认已在对话中选中本站自定义模型，并为支持工具调用的模型开启该选项。再检查 WorkBuddy 对当前目录及工具执行的权限。单纯的文本回复成功，不能证明完整的工具流程也已通过。

<a id="上传图片后报错-或模型看不到图片"></a>

### 上传图片后报错，或模型看不到图片

确认该模型支持图片输入，且 WorkBuddy 中已开启对应选项。检查图片格式、数量、大小和提交方式是否符合当前模型要求。需要 Base64 Data URL 的模型，应由工具按文档转换，不能直接传本地文件路径。

<a id="返回-400-或提示某个参数不支持"></a>

### 返回 400 或提示某个参数不支持

保留接口返回的具体原因，逐项检查对应参数。可以先关闭额外的思考或格式选项，使用最简单的文本请求验证，再逐步启用能力。不要为排错同时改动接口地址、密钥和模型名称。

<a id="出现-429-服务暂不可用或网络中断"></a>

### 出现 429、服务暂不可用或网络中断

按错误提示与实时监控判断是否需要降低并发、稍后重试或更换可用模型。对已提交的图片、视频异步任务，先查询原任务；结果未知时连续重新提交可能产生多次生成与费用。

<a id="模型回复-已生成-但没有实际图片或视频"></a>

### 模型回复“已生成”，但没有实际图片或视频

核对是否调用了对应媒体接口，是否取得真实任务 ID、完成状态和下载文件。只有文字描述或提示词不算生成结果；要求工具返回实际文件路径，或按接口文档提供可用的结果地址。

<a id="7-相关文档"></a>

## 7\. 相关文档

-   [API Key 与权限](https://img.junliai.org/docs.md?page=api-keys)：密钥、分组、有效期与价格保护。
    
-   [文本对话与原生协议](https://img.junliai.org/docs.md?page=text)：文本请求、工具调用与流式返回。
    
-   [生成图片](https://img.junliai.org/docs.md?page=images) · [编辑图片](https://img.junliai.org/docs.md?page=image-edit) · [异步图片任务](https://img.junliai.org/docs.md?page=image-tasks)。
    
-   [创建视频](https://img.junliai.org/docs.md?page=video) · [视频任务与下载](https://img.junliai.org/docs.md?page=video-results)。
    
-   [积分与计费](https://img.junliai.org/docs.md?page=billing) · [错误处理与重试](https://img.junliai.org/docs.md?page=errors)。
    
-   [WorkBuddy 官方模型配置说明](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Model)：客户端设置和自定义协议行为。
    
-   [WorkBuddy 官方技能说明](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)：技能创建、导入与启用方式。
    

# 生成图片

<a id="image-generation"></a>

<a id="文生图"></a>

## 文生图

`POST /v1/images/generations`

此 OpenAI 兼容接口不适用于 MidJourney（MJ）。MJ 请使用图像 API 下的 MJ 原生任务接口文档。其他模型发送提示词后同步返回图像结果。使用 `response_format: "url"` 获取临时地址，或使用 `b64_json` 获取内联内容。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `thinking` | `boolean` | 否 | 是否开启思考，默认 false。仅 thinking\_supported=true 的 ChatGPT 原生图片模型支持；开启后每张加收模型配置的 thinking\_price 积分，不支持时返回 400。思考模式按模型公布的附加价格计费，不重复扣费。 |
 `model` | `string` | 是 | 公开模型 ID，可从模型目录获取。 |
 `prompt` | `string` | 是 | 描述期望图像的文字提示。 |
 `n` | `integer` | 否 | 当前每次生成 1 张图片，n 默认 1；JSON 请求不接受其他数量。 |
 `size` | `string` | 否 | WIDTHxHEIGHT；必须落在模型支持的比例与分辨率内。 |
 `resolution` | `string` | 否 | 可选分辨率档位；优先使用模型目录和 size 对照表。 |
 `quality` | `string` | 否 | low、medium、high 或 auto；是否支持由模型能力决定，省略时使用模型默认值。 |
 `background` | `string` | 否 | transparent 透明背景、opaque 不透明背景、auto 默认行为。支持 Adobe GPT Image 系列；其他兼容图片模型以其能力为准，不支持时返回 400。 |
 `response_format` | `string` | 否 | url 或 b64\_json；省略时使用后台配置的默认值。 |

 **文生图**  `POST /v1/images/generations`

```bash
curl https://img.junliai.org/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "firefly-gpt-image-2",
    "prompt": "a corgi running in a golden wheat field, cinematic",
    "size": "1024x1024",
    "response_format": "url"
  }'
```

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="https://img.junliai.org/v1")
result = client.images.generate(
    model="firefly-gpt-image-2",
    prompt="a corgi running in a golden wheat field, cinematic",
    size="1024x1024",
    response_format="url",
)
print(result.data[0].url)
```

# 编辑图片

<a id="image-edit"></a>

<a id="图生图"></a>

## 图生图

`POST /v1/images/edits`

本节不适用于 MidJourney（MJ），MJ 使用原生任务接口。文件上传使用 `multipart/form-data`；Grok / xAI 的 JSON 编辑方式见[Grok 图像接口](https://img.junliai.org/docs.md?page=grok#grok-compat)。至少提供一张图片；只有模型目录标记为支持图生图的模型才可调用。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `thinking` | `boolean / form string` | 否 | 是否开启思考，默认 false。仅 thinking\_supported=true 的 ChatGPT 原生图片模型支持；开启后每张加收模型配置的 thinking\_price 积分，不支持时返回 400。思考模式按模型公布的附加价格计费，不重复扣费。 JSON 传布尔值；multipart 表单传 thinking=true 或 thinking=false。 |
 `image / image[]` | `file` | 是 | multipart 文件；至少一张，多张图片可重复 image 或 image\[\] 字段。 |
 `model` | `string` | 是 | 必须是模型目录标记为支持图生图的图片模型。 |
 `prompt` | `string` | 是 | 描述编辑目标或参考关系。 |
 `n` | `integer` | 否 | 当前每次生成 1 张图片，n 默认 1；JSON 请求不接受其他数量。 |
 `size` | `string` | 否 | WIDTHxHEIGHT；以模型目录中的能力为准。 |
 `resolution` | `string` | 否 | 可选分辨率档位；未声明时不要自行套用其他模型的尺寸表。 |
 `quality` | `string` | 否 | 与文生图接口相同。 |
 `background` | `string` | 否 | 与文生图相同；透明背景使用表单字段 background=transparent，JSON 编辑使用 "background": "transparent"。 |
 `response_format` | `string` | 否 | url 或 b64\_json；URL 无需再次携带 API Key。 |

 **图生图**  `POST /v1/images/edits · multipart`

```bash
curl https://img.junliai.org/v1/images/edits \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F model="gemini-nano-banana-2.1" \
  -F prompt="把这张图改成电影感光影" \
  -F image=@input.png \
  -F response_format=b64_json
# 多张参考图：重复 -F image=@reference.png
```

```python
import base64
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="https://img.junliai.org/v1")
result = client.images.edit(
    model="gemini-nano-banana-2.1",
    image=open("input.png", "rb"),
    prompt="把这张图改成电影感光影",
    response_format="b64_json",
)
with open("output.png", "wb") as output:
    output.write(base64.b64decode(result.data[0].b64_json))
```

# 透明背景与思考模式

<a id="transparent-background"></a>

<a id="透明背景"></a>

## 透明背景

文生图与图生图

选择 Adobe GPT Image 图片模型，例如 `firefly-gpt-image-2`，在请求中传 `"background": "transparent"`。图生图表单传 `background=transparent`；JSON 编辑同样支持该字段。`opaque` 请求不透明背景，省略或传 `auto` 使用模型默认行为。

提示词应明确主体独立、无桌面或场景背景；完整场景描述可能只让画面边缘透明。`response_format` 只决定返回 URL 还是 Base64，两种方式都保留原图透明度。保存时保留 PNG 等支持透明度的原始格式；不要转换成 JPEG，`transparent` 与 `output_format: "jpeg"` 同传会返回 400。

 **生成透明背景图片**  `POST /v1/images/generations`

```bash
curl 'https://img.junliai.org/v1/images/generations' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "gpt-image-2-high",
  "prompt": "一只独立的红色陶瓷杯，完整主体，透明背景，无桌面、无环境场景",
  "background": "transparent",
  "response_format": "b64_json"
}'
```

 **编辑为透明背景**  `POST /v1/images/edits · multipart`

```bash
curl 'https://img.junliai.org/v1/images/edits' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -F 'model=gpt-image-2-high' \
  -F 'prompt=保留图中主体，去掉背景，输出透明背景图片' \
  -F 'image=@input.png' \
  -F 'background=transparent' \
  -F 'response_format=b64_json'
```

使用 Base64 响应时，将 `data[0].b64_json` 解码后保存图片。此参数用于 `/v1/images/generations` 和 `/v1/images/edits`；`/v1/responses` 的布尔值 `background: true` 表示后台执行，当前不提供透明背景选项。

<a id="思考模式与附加费用"></a>

## 思考模式与附加费用

`thinking` 是独立布尔参数，不改变公开模型 ID。通过 `GET /v1/models` 查看 `thinking_supported` 和 `thinking_price`；当前价格可在模型目录查看。每张总价 = 当前用户的图片价格 + 开启思考时的附加积分；工作台另选去AI特征时再叠加对应费用。附加费默认 1 积分，可由管理员按模型修改，0 表示免费。

总价一并参与余额、API Key 额度和模型价格上限检查。生成失败按原扣费总额退款；后续调价不改变已有扣费的退款金额。请求按已确认的思考模式价格计费，不重复扣费。内容审核拒绝、请求取消及已提交但尚未确定结果的任务不会另起一笔生成。思考不保证更快或固定提升画质。

 **开启思考生图**  `POST /v1/images/generations`

```bash
curl 'https://img.junliai.org/v1/images/generations' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "gpt-image-2.5-flare",
  "prompt": "金色夕阳下的逆光人像",
  "thinking": true,
  "response_format": "url"
}'
```

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="https://img.junliai.org/v1")
result = client.images.generate(
    model="gpt-image-2.5-flare",
    prompt="金色夕阳下的逆光人像",
    response_format="url",
    extra_body={"thinking": True},
)
print(result.data[0].url)
```

Python OpenAI SDK 使用 `extra_body={"thinking": True}` 传递本站扩展参数。图生图表单加 `-F thinking=true`；后台图片任务在 `/v1/responses` 顶层同时传 `"background": true` 和 `"thinking": true`，两个开关互相独立。

调用前请携带密钥读取 [GET /v1/models](https://img.junliai.org/docs.md?page=models#models) 确认可用模型；生成请求会按所选模型计费。

# 异步图片任务

<a id="background-image"></a>

<a id="异步生图"></a>

## 异步生图

`POST /v1/responses`

本节不适用于 MidJourney（MJ）。这是公开的 Responses API 子集：仅用于后台图像任务，必须传 `background: true`，提交后通过任务 ID 轮询。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `thinking` | `boolean` | 否 | 是否开启思考，默认 false。仅 thinking\_supported=true 的 ChatGPT 原生图片模型支持；开启后每张加收模型配置的 thinking\_price 积分，不支持时返回 400。思考模式按模型公布的附加价格计费，不重复扣费。 放在请求顶层；后台任务保存该选项，幂等校验区分是否思考。 |
 `model` | `string` | 是 | 图片模型 ID。 |
 `background` | `boolean` | 是 | 必须为 true；当前公开的 Responses API 仅用于后台图像任务。 |
 `input` | `string \| array` | 是 | 提示词字符串，或包含 input\_text / input\_image 的消息数组。 |
 `input_image.image_url` | `string` | 否 | HTTP(S) URL 或 data:image/...;base64,...；不支持 file\_id。 |
 `size / quality` | `string` | 否 | 与同步图像接口使用相同的模型能力约束。 |
 `response_format` | `string` | 否 | url 或 b64\_json；完成结果格式与同步接口一致。 |
 `Idempotency-Key` | `header` | 否 | 用于避免后台任务重复提交；冲突时返回 422。 |

1 **提交** 返回 queued

2 **轮询** queued → in\_progress

3 **取结果** completed / failed / cancelled

 **异步生图**  `POST /v1/responses · 轮询 · 取消`

```bash
RESPONSE_ID=$(curl -s https://img.junliai.org/v1/responses \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Idempotency-Key: customer-order-123" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-nano-banana-2.1",
    "background": true,
    "response_format": "url",
    "input": [{"role":"user","content":[
      {"type":"input_text","text":"保持主体，改成电影光影"},
      {"type":"input_image","image_url":"https://example.com/reference.png"}
    ]}]
  }' | jq -r .id)

# 轮询 queued / in_progress，直到 completed
curl https://img.junliai.org/v1/responses/$RESPONSE_ID \
  -H "Authorization: Bearer YOUR_API_KEY"

# 尚未完成时可以取消
curl -X POST https://img.junliai.org/v1/responses/$RESPONSE_ID/cancel \
  -H "Authorization: Bearer YOUR_API_KEY"
```

<a id="responses-status"></a>

<a id="查询和取消异步任务"></a>

## 查询和取消异步任务

GET /v1/responses/{id} · POST /cancel

GET`/v1/responses/{id}`读取状态、错误和 output\[0\].result

POST`/v1/responses/{id}/cancel`取消尚未完成的任务

queuedin\_progresscompletedfailedcancelled

完成结果位于 `output[0].result`。如果使用 `response_format: "url"`，结果是临时 URL；使用 `b64_json` 时结果是内联内容。

参考图使用 `input_image.image_url`，支持 HTTP(S) URL 或 data URL，不提供 Files API 或 `file_id`。全局参考图上限为 15，模型还可能有更低限制。

# 图片结果与下载

<a id="image-record"></a>

## 查询生成记录

`url` 返回公开临时 URL，`b64_json` 返回内联 Base64。两种格式均建立生成记录，返回 `id` 和 `expires_at`。使用 API Key 请求 `GET /v1/images/{id}` 可查询状态及有效图片地址；过期后仍可查询生成记录。临时图片有效期以 expires\_at 为准。

<a id="image-results"></a>

<a id="读取公开图像"></a>

### 读取公开图像

`GET /v1/image-results/{id}`

当图像结果使用 URL 格式并落在本站临时存储时，可直接访问该地址，不需要 API Key。临时结果可能在下一个 UTC 零点到期，也可能保留最多 24 小时；以返回的 `expires_at` 为准。同时支持 `HEAD` 和 `Range`。

<a id="image-content"></a>

<a id="读取授权图像内容"></a>

### 读取授权图像内容

`GET /v1/images/{id}/content`

用于需要 API Key 校验的图像结果，返回图像原始二进制。请求必须携带生成该结果的 API Key。

# Gemini 图片接口

<a id="gemini-images"></a>

<a id="gemini-图片接口"></a>

## 接口说明

生图与编辑

本文介绍 Gemini 兼容接口，使用 Gemini GenerateContent 格式调用本站图片模型，API 地址为 `https://img.junliai.org/v1beta`。

GET`/v1beta/models`支持 Gemini 协议的模型列表

GET`/v1beta/models/{model}`读取单个 Gemini 模型

POST`/v1beta/models/{model}:generateContent`生图与编辑，返回内联图片

POST`/v1beta/models/{model}:streamGenerateContent?alt=sse`SSE 生图，出图后返回完整结果事件

API Key 使用本站密钥，可放在 `x-goog-api-key`、`Authorization: Bearer` 或 `?key=` 中。响应图片位于 `candidates[].content.parts[].inlineData`。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `contents` | `array` | 是 | 图文消息，使用 user / model 角色；最多 128 条。 |
 `contents[].parts[].text` | `string` | 是 | 提示词。图生图时在同一 parts 数组中加入 inlineData。 |
 `contents[].parts[].inlineData` | `object` | 否 | 参考图：mimeType 与纯 base64 data；支持 PNG、JPEG、WebP、GIF，每张不超过 25 MiB，数量受模型配置限制。 |
 `generationConfig.responseModalities` | `array` | 否 | 支持 \["IMAGE"\] 或 \["TEXT", "IMAGE"\]；省略时请求图文输出。 |
 `generationConfig.imageConfig.aspectRatio` | `string` | 否 | 如 1:1、16:9；显式值必须在模型支持范围内。 |
 `generationConfig.imageConfig.imageSize` | `string` | 否 | 1K / 2K / 4K，省略按 1K 校验与计费；不支持的档位直接报错。 |
 `generationConfig.candidateCount` | `integer` | 否 | 当前仅支持 1。按一次请求及所选分辨率计费，候选数不是图片张数。 |

单次请求上限 100 MiB。多轮编辑需模型声明支持对应能力；将上一轮完整的 model content（包括 thoughtSignature）加入下一轮 contents。单轮模式支持文字和参考图；不支持的高级请求会明确报错。当前不提供 Files API、countTokens、工具调用或 512 分辨率。

流式地址为 `/v1beta/models/{model}:streamGenerateContent?alt=sse`：等待期间发送 SSE 心跳，出图完成后发送一个完整的 Gemini 结果事件并结束连接。无图或内容拒绝退回生图费用，并保留 Gemini 的 promptFeedback / finishReason；不伪造 token 用量。

sub2api 接入：选择 Gemini 平台与 API Key 账号，Base URL 填本站根地址 `https://img.junliai.org`（不加 /v1 或 /v1beta），填写本站 Key，并将测试模型和模型映射设为本站实际开放的图片模型。

 **Gemini 兼容 · 生图与编辑**  `POST /v1beta/models/{model}:generateContent`

```bash
curl 'https://img.junliai.org/v1beta/models/firefly-gpt-image-2:generateContent' \
  -H 'x-goog-api-key: YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "生成一只坐在窗边的橘猫，摄影风格"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "TEXT",
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "1:1",
      "imageSize": "1K"
    }
  }
}'
```

# Grok 图像接口

<a id="grok-compat"></a>

<a id="grok-图片与视频"></a>

## 接口说明

生图、编辑与视频

本站提供 Grok / xAI 通用图片与视频接口，支持文生图、JSON 图片编辑、文生视频和参考图生视频，可供 sub2api 等兼容下游调用。API 地址为 `https://img.junliai.org/v1`，使用本站 API Key，通过 `Authorization: Bearer YOUR_API_KEY` 鉴权。

请求使用 `application/json`；图片请求体上限 100 MiB，视频请求体上限 50 MiB。参考图支持 PNG、JPEG、WebP，每张最多 25 MiB，张数还受模型限制。模型、时长、比例和分辨率以本站模型目录为准。

POST`/v1/images/generations`Grok / xAI JSON 文生图

POST`/v1/images/edits`Grok / xAI JSON 图片编辑，兼容 sub2api

<a id="图片生成与编辑"></a>

### 图片生成与编辑

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `model` | `string` | 是 | 本站已启用的图片模型 ID，可通过 /v1/models 获取；以本站模型目录为准。 |
 `prompt` | `string` | 是 | 生成或编辑图片的文字指令。 |
 `n` | `integer` | 否 | 默认 1，目前仅支持 1；其他值会报错，不会多扣费或静默少返回。 |
 `aspect_ratio` | `string` | 否 | 如 1:1、16:9，需符合模型能力；auto 按模型能力决定，默认使用模型比例。 |
 `resolution` | `string` | 否 | 1k / 2k，默认 1k；需启用对应计费档位，也接受 1K / 2K。 |
 `response_format` | `string` | 否 | url 或 b64\_json；Grok 请求默认 url，结果位于 data\[\].url 或 data\[\].b64\_json。 |
 `image.url / images[].url` | `string` | 编辑必填 | 单图使用 image，多图使用 images；支持公网 HTTP(S) URL、data:image/...;base64,...，以及 image\_url 别名。 |

 **Grok 兼容 · 文生图**  `POST /v1/images/generations`

```bash
curl 'https://img.junliai.org/v1/images/generations' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "grok-imagine",
  "prompt": "生成一只坐在窗边的橘猫，摄影风格",
  "n": 1,
  "aspect_ratio": "2:1",
  "resolution": "1k",
  "response_format": "url"
}'
```

 **Grok 兼容 · JSON 图片编辑**  `POST /v1/images/edits`

```bash
curl 'https://img.junliai.org/v1/images/edits' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "grok-imagine",
  "prompt": "保持主体不变，把背景改成海边",
  "image": {
    "url": "data:image/png;base64,REPLACE_WITH_IMAGE_BASE64"
  },
  "n": 1,
  "resolution": "1k",
  "response_format": "b64_json"
}'
```

将示例占位符替换为图片 Base64，或把 `image.url` 换成实际公网图片地址；多图使用 `"images":[{"url":"..."},{"url":"..."}]`。支持 sub2api 转换后的 `image=images[0]` 格式。

sub2api 接入：选择 Grok / xAI 的 API Key 账号，填写本站地址与密钥，配置本站已启用的图片、视频模型及模型映射；确保最终路径与本文给出的路径一致。旧版 Responses 连通性探测不生成媒体；sub2api 的图片/视频测试会实际生成并计费。

当前兼容上述媒体接口；批量生图、图片流式输出、mask、Files API、视频编辑/续接、自定义存储和音频参考尚未支持。

[Grok 视频生成、查询与下载 →](https://img.junliai.org/docs.md?page=grok-video)

# MJ 接入概览与任务约定

<a id="midjourney"></a>

<a id="midjourney-原生图片任务"></a>

## MidJourney 原生图片任务

本节介绍本站 MidJourney 原生图片任务接口的参数、调用流程及开放范围。MJ 任务使用 `/mj` 接口，不能通过 OpenAI 图片生成、编辑或 Responses 图片任务接口调用。

网页创作请打开应用中心的 [MJ 工作台](/apps/midjourney)，使用当前账号积分完成生图、图片描述、融合、提示词精简及结果后续操作。工作台任务与 API Key 任务分别管理。

Base URL 为本站根地址 `https://img.junliai.org`，不带 `/v1`。请求使用 `Authorization: Bearer YOUR_API_KEY`；POST 请求使用 `Content-Type: application/json`。示例中的 API Key、任务 ID、Base64 和图片 URL 都须替换。

调用顺序：提交 Imagine → 保存回执的 `result` → 查询任务 → 成功后下载图片 → 如需放大或变体，再使用任务返回的按钮提交子任务。Describe / Shorten 返回分析文本，上传和 Seed 则同步返回各自结果。

 方法 | 接口 | 用途 |
| --- | --- | --- |
 POST | [`/mj/submit/imagine`](https://img.junliai.org/docs.md?page=mj-create#mj-imagine) | Imagine 文生图与垫图 |
 GET | [`/mj/task/{id}/fetch`](https://img.junliai.org/docs.md?page=mj-results#mj-fetch) | 查询单个任务 |
 GET | [`/mj/image/{id}`](https://img.junliai.org/docs.md?page=mj-results#mj-image) | 下载生成图片 |
 POST | [`/mj/submit/action`](https://img.junliai.org/docs.md?page=mj-actions#mj-action) | Action 放大、变体与扩图 |
 POST | [`/mj/submit/change`](https://img.junliai.org/docs.md?page=mj-actions#mj-change) | Change 结构化变化 |
 POST | [`/mj/submit/simple-change`](https://img.junliai.org/docs.md?page=mj-actions#mj-simple-change) | Simple Change 文本变化 |
 POST | [`/mj/submit/modal`](https://img.junliai.org/docs.md?page=mj-actions#mj-modal) | Modal 局部重绘与自定义 Zoom |
 POST | [`/mj/submit/describe`](https://img.junliai.org/docs.md?page=mj-create#mj-describe) | Describe 图生文 |
 POST | [`/mj/submit/blend`](https://img.junliai.org/docs.md?page=mj-create#mj-blend) | Blend 图片混合 |
 POST | [`/mj/submit/shorten`](https://img.junliai.org/docs.md?page=mj-create#mj-shorten) | Shorten 提示词分析 |
 POST | [`/mj/submit/upload-discord-images`](https://img.junliai.org/docs.md?page=mj-results#mj-upload-discord-images) | 上传图片并获取 URL |
 POST | [`/mj/submit/edits`](https://img.junliai.org/docs.md?page=mj-actions#mj-edits) | Edits 图片编辑 |
 POST | [`/mj/task/list-by-condition`](https://img.junliai.org/docs.md?page=mj-results#mj-list) | 批量查询任务 |
 GET | [`/mj/task/{id}/image-seed`](https://img.junliai.org/docs.md?page=mj-results#mj-seed) | 获取图片 Seed |

[回执与状态](#mj-contract)[任务返回字段](#mj-fields)[模式与开放范围](#mj-modes)[完整客户端示例](https://img.junliai.org/docs.md?page=mj-examples#mj-clients)[计费与排障](https://img.junliai.org/docs.md?page=mj-errors#mj-errors)

<a id="mj-contract"></a>

<a id="通用提交回执与任务状态"></a>

### 通用提交回执与任务状态

大多数生成、变体和编辑接口采用异步任务。提交成功不等于生成成功；HTTP 200 还必须检查 JSON 中的 `code` 和 `result`。

 **异步提交回执**  `JSON`

```json
{
  "code": 1,
  "description": "Submit Success",
  "result": "TASK_ID",
  "properties": null
}
```

 字段 | 类型 | 说明 |
| --- | --- | --- |
 `code` | integer | 业务状态码，见下表；不是 HTTP 状态码。 |
 `description` | string | 操作说明或错误原因，文案可能变化。 |
 `result` | string | 异步提交接受时为非空任务 ID；保存后查询。上传和 Seed 的含义另见对应接口。 |
 `properties` | object / null | 附加信息，错误响应通常为 null；错误原因读取 description。 |

 code | 含义 | 处理 |
| --- | --- | --- |
 1 | 已接受 | 保存字符串 result，然后查询任务；这不代表图片已生成。 |
 21 | 需补充 Modal 参数，或关联任务已存在 | 保存 result 并检查任务状态及 description；需要 Modal 时使用该 ID 提交 modal。不能一律视为已完成，也不要重复提交原 Action。 |
 22 | 已接受，排队中 | 保存 result，按 3–5 秒间隔轮询。 |
 23 | 队列已满，明确拒绝 | 确认没有接受任务后，再有限次退避重试；不要与提交超时混为一谈。 |
 24 | 提示词被拒绝 | 查看 description，调整提示词后再提交。 |
 3 | 关联任务失效或账号不可用 | 检查父任务、动作权限及任务时效。 |
 其他 | 提交失败 | 保留原始回执，按 description 排查；本站自身错误采用 code: 4。 |

`1 / 21 / 22` 只有结合非空字符串任务 ID 才能继续后续流程；`21` 不应直接当作普通排队或完成。查询返回裸任务对象；终态为 `SUCCESS / FAILURE / CANCEL`。

 status | 含义 | 处理 |
| --- | --- | --- |
 NOT\_START | 未开始 | 继续轮询。 |
 SUBMITTED | 已提交 | 继续轮询。 |
 MODAL | 等待补充参数 | 当前 Action 已完成并结算，不再占用进行中并发；补充参数后提交独立计费的 Modal 任务。 |
 IN\_PROGRESS | 执行中 | 继续轮询，progress 为字符串。 |
 SUCCESS | 成功，终态 | 图片读取 imageUrl；Describe / Shorten 读取 properties。 |
 FAILURE | 失败，终态 | 读取 failReason，本次预扣积分退回。 |
 CANCEL | 取消，终态 | 结束轮询，本次预扣积分退回；这不是可调用的取消接口。 |

建议每 3–5 秒查询，客户端一次等待可设为 5–10 分钟。到达等待期限后保存任务 ID，稍后继续查询；等待超时不代表任务失败，也不会取消任务。

<a id="mj-fields"></a>

<a id="任务返回字段"></a>

### 任务返回字段

图片结果不包装成 OpenAI 的 `data[].url`。下表列出任务的常用字段；部分字段随动作和状态出现，客户端应容忍附加字段。

 字段 | 类型 | 说明 |
| --- | --- | --- |
 `id` | string | 本站任务 ID；后续操作继续使用此值。 |
 `action` | string | 动作类型，例如 IMAGINE、UPSCALE、VARIATION。 |
 `status` | string | 任务状态，见状态表。 |
 `progress` | string | 例如 "0%"、"100%"，不是数值。 |
 `prompt / promptEn` | string | 原提示词及处理后的英文提示词。 |
 `imageUrl` | string | 有图片时返回完整下载 URL；本站签名地址有效期 15 分钟。 |
 `imageUnavailable / imageUnavailableReason` | boolean / string | 确认图片已失效或被删除时返回 true 及具体提示，不再返回 imageUrl 和可用按钮；原生成状态和计费记录保留。 |
 `failReason` | string | 失败原因；正常任务通常为空字符串。 |
 `state` | string | 提交时携带的业务标识。 |
 `submitTime / startTime / finishTime` | integer | Unix 毫秒时间戳，未开始或未完成时可能为空或 0。 |
 `properties` | object / null | 动作相关结果；Describe、Shorten 常用 finalPrompt 和 finalZhPrompt。 |
 `buttons` | array | 当前任务可执行按钮；不同动作、模型版本返回的按钮可能不同。 |
 `buttons[].customId` | string | 不透明按钮标识，必须原样传给 action，不能根据 label 自行拼接。 |
 `buttons[].label / emoji` | string | 按钮文字和图标，可用于选择 U1、V1、Zoom 等操作。 |
 `buttons[].type / style` | integer | 按钮类型及样式，按原值保留。 |

后续操作使用本站返回的任务 ID、图片下载地址和 `buttons[].customId`。

<a id="mj-modes"></a>

<a id="模式与当前开放范围"></a>

### 模式与当前开放范围

本站当前仅开放默认 `/mj` 下已配置的动作。Fast、Turbo、Relax 独立模式尚未开放，请使用默认入口。

 接口前缀 | 用途 | 本站状态 |
| --- | --- | --- |
 `/mj` | 平台默认模式 | 本站当前入口；仅已启用、已定价且 Key 有权限的动作可调用。 |
 `/mj-fast/mj` | Fast | 本站当前未开放独立模式。 |
 `/mj-turbo/mj` | Turbo | 本站当前未开放独立模式。 |
 `/mj-relax/mj` | Relax | 本站当前未开放独立模式。 |

下载图片时使用查询返回的完整 `imageUrl`。

 功能 | 本站状态 |
| --- | --- |
 图片生成、变化、编辑、分析、上传、查询、Seed | 已适配本节所列接口；须有对应模型、价格和 Key 权限，不代表所有账号默认可用。 |
 `notifyHook` 回调 | 尚未开放，非空值被拒绝；使用轮询。不会悄悄丢弃回调地址或伪造通知。 |
 `POST /mj/submit/video` | 尚未适配 MJ 视频，新建和扩展均不可调用。 |
 `POST /mj/insight-face/swap` | 尚未适配换脸，不接受 accountFilter.instanceId 指定账号。 |

请求字段按本节参数表填写，生成 / 动作提交时未列出的字段会被拒绝。生成 / 编辑提交体上限为 50 MiB，包含 Base64 的体积；批量查询上限为 64 KiB。Data URL 使用 `data:image/png;base64,...` 等图片 MIME 格式，省略可选数组时不要发送空数组。

# MJ 生成、融合与提示词

<a id="mj-imagine"></a>

<a id="imagine-文生图与垫图"></a>

## Imagine 文生图与垫图

 **POST**  `/mj/submit/imagine`

提交文字提示词，可同时提供参考图片。比例和版本等 MJ 参数写在 prompt 内。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `prompt` | `string` | 是 | 非空提示词，例如 a cat in sunlight --ar 16:9。版本参数及可用版本以本站模型说明为准。 |
 `base64Array` | `string[]` | 否 | 参考图 Data URL 数组；本站传入时要求 1–10 项，省略表示纯文生图。 |
 `state` | `string` | 否 | 调用方业务标识，随任务返回；不是任务 ID，也不提供幂等去重。 |
 `notifyHook` | `string` | 否 | 本站暂未开放回调，请省略。传非空值会被拒绝。 |

 **纯文字生图**  `POST /mj/submit/imagine`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/imagine' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "prompt": "a cat in sunlight --ar 16:9",
  "state": "order-123"
}'
```

 **带参考图生图**  `POST /mj/submit/imagine`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/imagine' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "prompt": "turn the reference into a watercolor --ar 1:1",
  "base64Array": [
    "data:image/png;base64,REPLACE_WITH_IMAGE_BASE64"
  ],
  "state": "reference-123"
}'
```

 **返回：** 返回通用提交回执；保存 result，轮询新任务。

不传 model、n、size、response\_format。--ar 等参数不拆成自定义 JSON 字段。

生成四宫格仍是一次 Imagine 动作；要得到其中一张放大图，请在完成后执行对应 U 按钮。

计费：mj\_imagine。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

<a id="mj-blend"></a>

<a id="blend-图片混合"></a>

## Blend 图片混合

 **POST**  `/mj/submit/blend`

将 2–5 张参考图混合生成新图。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `base64Array` | `string[]` | 是 | 2–5 个图片 Data URL；不要传图片 URL。 |
 `dimensions` | `string` | 是 | PORTRAIT = 2:3，SQUARE = 1:1，LANDSCAPE = 3:2。 |
 `state` | `string` | 否 | 调用方业务标识，随任务返回；不是任务 ID，也不提供幂等去重。 |

 **两图混合**  `POST /mj/submit/blend`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/blend' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "base64Array": [
    "data:image/png;base64,REPLACE_WITH_IMAGE_BASE64",
    "data:image/jpeg;base64,REPLACE_WITH_SECOND_IMAGE_BASE64"
  ],
  "dimensions": "LANDSCAPE",
  "state": "blend-123"
}'
```

 **返回：** 返回通用提交回执；保存 result，轮询新任务。

此接口不接受 prompt、size 或自定义 aspect\_ratio；构图比例由 dimensions 指定。

计费：mj\_blend。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

<a id="mj-describe"></a>

<a id="describe-图生文"></a>

## Describe 图生文

 **POST**  `/mj/submit/describe`

上传一张图片，异步获取提示词分析。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `base64` | `string` | 是 | 单个图片 Data URL，不是 base64Array 数组，也不是纯 Base64。 |
 `state` | `string` | 否 | 调用方业务标识，随任务返回；不是任务 ID，也不提供幂等去重。 |

 **分析图片**  `POST /mj/submit/describe`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/describe' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "base64": "data:image/png;base64,REPLACE_WITH_IMAGE_BASE64",
  "state": "describe-123"
}'
```

 **返回：** 返回通用提交回执；保存 result，轮询新任务。

 **完成后任务 properties 字段（节选）**  `GET /mj/task/{id}/fetch`

```json
{
  "properties": {
    "finalPrompt": "1. Suggested prompt ...",
    "finalZhPrompt": "1. 中文提示词建议……"
  }
}
```

完成后读取 properties.finalPrompt 和 properties.finalZhPrompt；以实际返回为准。该动作不保证返回 imageUrl。

计费：mj\_describe。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

<a id="mj-shorten"></a>

<a id="shorten-提示词分析"></a>

## Shorten 提示词分析

 **POST**  `/mj/submit/shorten`

分析较长提示词，返回精简建议。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `prompt` | `string` | 是 | 要分析的非空提示词。 |
 `botType` | `string` | 是 | MID\_JOURNEY 或 NIJI\_JOURNEY，不能省略。 |
 `state` | `string` | 否 | 调用方业务标识，随任务返回；不是任务 ID，也不提供幂等去重。 |

 **精简提示词**  `POST /mj/submit/shorten`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/shorten' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "prompt": "a quiet library with warm afternoon light and wooden shelves",
  "botType": "MID_JOURNEY",
  "state": "shorten-123"
}'
```

 **返回：** 返回通用提交回执；保存 result，轮询新任务。

 **完成后任务 properties 字段（节选）**  `GET /mj/task/{id}/fetch`

```json
{
  "properties": {
    "finalPrompt": "1. Suggested prompt ...",
    "finalZhPrompt": "1. 中文提示词建议……"
  }
}
```

完成后读取 properties.finalPrompt / properties.finalZhPrompt；不要把文字分析结果当图片下载。

计费：mj\_shorten。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

# MJ 放大、变体与图片编辑

<a id="mj-action"></a>

<a id="action-放大-变体与扩图"></a>

## Action 放大、变体与扩图

 **POST**  `/mj/submit/action`

从父任务 buttons 中选择按钮，原样提交其 customId。成功后继续查询返回的新任务 ID。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `taskId` | `string` | 是 | 当前 API Key 创建的父任务 ID。使用本站回执 result，不能使用 state 代替。 |
 `customId` | `string` | 是 | 必须与父任务 buttons\[\].customId 完全一致；示例是占位符，不能直接用于真实任务。 |
 `state` | `string` | 否 | 调用方业务标识，随任务返回；不是任务 ID，也不提供幂等去重。 |

 **执行父任务按钮**  `POST /mj/submit/action`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/action' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "taskId": "PARENT_TASK_ID",
  "customId": "COPY_EXACT_CUSTOM_ID_FROM_BUTTONS",
  "state": "upscale-123"
}'
```

 **返回：** 返回通用提交回执；保存 result，轮询新任务。

 常见按钮 | 用途 | 对应计费动作 |
| --- | --- | --- |
 U1–U4 | 放大四宫格中的第 1–4 张 | mj\_upscale |
 V1–V4 | 生成对应宫格的变体 | mj\_variation |
 Reroll / 🔄 | 重新生成 | mj\_reroll |
 Vary (Strong) / Vary (Subtle) | 强变体 / 弱变体 | mj\_high\_variation / mj\_low\_variation |
 Upscale (Subtle) / Upscale (Creative) | 精细放大 / 创意放大 | mj\_upscale\_subtle / mj\_upscale\_creative |
 Zoom Out 1.5x / Zoom Out 2x | 向外扩图 | mj\_zoom |
 Custom Zoom | 自定义扩图，通常需要 Modal | mj\_custom\_zoom |
 Vary (Region) | 局部重绘，通常需要 Modal | mj\_inpaint |
 ⬅️ / ➡️ / ⬆️ / ⬇️ | 向对应方向扩展 | mj\_pan |

下表仅说明常见按钮，不保证每个任务都返回这些按钮。以本次查询结果为准。

未知按钮、没有配置动作价格或没有相应模型权限时，提交会被拒绝。

需要 Modal 的按钮不能只提交 Action 后一直轮询；请按 Modal 流程补充参数。

计费：按实际按钮动作收费，见按钮表。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

<a id="mj-change"></a>

<a id="change-结构化变化"></a>

## Change 结构化变化

 **POST**  `/mj/submit/change`

用动作名称与宫格序号执行放大、变体或重绘。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `taskId` | `string` | 是 | 当前 API Key 创建的父任务 ID。使用本站回执 result，不能使用 state 代替。 |
 `action` | `string` | 是 | 仅 UPSCALE、VARIATION、REROLL，使用大写。 |
 `index` | `integer` | 条件 | UPSCALE / VARIATION 必填，范围 1–4；REROLL 省略。 |
 `state` | `string` | 否 | 调用方业务标识，随任务返回；不是任务 ID，也不提供幂等去重。 |

 **放大第 1 张**  `POST /mj/submit/change`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/change' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "taskId": "PARENT_TASK_ID",
  "action": "UPSCALE",
  "index": 1,
  "state": "upscale-1"
}'
```

 **第 2 张变体**  `POST /mj/submit/change`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/change' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "taskId": "PARENT_TASK_ID",
  "action": "VARIATION",
  "index": 2
}'
```

 **重新生成**  `POST /mj/submit/change`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/change' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "taskId": "PARENT_TASK_ID",
  "action": "REROLL"
}'
```

 **返回：** 返回通用提交回执；保存 result，轮询新任务。

需要更丰富按钮时使用 Action；不能把 Zoom、Pan 等动作塞入 action 枚举。

计费：mj\_upscale / mj\_variation / mj\_reroll。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

<a id="mj-simple-change"></a>

<a id="simple-change-文本变化"></a>

## Simple Change 文本变化

 **POST**  `/mj/submit/simple-change`

将任务 ID 和动作简写放在 content 中。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `content` | `string` | 是 | 格式为 TASK\_ID U1…U4、TASK\_ID V1…V4 或 TASK\_ID R，以空格分隔。 |
 `state` | `string` | 否 | 调用方业务标识，随任务返回；不是任务 ID，也不提供幂等去重。 |

 **放大第 2 张**  `POST /mj/submit/simple-change`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/simple-change' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "content": "PARENT_TASK_ID U2",
  "state": "upscale-2"
}'
```

 **返回：** 返回通用提交回执；保存 result，轮询新任务。

这里没有单独的 taskId、action 或 index 字段；新接入也可直接使用 Action。

计费：mj\_upscale / mj\_variation / mj\_reroll。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

<a id="mj-modal"></a>

<a id="modal-局部重绘与自定义-zoom"></a>

## Modal 局部重绘与自定义 Zoom

 **POST**  `/mj/submit/modal`

先提交父任务的 Vary (Region) / Custom Zoom 按钮，再使用该 Action 回执 result 指向的 Modal 任务补充参数。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `taskId` | `string` | 是 | 需要补充参数的 Modal 任务 ID，通常来自上一条 Action 的 result；不要用 state 代替。 |
 `prompt` | `string` | 否 | 按所选动作补充提示词，例如自定义扩图追加 --zoom 1.5。 |
 `maskBase64` | `string` | 否 | 局部重绘蒙版，单个图片 Data URL 字符串；黑色为保留区、白色为编辑区，尺寸与目标图一致。 |
 `state` | `string` | 否 | 调用方业务标识，随任务返回；不是任务 ID，也不提供幂等去重。 |

 **自定义 Zoom**  `POST /mj/submit/modal`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/modal' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "taskId": "MODAL_TASK_ID",
  "prompt": "a cat in sunlight --zoom 1.5"
}'
```

 **局部重绘**  `POST /mj/submit/modal`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/modal' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "taskId": "MODAL_TASK_ID",
  "prompt": "replace the selected area with flowers",
  "maskBase64": "data:image/png;base64,REPLACE_WITH_MASK_BASE64"
}'
```

 **返回：** 返回通用提交回执；保存 result，轮询新任务。

Action 回执 code: 21 可能表示需要 Modal，也可能表示任务已存在；结合 description 和任务状态判断。

Modal 回执后继续查询本次 result。本站将 Action 和 Modal 视为各自配置价格的提交动作，调用前确认对应价格。

本接口的 maskBase64 是字符串；Edits 接口的同名字段是数组，不能混用。

计费：mj\_modal。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

<a id="mj-edits"></a>

<a id="edits-图片编辑"></a>

## Edits 图片编辑

 **POST**  `/mj/submit/edits`

使用图片 URL 和编辑提示词创建新任务，可附带蒙版。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `prompt` | `string` | 是 | 非空编辑要求。 |
 `image` | `string` | 是 | 可公开访问的图片 URL；与 Imagine 的 base64Array 不同。 |
 `maskBase64` | `string[]` | 否 | 蒙版 Data URL 数组，传入时本站要求 1–10 项；不是 Modal 的单个字符串。 |
 `noStorage` | `boolean` | 是 | 须显式传 true / false，控制是否跳过图片转存。查询结果提供签名下载 URL，请使用返回的完整地址。 |
 `state` | `string` | 否 | 调用方业务标识，随任务返回；不是任务 ID，也不提供幂等去重。 |
 `notifyHook` | `string` | 否 | 本站暂未开放回调，请省略。传非空值会被拒绝。 |

 **编辑背景**  `POST /mj/submit/edits`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/edits' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "prompt": "change the background to a sunset",
  "image": "https://images.example.com/input.png",
  "maskBase64": [
    "data:image/png;base64,REPLACE_WITH_MASK_BASE64"
  ],
  "noStorage": false,
  "state": "edit-123"
}'
```

 **返回：** 返回通用提交回执；保存 result，轮询新任务。

图片及蒙版占位符需替换为真实内容；不要直接复制示例 URL 提交。

计费：mj\_edits。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

# MJ 查询、下载与辅助接口

<a id="mj-fetch"></a>

<a id="查询单个任务"></a>

## 查询单个任务

 **GET**  `/mj/task/{id}/fetch`

返回裸任务对象，包含任务状态、进度、图片或分析结果及可执行按钮。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `id（路径）` | `string` | 是 | 当前 API Key 创建的任务 ID；提交、查询和后续操作使用同一站点和 Key。 |

 **查询任务**  `GET /mj/task/{id}/fetch`

```bash
curl --fail-with-body 'https://img.junliai.org/mj/task/TASK_ID/fetch' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

 **返回：** 直接返回任务对象，不包在 result、data 或 data\[\].url 中。下方示例展示主要字段；字段是否存在取决于任务动作和状态。

 **成功任务示例**  `响应示例`

```json
{
  "id": "TASK_ID",
  "action": "IMAGINE",
  "status": "SUCCESS",
  "progress": "100%",
  "prompt": "a cat in sunlight --ar 16:9",
  "promptEn": "a cat in sunlight --ar 16:9",
  "imageUrl": "IMAGE_URL_FROM_RESPONSE",
  "failReason": "",
  "state": "order-123",
  "submitTime": 1787317252488,
  "startTime": 1787317253000,
  "finishTime": 1787317270584,
  "properties": {},
  "buttons": [
    {
      "customId": "COPY_EXACT_CUSTOM_ID_FROM_BUTTONS",
      "emoji": "",
      "label": "U1",
      "type": 2,
      "style": 2
    }
  ]
}
```

每 3–5 秒查询一次；FAILURE / CANCEL 读取 failReason，SUCCESS 读取对应结果。

查询不重复收费。即使同一用户创建多把 Key，也不能使用另一把 Key 查询该任务。

计费：查询不新增动作费用。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

<a id="mj-list"></a>

<a id="批量查询任务"></a>

## 批量查询任务

 **POST**  `/mj/task/list-by-condition`

按任务 ID 列表查询，返回裸任务数组。只查询明确列出的任务，不支持按 state 搜索或列出所有任务。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `ids` | `string[]` | 是 | 任务 ID 数组，最多 100 个；必须全部属于当前 Key。空数组返回空数组。 |

 **批量查询**  `POST /mj/task/list-by-condition`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/task/list-by-condition' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "ids": [
    "TASK_ID",
    "TASK_ID_2"
  ]
}'
```

 **返回：** 数组内每项与单任务查询格式一致；下方省略了重复的任务字段。

 **任务数组（节选）**  `响应示例`

```json
[
  {
    "id": "TASK_ID",
    "status": "SUCCESS",
    "progress": "100%",
    "imageUrl": "IMAGE_URL_FROM_RESPONSE"
  },
  {
    "id": "TASK_ID_2",
    "status": "IN_PROGRESS",
    "progress": "50%"
  }
]
```

本站先校验整批任务归属，再逐个读取任务；任一任务无权访问或查询失败会使整批请求报错，不返回部分成功数组。

可回退为逐个 GET 查询以定位失败任务。本站批量请求体上限 64 KiB。

计费：查询不新增动作费用。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

<a id="mj-image"></a>

<a id="下载生成图片"></a>

## 下载生成图片

 **GET**  `/mj/image/{id}`

图片生成完成后，优先使用任务返回的完整 imageUrl 下载；不要自行拼接图片地址。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `id（路径）` | `string` | 是 | 当前 API Key 创建的任务 ID；提交、查询和后续操作使用同一站点和 Key。 |
 `token（查询）` | `string` | 条件 | imageUrl 自带的临时签名，无需额外 Bearer。直接调用不带 token 的下载路径时，须携带创建任务的 API Key。 |

 **用当前 Key 下载图片**  `GET /mj/image/{id}`

```bash
curl --fail-with-body 'https://img.junliai.org/mj/image/TASK_ID' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  --output result.png
```

 **使用返回的签名地址**  `GET /mj/image/{id}`

```bash
curl --fail-with-body 'PASTE_COMPLETE_IMAGE_URL_HERE' --output result.png
```

 **返回：** 返回 image/\* 二进制，不是 JSON 或 Base64。

签名 URL 有效期 15 分钟；失效后重新查询任务，取得新的 imageUrl。建议及时保存图片到自己的存储。

签名链接本身授予临时下载权限，不要公开分享。向返回的签名 URL 下载时无需附带 API Key。

检查 HTTP 状态及 Content-Type，再按实际图片格式保存；本站下载代理上限为 32 MiB。

计费：下载不新增动作费用。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

<a id="mj-upload-discord-images"></a>

<a id="上传图片并获取-url"></a>

## 上传图片并获取 URL

 **POST**  `/mj/submit/upload-discord-images`

将图片 Data URL 上传为后续可引用的 URL。该接口同步返回，不需要轮询任务。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `base64Array` | `string[]` | 是 | 本站要求 1–10 个图片 Data URL；不接受 state 或 notifyHook。 |

 **上传一张图片**  `POST /mj/submit/upload-discord-images`

```bash
curl --fail-with-body -X POST 'https://img.junliai.org/mj/submit/upload-discord-images' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "base64Array": [
    "data:image/png;base64,REPLACE_WITH_IMAGE_BASE64"
  ]
}'
```

 **返回：** 同步返回以下两种格式之一。对象回执必须检查 code；不能只凭 result 存在判断上传成功。

 **对象回执**  `响应示例`

```json
{
  "code": 1,
  "description": "提交成功",
  "result": [
    "https://images.example.com/uploaded.png"
  ],
  "properties": {}
}
```

 **裸 URL 数组**  `响应示例`

```json
[
  "https://images.example.com/uploaded.png"
]
```

返回格式可能为裸 URL 数组或 result 为 URL 数组的回执，客户端需要兼容这两种格式。

result 数组不是任务 ID。URL 有效期有限，长期使用应自行保存。

计费：mj\_uploads。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

<a id="mj-seed"></a>

<a id="获取图片-seed"></a>

## 获取图片 Seed

 **GET**  `/mj/task/{id}/image-seed`

读取原任务对应的 Seed。使用 GET；同时兼容原有 POST 空 JSON 调用。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `id（路径）` | `string` | 是 | 当前 API Key 创建的任务 ID；提交、查询和后续操作使用同一站点和 Key。 |

 **查询 Seed**  `GET /mj/task/{id}/image-seed`

```bash
curl --fail-with-body 'https://img.junliai.org/mj/task/TASK_ID/image-seed' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

 **返回：** 返回 Seed 回执；result 是 Seed 字符串，不是新任务 ID。

 **Seed 回执示例**  `响应示例`

```json
{
  "code": 1,
  "description": "成功",
  "result": "636646138"
}
```

Seed 回执可能使用 code: 0 或 code: 1。以 code 为 0 或 1 且 result 为非空字符串判断成功，不要套用异步任务提交的判定。

建议在原图片任务成功后查询；未提供 Seed 时返回 503，稍后只重试本查询，不重复提交生成任务。

计费：本站不新增 Seed 动作扣费。动作是否开放及价格，以本站模型目录和当前 Key 权限为准。

# MJ 完整客户端示例

<a id="mj-clients"></a>

<a id="python-node-js-完整接入示例"></a>

## Python / Node.js 完整接入示例

在服务端环境变量中配置 `IMAGE2API_API_KEY`，可用 `IMAGE2API_BASE_URL` 覆盖本站根地址。以下脚本实际执行会提交一次收费 Imagine 任务；额外放大示例默认注释。

例如在终端设置 `export IMAGE2API_API_KEY='YOUR_API_KEY'`。Python 示例保存为 `midjourney.py`，安装 requests 后运行 `python midjourney.py`；Node.js 示例保存为 `midjourney.mjs`，使用 Node.js 18+ 运行 `node midjourney.mjs`。

明确拒绝会返回对应 HTTP 状态和错误原因；提交响应头 `X-Midjourney-Submission-Status: rejected` 表示本站已确认未接受生成请求。没有该标记的 502、超时或无效回执不能视为明确拒绝，不应自动重发。查询或下载失败时只重试对应查询或下载。

示例包含提交回执检查、查询退避、终态处理、签名图片下载和原样按钮调用。首次得到任务 ID 后应写入自己的持久存储；示例中的控制台输出不替代持久化。出现 MODAL 时脚本会停止并提示补参，可使用前文 Modal 请求继续。

 **Python：提交 → 轮询 → 下载**  `本站 /mj 原生协议`

```python
"""Python 3；先安装 requests：python -m pip install requests。"""
import os
import time
from pathlib import Path

import requests

BASE_URL = os.environ.get("IMAGE2API_BASE_URL", "https://img.junliai.org").rstrip("/")
API_KEY = os.environ["IMAGE2API_API_KEY"]
HEADERS = {"Authorization": f"Bearer {API_KEY}", "Accept": "application/json"}


def submit(operation, body):
    # 提交只发送一次。连接中断、超时、5xx 或无效回执均不得自动重发。
    try:
        response = requests.post(
            f"{BASE_URL}/mj/submit/{operation}", headers=HEADERS, json=body, timeout=90
        )
    except requests.RequestException as exc:
        raise RuntimeError("提交结果不明：保留 state 和时间联系管理员，不要重发") from exc
    reference = response.headers.get("X-Midjourney-Task-Id", "未返回")
    if response.status_code >= 500:
        raise RuntimeError(f"提交结果需核对：HTTP {response.status_code}，参考任务 {reference}")
    if not response.ok:
        raise RuntimeError(f"提交 HTTP {response.status_code}，参考任务 {reference}：{response.text}")
    try:
        receipt = response.json()
        if (isinstance(receipt, dict) and receipt.get("code") in (1, 21, 22)
                and isinstance(receipt.get("result"), str) and receipt["result"]):
            # code 21 仍须检查任务；若为 MODAL，按动作补充参数。
            return receipt["result"]
    except ValueError as exc:
        raise RuntimeError(f"回执无效，不要重发；参考任务 {reference}") from exc
    raise RuntimeError(f"提交未确认接受，请核对回执，不要自动重发：{receipt}")


def wait_for_task(task_id, timeout_seconds=600):
    deadline = time.monotonic() + timeout_seconds
    delay = 5
    while time.monotonic() < deadline:
        try:
            response = requests.get(
                f"{BASE_URL}/mj/task/{task_id}/fetch", headers=HEADERS, timeout=30
            )
            if response.status_code == 429 or response.status_code >= 500:
                time.sleep(min(delay, max(0, deadline - time.monotonic())))
                delay = min(delay * 2, 30)
                continue
            response.raise_for_status()
        except (requests.Timeout, requests.ConnectionError):
            time.sleep(min(delay, max(0, deadline - time.monotonic())))
            delay = min(delay * 2, 30)
            continue
        task = response.json()  # 裸任务对象，不取 data 或 result。
        if not isinstance(task, dict) or task.get("id") != task_id or not task.get("status"):
            raise RuntimeError("查询结果不是预期任务对象，保留任务 ID 后排查")
        status = task["status"]
        print(task_id, status, task.get("progress"))
        if status == "SUCCESS":
            return task
        if status in ("FAILURE", "CANCEL"):
            raise RuntimeError(f"任务 {task_id} {status}: {task.get('failReason')}")
        if status == "MODAL":
            raise RuntimeError(f"任务 {task_id} 等待 Modal：补充参数后调用 /mj/submit/modal")
        delay = 5
        time.sleep(min(delay, max(0, deadline - time.monotonic())))
    raise TimeoutError(f"停止等待，但任务未取消：保存 {task_id}，稍后继续查询，不要重建任务")


def download_image(task, output):
    # 使用完整签名 URL，不向下载站点发送 API Key。过期后重新查询任务。
    response = requests.get(task["imageUrl"], timeout=120)
    response.raise_for_status()
    if not response.headers.get("Content-Type", "").lower().startswith("image/"):
        raise RuntimeError("下载结果不是图片")
    Path(output).write_bytes(response.content)


def submit_button(parent, label):
    button = next((b for b in parent.get("buttons", []) if b.get("label") == label), None)
    if not button:
        raise ValueError(f"本次任务未返回 {label} 按钮")
    return submit("action", {"taskId": parent["id"], "customId": button["customId"]})


if __name__ == "__main__":
    task_id = submit("imagine", {"prompt": "a cat in sunlight --ar 16:9", "state": "python-demo-001"})
    print("请立即保存任务 ID：", task_id)
    task = wait_for_task(task_id)
    download_image(task, "result.png")
    # 放大是额外收费动作，需要时才取消下面注释。
    # child_id = submit_button(task, "U1")
    # print("请立即保存子任务 ID：", child_id)
    # download_image(wait_for_task(child_id), "upscale.png")
```

 **Node.js：提交 → 轮询 → 下载**  `本站 /mj 原生协议`

```javascript
// Node.js 18+，保存为 midjourney.mjs 后执行 node midjourney.mjs。
import { writeFile } from 'node:fs/promises'

const BASE_URL = (process.env.IMAGE2API_BASE_URL || 'https://img.junliai.org').replace(/\/$/, '')
const API_KEY = process.env.IMAGE2API_API_KEY
if (!API_KEY) throw new Error('请设置 IMAGE2API_API_KEY')
const headers = { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' }
const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))

async function submit(operation, body) {
  // 不对提交 POST 自动重试，包括连接中断、超时和 5xx。
  let response
  try {
    response = await fetch(`${BASE_URL}/mj/submit/${operation}`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
    })
  } catch (error) {
    throw new Error('提交结果不明：保存 state 和时间联系管理员，不要重发', { cause: error })
  }
  const reference = response.headers.get('X-Midjourney-Task-Id') || '未返回'
  if (!response.ok) throw new Error(`提交 HTTP ${response.status}，参考任务 ${reference}；核对原始响应，不要自动重发：${await response.text()}`)
  let receipt
  try { receipt = await response.json() } catch {
    throw new Error(`回执无效，参考任务 ${reference}；不要重发`)
  }
  if (![1, 21, 22].includes(receipt?.code) || typeof receipt.result !== 'string' || !receipt.result) {
    throw new Error(`提交未确认接受，请核对回执，不要自动重发：${JSON.stringify(receipt)}`)
  }
  return receipt.result
}

async function waitForTask(taskId, timeoutMs = 600_000) {
  const deadline = Date.now() + timeoutMs
  let delay = 5000
  while (Date.now() < deadline) {
    let response
    try {
      response = await fetch(`${BASE_URL}/mj/task/${encodeURIComponent(taskId)}/fetch`, {
        headers, signal: AbortSignal.timeout(30_000),
      })
    } catch {
      await sleep(Math.min(delay, deadline - Date.now()))
      delay = Math.min(delay * 2, 30_000)
      continue
    }
    if (response.status === 429 || response.status >= 500) {
      await response.arrayBuffer() // 消费错误响应后再重试查询。
      await sleep(Math.min(delay, deadline - Date.now()))
      delay = Math.min(delay * 2, 30_000)
      continue
    }
    if (!response.ok) throw new Error(`查询 HTTP ${response.status}: ${await response.text()}`)
    const task = await response.json() // 裸对象，不取 data 或 result。
    if (task?.id !== taskId || !task.status) throw new Error('查询对象无效：保存任务 ID 后排查')
    console.log(taskId, task.status, task.progress)
    if (task.status === 'SUCCESS') return task
    if (['FAILURE', 'CANCEL'].includes(task.status)) throw new Error(`${taskId} ${task.status}: ${task.failReason}`)
    if (task.status === 'MODAL') throw new Error(`${taskId} 等待 Modal：补充参数后调用 /mj/submit/modal`)
    delay = 5000
    await sleep(Math.min(delay, deadline - Date.now()))
  }
  throw new Error(`停止等待，但任务未取消：保存 ${taskId}，稍后继续查询，不要重建任务`)
}

async function downloadImage(task, filename) {
  // 完整签名链接已授权下载，无需 API Key；过期后重新查询任务。
  const response = await fetch(task.imageUrl, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok || !response.headers.get('Content-Type')?.toLowerCase().startsWith('image/')) {
    throw new Error(`下载失败或不是图片：HTTP ${response.status}`)
  }
  await writeFile(filename, Buffer.from(await response.arrayBuffer()))
}

async function submitButton(parent, label) {
  const button = parent.buttons?.find(item => item.label === label)
  if (!button) throw new Error(`本次任务未返回 ${label} 按钮`)
  return submit('action', { taskId: parent.id, customId: button.customId })
}

const taskId = await submit('imagine', { prompt: 'a cat in sunlight --ar 16:9', state: 'node-demo-001' })
console.log('请立即保存任务 ID：', taskId)
const task = await waitForTask(taskId)
await downloadImage(task, 'result.png')
// 放大是额外收费动作，需要时才取消下面注释。
// const childId = await submitButton(task, 'U1')
// console.log('请立即保存子任务 ID：', childId)
// await downloadImage(await waitForTask(childId), 'upscale.png')
```

# MJ 计费、重试与排障

<a id="mj-errors"></a>

<a id="计费-重试与排障"></a>

## 接口说明

每次生成或后续动作按对应动作价格收费。Imagine 四宫格按一次动作计费，放大、变体、Modal 等后续提交独立计费。任务提交时预扣积分，明确拒绝或终态 FAILURE / CANCEL 幂等退款；重复查询不重复扣费或退款。

state 只做业务关联，不能作为幂等键，也不能通过 state 查询任务。提交结果不明时保留金额和任务占用，等待核对，不自动退款或重发。保存错误响应头 `X-Midjourney-Task-Id`（若有）及原始错误；它是核对用标识，不证明任务已被接受。

参数校验错误使用以下原生形态；业务错误保留其明确原因。HTTP 状态与业务 code 都需要检查。

 **本站参数错误示例**  `HTTP 400`

```json
{
  "code": 4,
  "description": "请输入提示词后再生成。",
  "result": null,
  "properties": null
}
```

 现象 | 处理 |
| --- | --- |
 401 / 403 | 核对本站 Key、Bearer 格式、有效期与动作模型权限；父任务及子操作都须在当前 Key 的授权范围内。 |
 404 / 查不到任务 | 确认根地址不带 /v1，路径含 /mj，使用回执 result；必须与提交时使用同一 Key 和站点。不存在或属于其他 Key 的任务都会拒绝访问。 |
 400 / 参数被拒绝 | 检查 description、必填字段和 JSON 类型；特别注意 noStorage 是布尔值，Modal 蒙版是字符串，Edits 蒙版是数组。非空 notifyHook 当前不可用。 |
 无可用渠道 / 动作未定价 | 接口存在不等于动作已开通；确认模型目录、Key 分组及对应动作价格。不能通过添加 model 字段绕过。 |
 提交 HTTP 200，但没有成功 | 检查 JSON code 和 result。提交接受与任务生成成功是不同阶段；生成成功以任务 status: SUCCESS 为准。 |
 排队、持续 0% 或达到客户端等待期限 | 保存任务 ID，稍后继续查询；客户端超时不取消任务，不代表失败，也不自动退款。 |
 提交超时 / 5xx / 非 JSON / 断网 | 结果可能不明，禁止盲目重发 POST。保存 X-Midjourney-Task-Id（若返回）、state、时间和响应，交管理员核对；HTTP 响应都未收到时不要假设未受理。 |
 查询 429 / 5xx / 网络错误 | 仅对查询做有上限的指数退避；不要因此重新提交任务。401 / 403 等明确权限错误应先修复。 |
 MODAL 一直不结束 | 按所选按钮补充 prompt / maskBase64，调用 modal；仅轮询无法代替这一步。 |
 图片下载失败 | 签名过期可重新查询任务刷新链接；HTTP 410 或 imageUnavailable=true 表示图片已失效，工作台会移除对应创作，原计费记录保留。其他下载故障可稍后重试，不要重新提交生成。 |

# 创建视频

<a id="video-generation"></a>

<a id="视频生成"></a>

## 视频生成

`POST /v1/videos`

视频生成是异步任务。创建后立即返回 `queued`，轮询状态，完成后读取 URL 或下载内容。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `model` | `string` | 是 | 视频模型 ID。 |
 `prompt` | `string` | 文生视频必填 | 描述视频内容、动作、镜头和风格。 |
 `seconds / duration` | `string \| number` | 是 | 生成时长；duration 是兼容别名，必须是模型支持的时长。 |
 `size` | `string` | 否 | WIDTHxHEIGHT；短边决定分辨率档位，同时决定比例。 |
 `aspect_ratio` | `string` | 否 | 也可直接传比例，例如 16:9、9:16；size 优先映射。 |
 `resolution` | `string` | 否 | 也可直接传 720p、1080p 等模型支持的档位。 |
 `reference_mode` | `string` | 否 | asset=普通参考图；frame=首尾帧。字段本身也会触发自动识别。 |
 `reference_images` | `string[] \| file[]` | 否 | 普通参考图；JSON 用 URL、Data URI 或原始 Base64，multipart 可重复字段。 |
 `start_frame / end_frame` | `string \| file` | 否 | 首尾帧；end\_frame 必须搭配 start\_frame，且不能与普通参考图混用。 |
 `reference_videos` | `string[] \| file[]` | 否 | 参考视频；数量和格式以模型公开能力为准。 |
 `audio_reference(s)` | `string \| string[] \| file[]` | 否 | 参考音频；必须搭配模型支持的普通图像或视频参考。 |
 `audio` | `boolean` | 否 | 控制输出音轨；仅对支持该能力的模型生效。 |
 `response_format` | `string` | 否 | 仅支持 url；完成态返回公开临时 URL 和 expires\_at。 |

 **视频生成**  `POST /v1/videos · 创建 · 轮询 · 下载`

```bash
curl https://img.junliai.org/v1/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2.5",
    "prompt": "a paper boat sailing down a rainy street, cinematic",
    "seconds": "4",
    "size": "1120x480",
    "response_format": "url"
  }'

# 轮询状态，完成后读取 url
curl https://img.junliai.org/v1/videos/<VIDEO_ID> \
  -H "Authorization: Bearer YOUR_API_KEY"
curl '<RETURNED_URL>' -o output.mp4
```

```python
import time
import requests

base = "https://img.junliai.org/v1"
headers = {"Authorization": "Bearer YOUR_API_KEY"}
job = requests.post(f"{base}/videos", headers=headers, json={
    "model": "seedance-2.5",
    "prompt": "a paper boat sailing down a rainy street",
    "seconds": "4",
    "size": "1120x480",
    "response_format": "url",
}).json()

while True:
    status = requests.get(f"{base}/videos/{job['id']}", headers=headers).json()
    if status["status"] in ("completed", "failed"):
        break
    time.sleep(5)

if status["status"] == "completed":
    open("output.mp4", "wb").write(requests.get(status["url"]).content)
```

# 视频任务与下载

<a id="video-status"></a>

<a id="查询视频状态"></a>

### 查询视频状态

`GET /v1/videos/{id}`

状态通常按 `queued → in_progress → completed` 变化，也可能进入 `failed`。只有完成后才能读取视频内容。

<a id="video-content"></a>

<a id="下载视频"></a>

### 下载视频

`GET /v1/videos/{id}/content`

完成任务后返回  **mp4 原始二进制** ，不是 Base64，也不是 JSON。任务未完成时返回 409。

<a id="video-response"></a>

## 结果返回方式

创建、轮询、下载分为三步。显式传 `response_format: "url"` 时完成态包含 `url` 和 `expires_at`；否则使用 `/content`。

# Seedance 任务接口

<a id="seedance"></a>

<a id="seedance-任务接口"></a>

## 接口说明

使用本站 API Key

使用本站 API Key 调用 Ark 兼容任务接口。Base URL 为 `https://img.junliai.org/api/v3`，创建任务使用 `content[]`，成功结果位于 `content.video_url`。模型、时长、比例、分辨率和参考能力以[模型目录](https://img.junliai.org/docs.md?page=models#models)为准。

 **Seedance · 创建任务**  `POST /api/v3/contents/generations/tasks`

```bash
curl 'https://img.junliai.org/api/v3/contents/generations/tasks' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "seedance-2.5",
  "content": [
    {
      "type": "text",
      "text": "海浪轻轻拍打沙滩，镜头缓慢推进"
    }
  ],
  "duration": 4,
  "ratio": "21:9",
  "resolution": "480p"
}'
```

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `model` | `string` | 是 | 本站公开的视频模型 ID；时长、参考能力与价格以模型目录为准。 |
 `content` | `array` | 是 | 非空数组，最多 32 项。文字使用 {"type":"text","text":"提示词"}；多个文字项按换行合并。 |
 `content[].image_url` | `object` | 否 | type=image\_url，image\_url={"url":"公网 URL 或 Data URI"}。role 为 first\_frame（默认）、last\_frame 或 reference\_image；尾帧须搭配首帧。 |
 `content[].video_url / audio_url` | `object` | 否 | type=video\_url 或 audio\_url，对应字段为 {"url":"…"}。role 分别为 reference\_video / reference\_audio，可省略；支持 HTTP(S) 或对应媒体的 Data URI。 |
 `duration` | `integer` | 否 | 正整数秒，默认 5；必须在模型支持范围内，不支持 -1 自动时长。 |
 `ratio / resolution` | `string` | 否 | 例如 16:9 / 720p；默认比例 16:9，分辨率采用模型默认档位。建议按模型目录显式填写。 |
 `generate_audio` | `boolean` | 否 | 控制生成音轨，仅用于声明支持此能力的模型。 |

普通参考与首尾帧互斥；音频参考按模型要求搭配视觉参考。当前支持上表字段；callback\_url、seed、draft、watermark、return\_last\_frame、tools 等扩展参数会返回 400，不会被静默忽略。

<a id="查询-下载与删除"></a>

### 查询、下载与删除

 **Seedance · 查询与下载**  `GET /api/v3/contents/generations/tasks/{id}`

```bash
# 创建返回 {"id":"任务ID"}；替换 TASK_ID，查询至 succeeded / failed / expired
curl 'https://img.junliai.org/api/v3/contents/generations/tasks/TASK_ID' \
  -H 'Authorization: Bearer YOUR_API_KEY'

# succeeded 后，复制响应 content.video_url 的完整地址（含 media_token）
curl 'VIDEO_URL' -o video.mp4

# 可选：删除已结束的任务，返回 204
curl -X DELETE 'https://img.junliai.org/api/v3/contents/generations/tasks/TASK_ID' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

状态为 `queued / running / succeeded / failed / expired`。创建、查询和删除需要本站 API Key，任务按本站用户隔离；同一用户的密钥可查询其任务。视频链接包含临时下载凭证，无需额外密钥，有效期为生成完成后 24 小时。查询已有任务不重复扣费；删除仅支持已结束任务，不退还成功任务费用，且会撤销该任务的 API 查询与下载权限。运行中删除返回 409，暂不支持主动取消。

 **完成响应示例 · 本次扣除 3 积分**  `200 OK`

```json
{
  "id": "TASK_ID",
  "model": "seedance-2.5",
  "status": "succeeded",
  "content": {
    "video_url": "https://img.junliai.org/api/v3/contents/generations/tasks/TASK_ID/content?media_token=TEMPORARY_TOKEN"
  },
  "usage": {
    "completion_tokens": 3000,
    "total_tokens": 3000
  },
  "billing": {
    "unit": "credit_equivalent",
    "credits": 3,
    "units_per_credit": 1000,
    "measured_tokens": false
  }
}
```

<a id="在你的-sub2api-中接入本站"></a>

### 在你的 Sub2API 中接入本站

使用支持 Seedance 的 Sub2API v0.2.7 或更新版本，新增  **OpenAI 平台 → API Key 账号** ，勾选  **Seedance (Ark)** 。Base URL 填 `https://img.junliai.org/api/v3`，API Key 填本站密钥。配置本站视频模型及模型映射，加入可用分组，并开启分组的“允许图片生成”媒体权限。

 **计费单位：** 本站按模型价格预扣积分，失败退款。为兼容 Sub2API 的 Seedance 结算，成功响应的 `usage.completion_tokens` 按实际扣费积分 × 1000 折算，四舍五入为整数；这是兼容计费单位，并非实际测量的推理 token。`billing.measured_tokens=false` 明确标注来源，重复查询返回相同单位数。

Sub2API 按成功查询的 usage 结算。若希望每个本站积分向下游收取 P 个货币单位，将输出价格设置为  **1000 × P / 百万 token** ，并考虑分组倍率。例：每积分收取 0.01，则设置 10 / 百万 token，3 积分对应 3000 单位，基础费用为 0.03。客户端必须查询到 succeeded，并及时保存视频；不要通过重复创建来重试查询。

同时提供 `/v3`、`/v1` 和无版本前缀的任务路由别名；Sub2API 接口地址使用 `/api/v3` 地址。未提供任务列表、回调或完整 Ark 扩展能力。错误格式为 `{"error":{"code":"…","message":"…"}}`。

# MiniMax 视频接口

<a id="minimax"></a>

<a id="minimax-视频接口"></a>

## 接口说明

兼容 New API Hailuo 插件

New API 的 Hailuo Video 插件可以直接接入本站。接口地址填写 `https://img.junliai.org`（不加 /v1 或 /v2），密钥使用本站 API Key。model 填写本站模型目录或 `/v1/models` 返回的实际模型 ID，例如 `minimax-h3-optimized`。v1、v2 均使用本站模型配置，查询结果保留本站模型 ID。

Hailuo Video 1.2.0 使用本站模型 ID 时会选择 v1 接口，可用于文生视频、首尾帧和主体参考。多模态 content\[\] 可直接请求本站 v2 接口；该版本插件仅为名称 MiniMax-H3 自动选择 v2，经它使用 v2 需调整插件的接口选择逻辑，model 仍填写本站模型 ID。

POST`/v1/video_generation`v1 创建：prompt、first\_frame\_image、last\_frame\_image、subject\_reference

GET`/v1/query/video_generation?task_id=TASK_ID`v1 查询：Queueing / Processing / Success / Fail；成功返回 file\_id

GET`/v1/files/retrieve?file_id=FILE_ID`文件信息，返回 file.download\_url

GET`/v1/files/download?file_id=FILE_ID`携带 API Key 下载 MP4，也支持 HEAD

POST`/v2/video_generation`H3 创建：content\[\]、duration、resolution、ratio

GET`/v2/query/video_generation/TASK_ID`H3 查询：task.status；成功结果位于 task.content.url

 **MiniMax H3 · 创建任务**  `POST /v2/video_generation`

```bash
curl 'https://img.junliai.org/v2/video_generation' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "minimax-h3-optimized",
  "content": [
    {
      "type": "text",
      "text": "海浪轻拍沙滩，镜头缓慢推进"
    }
  ],
  "duration": 6,
  "resolution": "768P",
  "ratio": "16:9"
}'
```

创建返回 `{"task_id":"任务ID"}`。v2 查询状态为 `queued / running / succeeded / failed`，成功后直接下载 `task.content.url`，保留完整查询参数。v1 返回 `base_resp.status_code`，0 表示成功。查询与文件信息需要 Bearer API Key；结果链接自带临时凭证，最长有效 24 小时，过期后查询返回失败。

H3 优化版支持 4–15 整数秒、768P；720P 按原有兼容规则对应 768P。接口兼容不会增加模型能力，480P、2K 或未启用的 Hailuo 模型仍会被拒绝。v1 默认 6 秒，v2 默认 5 秒；分辨率省略时使用模型默认档位。

v2 的 `content[]` 支持 text、image\_url、video\_url、audio\_url。图片 role 为 first\_frame、last\_frame 或 reference\_image，视频和音频分别为 reference\_video、reference\_audio；首尾帧与素材参考互斥。图像参考支持公网地址、Data URI 或 Base64；视频、音频遵循模型素材限制。adaptive 根据第一张参考图选择最接近的支持比例；纯视频参考请显式填写 ratio。尾帧需要首帧，纯音频参考不支持。

可传 `Idempotency-Key` 防止重复创建和扣费。失败沿用本站退款和积分流水规则。暂不支持 callback\_url、水印、提示词优化或快速预处理；对应布尔选项可省略或设为 false，开启时会明确报错。未测量的输入时长和 token 用量不会伪造返回。

# Grok 视频接口

<a id="grok-video"></a>

## 视频接口说明

生图、编辑与视频

本站提供 Grok / xAI 通用图片与视频接口，支持文生图、JSON 图片编辑、文生视频和参考图生视频，可供 sub2api 等兼容下游调用。API 地址为 `https://img.junliai.org/v1`，使用本站 API Key，通过 `Authorization: Bearer YOUR_API_KEY` 鉴权。

请求使用 `application/json`；图片请求体上限 100 MiB，视频请求体上限 50 MiB。参考图支持 PNG、JPEG、WebP，每张最多 25 MiB，张数还受模型限制。模型、时长、比例和分辨率以本站模型目录为准。

POST`/v1/videos/generations`Grok / xAI 风格的视频生成，返回 request\_id

GET`/v1/videos/{request_id}`查询生成状态与结果地址

GET`/v1/videos/{request_id}/content`携带 API Key 下载 MP4

<a id="视频生成-查询与下载"></a>

### 视频生成、查询与下载

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `model` | `string` | 是 | 本站已启用的视频模型 ID；兼容名称 grok-imagine-video 调用本站 grok-video 模型。 |
 `prompt` | `string` | 文生视频必填 | 描述视频内容、动作和镜头；提供参考图时可省略。 |
 `duration` | `integer / string` | 否 | 1–15 的整数秒数，默认 8 秒，也接受 seconds 别名；实际可用值以模型目录为准。 |
 `aspect_ratio` | `string` | 否 | 画面比例，默认 16:9；需使用模型支持的比例。 |
 `resolution` | `string` | 否 | 分辨率，默认 480p；实际可用档位以模型目录为准。 |
 `image.url` | `string` | 否 | 图生视频首帧，支持公网 HTTP(S) URL、data:image/...;base64,... 或纯 Base64。 |
 `reference_images[].url` | `string` | 否 | 多张参考图，格式与 image.url 相同；数量和能力受模型限制。 |
 `size` | `string` | 否 | 兼容 WIDTHxHEIGHT，补充未显式指定的比例和分辨率。 |

 **Grok 兼容 · 创建视频任务**  `POST /v1/videos/generations`

```bash
curl 'https://img.junliai.org/v1/videos/generations' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "grok-video",
  "prompt": "海浪轻拍沙滩，镜头缓慢推进，电影质感",
  "duration": 6,
  "aspect_ratio": "2:3",
  "resolution": "720p"
}'
```

提交成功返回 `{"request_id":"任务ID"}`，随后查询同一任务，直至 `done`、`failed` 或 `expired`。仅通过 `/v1/videos/generations` 创建的任务使用这套状态格式。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `request_id` | `string` | — | 提交成功返回的任务 ID，用于查询和下载。 |
 `status` | `string` | — | pending=生成中；done=完成；failed=失败；expired=临时结果已过期。 |
 `progress` | `integer` | — | 本站任务阶段进度，完成时为 100。 |
 `video.url` | `string` | — | 完成后返回可直接下载的 MP4 地址，含临时下载凭证，有效期 24 小时；不要删除查询参数。 |
 `url / download_url` | `string` | — | 完成时返回本站 /content 地址；下载时必须携带生成该任务的 API Key。 |
 `video.duration` | `integer` | — | 完成视频的时长，单位为秒。 |
 `error.message` | `string` | — | 生成失败时的错误说明。 |

完成结果包含 `"status":"done","video":{"url":"...","duration":6,"respect_moderation":true}`。可直接下载 `video.url`；也可像 sub2api 一样通过携带 API Key 的 `/content` 路径下载。

 **Grok 兼容 · 查询与下载**  `GET /v1/videos/{request_id} · GET /content`

```bash
# 将 REQUEST_ID 替换为提交响应中的 request_id
curl 'https://img.junliai.org/v1/videos/REQUEST_ID' \
  -H 'Authorization: Bearer YOUR_API_KEY'

# 查询结果为 status: "done" 后下载
curl 'https://img.junliai.org/v1/videos/REQUEST_ID/content' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -o output.mp4
```

sub2api 接入：选择 Grok / xAI 的 API Key 账号，填写本站地址与密钥，配置本站已启用的图片、视频模型及模型映射；确保最终路径与本文给出的路径一致。旧版 Responses 连通性探测不生成媒体；sub2api 的图片/视频测试会实际生成并计费。

当前兼容上述媒体接口；批量生图、图片流式输出、mask、Files API、视频编辑/续接、自定义存储和音频参考尚未支持。

[Grok 图片生成与编辑 →](https://img.junliai.org/docs.md?page=grok)

# 文本对话与原生协议

<a id="text-completions"></a>

<a id="文本对话"></a>

## 文本对话

`POST /v1/chat/completions`

文本模型统一支持 Chat Completions，可直接用于 WorkBuddy 等兼容客户端。支持多轮对话、图片输入、函数工具调用与 SSE；具体能力以所选模型为准。非流式响应包含 `choices[].message`。

Responses 使用 `POST /v1/responses`，请求包含 `model` 与 `input`；Messages 使用 `POST /v1/messages`，请求包含 `model`、`messages` 与 `max_tokens`，可携带 `anthropic-version`。两者传 `stream: true` 请求 SSE。Gemini 使用 `POST /v1beta/models/{model}:generateContent` 与 `contents`，流式路径为 `:streamGenerateContent?alt=sse`。

文本 Responses 返回本站响应 ID。查询、取消、删除和 `input_items` 使用该 ID；续接时填入 `previous_response_id`，继续同一响应上下文。Chat Completions 使用 messages 传递历史对话与工具结果，不使用 previous\_response\_id；其他接口的开放范围以模型目录为准。

 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
 `model` | `string` | 是 | 文本模型 ID，可从模型目录获取。 |
 `messages` | `array` | 是 | 对话消息数组；文本模型支持其协议允许的图文内容和工具消息，具体能力由模型决定。 |
 `temperature` | `number` | 否 | 采样温度，范围 0 到 2。 |
 `top_p` | `number` | 否 | 核采样参数，范围 0 到 1。 |
 `max_tokens` | `integer` | 否 | 最大输出 token 数，必须大于 0。 |
 `max_completion_tokens` | `integer` | 否 | 最大完成 token 数，必须大于 0。 |
 `response_format` | `object` | 否 | 响应格式要求；是否支持取决于所选文本模型。 |
 `stream` | `boolean` | 否 | 文本模型传 true 返回 SSE；原有按次模型以实际接口支持为准。 |
 `tools / tool_choice` | `array / string / object` | 否 | 文本模型透传工具定义和选择参数，是否支持由模型决定。 |

 **文本对话**  `POST /v1/chat/completions`

```bash
curl https://img.junliai.org/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-6-sol",
    "messages": [
      {"role": "system", "content": "You are a concise assistant."},
      {"role": "user", "content": "用三句话介绍这项服务。"}
    ],
    "temperature": 0.7,
    "stream": false
  }'
```

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="https://img.junliai.org/v1")
result = client.chat.completions.create(
    model="gpt-6-sol",
    messages=[
        {"role": "system", "content": "You are a concise assistant."},
        {"role": "user", "content": "用三句话介绍这项服务。"},
    ],
    temperature=0.7,
)
print(result.choices[0].message.content)
```

# 接口速查

<a id="endpoint-index"></a>

<a id="接口目录"></a>

## 接口目录

点击查看参数与示例

[POST `/mj/submit/imagine` MJ · Imagine 文生图与垫图 提交文字提示词，可同时提供参考图片。比例和版本等 MJ 参数写在 prompt 内。](https://img.junliai.org/docs.md?page=mj-create#mj-imagine)

 

[GET `/mj/task/{id}/fetch` MJ · 查询单个任务 返回裸任务对象，包含任务状态、进度、图片或分析结果及可执行按钮。](https://img.junliai.org/docs.md?page=mj-results#mj-fetch)

 

[GET `/mj/image/{id}` MJ · 下载生成图片 图片生成完成后，优先使用任务返回的完整 imageUrl 下载；不要自行拼接图片地址。](https://img.junliai.org/docs.md?page=mj-results#mj-image)

 

[POST `/mj/submit/action` MJ · Action 放大、变体与扩图 从父任务 buttons 中选择按钮，原样提交其 customId。成功后继续查询返回的新任务 ID。](https://img.junliai.org/docs.md?page=mj-actions#mj-action)

 

[POST `/mj/submit/change` MJ · Change 结构化变化 用动作名称与宫格序号执行放大、变体或重绘。](https://img.junliai.org/docs.md?page=mj-actions#mj-change)

 

[POST `/mj/submit/simple-change` MJ · Simple Change 文本变化 将任务 ID 和动作简写放在 content 中。](https://img.junliai.org/docs.md?page=mj-actions#mj-simple-change)

 

[POST `/mj/submit/modal` MJ · Modal 局部重绘与自定义 Zoom 先提交父任务的 Vary (Region) / Custom Zoom 按钮，再使用该 Action 回执 result 指向的 Modal 任务补充参数。](https://img.junliai.org/docs.md?page=mj-actions#mj-modal)

 

[POST `/mj/submit/describe` MJ · Describe 图生文 上传一张图片，异步获取提示词分析。](https://img.junliai.org/docs.md?page=mj-create#mj-describe)

 

[POST `/mj/submit/blend` MJ · Blend 图片混合 将 2–5 张参考图混合生成新图。](https://img.junliai.org/docs.md?page=mj-create#mj-blend)

 

[POST `/mj/submit/shorten` MJ · Shorten 提示词分析 分析较长提示词，返回精简建议。](https://img.junliai.org/docs.md?page=mj-create#mj-shorten)

 

[POST `/mj/submit/upload-discord-images` MJ · 上传图片并获取 URL 将图片 Data URL 上传为后续可引用的 URL。该接口同步返回，不需要轮询任务。](https://img.junliai.org/docs.md?page=mj-results#mj-upload-discord-images)

 

[POST `/mj/submit/edits` MJ · Edits 图片编辑 使用图片 URL 和编辑提示词创建新任务，可附带蒙版。](https://img.junliai.org/docs.md?page=mj-actions#mj-edits)

 

[POST `/mj/task/list-by-condition` MJ · 批量查询任务 按任务 ID 列表查询，返回裸任务数组。只查询明确列出的任务，不支持按 state 搜索或列出所有任务。](https://img.junliai.org/docs.md?page=mj-results#mj-list)

 

[GET `/mj/task/{id}/image-seed` MJ · 获取图片 Seed 读取原任务对应的 Seed。使用 GET；同时兼容原有 POST 空 JSON 调用。](https://img.junliai.org/docs.md?page=mj-results#mj-seed)

 

[GET `/v1/user/balance` 账户余额 API Key 所属用户的剩余积分和累计成功消费](https://img.junliai.org/docs.md?page=billing#user-balance)

 

[GET `/v1/models` 模型列表 读取可用模型与支持协议](https://img.junliai.org/docs.md?page=models#models)

 

[GET `/admin/api/model-status` 模型状态 公开状态快照，无需 API Key](https://img.junliai.org/docs.md?page=model-status#model-status)

 

[POST `/v1/chat/completions` 文本对话 Chat Completions，支持 JSON / SSE 响应](https://img.junliai.org/docs.md?page=text#text-completions)

 

[POST `/v1/responses` Responses 文本 文本、工具调用、流式输出和会话续接](https://img.junliai.org/docs.md?page=text#text-completions)

 

[POST `/v1/messages` Messages 文本 Anthropic 原生请求与响应](https://img.junliai.org/docs.md?page=text#text-completions)

 

[POST `/v1beta/models/{model}:generateContent` Gemini 文本 Gemini 原生请求；流式使用 streamGenerateContent?alt=sse](https://img.junliai.org/docs.md?page=text#text-completions)

 

[POST `/v1/images/generations` 文生图 JSON，同步返回图像结果](https://img.junliai.org/docs.md?page=images#image-generation)

 

[GET `/v1/image-results/{id}` 读取公开图像 URL 模式返回的临时图像地址](https://img.junliai.org/docs.md?page=image-results#image-results)

 

[GET `/v1/images/{id}/content` 读取图像内容 需要 API Key 的图像二进制](https://img.junliai.org/docs.md?page=image-results#image-content)

 

[POST `/v1/images/edits` 图生图 multipart/form-data，上传参考图](https://img.junliai.org/docs.md?page=image-edit#image-edit)

 

[POST `/v1/responses` 异步生图 后台任务，适合长任务和参考图](https://img.junliai.org/docs.md?page=image-tasks#background-image)

 

[GET `/v1/responses/{id}` 查询异步任务 读取状态与 output\[0\].result](https://img.junliai.org/docs.md?page=image-tasks#responses-status)

 

[POST `/v1/responses/{id}/cancel` 取消异步任务 取消尚未完成的任务](https://img.junliai.org/docs.md?page=image-tasks#responses-status)

 

[POST `/v1/videos` 创建视频任务 JSON 或 multipart，立即返回 queued](https://img.junliai.org/docs.md?page=video#video-generation)

 

[GET `/v1/videos/{id}` 查询视频状态 轮询至 completed 或 failed](https://img.junliai.org/docs.md?page=video-results#video-status)

 

[GET `/v1/videos/{id}/content` 下载视频 返回 mp4 原始二进制](https://img.junliai.org/docs.md?page=video-results#video-content)

# 尺寸与格式

<a id="formats"></a>

<a id="尺寸与格式"></a>

## 接口说明

按模型能力选择

`firefly-gpt-image-2`  **图片尺寸** 下表只适用于该图片模型。建议直接使用表内原生尺寸，最长边不超过 3840。

 比例 | 1K | 2K | 4K |
| --- | --- | --- | --- |
 1:1 · 方 | `1024x1024` | `2048x2048` | `2880x2880` |
 5:4 · 横 | `1120x896` | `2240x1792` | `3200x2560` |
 4:3 · 横 | `1152x864` | `2304x1728` | `3264x2448` |
 3:2 · 横 | `1248x832` | `2496x1664` | `3504x2336` |
 16:9 · 横 | `1280x720` | `2560x1440` | `3840x2160` |
 21:9 · 超宽 | `1456x624` | `3024x1296` | `3696x1584` |
 4:5 · 竖 | `896x1120` | `1792x2240` | `2560x3200` |
 3:4 · 竖 | `864x1152` | `1728x2304` | `2448x3264` |
 2:3 · 竖 | `832x1248` | `1664x2496` | `2336x3504` |
 9:16 · 竖 | `720x1280` | `1440x2560` | `2160x3840` |

例如：2K · 16:9 传 `"size": "2560x1440"`。其他图片模型请以模型目录中的比例和分辨率为准。

 **视频**  `size`  **对照** 短边决定 720p / 1080p / 1440p / 2160p 档位。实际档位仍必须在对应视频模型的公开能力内。

 比例 | 720p | 1080p | 1440p | 2160p |
| --- | --- | --- | --- | --- |
 21:9 · 超宽 | `1680x720` | `2520x1080` | `3360x1440` | `5040x2160` |
 16:9 · 横 | `1280x720` | `1920x1080` | `2560x1440` | `3840x2160` |
 9:16 · 竖 | `720x1280` | `1080x1920` | `1440x2560` | `2160x3840` |
 1:1 · 方 | `720x720` | `1080x1080` | `1440x1440` | `2160x2160` |
 4:3 · 横 | `960x720` | `1440x1080` | `1920x1440` | `2880x2160` |
 3:4 · 竖 | `720x960` | `1080x1440` | `1440x1920` | `2160x2880` |

例如：720p 的 16:9 横版传 `"size": "1280x720"`；竖版 9:16 传 `"720x1280"`。

# 错误处理与重试

<a id="contract"></a>

<a id="http-errors"></a>

## HTTP 状态与处理

HTTP 状态描述本次请求的处理结果；异步任务还需检查业务状态。以接口返回的具体错误文案为准，不能仅凭状态码判断原因。

400参数缺失、不支持、未定价或提示词被拒

401鉴权失败，具体原因以响应说明为准

402积分不足或密钥消费额度不足

403权限不足、模型不在密钥分组内，或密钥已停用、过期

404模型、任务或结果不存在

409内容尚未完成，或文本幂等请求已存在

413参考媒体过大

422图片 URL 无效或幂等键冲突

429并发或队列已满，请稍后重试

501当前模型不支持该能力

502请求执行失败

503模型暂不可用或文本模型尚未定价，具体原因以响应说明为准

<a id="retry"></a>

## 重试前先确认结果

提交超时不代表任务失败。保存任务编号与幂等标识，优先查询已有记录；确认无需继续等待后再按对应接口约定处理。应用和 MJ 的业务状态、费用与幂等规则见对应接口文档。

<a id="help"></a>

## 常见问题

<a id="authentication"></a>

## 为什么提示密钥无效？

API 调用需要完整的本站 API Key；网页登录 Cookie 和脱敏密钥不能代替。请核对密钥是否过期或被禁用。

<a id="model-access"></a>

## 为什么看不到某个模型？

密钥绑定模型分组后，只能列出和调用该分组内的可用模型。空分组或已删除的分组仍保持限制。

<a id="task-state"></a>

## HTTP 200 是否代表任务成功？

不一定。异步任务需要继续查询业务状态，按对应接口文档确认结果；结果未知时先核对已有任务，避免重复提交。

<a id="errors"></a>

## 如何处理接口错误？

保留接口返回的具体错误说明，根据参数、权限、额度或任务状态处理。积分和退款记录可在积分流水中按密钥查询。

# 示例阅读指南

<a id="first-request"></a>

<a id="发起第一次调用"></a>

## 发起第一次调用

选择语言，复制示例，将 YOUR\_API\_KEY 替换为你的密钥。

[更多示例](#examples)

<a id="examples"></a>

每篇接口文档提供相应语言的完整示例。替换 API Key、模型和媒体地址后再执行；生成请求会实际计费。

-   [图片生成示例](https://img.junliai.org/docs.md?page=images)
    
-   [图片编辑示例](https://img.junliai.org/docs.md?page=image-edit)
    
-   [异步生图示例](https://img.junliai.org/docs.md?page=image-tasks)
    
-   [视频提交示例](https://img.junliai.org/docs.md?page=video)
    
-   [文本请求示例](https://img.junliai.org/docs.md?page=text)
    
-   [MJ 完整客户端](https://img.junliai.org/docs.md?page=mj-examples)
    

# 常见问题导航

-   [密钥无效、分组和价格限制](https://img.junliai.org/docs.md?page=api-keys)
    
-   [积分、预扣和失败退款](https://img.junliai.org/docs.md?page=billing)
    
-   [任务异常与安全重试](https://img.junliai.org/docs.md?page=errors)
    
-   [模型可用状态](https://img.junliai.org/docs.md?page=model-status)
    

# 模型状态

<a id="model-status"></a>

<a id="模型状态"></a>

## 接口说明

`GET /admin/api/model-status 无需 Key`

返回当前模型的公开可用性快照，适合状态页、自动切换模型和调用前健康检查。该接口不需要登录，也不需要 `Authorization` 请求头。

公开接口，可直接跨页面调用。服务端状态快照最多缓存 5 分钟；客户端可按需轮询，建议间隔不少于 60 秒。

operationaldegradedoutagemaintenanceunknown

 字段 | 类型 | 说明 |
| --- | --- | --- |
 `data` | `array` | 当前公开模型的状态列表。 |
 `data[].model_id` | `string` | 模型配置 ID。 |
 `data[].name` | `string` | 模型显示名称。 |
 `data[].alias` | `string` | 公开别名；未设置时省略。 |
 `data[].description` | `string` | 公开模型说明；为空时省略。 |
 `data[].type` | `string` | 模型类型：text、image 或 video。 |
 `data[].provider` | `string` | 模型所属服务类型。 |
 `data[].prices` | `object` | 公开价格表：图片按分辨率、视频按分辨率及 video\_billing\_mode（per\_second 按秒、per\_request 按次）、文本按次展示积分价格；按 token 模型以 text\_pricing 中的输入、输出、缓存价格为准。 |
 `data[].status` | `string` | operational、degraded、outage、maintenance 或 unknown。 |
 `data[].status_reason` | `string` | 当前状态的简要原因。 |
 `data[].availability_7d` | `number \| null` | 最近 7 天可用率，范围 0 到 1；无数据时为 null。 |
 `data[].samples_7d` | `integer` | 最近 7 天计入可用率的样本数量。 |
 `data[].avg_ms` | `integer \| null` | 最近 24 小时平均处理耗时，单位毫秒。 |
 `data[].last_checked_at` | `string \| null` | 最近检测时间，RFC 3339 格式。 |
 `data[].updated_at` | `string` | 该模型状态记录的更新时间，RFC 3339 格式。 |
 `updated_at` | `string` | 本次公开状态快照的更新时间。 |

 **模型状态**  `GET /admin/api/model-status · 无需 API Key`

```bash
curl https://img.junliai.org/admin/api/model-status
```
