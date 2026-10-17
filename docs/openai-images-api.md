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

Public API output images are copied into Cloudflare R2 before the
request is reported as successful. The API returns only a durable R2
image URL. If copying or verification fails, the task fails and its reserved
credits are refunded instead of returning a temporary upstream URL.

User-facing generation failures are intentionally provider-neutral. They are
reported as a sensitive-prompt correction, a specific reference-image problem,
a temporary image-service outage, or model congestion. Responses never expose
the upstream model, provider, fallback order, or internal switching behavior.

PIXORY extensions supported by this endpoint:

- `dimensions`, `aspect_ratio`, or `aspectRatio`: any ratio supported by the web UI.
- `imageSize` or `image_size`: `gpt-image-2` supports `STANDARD`, `2K`, and `4K`; `nano-banana-pro` supports `1K`, `2K`, and `4K`; `nano-banana-2.1` supports `1K`, `2K`, and `4K` (defaults to `1K`; each tier is priced separately in the admin console).
- `reference_images` or `images`: up to 6 HTTPS URLs or image data URLs; Base64 images must be no larger than 25 MB each.
- `optimizeChineseText`: Nano Banana billing option (`nano-banana-pro` and `nano-banana-2.1`). When enabled it adds a per-image surcharge, configured in the admin console, but no upstream native enhancement feature or enhancement endpoint is called. `nano-banana-2.1` ignores this surcharge entirely and is billed only by its image-size tier.

For asynchronous use, keep using:

```text
POST /v1/async/images/generations
GET  /v1/async/images/generations/{task_id}
```

## Intelligent routing and compatibility

All website and public API image requests use the same PIXORY model gateway and
the same per-resolution channel order configured in the admin console. This
applies to `gpt-image-2`, `nano-banana-pro`, and `nano-banana-2.1` (the latter
runs on a single fixed upstream and is therefore never reordered across
channels), and to legacy API keys.

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

## Nano Banana 2.1

`nano-banana-2.1` is Google's newest Nano Banana model, tuned for finer detail
and more accurate Chinese text. The request and response shapes are identical to
`nano-banana-pro`; only the model identifier and the price tiers differ.

- Accepted model identifiers: `nano-banana-2.1`, `nano-banana-21`,
  `nano_banana_2_1`, `gemini-nano-banana-2.1` (case-insensitive).
- Modes: text-to-image and image-to-image. Reference images use the same
  `images` / `reference_images` fields, up to 6 images.
- `imageSize`: `1K` (default), `2K`, `4K`. Any other value is treated as `1K`.
- Credits: priced per image-size tier. The tiers are configured in the admin
  console, are returned by the models endpoint, and are the only billing input
  for this model.
- `optimizeChineseText` is accepted but ignored: no surcharge and no upstream
  enhancement call.
- `quality` is accepted but ignored; it does not change the price.
- Single fixed upstream: unlike `nano-banana-pro`, this model does not fail over
  to another channel. If generation fails, the endpoint returns a
  provider-neutral error and the reserved credits are refunded immediately.

Synchronous example:

```bash
curl https://pixory.top/v1/images/generations \
  -H "Authorization: Bearer px_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nano-banana-2.1",
    "prompt": "Merge both reference images into a premium product poster",
    "images": ["https://example.com/reference-1.png", "https://example.com/reference-2.png"],
    "aspectRatio": "1:1",
    "imageSize": "2K"
  }'
```

Asynchronous example:

```bash
curl https://pixory.top/v1/async/images/generations \
  -H "Authorization: Bearer px_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{ "model": "nano-banana-2.1", "prompt": "A cinematic harbor at sunrise", "aspectRatio": "16:9", "imageSize": "4K" }'

curl https://pixory.top/v1/async/images/generations/{task_id} \
  -H "Authorization: Bearer px_your_api_key"
```
