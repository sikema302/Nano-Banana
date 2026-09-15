// 生图请求「上游已成功、但本地没交付完」时的失败归因。
//
// 背景：上游出图成功后，代码还要依次做「转存图片 → 扣积分 → 写历史」。
// 这三步各自的后果完全不同——图有没有、钱扣没扣——但历史上它们共用了一句
// 「积分扣款状态暂时无法确认」的文案，导致后台既看不懂、也定位不到根因。
// 这里把归因做成一件事先可测的纯函数，文案与阶段一一对应。

export type GenerationFailureStage = 'upstream' | 'persist' | 'charge' | 'post-charge';

export type GenerationFailureState = {
  /** 上游是否已经成功返回了图片（as opposed to 上游本身失败） */
  upstreamSucceeded: boolean;
  /** 图片是否已经落到持久层（R2 或降级后的本地磁盘） */
  imagePersisted: boolean;
  /** 积分是否已经真正扣除 */
  creditsCharged: boolean;
};

export function resolveGenerationFailureStage(state: GenerationFailureState): GenerationFailureStage {
  if (!state.upstreamSucceeded) return 'upstream';
  if (!state.imagePersisted) return 'persist';
  if (!state.creditsCharged) return 'charge';
  return 'post-charge';
}

/**
 * 给后台/用户看的人话结论。
 * 每个阶段都必须讲清「钱和图」的状态，避免用户以为被白扣、或后台以为不用管。
 */
export const GENERATION_FAILURE_MESSAGES: Record<GenerationFailureStage, string> = {
  // 上游没出图：图上没损失，沿用既有的错误分类文案。
  upstream: '生成结果处理失败，本次未扣取积分',
  // 图没落盘、钱也没扣。用户重试即可，且上游大概率有缓存，成本损失有限。
  persist: '上游已出图，但图片转存失败，本次未扣积分；请重试，若反复失败请联系管理员',
  // 图在、钱没扣：账务/余额异常，需要人工核对（图通常仍可查看）。
  charge: '上游已出图且图片已保存，但扣积分未完成，请联系管理员核对',
  // 图在、钱也扣了，只有后续记账失败。极罕见。
  'post-charge': '生成结果处理失败：图片已保存且已扣除积分，但后续记账未完成，请联系管理员核对',
};

export function generationFailureMessage(stage: GenerationFailureStage, upstreamFallbackMessage: string) {
  // upstream 阶段的具体原因已由 publicImageErrorMessage 分类过，直接沿用。
  return stage === 'upstream' ? upstreamFallbackMessage : GENERATION_FAILURE_MESSAGES[stage];
}

/**
 * 写入 generation_requests.error_detail 的技术根因。
 * 必须保留原始报错（HTTP 状态、undici 的 ECONNRESET 等），否则后台只剩一句笼统话。
 */
export function generationFailureDetail(stage: GenerationFailureStage, errorDetail: string) {
  const normalized = String(errorDetail || '').trim() || 'unknown error';
  return `stage=${stage} ${normalized}`;
}
