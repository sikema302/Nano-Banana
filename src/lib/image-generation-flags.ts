export function getAiEnhancementRequestFlags(enabled: boolean) {
  return {
    optimizeChineseText: false,
    billAiEnhancement: enabled,
  } as const;
}

export function resolveAiEnhancementBillingRequested(payload: {
  billAiEnhancement?: unknown;
  optimizeChineseText?: unknown;
}) {
  return Boolean(payload.billAiEnhancement ?? payload.optimizeChineseText);
}
