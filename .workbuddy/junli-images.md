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
