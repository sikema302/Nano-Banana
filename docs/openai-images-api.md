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
      "url": "https://upstream-images.example/result.png",
      "revised_prompt": "A cinematic harbor at sunrise"
    }
  ]
}
```

Set `response_format` to `b64_json` to receive Base64 image data. `n` currently
must be `1`.

Public API output images are not copied into PIXORY local storage or R2. The API
returns an upstream HTTPS result URL directly when one is available. Provider
results that exist only as inline image data are returned from a bounded,
short-lived memory cache and should be downloaded promptly. Generation metadata,
status, duration, and billing remain in admin history, with an empty image path.
If an inline asynchronous result expires before it is fetched, its task remains
in `succeeded` state with an empty `results` array and `resultExpired: true`.

User-facing generation failures are intentionally provider-neutral. They are
reported as a sensitive-prompt correction, a specific reference-image problem,
a temporary image-service outage, or model congestion. Responses never expose
the upstream model, provider, fallback order, or internal switching behavior.

PIXORY extensions supported by this endpoint:

- `dimensions`, `aspect_ratio`, or `aspectRatio`: any ratio supported by the web UI.
- `imageSize` or `image_size`: `gpt-image-2` supports `STANDARD`, `2K`, and `4K`; `nano-banana-pro` supports `1K`, `2K`, and `4K`.
- `reference_images` or `images`: up to 6 HTTPS URLs or image data URLs; Base64 images must be no larger than 25 MB each.
- `optimizeChineseText`: Nano Banana billing option. When enabled it adds 8 PIXORY credits, but no upstream native enhancement feature or enhancement endpoint is called.

For asynchronous use, keep using:

```text
POST /v1/async/images/generations
GET  /v1/async/images/generations/{task_id}
```

## Intelligent routing and compatibility

All website and public API image requests use the same PIXORY model gateway and
the same per-resolution channel order configured in the admin console. This
applies to both `gpt-image-2` and `nano-banana-pro` and to legacy API keys.

When a channel explicitly rejects a request, PIXORY immediately tries the next
enabled channel in the configured order. The failed channel is temporarily
skipped for 30 seconds; after that, the next request starts evaluating from the
first configured channel again. If the upstream result is uncertain, PIXORY
does not fail over during that request, preventing duplicate generations or
duplicate provider costs. Failed tasks refund their reserved PIXORY credits.

Routing is entirely server-side. Existing integrations do not need to change:

- endpoint URLs and authentication remain unchanged;
- continue sending the public model name `gpt-image-2`;
- request parameters, task IDs, polling endpoints, and response shapes remain unchanged;
- a provider fallback never charges PIXORY credits twice;
- failed asynchronous tasks continue to refund reserved credits.

Do not send an upstream provider's internal model name. PIXORY may change its
upstream providers without changing this public API contract.
