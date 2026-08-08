/**
 * Supabase 数据库操作层
 * 在 Vercel Serverless 环境下替代 SQLite，直接使用 Supabase (PostgreSQL) 作为数据库。
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { getInviteRedemptionCredits } from './invite-redemption.js';

// ─── 类型定义 ───────────────────────────────────────────────────────

type CreditSummary = {
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
};

type InviteCodeRow = {
  code: string;
  credits: number;
  issued_credits: number;
  created_by: string;
  created_at: string;
  redeemed_by: string | null;
  redeemed_at: string | null;
  low_balance_since: string | null;
};

type GenerationRow = {
  id: string;
  user_id: string;
  username: string;
  prompt: string;
  model_id: string;
  model_name: string;
  dimensions: string;
  image_size: string;
  image_path: string;
  credits_used: number;
  api_request_ms: number;
  reference_images: string;
  created_at: string;
  invite_code?: string;
  result_status?: string;
  result_message?: string;
};

type GenerationFilterOptions = {
  search?: string;
  model?: string;
  resolution?: string;
  range?: string;
};

type GenerationStatRow = {
  created_at: string;
  credits_used: number;
  model_name: string;
  dimensions: string;
  image_size: string;
};

type ImageRow = {
  id: string;
  user_id: string;
  prompt: string;
  model_name: string;
  dimensions: string;
  image_path: string;
  category: string;
  reference_images: string;
  created_at: string;
};

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  email: string | null;
  created_at: string;
};

type UserCreditsRow = {
  user_id: string;
  username: string;
  total_credits: number;
  used_credits: number;
  created_at: string;
  updated_at: string;
};

// ─── 常量 ───────────────────────────────────────────────────────────

const ADMIN_INITIAL_CREDITS = 3859;
const INVITE_RECLAIM_THRESHOLD = 17;
const INVITE_RECLAIM_DAYS = 7;
const INVITE_USER_PASSWORD_HASH = '$2b$10$/Xw/Ey1z9.jE5BtfDjHCBevDb4OKMFaovhlXhrKpGbUUiHCaQrYCq';
const IMAGE_RETENTION_DAYS = 7;
const GENERATION_API_REQUEST_MS_SETTING_PREFIX = 'generation_api_request_ms:';
const ADMIN_CREDIT_POOL_SETTING_KEY = 'admin_credit_pool_v2';
const SUPABASE_REQUEST_TIMEOUT_MS = Math.max(1_000, Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS || 12_000));
const SUPABASE_RETRY_DELAY_MS = 250;

// ─── Supabase 客户端 ────────────────────────────────────────────────

let _supabase: SupabaseClient | null = null;

function isRetryableSupabaseMethod(method: string) {
  return method === 'GET' || method === 'HEAD' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
}

async function fetchSupabaseWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const maxAttempts = isRetryableSupabaseMethod(method) ? 2 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, SUPABASE_RETRY_DELAY_MS));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError || 'unknown error');
  throw new Error(`Supabase ${method} request timed out or failed: ${detail}`);
}

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when DATABASE_PROVIDER=supabase');
    }
    _supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        transport: WebSocket as any,
      },
      global: {
        fetch: fetchSupabaseWithTimeout,
      },
    });
  }
  return _supabase;
}

// ─── 辅助函数 ───────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function subtractDaysIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeSupabaseId(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function toUserRow(row: Record<string, unknown>): UserRow {
  return {
    id: normalizeSupabaseId(row.id),
    username: String(row.username || ''),
    password_hash: String(row.password_hash || ''),
    email: row.email == null ? null : String(row.email),
    created_at: String(row.created_at || ''),
  };
}

function toGenerationRow(row: Record<string, unknown>): GenerationRow {
  return {
    id: normalizeSupabaseId(row.id),
    user_id: normalizeSupabaseId(row.user_id),
    username: String(row.username || ''),
    prompt: String(row.prompt || ''),
    model_id: String(row.model_id || ''),
    model_name: String(row.model_name || ''),
    dimensions: String(row.dimensions || ''),
    image_size: String(row.image_size || ''),
    image_path: String(row.image_path || ''),
    credits_used: Number(row.credits_used || 0),
    api_request_ms: Number(row.api_request_ms || 0),
    reference_images: String(row.reference_images || '[]'),
    created_at: String(row.created_at || ''),
    invite_code: row.invite_code == null ? undefined : String(row.invite_code),
    result_status: row.result_status == null ? undefined : String(row.result_status),
    result_message: row.result_message == null ? undefined : String(row.result_message),
  };
}

function generationApiRequestMsSettingKey(generationId: string | number) {
  return `${GENERATION_API_REQUEST_MS_SETTING_PREFIX}${generationId}`;
}

function isMissingApiRequestMsColumn(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message && error.message.includes('api_request_ms'));
}

async function getInviteUserIdsForGenerationKeyword(keyword: string): Promise<Set<string>> {
  const userIds = new Set<string>();
  if (!keyword) return userIds;

  const safeKeyword = keyword.replace(/[%_,]/g, ' ');
  const { data } = await getSupabase()
    .from('invite_codes')
    .select('redeemed_by')
    .ilike('code', `%${safeKeyword}%`)
    .not('redeemed_by', 'is', null)
    .limit(200);

  for (const row of data || []) {
    const userId = normalizeSupabaseId((row as { redeemed_by: string | number | null }).redeemed_by);
    if (userId) userIds.add(userId);
  }

  return userIds;
}

function applyGenerationFilters(query: any, options: GenerationFilterOptions, inviteKeywordUserIds = new Set<string>()) {
  const keyword = String(options.search || '').trim();
  let next = query.neq('username', 'demo');

  if (options.model && options.model !== 'all') {
    next = next.eq('model_name', options.model);
  }

  if (options.resolution && options.resolution !== 'all') {
    const [dimensions, imageSize] = options.resolution.split(' / ').map((item) => item.trim());
    if (dimensions) next = next.eq('dimensions', dimensions);
    if (imageSize) next = next.eq('image_size', imageSize);
  }

  if (options.range && options.range !== 'all') {
    const hours = options.range === '24h' ? 24 : options.range === '7d' ? 24 * 7 : options.range === '30d' ? 24 * 30 : 0;
    if (hours > 0) {
      next = next.gte('created_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString());
    }
  }

  if (keyword) {
    const safeKeyword = keyword.replace(/[(),]/g, ' ');
    const orParts = [
      `username.ilike.%${safeKeyword}%`,
      `user_id.ilike.%${safeKeyword}%`,
      `prompt.ilike.%${safeKeyword}%`,
    ];
    if (inviteKeywordUserIds.size > 0) {
      orParts.push(`user_id.in.(${[...inviteKeywordUserIds].join(',')})`);
    }
    next = next.or(orParts.join(','));
  }

  return next;
}

function toImageRow(row: Record<string, unknown>): ImageRow {
  return {
    id: normalizeSupabaseId(row.id),
    user_id: normalizeSupabaseId(row.user_id),
    prompt: String(row.prompt || ''),
    model_name: String(row.model_name || ''),
    dimensions: String(row.dimensions || ''),
    image_path: String(row.image_path || ''),
    category: String(row.category || ''),
    reference_images: String(row.reference_images || '[]'),
    created_at: String(row.created_at || ''),
  };
}

async function getNextNumericId(tableName: 'users' | 'generations' | 'images' | 'generation_requests'): Promise<number> {
  const { data, error } = await getSupabase()
    .from(tableName)
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Read next ${tableName} id failed: ${error.message}`);
  }

  return Number(data?.id || 0) + 1;
}

function isPrimaryKeyConflict(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message && error.message.includes('duplicate key value violates unique constraint'));
}

function toCreditSummary(row: { total_credits: number; used_credits: number } | null): CreditSummary {
  const totalCredits = Number(row?.total_credits || 0);
  const usedCredits = Number(row?.used_credits || 0);
  return {
    totalCredits,
    usedCredits,
    remainingCredits: Math.max(0, totalCredits - usedCredits),
  };
}

function addDaysIso(base: string, days: number): string {
  const date = new Date(base);
  if (Number.isNaN(date.getTime())) return base;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function generateRandomHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateInviteCode(): string {
  return `PIXORY-${generateRandomHex(4).toUpperCase()}`;
}

function sha256Digest(input: string): string {
  // 使用 Web Crypto API (Vercel 环境可用)
  // 由于是同步场景，这里用简单哈希替代
  // 实际上 crypto.createHash 在 Vercel 中也可用，但为安全起见用简单方法
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(12, '0').slice(0, 12);
}

// ─── 用户操作 ───────────────────────────────────────────────────────

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('id, username, password_hash, email, created_at')
    .eq('username', username)
    .single();
  if (error || !data) return null;
  return toUserRow(data as Record<string, unknown>);
}

export async function findUserById(userId: string): Promise<UserRow | null> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('id, username, password_hash, email, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return toUserRow(data as Record<string, unknown>);
}

export async function createUser(
  username: string,
  passwordHash: string,
  email: string | null,
): Promise<UserRow> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = await getNextNumericId('users');
    const { data, error } = await getSupabase()
      .from('users')
      .insert({
        id,
        username,
        password_hash: passwordHash,
        email,
        created_at: nowIso(),
      })
      .select('id, username, password_hash, email, created_at')
      .single();

    if (!error && data) {
      return toUserRow(data as Record<string, unknown>);
    }

    if (!isPrimaryKeyConflict(error)) {
      throw new Error(`Create user failed: ${error?.message || 'unknown error'}`);
    }
  }

  throw new Error('Create user failed: unable to allocate a unique user id');
}

export async function findOrCreateInviteUser(username: string): Promise<UserRow> {
  const existing = await findUserByUsername(username);
  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = await getNextNumericId('users');
    const { data, error } = await getSupabase()
      .from('users')
      .insert({
        id,
        username,
        password_hash: INVITE_USER_PASSWORD_HASH,
        email: null,
        created_at: nowIso(),
      })
      .select('id, username, password_hash, email, created_at')
      .single();

    if (!error && data) {
      return toUserRow(data as Record<string, unknown>);
    }

    const retry = await findUserByUsername(username);
    if (retry) {
      return retry;
    }

    if (!isPrimaryKeyConflict(error)) {
      throw new Error(`Create invite user failed: ${error?.message || 'unknown error'}`);
    }
  }

  throw new Error('Create invite user failed: unable to allocate a unique user id');
}

export async function updateUserPassword(username: string, passwordHash: string): Promise<void> {
  const { error } = await getSupabase()
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('username', username);
  if (error) throw new Error(`Update password failed: ${error.message}`);
}

export async function getInviteCodesRedeemedByUser(userId: string): Promise<InviteCodeRow[]> {
  const { data, error } = await getSupabase()
    .from('invite_codes')
    .select('*')
    .eq('redeemed_by', userId);
  if (error) throw new Error(`Query user invite codes failed: ${error.message}`);
  return (data || []) as unknown as InviteCodeRow[];
}

export async function deleteUserAccountData(userId: string): Promise<void> {
  const supabase = getSupabase();
  for (const table of ['images', 'generations'] as const) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`Delete user ${table} failed: ${error.message}`);
  }

  const { error: inviteError } = await supabase.from('invite_codes').delete().eq('redeemed_by', userId);
  if (inviteError) throw new Error(`Delete user invite codes failed: ${inviteError.message}`);

  const { error: creditError } = await supabase.from('user_credits').delete().eq('user_id', userId);
  if (creditError) throw new Error(`Delete user credits failed: ${creditError.message}`);

  const { error: userError } = await supabase.from('users').delete().eq('id', userId);
  if (userError) throw new Error(`Delete user failed: ${userError.message}`);
}

// ─── 积分操作 ───────────────────────────────────────────────────────

export async function getUserCredits(userId: string): Promise<CreditSummary> {
  const { data, error } = await getSupabase()
    .from('user_credits')
    .select('total_credits, used_credits')
    .eq('user_id', userId)
    .single();
  if (error) return { totalCredits: 0, usedCredits: 0, remainingCredits: 0 };
  return toCreditSummary(data as { total_credits: number; used_credits: number });
}

export async function ensureUserCredits(
  userId: string,
  username: string,
  totalCredits = 0,
): Promise<void> {
  const { data: existing } = await getSupabase()
    .from('user_credits')
    .select('user_id')
    .eq('user_id', userId)
    .single();

  if (existing) {
    const { error } = await getSupabase()
      .from('user_credits')
      .update({ username, updated_at: nowIso() })
      .eq('user_id', userId);
    if (error) throw new Error(`Update credits failed: ${error.message}`);
    return;
  }

  const { error } = await getSupabase().from('user_credits').insert({
    user_id: userId,
    username,
    total_credits: totalCredits,
    used_credits: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  if (error) throw new Error(`Insert credits failed: ${error.message}`);
}

export async function setUserTotalCredits(userId: string, totalCredits: number): Promise<void> {
  const { error } = await getSupabase()
    .from('user_credits')
    .update({
      total_credits: Math.max(0, Math.floor(totalCredits)),
      updated_at: nowIso(),
    })
    .eq('user_id', userId);
  if (error) throw new Error(`Set total credits failed: ${error.message}`);
}

export async function adjustUserTotalCredits(userId: string, delta: number): Promise<void> {
  const credits = await getUserCredits(userId);
  await setUserTotalCredits(userId, credits.totalCredits + delta);
}

export async function incrementUsedCredits(userId: string, amount: number): Promise<void> {
  // 先读取当前值
  const credits = await getUserCredits(userId);
  const { error } = await getSupabase()
    .from('user_credits')
    .update({
      used_credits: credits.usedCredits + amount,
      updated_at: nowIso(),
    })
    .eq('user_id', userId);
  if (error) throw new Error(`Increment used credits failed: ${error.message}`);
}

// ─── 管理员积分 ─────────────────────────────────────────────────────

export async function getAdminCreditOwner(): Promise<{ user_id: string } | null> {
  const { data, error } = await getSupabase()
    .from('user_credits')
    .select('user_id')
    .eq('username', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error || !data) return null;
  return { user_id: normalizeSupabaseId((data as Record<string, unknown>).user_id) };
}

export async function getAdminCreditSummary(): Promise<CreditSummary> {
  const { data, error } = await getSupabase()
    .from('user_credits')
    .select('total_credits, used_credits')
    .eq('username', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  const fallback = error
    ? { totalCredits: 0, usedCredits: 0, remainingCredits: 0 }
    : toCreditSummary(data as { total_credits: number; used_credits: number });
  const raw = await getSetting(ADMIN_CREDIT_POOL_SETTING_KEY, JSON.stringify(fallback));
  try {
    const parsed = JSON.parse(raw) as Partial<CreditSummary>;
    const totalCredits = Math.max(0, Math.floor(Number(parsed.totalCredits || 0)));
    const usedCredits = Math.max(0, Math.floor(Number(parsed.usedCredits || 0)));
    return { totalCredits, usedCredits, remainingCredits: Math.max(0, totalCredits - usedCredits) };
  } catch {
    return fallback;
  }
}

export async function adjustAdminTotalCredits(delta: number): Promise<void> {
  const current = await getAdminCreditSummary();
  const totalCredits = Math.max(current.usedCredits, current.totalCredits + Math.floor(delta));
  await setSetting(ADMIN_CREDIT_POOL_SETTING_KEY, JSON.stringify({
    totalCredits,
    usedCredits: current.usedCredits,
    remainingCredits: Math.max(0, totalCredits - current.usedCredits),
  }));
}

// ─── 邀请码操作 ─────────────────────────────────────────────────────

export async function getInviteCode(code: string): Promise<InviteCodeRow | null> {
  const { data, error } = await getSupabase()
    .from('invite_codes')
    .select('*')
    .eq('code', code)
    .single();
  if (error || !data) return null;
  return data as unknown as InviteCodeRow;
}

export async function getInviteCodesByCodes(codes: string[]): Promise<InviteCodeRow[]> {
  if (codes.length === 0) return [];
  const { data, error } = await getSupabase()
    .from('invite_codes')
    .select('*')
    .in('code', codes);
  if (error) throw new Error(`Fetch invite codes failed: ${error.message}`);
  return (data || []) as unknown as InviteCodeRow[];
}

export async function createInviteCode(
  code: string,
  credits: number,
  createdBy: string,
): Promise<InviteCodeRow> {
  const lowBalanceSince = credits < INVITE_RECLAIM_THRESHOLD ? nowIso() : null;
  const { data, error } = await getSupabase()
    .from('invite_codes')
    .insert({
      code,
      credits,
      issued_credits: credits,
      created_by: createdBy,
      created_at: nowIso(),
      low_balance_since: lowBalanceSince,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Create invite code failed: ${error.message}`);
  return data as unknown as InviteCodeRow;
}

export async function createInviteCodes(
  codes: string[],
  credits: number,
  createdBy: string,
): Promise<InviteCodeRow[]> {
  if (codes.length === 0) return [];
  const lowBalanceSince = credits < INVITE_RECLAIM_THRESHOLD ? nowIso() : null;
  const createdAt = nowIso();
  const { data, error } = await getSupabase()
    .from('invite_codes')
    .insert(codes.map((code) => ({
      code,
      credits,
      issued_credits: credits,
      created_by: createdBy,
      created_at: createdAt,
      low_balance_since: lowBalanceSince,
    })))
    .select('*');
  if (error) throw new Error(`Create invite codes failed: ${error.message}`);
  return (data || []) as unknown as InviteCodeRow[];
}

export async function redeemInviteCode(code: string, userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('invite_codes')
    .update({
      redeemed_by: userId,
      redeemed_at: nowIso(),
    })
    .eq('code', code);
  if (error) throw new Error(`Redeem invite code failed: ${error.message}`);
}

export async function claimInviteCodeForUser(
  code: string,
  userId: string,
  username: string,
): Promise<number> {
  await ensureUserCredits(userId, username, 0);
  const invite = await getInviteCode(code);
  const redeemedCredits = getInviteRedemptionCredits(invite);

  const redeemedAt = nowIso();
  const { data: claimedRows, error: claimError } = await getSupabase()
    .from('invite_codes')
    .update({
      credits: 0,
      redeemed_by: userId,
      redeemed_at: redeemedAt,
      low_balance_since: null,
    })
    .eq('code', code)
    .is('redeemed_by', null)
    .eq('credits', redeemedCredits)
    .select('code');
  if (claimError) throw new Error(`Redeem invite code failed: ${claimError.message}`);
  if (!claimedRows?.length) throw new Error('INVITE_ALREADY_REDEEMED');

  try {
    await adjustUserTotalCredits(userId, redeemedCredits);
  } catch (error) {
    await getSupabase()
      .from('invite_codes')
      .update({
        credits: redeemedCredits,
        redeemed_by: null,
        redeemed_at: null,
        low_balance_since: invite.low_balance_since || null,
      })
      .eq('code', code)
      .eq('redeemed_by', userId)
      .eq('credits', 0);
    throw error;
  }

  return redeemedCredits;
}

export async function migrateLegacyInviteUserId(
  oldUserId: string,
  newUserId: string,
  username: string,
): Promise<void> {
  if (!oldUserId || oldUserId === newUserId) {
    return;
  }

  const supabase = getSupabase();
  const { data: oldCredits } = await supabase
    .from('user_credits')
    .select('user_id, username, total_credits, used_credits, created_at, updated_at')
    .eq('user_id', oldUserId)
    .maybeSingle();

  const { data: newCredits } = await supabase
    .from('user_credits')
    .select('user_id, username, total_credits, used_credits, created_at, updated_at')
    .eq('user_id', newUserId)
    .maybeSingle();

  if (oldCredits) {
    const totalCredits = Number(oldCredits.total_credits || 0) + Number(newCredits?.total_credits || 0);
    const usedCredits = Number(oldCredits.used_credits || 0) + Number(newCredits?.used_credits || 0);

    const { error: upsertError } = await supabase.from('user_credits').upsert(
      {
        user_id: newUserId,
        username,
        total_credits: totalCredits,
        used_credits: usedCredits,
        created_at: String(newCredits?.created_at || oldCredits.created_at || nowIso()),
        updated_at: nowIso(),
      },
      { onConflict: 'user_id' },
    );
    if (upsertError) {
      throw new Error(`Migrate credits failed: ${upsertError.message}`);
    }

    const { error: deleteOldError } = await supabase.from('user_credits').delete().eq('user_id', oldUserId);
    if (deleteOldError) {
      throw new Error(`Delete legacy credits failed: ${deleteOldError.message}`);
    }
  }

  const { error: inviteError } = await supabase
    .from('invite_codes')
    .update({ redeemed_by: newUserId })
    .eq('redeemed_by', oldUserId);
  if (inviteError) {
    throw new Error(`Migrate invite ownership failed: ${inviteError.message}`);
  }
}

export async function updateInviteCodeCredits(
  code: string,
  credits: number,
  lowBalanceSince: string | null,
): Promise<void> {
  const { error } = await getSupabase()
    .from('invite_codes')
    .update({
      credits,
      low_balance_since: lowBalanceSince,
    })
    .eq('code', code);
  if (error) throw new Error(`Update invite code failed: ${error.message}`);
}

export async function rechargeInviteCode(
  code: string,
  credits: number,
  issuedCredits: number,
  lowBalanceSince: string | null,
): Promise<void> {
  const { error } = await getSupabase()
    .from('invite_codes')
    .update({
      credits,
      issued_credits: issuedCredits,
      low_balance_since: lowBalanceSince,
    })
    .eq('code', code);
  if (error) throw new Error(`Recharge invite code failed: ${error.message}`);
}

export async function zeroInviteCode(code: string): Promise<void> {
  const { error } = await getSupabase()
    .from('invite_codes')
    .update({
      credits: 0,
      low_balance_since: null,
    })
    .eq('code', code);
  if (error) throw new Error(`Zero invite code failed: ${error.message}`);
}

export async function deleteInviteCode(code: string): Promise<void> {
  const { error } = await getSupabase()
    .from('invite_codes')
    .delete()
    .eq('code', code);
  if (error) throw new Error(`Delete invite code failed: ${error.message}`);
}

export async function deleteInviteCodes(codes: string[]): Promise<void> {
  if (codes.length === 0) return;
  const { error } = await getSupabase()
    .from('invite_codes')
    .delete()
    .in('code', codes);
  if (error) throw new Error(`Delete invite codes failed: ${error.message}`);
}

export async function listInviteCodes(
  page: number,
  pageSize: number,
  options: {
    status?: string;
    sort?: string;
    search?: string;
  } = {},
): Promise<{ codes: InviteCodeRow[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const keyword = String(options.search || '').trim();
  const userIdsForKeyword = new Set<string>();

  if (keyword) {
    const safeKeyword = keyword.replace(/[%_,]/g, ' ');
    const { data: matchedUsers } = await getSupabase()
      .from('users')
      .select('id')
      .ilike('username', `%${safeKeyword}%`)
      .limit(200);

    for (const row of matchedUsers || []) {
      const userId = normalizeSupabaseId((row as { id: string | number }).id);
      if (userId) userIdsForKeyword.add(userId);
    }
  }

  const applyFilters = (query: any) => {
    let next = query;
    if (options.status === 'used') {
      next = next.not('redeemed_by', 'is', null).neq('redeemed_by', '');
    } else if (options.status === 'unused') {
      next = next.is('redeemed_by', null);
    }

    if (keyword) {
      const safeKeyword = keyword.replace(/[(),]/g, ' ');
      const orParts = [`code.ilike.%${safeKeyword}%`, `redeemed_by.ilike.%${safeKeyword}%`];
      if (userIdsForKeyword.size > 0) {
        orParts.push(`redeemed_by.in.(${[...userIdsForKeyword].join(',')})`);
      }
      next = next.or(orParts.join(','));
    }

    return next;
  };

  const { count, error: countError } = await applyFilters(getSupabase()
    .from('invite_codes')
    .select('*', { count: 'exact', head: true }));
  const total = countError ? 0 : count || 0;

  let dataQuery = applyFilters(getSupabase()
    .from('invite_codes')
    .select('*'));

  if (options.sort === 'created-asc') {
    dataQuery = dataQuery.order('created_at', { ascending: true });
  } else if (options.sort === 'credits-desc') {
    dataQuery = dataQuery.order('credits', { ascending: false }).order('created_at', { ascending: false });
  } else if (options.sort === 'credits-asc') {
    dataQuery = dataQuery.order('credits', { ascending: true }).order('created_at', { ascending: false });
  } else {
    dataQuery = dataQuery.order('created_at', { ascending: false });
  }

  const { data, error } = await dataQuery.range(from, to);
  if (error) throw new Error(`List invite codes failed: ${error.message}`);

  return {
    codes: (data || []) as unknown as InviteCodeRow[],
    total,
  };
}

export async function getRedeemedInviteCodeForUser(
  userId: string,
): Promise<InviteCodeRow | null> {
  const { data, error } = await getSupabase()
    .from('invite_codes')
    .select('*')
    .eq('redeemed_by', userId)
    .order('redeemed_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) return null;
  return data as unknown as InviteCodeRow;
}

export async function getInviteRedemptionsForUser(userId: string): Promise<InviteCodeRow[]> {
  const { data, error } = await getSupabase()
    .from('invite_codes')
    .select('*')
    .eq('redeemed_by', userId)
    .not('redeemed_at', 'is', null)
    .order('redeemed_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Fetch invite redemptions failed: ${error.message}`);
  return (data || []) as unknown as InviteCodeRow[];
}

export async function getAllRedeemedUserIds(): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from('invite_codes')
    .select('redeemed_by')
    .not('redeemed_by', 'is', null)
    .neq('redeemed_by', '');
  if (error) return [];
  return [...new Set((data || []).map((row: { redeemed_by: string }) => row.redeemed_by).filter(Boolean))];
}

export async function getReclaimableInviteCodes(): Promise<InviteCodeRow[]> {
  const { data, error } = await getSupabase()
    .from('invite_codes')
    .select('*')
    .gt('credits', 0)
    .not('low_balance_since', 'is', null);
  if (error) return [];
  return (data || []) as unknown as InviteCodeRow[];
}

export async function getOutstandingInviteCredits(): Promise<number> {
  const { data, error } = await getSupabase()
    .from('invite_codes')
    .select('credits');
  if (error) return 0;
  return (data || []).reduce((sum: number, row: { credits: number }) => sum + Number(row.credits || 0), 0);
}

// ─── 生成历史操作 ───────────────────────────────────────────────────

export async function insertGeneration(record: {
  userId: string;
  username: string;
  prompt: string;
  modelId: string;
  modelName: string;
  dimensions: string;
  imageSize: string;
  imagePath: string;
  creditsUsed: number;
  apiRequestMs?: number;
  referenceImages: string[];
  createdAt: string;
}): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = await getNextNumericId('generations');
    const apiRequestMs = Math.max(0, Math.floor(record.apiRequestMs || 0));
    const insertPayload = {
      id,
      user_id: record.userId,
      username: record.username,
      prompt: record.prompt,
      model_id: record.modelId,
      model_name: record.modelName,
      dimensions: record.dimensions,
      image_size: record.imageSize,
      image_path: record.imagePath,
      credits_used: record.creditsUsed,
      api_request_ms: apiRequestMs,
      reference_images: JSON.stringify(record.referenceImages),
      created_at: record.createdAt,
    };
    const { error } = await getSupabase().from('generations').insert(insertPayload);

    if (!error) {
      return;
    }

    if (isMissingApiRequestMsColumn(error)) {
      const legacyPayload = { ...insertPayload };
      delete (legacyPayload as Partial<typeof insertPayload>).api_request_ms;
      const { error: legacyError } = await getSupabase().from('generations').insert(legacyPayload);
      if (!legacyError) {
        if (apiRequestMs > 0) {
          await setSetting(generationApiRequestMsSettingKey(id), String(apiRequestMs));
        }
        return;
      }
      if (!isPrimaryKeyConflict(legacyError)) {
        throw new Error(`Insert generation failed: ${legacyError.message}`);
      }
      continue;
    }

    if (!isPrimaryKeyConflict(error)) {
      throw new Error(`Insert generation failed: ${error.message}`);
    }
  }

  throw new Error('Insert generation failed: unable to allocate a unique generation id');
}

export async function getUserGenerations(userId: string): Promise<GenerationRow[]> {
  const { data, error } = await getSupabase()
    .from('generations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Fetch generations failed: ${error.message}`);
  return hydrateGenerationApiRequestMs((data || []).map((row) => toGenerationRow(row as Record<string, unknown>)));
}

export async function insertGenerationRequest(record: {
  userId: string;
  username: string;
  prompt: string;
  modelId: string;
  modelName: string;
  dimensions: string;
  imageSize: string;
  creditsUsed: number;
  apiRequestMs: number;
  resultStatus: string;
  resultMessage: string;
  createdAt: string;
}): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = await getNextNumericId('generation_requests');
    const { data, error } = await getSupabase().from('generation_requests').insert({
      id,
      user_id: record.userId,
      username: record.username,
      prompt: record.prompt,
      model_id: record.modelId,
      model_name: record.modelName,
      dimensions: record.dimensions,
      image_size: record.imageSize,
      image_path: '',
      credits_used: record.creditsUsed,
      api_request_ms: record.apiRequestMs,
      reference_images: '[]',
      result_status: record.resultStatus,
      result_message: record.resultMessage,
      created_at: record.createdAt,
    });
    if (!error) return String((data as { id?: string | number } | null)?.id || id);
    if (!isPrimaryKeyConflict(error)) throw new Error(`Insert generation request failed: ${error.message}`);
  }
  throw new Error('Insert generation request failed: unable to allocate a unique request id');
}

export async function updateGenerationRequestImage(requestId: string, imagePath: string): Promise<void> {
  if (!requestId || !imagePath) return;
  const { error } = await getSupabase()
    .from('generation_requests')
    .update({ image_path: imagePath })
    .eq('id', requestId);
  if (error) throw new Error(`Update generation request image failed: ${error.message}`);
}

export async function getGenerationRequests(
  page: number,
  pageSize: number,
  options: GenerationFilterOptions = {},
): Promise<{ records: GenerationRow[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const keyword = String(options.search || '').trim();
  const inviteUserIds = keyword ? await getInviteUserIdsForGenerationKeyword(keyword) : new Set<string>();
  const [{ count, error: countError }, { data, error }] = await Promise.all([
    applyGenerationFilters(getSupabase().from('generation_requests').select('id', { count: 'exact', head: true }), options, inviteUserIds),
    applyGenerationFilters(getSupabase().from('generation_requests').select('*'), options, inviteUserIds)
      .order('created_at', { ascending: false }).range(from, to),
  ]);
  if (error) throw new Error(`Fetch generation requests failed: ${error.message}`);
  if (countError) throw new Error(`Count generation requests failed: ${countError.message}`);
  return {
    records: (data || []).map((row) => toGenerationRow(row as Record<string, unknown>)),
    total: count || 0,
  };
}

export async function getGenerationRequestFilterOptions(): Promise<{
  modelOptions: string[];
  resolutionOptions: string[];
}> {
  const { data, error } = await getSupabase()
    .from('generation_requests')
    .select('model_name, dimensions, image_size')
    .neq('username', 'demo')
    .order('created_at', { ascending: false })
    .range(0, 9999);
  if (error) return { modelOptions: [], resolutionOptions: [] };
  const modelOptions = new Set<string>();
  const resolutionOptions = new Set<string>();
  for (const row of data || []) {
    const modelName = String((row as { model_name: string }).model_name || '');
    const dimensions = String((row as { dimensions: string }).dimensions || '');
    const imageSize = String((row as { image_size: string }).image_size || '');
    if (modelName) modelOptions.add(modelName);
    if (dimensions) resolutionOptions.add(imageSize ? `${dimensions} / ${imageSize}` : dimensions);
  }
  return { modelOptions: [...modelOptions].sort(), resolutionOptions: [...resolutionOptions].sort() };
}

async function hydrateGenerationApiRequestMs(records: GenerationRow[]): Promise<GenerationRow[]> {
  const missingRecords = records.filter((record) => !record.api_request_ms);
  if (missingRecords.length === 0) return records;

  const keys = missingRecords.map((record) => generationApiRequestMsSettingKey(record.id));
  const { data, error } = await getSupabase()
    .from('app_settings')
    .select('key, value')
    .in('key', keys);
  if (error || !data || data.length === 0) return records;

  const valueByKey = new Map(
    (data as Array<{ key: string; value: string }>).map((item) => [item.key, Number(item.value || 0)]),
  );

  return records.map((record) => ({
    ...record,
    api_request_ms: record.api_request_ms || Math.max(0, Math.floor(valueByKey.get(generationApiRequestMsSettingKey(record.id)) || 0)),
  }));
}

export async function getGenerationSummaries(): Promise<
  Array<{
    user_id: string;
    username: string;
    generations: number;
    credits_used: number;
    last_generated_at: string;
  }>
> {
  // Supabase/PostgREST 默认最多返回 1000 行，因此必须分页读取后再在应用层聚合。
  // 按 id 稳定排序，避免并发新增记录时不同分页之间出现重复或遗漏。
  const pageSize = 1000;
  const rows: Array<{
    id: string | number;
    user_id: string | number;
    username: string;
    credits_used: number;
    created_at: string;
  }> = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await getSupabase()
      .from('generations')
      .select('id, user_id, username, credits_used, created_at')
      .neq('username', 'demo')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) return [];

    const page = (data || []) as typeof rows;
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const summaryMap = new Map<
    string,
    {
      user_id: string;
      username: string;
      generations: number;
      credits_used: number;
      last_generated_at: string;
    }
  >();

  for (const row of rows) {
    const userId = normalizeSupabaseId(row.user_id);
    if (!userId) continue;
    const existing = summaryMap.get(userId);
    if (existing) {
      existing.generations += 1;
      existing.credits_used += Number(row.credits_used || 0);
      if (row.created_at > existing.last_generated_at) {
        existing.last_generated_at = row.created_at;
      }
    } else {
      summaryMap.set(userId, {
        user_id: userId,
        username: row.username,
        generations: 1,
        credits_used: Number(row.credits_used || 0),
        last_generated_at: row.created_at,
      });
    }
  }

  return [...summaryMap.values()].sort((a, b) => b.credits_used - a.credits_used || b.generations - a.generations);
}

export async function getGenerationsWithInviteCode(
  page: number,
  pageSize: number,
  options: GenerationFilterOptions = {},
): Promise<{ records: GenerationRow[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const keyword = String(options.search || '').trim();
  const userIdsForInviteKeyword = keyword ? await getInviteUserIdsForGenerationKeyword(keyword) : new Set<string>();

  const { count, error: countError } = await applyGenerationFilters(getSupabase()
    .from('generations')
    .select('id', { count: 'exact', head: true }), options, userIdsForInviteKeyword);
  const total = countError ? 0 : count || 0;

  const { data, error } = await applyGenerationFilters(getSupabase()
    .from('generations')
    .select('*'), options, userIdsForInviteKeyword)
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw new Error(`Fetch generations failed: ${error.message}`);

  const records = await hydrateGenerationApiRequestMs(
    (data || []).map((row) => toGenerationRow(row as Record<string, unknown>)),
  );

  // 为每条记录附加 invite_code
  const userIds = [...new Set(records.map((r) => r.user_id))];
  const inviteCodeMap = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: inviteRows } = await getSupabase()
      .from('invite_codes')
      .select('redeemed_by, code')
      .in('redeemed_by', userIds)
      .order('redeemed_at', { ascending: false })
      .order('created_at', { ascending: false });

    for (const row of inviteRows || []) {
      const userId = normalizeSupabaseId((row as { redeemed_by: string | number }).redeemed_by);
      if (userId && !inviteCodeMap.has(userId)) {
        inviteCodeMap.set(userId, String((row as { code: string }).code || ''));
      }
    }
  }

  for (const record of records) {
    (record as GenerationRow & { invite_code?: string }).invite_code =
      inviteCodeMap.get(record.user_id) || '';
  }

  return { records, total };
}

export async function getAdminDashboardCounts(): Promise<{
  userCount: number;
  recordCount: number;
  inviteCodeCount: number;
  usedInviteCodeCount: number;
  lowCreditUserCount: number;
  recentRecords: Array<{ created_at: string; credits_used: number }>;
}> {
  const [
    usersResult,
    recordsResult,
    invitesResult,
    usedInvitesResult,
    creditRowsResult,
    recentRowsResult,
  ] = await Promise.all([
    getSupabase().from('users').select('id', { count: 'exact', head: true }).neq('username', 'demo'),
    getSupabase().from('generations').select('id', { count: 'exact', head: true }).neq('username', 'demo'),
    getSupabase().from('invite_codes').select('code', { count: 'exact', head: true }),
    getSupabase()
      .from('invite_codes')
      .select('code', { count: 'exact', head: true })
      .not('redeemed_by', 'is', null)
      .neq('redeemed_by', ''),
    getSupabase().from('user_credits').select('total_credits, used_credits').neq('username', 'demo'),
    getSupabase()
      .from('generations')
      .select('created_at, credits_used')
      .neq('username', 'demo')
      .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10000),
  ]);

  const lowCreditUserCount = (creditRowsResult.data || []).filter((row) => {
    const totalCredits = Number((row as UserCreditsRow).total_credits || 0);
    const usedCredits = Number((row as UserCreditsRow).used_credits || 0);
    return Math.max(0, totalCredits - usedCredits) <= 50;
  }).length;

  return {
    userCount: usersResult.count || 0,
    recordCount: recordsResult.count || 0,
    inviteCodeCount: invitesResult.count || 0,
    usedInviteCodeCount: usedInvitesResult.count || 0,
    lowCreditUserCount,
    recentRecords: (recentRowsResult.data || []).map((row) => ({
      created_at: String((row as { created_at: string }).created_at || ''),
      credits_used: Number((row as { credits_used: number }).credits_used || 0),
    })),
  };
}

export async function getGenerationStatsRows(
  options: GenerationFilterOptions = {},
): Promise<{ rows: GenerationStatRow[]; total: number }> {
  const keyword = String(options.search || '').trim();
  const userIdsForInviteKeyword = keyword ? await getInviteUserIdsForGenerationKeyword(keyword) : new Set<string>();

  const { count, error: countError } = await applyGenerationFilters(getSupabase()
    .from('generations')
    .select('id', { count: 'exact', head: true }), options, userIdsForInviteKeyword);
  const total = countError ? 0 : count || 0;

  const { data, error } = await applyGenerationFilters(getSupabase()
    .from('generations')
    .select('created_at, credits_used, model_name, dimensions, image_size'), options, userIdsForInviteKeyword)
    .order('created_at', { ascending: false })
    .range(0, 9999);
  if (error) throw new Error(`Fetch generation stats failed: ${error.message}`);

  return {
    rows: (data || []).map((row) => ({
      created_at: String((row as { created_at: string }).created_at || ''),
      credits_used: Number((row as { credits_used: number }).credits_used || 0),
      model_name: String((row as { model_name: string }).model_name || ''),
      dimensions: String((row as { dimensions: string }).dimensions || ''),
      image_size: String((row as { image_size: string }).image_size || ''),
    })),
    total,
  };
}

export async function getGenerationFilterOptions(): Promise<{
  modelOptions: string[];
  resolutionOptions: string[];
}> {
  const { data, error } = await getSupabase()
    .from('generations')
    .select('model_name, dimensions, image_size')
    .neq('username', 'demo')
    .order('created_at', { ascending: false })
    .range(0, 9999);
  if (error) return { modelOptions: [], resolutionOptions: [] };

  const modelOptions = new Set<string>();
  const resolutionOptions = new Set<string>();

  for (const row of data || []) {
    const modelName = String((row as { model_name: string }).model_name || '');
    const dimensions = String((row as { dimensions: string }).dimensions || '');
    const imageSize = String((row as { image_size: string }).image_size || '');
    if (modelName) modelOptions.add(modelName);
    if (dimensions) resolutionOptions.add(imageSize ? `${dimensions} / ${imageSize}` : dimensions);
  }

  return {
    modelOptions: [...modelOptions].sort(),
    resolutionOptions: [...resolutionOptions].sort(),
  };
}

export async function getInviteCodeRedeemSummaries(userIds: string[]): Promise<Array<{
  user_id: string;
  username: string;
  credits_used: number;
}>> {
  const uniqueIds = [...new Set(userIds.map(normalizeSupabaseId).filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const [usersResult, creditRowsResult, generationRowsResult] = await Promise.all([
    getSupabase().from('users').select('id, username').in('id', uniqueIds),
    getSupabase().from('user_credits').select('user_id, username').in('user_id', uniqueIds),
    getSupabase()
      .from('generations')
      .select('user_id, credits_used')
      .in('user_id', uniqueIds)
      .neq('username', 'demo')
      .range(0, 9999),
  ]);

  const usernameById = new Map<string, string>();
  for (const row of usersResult.data || []) {
    const userId = normalizeSupabaseId((row as { id: string | number }).id);
    if (userId) usernameById.set(userId, String((row as { username: string }).username || ''));
  }
  for (const row of creditRowsResult.data || []) {
    const userId = normalizeSupabaseId((row as UserCreditsRow).user_id);
    if (userId && !usernameById.has(userId)) {
      usernameById.set(userId, String((row as UserCreditsRow).username || ''));
    }
  }

  const creditsById = new Map<string, number>();
  for (const row of generationRowsResult.data || []) {
    const userId = normalizeSupabaseId((row as { user_id: string | number }).user_id);
    if (!userId) continue;
    creditsById.set(userId, (creditsById.get(userId) || 0) + Number((row as { credits_used: number }).credits_used || 0));
  }

  return uniqueIds.map((userId) => ({
    user_id: userId,
    username: usernameById.get(userId) || '',
    credits_used: creditsById.get(userId) || 0,
  }));
}

export async function getRecentGenerationUsageRows(hours: number): Promise<Array<{
  user_id: string;
  created_at: string;
  credits_used: number;
}>> {
  const { data, error } = await getSupabase()
    .from('generations')
    .select('user_id, created_at, credits_used')
    .neq('username', 'demo')
    .gte('created_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .range(0, 9999);
  if (error) return [];

  return (data || []).map((row) => ({
    user_id: normalizeSupabaseId((row as { user_id: string | number }).user_id),
    created_at: String((row as { created_at: string }).created_at || ''),
    credits_used: Number((row as { credits_used: number }).credits_used || 0),
  }));
}

// ─── 图片操作 ───────────────────────────────────────────────────────

export async function insertImage(record: {
  userId: string;
  prompt: string;
  modelName: string;
  dimensions: string;
  imagePath: string;
  category: string;
  referenceImages: string[];
  createdAt: string;
}): Promise<ImageRow> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = await getNextNumericId('images');
    const { data, error } = await getSupabase()
      .from('images')
      .insert({
        id,
        user_id: record.userId,
        prompt: record.prompt,
        model_name: record.modelName,
        dimensions: record.dimensions,
        image_path: record.imagePath,
        category: record.category,
        reference_images: JSON.stringify(record.referenceImages),
        created_at: record.createdAt,
      })
      .select('*')
      .single();

    if (!error && data) {
      return toImageRow(data as Record<string, unknown>);
    }

    if (!isPrimaryKeyConflict(error)) {
      throw new Error(`Insert image failed: ${error?.message || 'unknown error'}`);
    }
  }

  throw new Error('Insert image failed: unable to allocate a unique image id');
}

export async function getUserImages(
  userId: string,
  category?: string,
): Promise<ImageRow[]> {
  let query = getSupabase()
    .from('images')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Fetch images failed: ${error.message}`);
  return (data || []).map((row) => toImageRow(row as Record<string, unknown>));
}

export async function getImageById(imageId: string, userId: string): Promise<ImageRow | null> {
  const { data, error } = await getSupabase()
    .from('images')
    .select('*')
    .eq('id', imageId)
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;
  return toImageRow(data as Record<string, unknown>);
}

export async function updateImageCategory(
  imageId: string,
  userId: string,
  category: string,
): Promise<boolean> {
  const { error } = await getSupabase()
    .from('images')
    .update({ category })
    .eq('id', imageId)
    .eq('user_id', userId);
  if (error) return false;
  return true;
}

export async function deleteImage(imageId: string, userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('images')
    .delete()
    .eq('id', imageId)
    .eq('user_id', userId);
  if (error) throw new Error(`Delete image failed: ${error.message}`);
}

// ─── 设置操作 ───────────────────────────────────────────────────────

export async function getSetting(key: string, fallback: string): Promise<string> {
  const { data, error } = await getSupabase()
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw new Error(`Get setting failed: ${error.message}`);
  if (!data) {
    // 设置默认值
    const { error: insertError } = await getSupabase().from('app_settings').insert({
      key,
      value: fallback,
      updated_at: nowIso(),
    });
    if (insertError) {
      // Another request may have created the row between the read and insert.
      const { data: existing, error: retryError } = await getSupabase()
        .from('app_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();
      if (retryError) throw new Error(`Get setting failed: ${retryError.message}`);
      if (existing) return String((existing as { value: string }).value);
      throw new Error(`Initialize setting failed: ${insertError.message}`);
    }
    return fallback;
  }
  return String((data as { value: string }).value);
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await getSupabase()
    .from('app_settings')
    .upsert(
      { key, value, updated_at: nowIso() },
      { onConflict: 'key' },
    );
  if (error) throw new Error(`Set setting failed: ${error.message}`);
}

export async function claimSetting(key: string, value: string): Promise<{ claimed: boolean; value: string }> {
  const { error } = await getSupabase().from('app_settings').insert({
    key,
    value,
    updated_at: nowIso(),
  });
  if (!error) return { claimed: true, value };

  if (error.code !== '23505') {
    throw new Error(`Claim setting failed: ${error.message}`);
  }

  const { data, error: readError } = await getSupabase()
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (readError) throw new Error(`Read claimed setting failed: ${readError.message}`);
  return { claimed: false, value: data ? String((data as { value: string }).value) : '' };
}

// ─── 管理概览操作 ───────────────────────────────────────────────────

export async function getRegisteredUsers(): Promise<
  Array<{
    user_id: string;
    username: string;
    total_credits: number;
    used_credits: number;
  }>
> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('id, username')
    .neq('username', 'demo')
    .order('created_at', { ascending: false });
  if (error) return [];

  const userIds = (data || []).map((user: { id: string | number }) => normalizeSupabaseId(user.id)).filter(Boolean);
  const creditMap = new Map<string, { total_credits: number; used_credits: number }>();

  if (userIds.length > 0) {
    const { data: creditRows } = await getSupabase()
      .from('user_credits')
      .select('user_id, total_credits, used_credits')
      .in('user_id', userIds);

    for (const row of creditRows || []) {
      const userId = normalizeSupabaseId((row as UserCreditsRow).user_id);
      creditMap.set(userId, {
        total_credits: Number((row as UserCreditsRow).total_credits || 0),
        used_credits: Number((row as UserCreditsRow).used_credits || 0),
      });
    }
  }

  return (data as Array<{ id: string; username: string }>).map((user) => {
    const userId = normalizeSupabaseId(user.id);
    const credits = creditMap.get(userId);
    return {
      user_id: userId,
      username: user.username,
      total_credits: Number(credits?.total_credits || 0),
      used_credits: Number(credits?.used_credits || 0),
    };
  });
}

export async function getAllCreditRows(): Promise<
  Array<{
    user_id: string;
    username: string;
    total_credits: number;
    used_credits: number;
  }>
> {
  const { data, error } = await getSupabase()
    .from('user_credits')
    .select('*')
    .neq('username', 'demo');
  if (error) return [];
  return (data || []).map((row: UserCreditsRow) => ({
    user_id: row.user_id,
    username: row.username,
    total_credits: Number(row.total_credits || 0),
    used_credits: Number(row.used_credits || 0),
  }));
}

// ─── 邀请码回收逻辑 ────────────────────────────────────────────────

export async function syncInviteCodeBalanceForUser(userId: string): Promise<void> {
  const invite = await getRedeemedInviteCodeForUser(userId);
  if (!invite?.code) return;

  const user = await findUserById(userId);
  const isInviteUser =
    Boolean(user?.username?.startsWith('invite-')) || String(user?.password_hash || '') === INVITE_USER_PASSWORD_HASH;

  if (!isInviteUser) {
    if (invite.low_balance_since) {
      await updateInviteCodeCredits(invite.code, Number(invite.credits || 0), null);
    }
    return;
  }

  const credits = await getUserCredits(userId);
  const remainingCredits = credits.remainingCredits;
  const currentCredits = Number(invite.credits || 0);
  const existingLowBalanceSince = invite.low_balance_since || '';
  const nextLowBalanceSince =
    remainingCredits > 0 && remainingCredits < INVITE_RECLAIM_THRESHOLD
      ? existingLowBalanceSince || nowIso()
      : null;

  if (
    currentCredits === remainingCredits &&
    String(invite.low_balance_since || '') === String(nextLowBalanceSince || '')
  ) {
    return;
  }

  await updateInviteCodeCredits(invite.code, remainingCredits, nextLowBalanceSince);
}

export async function syncRedeemedInviteCodeBalances(): Promise<void> {
  const userIds = await getAllRedeemedUserIds();
  for (const userId of userIds) {
    await syncInviteCodeBalanceForUser(userId);
  }
}

export async function reclaimLowBalanceInviteCodes(): Promise<void> {
  const invites = await getReclaimableInviteCodes();

  for (const invite of invites) {
    const lowBalanceSince = invite.low_balance_since || '';
    if (!lowBalanceSince) continue;

    const reclaimAt = new Date(addDaysIso(lowBalanceSince, INVITE_RECLAIM_DAYS));
    if (Number.isNaN(reclaimAt.getTime()) || reclaimAt.getTime() > Date.now()) {
      continue;
    }

    const creditsToReturn = Number(invite.credits || 0);
    if (creditsToReturn <= 0) continue;

    // 已按需求停用“邀请码余额耗尽后自动处理用户和邀请码记录”的逻辑。
    // 如需恢复自动回收，请取消下面这段代码的注释。
    /*
    const redeemedBy = invite.redeemed_by || '';
    if (redeemedBy) {
      const user = await findUserById(redeemedBy);
      const isInviteUser =
        Boolean(user?.username?.startsWith('invite-')) || String(user?.password_hash || '') === INVITE_USER_PASSWORD_HASH;

      if (!isInviteUser) {
        await updateInviteCodeCredits(invite.code, creditsToReturn, null);
        continue;
      }

      const userCredits = await getUserCredits(redeemedBy);
      await setUserTotalCredits(redeemedBy, userCredits.usedCredits);
    }

    await zeroInviteCode(invite.code);
    await adjustAdminTotalCredits(creditsToReturn);
    */
  }
}

// ─── 初始化逻辑 ─────────────────────────────────────────────────────

export async function purgeExpiredImageData(retentionDays = IMAGE_RETENTION_DAYS): Promise<{
  deletedGenerations: number;
  deletedImages: number;
  cutoffIso: string;
}> {
  const cutoffIso = subtractDaysIso(retentionDays);

  const { data: oldGenerations, error: generationsQueryError } = await getSupabase()
    .from('generations')
    .select('id')
    .lt('created_at', cutoffIso);
  if (generationsQueryError) {
    throw new Error(`Query expired generations failed: ${generationsQueryError.message}`);
  }

  const { data: oldImages, error: imagesQueryError } = await getSupabase()
    .from('images')
    .select('id')
    .lt('created_at', cutoffIso);
  if (imagesQueryError) {
    throw new Error(`Query expired images failed: ${imagesQueryError.message}`);
  }

  if ((oldGenerations || []).length > 0) {
    const generationIds = oldGenerations.map((row) => normalizeSupabaseId((row as { id: string | number }).id));
    const { error: deleteGenerationsError } = await getSupabase().from('generations').delete().in('id', generationIds);
    if (deleteGenerationsError) {
      throw new Error(`Delete expired generations failed: ${deleteGenerationsError.message}`);
    }
  }

  if ((oldImages || []).length > 0) {
    const imageIds = oldImages.map((row) => normalizeSupabaseId((row as { id: string | number }).id));
    const { error: deleteImagesError } = await getSupabase().from('images').delete().in('id', imageIds);
    if (deleteImagesError) {
      throw new Error(`Delete expired images failed: ${deleteImagesError.message}`);
    }
  }

  return {
    deletedGenerations: (oldGenerations || []).length,
    deletedImages: (oldImages || []).length,
    cutoffIso,
  };
}

export async function ensureRuntimeSchema(): Promise<void> {
  const bcrypt = await import('bcryptjs');

  // 确保管理员用户存在
  const adminUsername = 'admin';
  let adminUser = await findUserByUsername(adminUsername);

  if (!adminUser) {
    const passwordHash = await bcrypt.hash('admin654', 10);
    adminUser = await createUser(adminUsername, passwordHash, 'admin@example.com');
  } else {
    const passwordHash = await bcrypt.hash('admin654', 10);
    await updateUserPassword(adminUsername, passwordHash);
  }

  await ensureUserCredits(adminUser.id, adminUsername, 0);
  const adminCredits = await getUserCredits(adminUser.id);
  if (adminCredits.totalCredits === 0 && adminCredits.usedCredits === 0) {
    const outstandingInviteCredits = await getOutstandingInviteCredits();
    await setUserTotalCredits(adminUser.id, Math.max(0, ADMIN_INITIAL_CREDITS - outstandingInviteCredits));
  }

  await syncRedeemedInviteCodeBalances();
  await reclaimLowBalanceInviteCodes();
}

// ─── 导出辅助 ───────────────────────────────────────────────────────

export { generateInviteCode, generateRandomHex, sha256Digest, INVITE_RECLAIM_THRESHOLD };
