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
`;

export type SqliteInviteCodeListOptions = {
  status?: string;
  sort?: string;
  search?: string;
};

export function buildSqliteInviteCodeListQuery(options: SqliteInviteCodeListOptions) {
  const search = options.search?.trim().toLowerCase() || '';
  const conditions: string[] = [];
  const parameters: string[] = [];

  if (options.status === 'used') {
    conditions.push("i.redeemed_by IS NOT NULL AND i.redeemed_by != ''");
  } else if (options.status === 'unused') {
    conditions.push("(i.redeemed_by IS NULL OR i.redeemed_by = '')");
  }

  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(`(
      LOWER(i.code) LIKE ? ESCAPE '\\'
      OR LOWER(COALESCE(i.redeemed_by, '')) LIKE ? ESCAPE '\\'
      OR LOWER(COALESCE(NULLIF(credits.username, ''), NULLIF(migration.username, ''), '')) LIKE ? ESCAPE '\\'
    )`);
    parameters.push(pattern, pattern, pattern);
  }

  const orderBy = options.sort === 'created-asc'
    ? 'datetime(i.created_at) ASC'
    : options.sort === 'credits-desc'
      ? 'i.credits DESC, datetime(i.created_at) DESC'
      : options.sort === 'credits-asc'
        ? 'i.credits ASC, datetime(i.created_at) DESC'
        : 'datetime(i.created_at) DESC';

  return {
    fromClause: `
      FROM invite_codes i
      LEFT JOIN user_credits credits ON credits.user_id = i.redeemed_by
      LEFT JOIN user_migrations migration ON migration.supabase_user_id = i.redeemed_by
    `,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    parameters,
    orderBy,
  };
}

type AdminApiKey = {
  id: string;
  name: string;
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
  keyName?: string;
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

  const apiKeyById = new Map(options.apiKeys.map((item) => [item.id, item]));
  const ownerByApiKeyUserId = new Map<string, string>();
  for (const key of options.apiKeys) {
    if (key.billingMode === 'account' && key.ownerUserId) {
      ownerByApiKeyUserId.set(`api-key:${key.id}`, key.ownerUserId);
    }
  }

  const rowByUserId = new Map<string, Record<string, unknown>>();
  for (const row of options.rows) {
    rowByUserId.set(String(row.user_id || ''), row);
  }

  // 账户型 Key 的生成量累加到归属账号
  const ownerAccum = new Map<string, { generations: number; creditsUsed: number; lastGeneratedAt: string }>();
  for (const row of options.rows) {
    const userId = String(row.user_id || '');
    const ownerUserId = ownerByApiKeyUserId.get(userId);
    if (!ownerUserId || !rowByUserId.has(ownerUserId)) continue;
    const generations = Number(row.generations || 0);
    const creditsUsed = Number(row.credits_used || 0);
    const lastGeneratedAt = String(row.last_generated_at || '');
    const acc = ownerAccum.get(ownerUserId) || { generations: 0, creditsUsed: 0, lastGeneratedAt: '' };
    acc.generations += generations;
    acc.creditsUsed += creditsUsed;
    if (lastGeneratedAt && (!acc.lastGeneratedAt || lastGeneratedAt > acc.lastGeneratedAt)) {
      acc.lastGeneratedAt = lastGeneratedAt;
    }
    ownerAccum.set(ownerUserId, acc);
  }

  const trendByUserId = new Map<string, number[]>();
  for (const row of options.trendRows) {
    const rawUserId = String(row.user_id || '');
    const userId = ownerByApiKeyUserId.get(rawUserId) || rawUserId;
    const createdAt = new Date(String(row.created_at || '')).getTime();
    const dayOffset = Math.floor((now - createdAt) / (24 * 60 * 60 * 1000));
    if (!userId || !Number.isFinite(createdAt) || dayOffset < 0 || dayOffset >= 7) continue;
    const buckets = trendByUserId.get(userId) || Array.from({ length: 7 }, () => 0);
    buckets[6 - dayOffset] += Number(row.credits_used || 0);
    trendByUserId.set(userId, buckets);
  }

  const search = options.search.trim().toLowerCase();
  const matchingUsers = options.rows
    .filter((row) => {
      const userId = String(row.user_id || '');
      const ownerUserId = ownerByApiKeyUserId.get(userId);
      return !(ownerUserId && rowByUserId.has(ownerUserId));
    })
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
      // API Key 伪用户行：用归属人/Key 名称作为展示名，避免显示不可读的 `api-xxxx` 前缀
      const displayName = apiKey
        ? (apiKey.ownerUsername || apiKey.name || String(row.username || '')).trim()
        : String(row.username || '');
      const acc = ownerAccum.get(userId);
      let lastGeneratedAt = String(row.last_generated_at || '');
      if (acc?.lastGeneratedAt && (!lastGeneratedAt || acc.lastGeneratedAt > lastGeneratedAt)) {
        lastGeneratedAt = acc.lastGeneratedAt;
      }
      const user: SqliteAdminUserSummary = {
        userId,
        username: displayName,
        inviteCode: String(row.invite_code || ''),
        generations: Number(row.generations || 0) + (acc?.generations || 0),
        creditsUsed: Number(row.credits_used || 0) + (acc?.creditsUsed || 0),
        totalCredits: apiKeyCredits?.totalCredits ?? totalCredits,
        usedCredits: apiKeyCredits?.usedCredits ?? usedCredits,
        remainingCredits: apiKeyCredits?.remainingCredits ?? Math.max(0, totalCredits - usedCredits),
        apiKeyId: apiKey?.id,
        keyName: apiKey?.name,
        quotaSource: apiKeyCredits?.quotaSource,
        ownerUserId: apiKey?.ownerUserId,
        ownerUsername: apiKey?.ownerUsername,
        lastGeneratedAt,
        usageTrend: trendByUserId.get(userId) || Array.from({ length: 7 }, () => 0),
      };
      return { user, inviteCodes: String(row.invite_codes || '').toLowerCase() };
    })
    .filter(({ user, inviteCodes }) => {
      if (!search) return true;
      return (
        user.username.toLowerCase().includes(search) ||
        user.userId.toLowerCase().includes(search) ||
        inviteCodes.includes(search) ||
        (user.ownerUsername || '').toLowerCase().includes(search) ||
        (user.keyName || '').toLowerCase().includes(search)
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
