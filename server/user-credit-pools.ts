export type CreditBucket = 'gpt' | 'banana' | 'general';

export type CreditBalances = Record<CreditBucket, number>;
export type CreditDebit = Record<CreditBucket, number>;

export const EMPTY_CREDIT_BALANCES: CreditBalances = { gpt: 0, banana: 0, general: 0 };

function credit(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function normalizeCreditBalances(value: unknown): CreditBalances {
  const source = value && typeof value === 'object' ? value as Partial<CreditBalances> : {};
  return {
    gpt: credit(source.gpt),
    banana: credit(source.banana),
    general: credit(source.general),
  };
}

export function totalCreditBalance(value: CreditBalances) {
  return value.gpt + value.banana + value.general;
}

export function reconcileCreditBalances(value: unknown, aggregateRemaining: number): CreditBalances {
  const next = normalizeCreditBalances(value);
  const expected = credit(aggregateRemaining);
  let difference = expected - totalCreditBalance(next);
  if (difference >= 0) return { ...next, general: next.general + difference };

  let excess = Math.abs(difference);
  for (const bucket of ['general', 'gpt', 'banana'] as const) {
    const removed = Math.min(next[bucket], excess);
    next[bucket] -= removed;
    excess -= removed;
    if (excess === 0) break;
  }
  return next;
}

export function availableCreditsForBucket(balances: CreditBalances, bucket: CreditBucket) {
  return bucket === 'general' ? balances.general : balances[bucket] + balances.general;
}

export function debitCreditBalances(
  balances: CreditBalances,
  bucket: CreditBucket,
  amount: number,
): { balances: CreditBalances; debit: CreditDebit } {
  const requested = credit(amount);
  if (availableCreditsForBucket(balances, bucket) < requested) {
    throw new Error('INSUFFICIENT_BUCKET_CREDITS');
  }

  const next = { ...balances };
  const debit: CreditDebit = { gpt: 0, banana: 0, general: 0 };
  if (bucket === 'general') {
    next.general -= requested;
    debit.general = requested;
    return { balances: next, debit };
  }

  debit[bucket] = Math.min(next[bucket], requested);
  next[bucket] -= debit[bucket];
  debit.general = requested - debit[bucket];
  next.general -= debit.general;
  return { balances: next, debit };
}

export function refundCreditBalances(balances: CreditBalances, debit: CreditDebit): CreditBalances {
  const normalizedDebit = normalizeCreditBalances(debit);
  return {
    gpt: balances.gpt + normalizedDebit.gpt,
    banana: balances.banana + normalizedDebit.banana,
    general: balances.general + normalizedDebit.general,
  };
}

export function creditBucketForModel(modelId: string): CreditBucket {
  if (modelId === 'gpt-image-2') return 'gpt';
  if (modelId === 'Nano_Banana_Pro') return 'banana';
  return 'general';
}
