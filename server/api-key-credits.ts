export type CreditValues = {
  totalCredits: number;
  usedCredits: number;
};

export type ApiKeyCreditRecord = CreditValues & {
  billingMode?: 'legacy' | 'account';
  ownerUserId?: string;
};

export type ApiKeyDisplayCredits = CreditValues & {
  remainingCredits: number;
  quotaSource: 'key' | 'account';
};

function normalizeCredits(credits: CreditValues): CreditValues {
  const totalCredits = Math.max(0, Math.floor(Number(credits.totalCredits || 0)));
  const usedCredits = Math.max(0, Math.floor(Number(credits.usedCredits || 0)));
  return { totalCredits, usedCredits };
}

export function resolveApiKeyDisplayCredits(
  record: ApiKeyCreditRecord,
  ownerCredits?: CreditValues,
): ApiKeyDisplayCredits {
  const usesAccountCredits = record.billingMode === 'account' && Boolean(record.ownerUserId);
  const credits = normalizeCredits(usesAccountCredits && ownerCredits ? ownerCredits : record);

  return {
    ...credits,
    remainingCredits: Math.max(0, credits.totalCredits - credits.usedCredits),
    quotaSource: usesAccountCredits ? 'account' : 'key',
  };
}
