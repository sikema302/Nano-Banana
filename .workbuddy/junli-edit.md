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
