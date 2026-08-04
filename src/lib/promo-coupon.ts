export type PromoDiscountPercent = 5 | 10;

export const PROMO_COUPON_LIFETIME_MS = 12 * 60 * 60 * 1000;
export const PROMO_COUPON_MIN_COOLDOWN_DAYS = 2;

export function normalizePromoDiscountPercent(value: unknown): PromoDiscountPercent {
  return Number(value) === 5 ? 5 : 10;
}

export function pickPromoDiscountPercent(randomPercent: number): PromoDiscountPercent {
  const normalizedPercent = Number.isFinite(randomPercent) ? Math.abs(Math.floor(randomPercent)) % 100 : 0;
  return normalizedPercent < 80 ? 5 : 10;
}

export function getPromoDiscountRate(discountPercent: number) {
  const normalizedPercent = normalizePromoDiscountPercent(discountPercent);
  return normalizedPercent === 5 ? '9.5' : '9';
}

export function getPromoDiscountLabel(discountPercent: number) {
  return `${getPromoDiscountRate(discountPercent)} 折`;
}

export function getPromoCouponPrefix(discountPercent: number) {
  return normalizePromoDiscountPercent(discountPercent) === 5 ? 'PIXORY95' : 'PIXORY90';
}

export function getPromoCouponSchedule(issuedAt: string, cooldownDays: number) {
  const issuedAtMs = new Date(issuedAt).getTime();
  if (!Number.isFinite(issuedAtMs)) {
    throw new Error('Invalid promo coupon issue time');
  }

  const normalizedCooldownDays = Math.max(
    PROMO_COUPON_MIN_COOLDOWN_DAYS,
    Number.isFinite(cooldownDays) ? Math.floor(cooldownDays) : PROMO_COUPON_MIN_COOLDOWN_DAYS,
  );
  const expiresAtMs = issuedAtMs + PROMO_COUPON_LIFETIME_MS;
  return {
    expiresAt: new Date(expiresAtMs).toISOString(),
    nextEligibleAt: new Date(expiresAtMs + normalizedCooldownDays * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function formatPromoCouponCountdown(expiresAt: string, nowMs = Date.now()) {
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs)) return '00:00:00';

  const totalSeconds = Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}
