import { resolveApiKeyDisplayCredits, type CreditValues } from './api-key-credits.js';

export const ADMIN_OVERVIEW_RECORDS_SQL = `
  SELECT
    g.id,
    g.user_id,
    g.username,
    g.prompt,
    g.model_id,
    g.model_name,
    g.dimensions,
    g.image_size,
    g.image_path,
    g.credits_used,
    g.api_request_ms,
    g.reference_images,
    g.result_status,
    g.result_message,
    g.created_at
  FROM generation_requests g
  WHERE g.username != 'demo'
  ORDER BY datetime(g.created_at) DESC, g.id DESC
  LIMIT ? OFFSET ?
`;

export const ADMIN_USERS_SQL = `
  WITH registered_users AS (
    SELECT
      COALESCE(m.supabase_user_id, CAST(u.id AS TEXT)) AS user_id,
      u.username
    FROM users u
    LEFT JOIN user_migrations m ON m.legacy_user_id = u.id
    WHERE u.username != 'demo'
  ),
  generation_summaries AS (
    SELECT
      user_id,
      MAX(username) AS username,
      COUNT(*) AS generations,
      COALESCE(SUM(credits_used), 0) AS credits_used,
      MAX(created_at) AS last_generated_at
    FROM generations
    WHERE username != 'demo'
    GROUP BY user_id
  ),
  all_user_ids AS (
    SELECT user_id FROM registered_users
    UNION
    SELECT user_id FROM user_credits WHERE username != 'demo'
    UNION
    SELECT user_id FROM generation_summaries
  ),
  invite_summaries AS (
    SELECT
      redeemed_by AS user_id,
      GROUP_CONCAT(code, CHAR(31)) AS invite_codes
    FROM invite_codes
    WHERE redeemed_by IS NOT NULL AND redeemed_by != ''
    GROUP BY redeemed_by
  )
  SELECT
    ids.user_id,
    COALESCE(registered.username, credits.username, generated.username, '') AS username,
    COALESCE((
      SELECT latest_invite.code
      FROM invite_codes latest_invite
      WHERE latest_invite.redeemed_by = ids.user_id
      ORDER BY datetime(latest_invite.redeemed_at) DESC, datetime(latest_invite.created_at) DESC
      LIMIT 1
    ), '') AS invite_code,
    COALESCE(invites.invite_codes, '') AS invite_codes,
    COALESCE(generated.generations, 0) AS generations,
    COALESCE(generated.credits_used, 0) AS credits_used,
    COALESCE(credits.total_credits, 0) AS total_credits,
    COALESCE(credits.used_credits, 0) AS used_credits,
    COALESCE(generated.last_generated_at, '') AS last_generated_at
  FROM all_user_ids ids
  LEFT JOIN registered_users registered ON registered.user_id = ids.user_id
  LEFT JOIN user_credits credits ON credits.user_id = ids.user_id
  LEFT JOIN generation_summaries generated ON generated.user_id = ids.user_id
  LEFT JOIN invite_summaries invites ON invites.user_id = ids.user_id
`;

export const ADMIN_USER_USAGE_TRENDS_SQL = `
  SELECT user_id, credits_used, created_at
  FROM generations
  WHERE username != 'demo'
    AND datetime(created_at) >= datetime('now', '-7 days')
`;

type AdminApiKey = {
  id: string;
  totalCredits: number;
  usedCredits: number;
  billingMode?: 'legacy' | 'account';
  ownerUserId?: string;
  ownerUsername?: string;
};

export type SqliteAdminUserSummary = {
  userId: string;
  username: string;
  inviteCode?: string;
  generations: number;
  creditsUsed: number;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  apiKeyId?: string;
  quotaSource?: 'key' | 'account';
  ownerUserId?: string;
  ownerUsername?: string;
  lastGeneratedAt: string;
  usageTrend: number[];
};

type BuildSqliteAdminUsersOptions = {
  rows: Record<string, unknown>[];
  trendRows: Record<string, unknown>[];
  apiKeys: AdminApiKey[];
  search: string;
  sort: string;
  page: number;
  pageSize: number;
  now?: number;
};

export function buildSqliteAdminUsersPage(options: BuildSqliteAdminUsersOptions) {
  const now = options.now ?? Date.now();
  const creditsByUserId = new Map<string, CreditValues>();
  for (const row of options.rows) {
    creditsByUserId.set(String(row.user_id || ''), {
      totalCredits: Number(row.total_credits || 0),
      usedCredits: Number(row.used_credits || 0),
    });
  }

  const trendByUserId = new Map<string, number[]>();
  for (const row of options.trendRows) {
    const userId = String(row.user_id || '');
    const createdAt = new Date(String(row.created_at || '')).getTime();
    const dayOffset = Math.floor((now - createdAt) / (24 * 60 * 60 * 1000));
    if (!userId || !Number.isFinite(createdAt) || dayOffset < 0 || dayOffset >= 7) continue;
    const buckets = trendByUserId.get(userId) || Array.from({ length: 7 }, () => 0);
    buckets[6 - dayOffset] += Number(row.credits_used || 0);
    trendByUserId.set(userId, buckets);
  }

  const apiKeyById = new Map(options.apiKeys.map((item) => [item.id, item]));
  const search = options.search.trim().toLowerCase();
  const matchingUsers = options.rows
    .map((row) => {
      const userId = String(row.user_id || '');
      const totalCredits = Number(row.total_credits || 0);
      const usedCredits = Number(row.used_credits || 0);
      const apiKeyId = userId.startsWith('api-key:') ? userId.slice('api-key:'.length) : '';
      const apiKey = apiKeyId ? apiKeyById.get(apiKeyId) : undefined;
      const apiKeyCredits = apiKey
        ? resolveApiKeyDisplayCredits(
            apiKey,
            apiKey.ownerUserId ? creditsByUserId.get(apiKey.ownerUserId) : undefined,
          )
        : undefined;
      const user: SqliteAdminUserSummary = {
        userId,
        username: String(row.username || ''),
        inviteCode: String(row.invite_code || ''),
        generations: Number(row.generations || 0),
        creditsUsed: Number(row.credits_used || 0),
        totalCredits: apiKeyCredits?.totalCredits ?? totalCredits,
        usedCredits: apiKeyCredits?.usedCredits ?? usedCredits,
        remainingCredits: apiKeyCredits?.remainingCredits ?? Math.max(0, totalCredits - usedCredits),
        apiKeyId: apiKey?.id,
        quotaSource: apiKeyCredits?.quotaSource,
        ownerUserId: apiKey?.ownerUserId,
        ownerUsername: apiKey?.ownerUsername,
        lastGeneratedAt: String(row.last_generated_at || ''),
        usageTrend: trendByUserId.get(userId) || Array.from({ length: 7 }, () => 0),
      };
      return { user, inviteCodes: String(row.invite_codes || '').toLowerCase() };
    })
    .filter(({ user, inviteCodes }) => {
      if (!search) return true;
      return (
        user.username.toLowerCase().includes(search) ||
        user.userId.toLowerCase().includes(search) ||
        inviteCodes.includes(search)
      );
    })
    .sort((left, right) => {
      const leftTime = left.user.lastGeneratedAt ? new Date(left.user.lastGeneratedAt).getTime() : 0;
      const rightTime = right.user.lastGeneratedAt ? new Date(right.user.lastGeneratedAt).getTime() : 0;
      return options.sort === 'recent-asc' ? leftTime - rightTime : rightTime - leftTime;
    });

  const offset = (options.page - 1) * options.pageSize;
  return {
    users: matchingUsers.slice(offset, offset + options.pageSize).map(({ user }) => user),
    total: matchingUsers.length,
  };
}
