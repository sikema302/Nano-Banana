export type PublicImageErrorCategory =
  | 'sensitive_prompt'
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
    /safety|unsafe|nsfw/,
    /sensitive|prohibited|inappropriate/,
    /prompt.*(?:blocked|rejected|violation)/,
    /敏感|违规|违禁|不合规|色情|涉黄|暴力|审核未通过/,
  ])) {
    return { category: 'sensitive_prompt', message: '提示词包含敏感信息，请修改后重试' };
  }

  if (containsAny(lower, [
    /reference.?image|reference.?images/,
    /base64.*image|image.*base64/,
    /参考图|参考图片/,
  ])) {
    if (/maximum|too many|最多|数量|limit/.test(lower)) {
      return { category: 'reference_image', message: '最多支持 6 张参考图，请减少后重试' };
    }
    if (/25\s*mb|too large|size|smaller|超过|大小/.test(lower)) {
      return { category: 'reference_image', message: '参考图单张不能超过 25MB，请压缩后重试' };
    }
    if (/invalid|format|mime|data url|supported image|格式|无效/.test(lower)) {
      return { category: 'reference_image', message: '参考图格式或数据无效，请更换后重试' };
    }
    if (/load|download|fetch|http|https|url|hosting|app_url|读取|下载|链接|上传/.test(lower)) {
      return { category: 'reference_image', message: '参考图读取失败，请检查图片或链接后重试' };
    }
    return { category: 'reference_image', message: '参考图处理失败，请检查图片后重试' };
  }

  if (containsAny(lower, [
    /image_service_unavailable/,
    /(?:502|503|504)(?:\s|\b)/,
    /bad gateway|gateway time-?out|service unavailable/,
    /timed?\s*out|timeout|abort(?:ed|error)/,
    /network|fetch failed|socket|dns|econn|connection (?:reset|refused|terminated)/,
    /database|prisma|internal (?:server )?(?:error|failure)|server is shutting down/,
    /服务暂时不可用|服务异常|网络异常|响应超时|网关异常/,
  ])) {
    return { category: 'service_unavailable', message: '图像服务暂时不可用，请稍后重试' };
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

  return { category: 'busy', message: '当前模型过于拥挤，请使用其他模型' };
}

export function publicImageErrorMessage(value: unknown) {
  return classifyPublicImageError(value).message;
}
