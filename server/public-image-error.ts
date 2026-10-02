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

// 内部渠道/上游/模型标识：这些词出现在错误里会暴露路由与供应商实现细节，
// 统一在「展示真实错误」前清洗掉，只保留用户能理解的语义。
const INTERNAL_DETAIL_PATTERN = new RegExp(
  [
    'junliai',
    'visionary',
    'uselg',
    'fluxport',
    'firefly',
    'openrouter',
    'openai',
    'gpt-image[^\\s,，;；:：)]*',
    'nano-?banana[^\\s,，;；:：)]*',
    'schat-[a-z0-9-]+',
    'banana',
    'flux',
    'adobe',
    'gemini',
    'midjourney',
    'stability',
    'dall-?e[^\\s,，;；:：)]*',
    'ideogram',
    'recraft',
    'qwen',
    'wanx',
    'hunyuan',
    'doubao',
    '备用渠道\\s*\\w*',
    '备用通道\\s*\\w*',
    '渠道',
    '通道',
    'provider',
    'upstream',
    '上游',
    'switch\\w*',
    'fallback\\w*',
    'failover',
    'cooldown',
    'route\\w*',
  ].join('|'),
  'gi',
);

const SERVICE_UNAVAILABLE_MESSAGE = '当前模型太拥挤了，请稍后重试或试试其他模型';

// 纯技术性、对用户无意义的内部错误（连接重置、DNS、socket 等），不直接展示原文。
const LOW_VALUE_TECHNICAL_PATTERN =
  /^(?:fetch failed|network|socket|dns|econn\w*|etimedout|econnreset|econnrefused|terminated|aborted?|abort error|connection (?:reset|refused|terminated)|internal (?:server )?(?:error|failure)|\d{3}(?:\s.*)?|bad gateway|gateway time-?out|service unavailable|http\/\d[\d.]*\s*\d{3})[\s\S]*$/i;

// 上游常把整段 JSON 错误报文塞进错误文本，例如：
//   request failed: 任务已明确失败: custom rejected request parameters: 422
//   {"error":{"code":10001,"message":"当前提示词暂时无法生成，请更换提示词后重试","type":"invalid_request_error"}} (HTTP 502)
// 外层包装（request failed / 任务已明确失败 / HTTP 502）对用户和后台都没有价值，
// 真正有意义的是里面的 message 字段，这里把它抠出来供展示层复用。
const EMBEDDED_MESSAGE_PATTERN = /"message"\s*:\s*"((?:\\.|[^"\\])*)"/i;

function decodeJsonStringLiteral(value: string) {
  return value.replace(/\\(u[0-9a-fA-F]{4}|[\s\S])/g, (_match: string, escape: string) => {
    if (escape[0] === 'u') return String.fromCharCode(parseInt(escape.slice(1), 16));
    switch (escape) {
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'b': return '\b';
      case 'f': return '\f';
      case '"': return '"';
      case '\\': return '\\';
      case '/': return '/';
      default: return escape;
    }
  });
}

/**
 * 从上游错误文本里提取内嵌 JSON 报文的 message 字段。
 * 仅当该 message 可安全展示（非内部敏感信息、非纯技术噪声）时返回，否则返回空串，交由调用方兜底。
 */
export function extractUpstreamErrorMessage(value: unknown): string {
  const match = EMBEDDED_MESSAGE_PATTERN.exec(String(value ?? ''));
  if (!match) return '';
  const decoded = decodeJsonStringLiteral(match[1]).replace(/\s+/g, ' ').trim();
  if (!decoded) return '';
  if (isSensitiveOrInternal(decoded)) return '';
  const cleaned = decoded.replace(INTERNAL_DETAIL_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || LOW_VALUE_TECHNICAL_PATTERN.test(cleaned)) return '';
  return cleaned.length > 300 ? `${cleaned.slice(0, 300).trimEnd()}…` : cleaned;
}

function isSensitiveOrInternal(raw: string) {
  return /prisma|database|sqlite|error querying the database|shutting down|database connection/i.test(raw);
}

/**
 * 把上游真实错误整理成「用户能看懂、且不暴露渠道/供应商实现细节」的文案。
 * - 命中内容审核：固定为内容审核提示（单独分类）。
 * - 命中明确的服务不可用（5xx/网关/超时/网络）：用「太拥挤」中性文案。
 * - 其余情况：清洗内部标识后透传真实原文；原文无有效信息才回退「太拥挤」。
 */
function toUserFacingMessage(normalized: string): string {
  const raw = normalized.replace(INTERNAL_DETAIL_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return SERVICE_UNAVAILABLE_MESSAGE;
  if (isSensitiveOrInternal(normalized)) return '图像服务暂时不可用，请稍后重试';
  // 内部标识清掉后若只剩技术噪声（纯状态码/连接错误），对用户没意义，用中性文案。
  if (LOW_VALUE_TECHNICAL_PATTERN.test(raw)) return SERVICE_UNAVAILABLE_MESSAGE;
  return raw.length > 160 ? `${raw.slice(0, 160).trimEnd()}…` : raw;
}

/**
 * 供外部（如 server/index.ts 的 sanitizeExternalErrorMessage）复用的脱敏：
 * 输入任意上游错误原文，返回清洗掉渠道/供应商/模型名后的安全文本；
 * 若清洗后无有效信息或属于敏感内部错误，返回空串，交由调用方决定兜底文案。
 */
export function sanitizeUpstreamErrorForDisplay(value: unknown): string {
  const normalized = normalizedError(value);
  if (!normalized) return '';
  // 上游 JSON 报文里的 message 已经是清洗过的可读文案，直接用它，不再透传外层包装。
  const embedded = extractUpstreamErrorMessage(value);
  if (embedded) return embedded;
  if (isSensitiveOrInternal(normalized)) return '';
  const raw = normalized.replace(INTERNAL_DETAIL_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (LOW_VALUE_TECHNICAL_PATTERN.test(raw)) return '';
  return raw.length > 300 ? `${raw.slice(0, 300).trimEnd()}…` : raw;
}

function containsAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

// 内容审核/敏感类信号：包装层与内嵌 message 任一命中都要拦住，因此两个文本都测。
const SENSITIVE_PROMPT_PATTERNS = [
  /content.?policy/,
  /moderation/,
  /safe.*policy|unsafe|nsfw/,
  /sensitive|prohibited|inappropriate/,
  /prompt.*(?:blocked|rejected|violation)/,
  /adobe\s+content\s+rejected/,
  /image_unsafe/,
  /gemini\s+upstream\s+error/,
  /content\s+moderation\s+rejected/,
  /敏感|违规|违禁|不合规|色情|涉黄|暴力|安全审核|未通过.{0,6}审核|审核未通过/,
];

export function classifyPublicImageError(value: unknown): PublicImageError {
  const normalized = normalizedError(value);
  const fullLower = normalized.toLowerCase();
  // 上游 JSON 报文里的 message 比外层包装（request failed / 任务已明确失败 / HTTP 502）更有信息量。
  const embedded = extractUpstreamErrorMessage(value);
  const lower = (embedded || normalized).toLowerCase();

  if (containsAny(lower, SENSITIVE_PROMPT_PATTERNS) || containsAny(fullLower, SENSITIVE_PROMPT_PATTERNS)) {
    return { category: 'sensitive_prompt', message: '提示词或参考图未通过内容审核，请修改后重试' };
  }

  // 语义明确的分类：包装层与内嵌 message 任一命中都算，保证原有判定不丢失。
  const matches = (pattern: RegExp) => pattern.test(lower) || pattern.test(fullLower);
  const matchesAny = (patterns: RegExp[]) => patterns.some(matches);

  if (matchesAny([
    /unsupported\s+or\s+unpriced/,
    /unpriced/,
    /unsupported\s+(?:parameter|value|size|model|image.?size)/,
  ])) {
    return { category: 'request', message: '当前使用的参数或模型不支持，请调整后重试' };
  }

  if (matchesAny([
    /image\s+generation\s+failed/,
    /image\s+generation\s+(?:failed|error)/,
  ])) {
    return { category: 'service_unavailable', message: '图像生成失败，请稍后重试或修改提示词' };
  }

  if (matchesAny([
    /reference.?image|reference.?images/,
    /base64.*image|image.*base64/,
    /参考图|参考图片/,
  ])) {
    // 数量超限
    if (matches(/maximum|too many|最多|数量|limit/)) {
      return { category: 'reference_image_count', message: '最多支持 6 张参考图，请减少后重试' };
    }
    // 尺寸/大小问题（文件太大、分辨率不符合要求等）
    if (matches(/25\s*mb|too large|too small|size|smaller|超过|大小|尺寸|resolution/)) {
      return { category: 'reference_image_size', message: '参考图尺寸或大小不符合要求，请调整后重试' };
    }
    // 图片类型/格式不支持（HEIC、GIF、TIFF、WebP、SVG、BMP 等）
    if (matches(/heic|gif|tiff|webp|svg|bmp|unsupported.*(?:image|format|type)|格式不支持|不支持的图片格式/)) {
      return { category: 'reference_image_format', message: '参考图格式不支持，请使用 JPG/PNG 格式' };
    }
    // 通用格式/数据无效
    if (matches(/invalid|format|mime|data url|supported image|格式|无效/)) {
      return { category: 'reference_image_format', message: '参考图格式或数据无效，请更换后重试' };
    }
    // 读取/下载失败
    if (matches(/load|download|fetch|http|https|url|hosting|app_url|读取|下载|链接|上传/)) {
      return { category: 'reference_image_load', message: '参考图读取失败，请检查图片或链接后重试' };
    }
    return { category: 'reference_image', message: '参考图处理失败，请检查图片后重试' };
  }

  if (containsAny(fullLower, [
    /database|prisma|server is shutting down|error querying the database|database system is shutting down|database connection/i,
  ])) {
    return { category: 'service_unavailable', message: '图像服务暂时不可用，请稍后重试' };
  }

  if (matchesAny([
    /api.?key.*(?:invalid|revoked|paused)/,
    /invalid.*api.?key/,
    /api key.*(?:无效|注销|暂停)/i,
  ])) {
    return { category: 'request', message: 'API Key 无效或不可用，请检查后重试' };
  }

  if (matchesAny([
    /credits?.*(?:not enough|insufficient|remaining)/,
    /insufficient.*credits?/,
    /积分不足|余额不足|额度不足/,
  ])) {
    return { category: 'request', message: '积分不足，请充值后重试' };
  }

  if (matches(/queue.*(?:full|capacity)|队列已满/)) {
    return { category: 'request', message: '当前请求较多，请稍后重试' };
  }

  // 内嵌 message 是可读的业务错误（如「当前提示词暂时无法生成」）：它比外层包装的
  // 5xx/网络关键词更能说明问题，直接展示，避免被归类成笼统的「太拥挤」。
  if (embedded) return { category: 'busy', message: embedded };

  // 所有渠道全部失败后的兜底：真正的图片服务器问题
  if (/image_service_unavailable/.test(fullLower)) {
    return { category: 'service_unavailable', message: '图片服务器暂时不可用，请稍后重试' };
  }

  if (matchesAny([
    /(?:502|503|504)(?:\s|\b)/,
    /bad gateway|gateway time-?out|service unavailable/,
    /timed?\s*out|timeout|abort(?:ed|error)/,
    /network|fetch failed|socket|dns|econn|connection (?:reset|refused|terminated)/,
    /internal (?:server )?(?:error|failure)/,
    /服务暂时不可用|服务异常|网络异常|响应超时|网关异常/,
  ])) {
    // 明确的服务不可用/网络类错误：保留中性「太拥挤」文案，不暴露上游技术细节。
    return { category: 'service_unavailable', message: SERVICE_UNAVAILABLE_MESSAGE };
  }

  // 兜底：把真实错误（已清洗渠道/供应商/模型名）带给用户；
  // 若原文是敏感内部信息、纯技术噪声或为空，才回退到「太拥挤」中性文案。
  return { category: 'busy', message: toUserFacingMessage(normalized) };
}

export function publicImageErrorMessage(value: unknown) {
  return classifyPublicImageError(value).message;
}
