export type PublicImageErrorCategory =
  | 'sensitive_prompt'
  | 'reference_image_format'
  | 'reference_image_size'
  | 'reference_image_count'
  | 'reference_image_load'
  | 'reference_image'
  | 'service_unavailable'
  | 'request'
  | 'busy';

export type PublicImageError = {
  category: PublicImageErrorCategory;
  message: string;
};

function normalizedError(value: unknown) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export function classifyPublicImageError(value: unknown): PublicImageError {
  const normalized = normalizedError(value);
  const lower = normalized.toLowerCase();

  if (containsAny(lower, [
    /content.?policy/,
    /moderation/,
    /safe.*policy|unsafe|nsfw/,
    /sensitive|prohibited|inappropriate/,
    /prompt.*(?:blocked|rejected|violation)/,
    /adobe\s+content\s+rejected/,
    /image_unsafe/,
    /敏感|违规|违禁|不合规|色情|涉黄|暴力|审核未通过/,
  ])) {
    return { category: 'sensitive_prompt', message: '注意提示词或图片敏感信息，请修改重试哦～' };
  }

  if (containsAny(lower, [
    /unsupported\s+or\s+unpriced/,
    /unpriced/,
    /unsupported\s+(?:parameter|value|size|model|image.?size)/,
  ])) {
    return { category: 'request', message: '当前使用的参数或模型不支持，请调整后重试' };
  }

  if (containsAny(lower, [
    /image\s+generation\s+failed/,
    /image\s+generation\s+(?:failed|error)/,
  ])) {
    return { category: 'service_unavailable', message: '图像生成失败，请稍后重试或修改提示词' };
  }

  if (containsAny(lower, [
    /reference.?image|reference.?images/,
    /base64.*image|image.*base64/,
    /参考图|参考图片/,
  ])) {
    // 数量超限
    if (/maximum|too many|最多|数量|limit/.test(lower)) {
      return { category: 'reference_image_count', message: '最多支持 6 张参考图，请减少后重试' };
    }
    // 尺寸/大小问题（文件太大、分辨率不符合要求等）
    if (/25\s*mb|too large|too small|size|smaller|超过|大小|尺寸|resolution/.test(lower)) {
      return { category: 'reference_image_size', message: '参考图尺寸或大小不符合要求，请调整后重试' };
    }
    // 图片类型/格式不支持（HEIC、GIF、TIFF、WebP、SVG、BMP 等）
    if (/heic|gif|tiff|webp|svg|bmp|unsupported.*(?:image|format|type)|格式不支持|不支持的图片格式/.test(lower)) {
      return { category: 'reference_image_format', message: '参考图格式不支持，请使用 JPG/PNG 格式' };
    }
    // 通用格式/数据无效
    if (/invalid|format|mime|data url|supported image|格式|无效/.test(lower)) {
      return { category: 'reference_image_format', message: '参考图格式或数据无效，请更换后重试' };
    }
    // 读取/下载失败
    if (/load|download|fetch|http|https|url|hosting|app_url|读取|下载|链接|上传/.test(lower)) {
      return { category: 'reference_image_load', message: '参考图读取失败，请检查图片或链接后重试' };
    }
    return { category: 'reference_image', message: '参考图处理失败，请检查图片后重试' };
  }

  if (containsAny(lower, [
    /database|prisma|server is shutting down|error querying the database|database system is shutting down|database connection/i,
  ])) {
    return { category: 'service_unavailable', message: '图像服务暂时不可用，请稍后重试' };
  }

  // 所有渠道全部失败后的兜底：真正的图片服务器问题
  if (/image_service_unavailable/.test(lower)) {
    return { category: 'service_unavailable', message: '图片服务器暂时不可用，请稍后重试' };
  }

  if (containsAny(lower, [
    /(?:502|503|504)(?:\s|\b)/,
    /bad gateway|gateway time-?out|service unavailable/,
    /timed?\s*out|timeout|abort(?:ed|error)/,
    /network|fetch failed|socket|dns|econn|connection (?:reset|refused|terminated)/,
    /internal (?:server )?(?:error|failure)/,
    /服务暂时不可用|服务异常|网络异常|响应超时|网关异常/,
  ])) {
    return { category: 'service_unavailable', message: '当前模型太拥挤了，请稍后重试或试试其他模型' };
  }

  if (containsAny(lower, [
    /api.?key.*(?:invalid|revoked|paused)/,
    /invalid.*api.?key/,
    /api key.*(?:无效|注销|暂停)/i,
  ])) {
    return { category: 'request', message: 'API Key 无效或不可用，请检查后重试' };
  }

  if (containsAny(lower, [
    /credits?.*(?:not enough|insufficient|remaining)/,
    /insufficient.*credits?/,
    /积分不足|余额不足|额度不足/,
  ])) {
    return { category: 'request', message: '积分不足，请充值后重试' };
  }

  if (/queue.*(?:full|capacity)|队列已满/.test(lower)) {
    return { category: 'request', message: '当前请求较多，请稍后重试' };
  }

  return { category: 'busy', message: '当前模型太拥挤了，请稍后重试或试试其他模型' };
}

export function publicImageErrorMessage(value: unknown) {
  return classifyPublicImageError(value).message;
}
