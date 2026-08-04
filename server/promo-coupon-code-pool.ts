import crypto from 'node:crypto';

export type PromoCouponDiscountPercent = 5 | 10;

export type PromoCouponCodeClaim = {
  userId: string;
  couponId: string;
  discountPercent: PromoCouponDiscountPercent;
  claimedAt: string;
};

export function parsePromoCouponCodes(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^\d{10}$/.test(line)),
    ),
  );
}

export function orderPromoCouponCodes(codes: string[], seed: string) {
  if (codes.length < 2) return [...codes];
  const digest = crypto.createHash('sha256').update(seed).digest();
  const offset = digest.readUInt32BE(0) % codes.length;
  return [...codes.slice(offset), ...codes.slice(0, offset)];
}

export function promoCouponCodeClaimKey(discountPercent: PromoCouponDiscountPercent, code: string) {
  const digest = crypto.createHash('sha256').update(code).digest('hex').slice(0, 32);
  return `promo_coupon_code_claim_v1:${discountPercent}:${digest}`;
}

export function serializePromoCouponCodeClaim(claim: PromoCouponCodeClaim) {
  return JSON.stringify(claim);
}

export function parsePromoCouponCodeClaim(raw: string): PromoCouponCodeClaim | null {
  try {
    const value = JSON.parse(raw) as Partial<PromoCouponCodeClaim> | null;
    if (!value || typeof value !== 'object') return null;
    if (typeof value.userId !== 'string' || !value.userId.trim()) return null;
    if (typeof value.couponId !== 'string' || !value.couponId.trim()) return null;
    if (value.discountPercent !== 5 && value.discountPercent !== 10) return null;
    if (typeof value.claimedAt !== 'string' || !value.claimedAt.trim()) return null;
    return {
      userId: value.userId.trim(),
      couponId: value.couponId.trim(),
      discountPercent: value.discountPercent,
      claimedAt: value.claimedAt.trim(),
    };
  } catch {
    return null;
  }
}

export function isSamePromoCouponClaim(
  claim: PromoCouponCodeClaim | null,
  expected: Pick<PromoCouponCodeClaim, 'userId' | 'couponId' | 'discountPercent'>,
) {
  return Boolean(
    claim
      && claim.userId === expected.userId
      && claim.couponId === expected.couponId
      && claim.discountPercent === expected.discountPercent,
  );
}
