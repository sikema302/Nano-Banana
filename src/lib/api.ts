export type ImageCategory = 'favorite' | 'backup' | 'discarded';

export interface UserInfo {
  id: string;
  username: string;
  isAdmin?: boolean;
  creditsRemaining?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  creditsCost?: number;
}

export interface GeneratedImagePayload {
  prompt: string;
  modelName: string;
  dimensions: string;
  imageSize?: string;
  imagePath: string;
  referenceImages: string[];
  createdAt: string;
}

export interface SavedImage {
  id: number;
  prompt: string;
  modelName: string;
  dimensions: string;
  imageSize?: string;
  imageUrl: string;
  category: ImageCategory;
  referenceImages: string[];
  createdAt: string;
}

export interface GenerationRecord {
  id: number;
  userId: string;
  username: string;
  prompt: string;
  modelId: string;
  modelName: string;
  dimensions: string;
  imageSize?: string;
  imageUrl: string;
  creditsUsed: number;
  referenceImages: string[];
  inviteCode?: string;
  createdAt: string;
}

export interface AdminUserSummary {
  userId: string;
  username: string;
  generations: number;
  creditsUsed: number;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  lastGeneratedAt: string;
}

export interface CreditSummary {
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
}

export interface InviteCodeInfo {
  code: string;
  credits: number;
  createdBy: string;
  createdAt: string;
  redeemedBy: string;
  redeemedAt: string;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ReferenceUploadInput {
  name: string;
  mimeType: string;
  data: string;
}

const TOKEN_KEY = 'visionary_local_token';
const USER_KEY = 'visionary_local_user';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setSession(token: string, user: UserInfo) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(input: string, init: RequestInit = {}, auth = false): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');

  if (auth) {
    const token = getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  let payload: T | { error?: string } | null = null;

  try {
    payload = (await response.json()) as T | { error?: string };
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && payload.error
        ? payload.error
        : '服务器返回了异常响应';
    throw new Error(message);
  }

  return payload as T;
}

export async function fetchHealth() {
  return request<{ ok: boolean; userStorage: string }>('/api/health');
}

export async function fetchMe() {
  const result = await request<{ user: UserInfo }>('/api/auth/me', {}, true);
  setSession(getToken() || '', result.user);
  return result.user;
}

export async function register(payload: { username: string; password: string; email?: string }) {
  const result = await request<{ token: string; user: UserInfo }>(
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    false,
  );

  setSession(result.token, result.user);
  return result.user;
}

export async function login(payload: { username: string; password: string }) {
  const result = await request<{ token: string; user: UserInfo }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    false,
  );

  setSession(result.token, result.user);
  return result.user;
}

export async function loginWithInvite(payload: { code: string }) {
  const result = await request<{ token: string; user: UserInfo }>(
    '/api/auth/invite',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    false,
  );

  setSession(result.token, result.user);
  return result.user;
}

export async function fetchModels() {
  return request<{ models: ModelInfo[] }>('/api/models', {}, true);
}

export async function generateImage(payload: {
  prompt: string;
  model: string;
  dimensions: string;
  imageSize?: string;
  reference_images: ReferenceUploadInput[];
}) {
  return request<{ image: GeneratedImagePayload }>(
    '/api/generate',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true,
  );
}

export async function fetchUserImages(category?: ImageCategory) {
  const query = category ? `?category=${category}` : '';
  return request<{ images: SavedImage[] }>(`/api/user/images${query}`, {}, true);
}

export async function fetchUserHistory() {
  return request<{ history: GenerationRecord[] }>('/api/user/history', {}, true);
}

export async function fetchAdminOverview(params: {
  recordsPage?: number;
  recordsPageSize?: number;
  inviteCodesPage?: number;
  inviteCodesPageSize?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.recordsPage) query.set('recordsPage', String(params.recordsPage));
  if (params.recordsPageSize) query.set('recordsPageSize', String(params.recordsPageSize));
  if (params.inviteCodesPage) query.set('inviteCodesPage', String(params.inviteCodesPage));
  if (params.inviteCodesPageSize) query.set('inviteCodesPageSize', String(params.inviteCodesPageSize));
  const suffix = query.toString() ? `?${query.toString()}` : '';

  return request<{
    users: AdminUserSummary[];
    records: GenerationRecord[];
    recordsPage: PaginationInfo;
    inviteCodes: InviteCodeInfo[];
    inviteCodesPage: PaginationInfo;
    adminCredits: CreditSummary;
  }>(`/api/admin/overview${suffix}`, {}, true);
}

export async function createInviteCode(payload: { credits: number }) {
  return request<{ inviteCode: InviteCodeInfo; adminCredits: CreditSummary }>(
    '/api/admin/invite-codes',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true,
  );
}

export async function moveImage(payload: {
  imageId?: number;
  image?: GeneratedImagePayload;
  category: ImageCategory;
}) {
  return request<{ image: SavedImage | null }>(
    '/api/user/images/move',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true,
  );
}

export async function deleteImage(imageId: number) {
  return request<{ ok: boolean }>(
    `/api/user/images/${imageId}`,
    {
      method: 'DELETE',
    },
    true,
  );
}
