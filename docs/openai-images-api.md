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

## Intelligent routing and compatibility

All website and public API image requests use the same PIXORY model gateway.
For `gpt-image-2`, PIXORY uses the current primary image provider first and
automatically falls back to the standby provider when the primary provider is
unavailable, times out, rejects authentication, or runs out of quota.

Routing is entirely server-side. Existing integrations do not need to change:

- endpoint URLs and authentication remain unchanged;
- continue sending the public model name `gpt-image-2`;
- request parameters, task IDs, polling endpoints, and response shapes remain unchanged;
- a provider fallback never charges PIXORY credits twice;
- failed asynchronous tasks continue to refund reserved credits.

Do not send an upstream provider's internal model name. PIXORY may change its
upstream providers without changing this public API contract.
