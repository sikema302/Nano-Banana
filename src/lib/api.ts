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

export interface ApiCreditPool {
  id: 'gpt_hd' | 'gpt' | 'banana' | 'legacy';
  name: string;
  envName?: string;
  keyPreview?: string;
  status?: 'available' | 'missing';
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
  apiCredits?: Array<{
    poolId: ApiCreditPool['id'];
    name: string;
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
  }>;
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
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

function toApiUrl(path: string) {
  if (!API_BASE_URL) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function resolveAssetUrl(path: string) {
  if (!path) return path;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function normalizeGeneratedImage(image: GeneratedImagePayload): GeneratedImagePayload {
  return {
    ...image,
    imagePath: resolveAssetUrl(image.imagePath),
    referenceImages: image.referenceImages.map(resolveAssetUrl),
  };
}

function normalizeSavedImage(image: SavedImage): SavedImage {
  return {
    ...image,
    imageUrl: resolveAssetUrl(image.imageUrl),
    referenceImages: image.referenceImages.map(resolveAssetUrl),
  };
}

function normalizeGenerationRecord(record: GenerationRecord): GenerationRecord {
  return {
    ...record,
    imageUrl: resolveAssetUrl(record.imageUrl),
    referenceImages: record.referenceImages.map(resolveAssetUrl),
  };
}

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

  const response = await fetch(toApiUrl(input), {
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
  quality?: string;
  optimizeChineseText?: boolean;
  reference_images: ReferenceUploadInput[];
}) {
  const result = await request<{ image: GeneratedImagePayload }>(
    '/api/generate',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true,
  );
  return { image: normalizeGeneratedImage(result.image) };
}

export async function fetchUserImages(category?: ImageCategory) {
  const query = category ? `?category=${category}` : '';
  const result = await request<{ images: SavedImage[] }>(`/api/user/images${query}`, {}, true);
  return { images: result.images.map(normalizeSavedImage) };
}

export async function fetchUserHistory() {
  const result = await request<{ history: GenerationRecord[] }>('/api/user/history', {}, true);
  return { history: result.history.map(normalizeGenerationRecord) };
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

  const result = await request<{
    users: AdminUserSummary[];
    records: GenerationRecord[];
    recordsPage: PaginationInfo;
    inviteCodes: InviteCodeInfo[];
    inviteCodesPage: PaginationInfo;
    adminCredits: CreditSummary;
    apiCreditPools: ApiCreditPool[];
  }>(`/api/admin/overview${suffix}`, {}, true);
  return {
    ...result,
    records: result.records.map(normalizeGenerationRecord),
  };
}

export async function createInviteCode(payload: { credits?: number; apiCredits?: Partial<Record<ApiCreditPool['id'], number>> }) {
  return request<{ inviteCode: InviteCodeInfo; adminCredits: CreditSummary; apiCreditPools: ApiCreditPool[] }>(
    '/api/admin/invite-codes',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true,
  );
}

export async function deleteInviteCode(code: string) {
  return request<{ ok: boolean; adminCredits: CreditSummary; apiCreditPools: ApiCreditPool[] }>(
    `/api/admin/invite-codes/${encodeURIComponent(code)}`,
    {
      method: 'DELETE',
    },
    true,
  );
}

export async function moveImage(payload: {
  imageId?: number;
  image?: GeneratedImagePayload;
  category: ImageCategory;
}) {
  const result = await request<{ image: SavedImage | null }>(
    '/api/user/images/move',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true,
  );
  return { image: result.image ? normalizeSavedImage(result.image) : null };
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
