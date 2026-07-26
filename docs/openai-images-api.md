# PIXORY OpenAI Images API

PIXORY exposes an OpenAI-compatible synchronous image generation endpoint:

```text
POST https://pixory.top/v1/images/generations
```

Authenticate with an existing PIXORY API key:

```http
Authorization: Bearer px_your_api_key
Content-Type: application/json
```

Example:

```bash
curl https://pixory.top/v1/images/generations \
  -H "Authorization: Bearer px_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "A cinematic harbor at sunrise",
    "size": "1536x1024",
    "quality": "high",
    "response_format": "url"
  }'
```

The response follows the OpenAI Images shape:

```json
{
  "created": 1785067200,
  "data": [
    {
      "url": "https://pixory.top/uploads/generated/example.png",
      "revised_prompt": "A cinematic harbor at sunrise"
    }
  ]
}
```

Set `response_format` to `b64_json` to receive Base64 image data. `n` currently
must be `1`.

PIXORY extensions supported by this endpoint:

- `dimensions`, `aspect_ratio`, or `aspectRatio`: any ratio supported by the web UI.
- `imageSize` or `image_size`: `STANDARD`, `2K`, or `4K`.
- `reference_images` or `images`: up to 9 HTTPS URLs or image data URLs.

For asynchronous use, keep using:

```text
POST /v1/async/images/generations
GET  /v1/async/images/generations/{task_id}
```

GPT Image requests use the configured Chat2API service first. PIXORY
automatically falls back to the existing Visionary provider when the primary
service fails or runs out of quota. The circuit state is persisted so quota
failures are not retried on every user request.
