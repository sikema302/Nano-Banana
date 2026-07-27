export const INVITE_REDEMPTION_ERRORS = {
  notFound: 'INVITE_NOT_FOUND',
  alreadyRedeemed: 'INVITE_ALREADY_REDEEMED',
  noCredits: 'INVITE_NO_CREDITS',
} as const;

export function getInviteRedemptionCredits(
  invite: { credits?: unknown; redeemed_by?: unknown } | null | undefined,
) {
  if (!invite) throw new Error(INVITE_REDEMPTION_ERRORS.notFound);
  if (String(invite.redeemed_by || '').trim()) {
    throw new Error(INVITE_REDEMPTION_ERRORS.alreadyRedeemed);
  }
  const credits = Math.max(0, Math.floor(Number(invite.credits || 0)));
  if (credits <= 0) throw new Error(INVITE_REDEMPTION_ERRORS.noCredits);
  return credits;
}

