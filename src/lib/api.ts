import type { GptImagePricing } from './model-pricing';

export type ImageCategory = 'favorite' | 'backup' | 'discarded';

export interface UserInfo {
  id: string;
  username: string;
  isAdmin?: boolean;
  canRedeemInvite?: boolean;
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
  thumbnailPath?: string;
  referenceImages: string[];
  createdAt: string;
}

export type GenerationJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface GenerationJobInfo {
  id: string;
  status: GenerationJobStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  image?: GeneratedImagePayload;
  error?: string;
}

export interface VideoGenerationJobInfo {
  id: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  progress: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  videoUrl?: string;
  error?: string;
  creditsUsed?: number;
  creditsRemaining?: number;
}

export interface SavedImage {
  id: number;
  prompt: string;
  modelName: string;
  dimensions: string;
  imageSize?: string;
  imageUrl: string;
  thumbnailUrl?: string;
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
  thumbnailUrl?: string;
  creditsUsed: number;
  apiRequestMs?: number;
  referenceImages: string[];
  inviteCode?: string;
  resultStatus?: 'success' | 'failed';
  resultMessage?: string;
  createdAt: string;
}

export interface AdminUserSummary {
  userId: string;
  username: string;
  inviteCode?: string;
  generations: number;
  creditsUsed: number;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  apiKeyId?: string;
  lastGeneratedAt: string;
  usageTrend?: number[];
}

export interface InviteRedemptionRecord {
  code: string;
  credits: number;
  redeemedAt: string;
  createdAt: string;
}

export interface CreditSummary {
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
}

export interface PromoCouponInfo {
  couponId: string;
  discountPercent: number;
  issuedAt: string;
  expiresAt: string;
  nextEligibleAt: string;
  purchaseUrl: string;
  active: boolean;
  shouldPopup: boolean;
}

export interface InviteCodeInfo {
  code: string;
  credits: number;
  apiCredits?: Array<{
    poolId: string;
    name: string;
    totalCredits: number;
    remainingCredits: number;
  }>;
  createdBy: string;
  createdAt: string;
  redeemedBy: string;
  redeemedAt: string;
  redeemedUsername?: string;
  consumedAfterRedeem?: number;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminDashboardStats {
  todayRecordCount: number;
  todayCreditsUsed: number;
  inviteUsageRate: number;
  lowCreditUserCount: number;
  userCount: number;
  inviteCodeCount: number;
  recordCount: number;
  usedInviteCodeCount: number;
}

export interface ProviderMetricRow {
  modelId: string;
  provider: string;
  configuration: string;
  callCount: number;
  successCount: number;
  failureCount: number;
  averageResponseMs: number;
  totalResponseMs: number;
}

export interface ProviderRiskRecord {
  traceId: string;
  modelId: string;
  configuration: string;
  createdAt: string;
  updatedAt: string;
  junliaiStatus: 'not_called' | 'success' | 'explicit_failure' | 'uncertain';
  junliaiDurationMs: number;
  visionaryStatus: 'not_called' | 'success' | 'failure';
  visionaryDurationMs: number;
  riskLevel: 'normal' | 'review' | 'suspected_duplicate';
  riskReason: string;
}

export interface ProviderRoutingConfig {
  junliaiGptImage2Economy: boolean;
  junliaiGptImage2: boolean;
  junliaiNanoBanana: boolean;
  junliaiFireflyVideo: boolean;
}

export interface VisionaryDocSyncStatus {
  lastAttemptAt: string;
  lastCheckedAt: string;
  nextCheckAt: string;
  documentChangedAt: string;
  pricingChangedAt: string;
  reviewRequired: boolean;
  lastError: string;
  pricing: GptImagePricing;
}

export interface AdminImageStorageStats {
  uploadsTotalBytes: number;
  generatedBytes: number;
  generatedCount: number;
  thumbnailBytes: number;
  thumbnailCount: number;
  referenceBytes: number;
  referenceCount: number;
  referenceStorageEnabled: boolean;
  retentionDays: number;
  originalRetentionDays: number;
  thumbnailRetentionDays: number;
  diskUsagePercent: number;
  diskWarningPercent: number;
  diskEmergencyPercent: number;
}

export interface AdminImageCleanupResult {
  retentionDays: number;
  cutoffIso: string;
  deletedGenerations: number;
  deletedImages: number;
  deletedReferenceFiles: number;
  deletedGeneratedFiles: number;
  deletedThumbnailFiles: number;
  deletedEmergencyFiles: number;
  diskUsagePercent: number;
}

export interface AdminRecordsStats {
  todayCreditsUsed: number;
  todayRecordCount: number;
  totalCreditsUsed: number;
  mostUsedModel: string;
  mostActiveHour: string;
}

export interface PublicApiKeyInfo {
  id: string;
  name: string;
  keyPreview: string;
  plainKey: string;
  copyable: boolean;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  createdAt: string;
  createdBy: string;
  revokedAt: string;
}

export interface UserApiKeyInfo {
  id: string;
  name: string;
  keyPreview: string;
  createdAt: string;
  pausedAt: string;
  revokedAt: string;
  lastUsedAt: string;
  status: 'active' | 'paused' | 'revoked';
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
    thumbnailPath: image.thumbnailPath ? resolveAssetUrl(image.thumbnailPath) : undefined,
    referenceImages: image.referenceImages.map(resolveAssetUrl),
  };
}

function normalizeSavedImage(image: SavedImage): SavedImage {
  return {
    ...image,
    imageUrl: resolveAssetUrl(image.imageUrl),
    thumbnailUrl: image.thumbnailUrl ? resolveAssetUrl(image.thumbnailUrl) : undefined,
    referenceImages: image.referenceImages.map(resolveAssetUrl),
  };
}

function normalizeGenerationRecord(record: GenerationRecord): GenerationRecord {
  return {
    ...record,
    imageUrl: resolveAssetUrl(record.imageUrl),
    thumbnailUrl: record.thumbnailUrl ? resolveAssetUrl(record.thumbnailUrl) : undefined,
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export interface ChatMemoryItem {
  id: string;
  content: string;
  createdAt: string;
}

export interface ChatMemory {
  enabled: boolean;
  items: ChatMemoryItem[];
}

function parseJsonPayload<T>(text: string): T | { error?: unknown; message?: unknown; detail?: unknown; failure_reason?: unknown } | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T | { error?: unknown; message?: unknown; detail?: unknown; failure_reason?: unknown };
  } catch {
    return null;
  }
}

function stringifyApiError(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  return (
    stringifyApiError(record.message) ||
    stringifyApiError(record.error) ||
    stringifyApiError(record.detail) ||
    stringifyApiError(record.failure_reason)
  );
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHttpErrorText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const titleMatch = trimmed.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const headingMatch = trimmed.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const normalized = stripHtml(titleMatch?.[1] || headingMatch?.[1] || trimmed);
  const lower = normalized.toLowerCase();

  if (lower.includes('504 gateway time-out') || lower.includes('504 gateway timeout')) {
    return '图像服务响应超时，请稍后重试。';
  }
  if (lower.includes('502 bad gateway')) {
    return '图像服务网关异常，请稍后重试。';
  }
  if (lower.includes('503 service unavailable')) {
    return '图像服务暂时不可用，请稍后重试。';
  }
  if (/<\/?[a-z][\s\S]*>/i.test(trimmed)) {
    return normalized || '服务接口返回异常，请稍后重试。';
  }

  return normalized;
}

function getApiErrorMessage(payload: unknown, responseText: string) {
  const fromPayload = stringifyApiError(payload);
  if (fromPayload) return normalizeHttpErrorText(fromPayload);

  const trimmedText = normalizeHttpErrorText(responseText);
  if (trimmedText) return trimmedText;

  return '服务接口返回异常';
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

  const responseText = await response.text().catch(() => '');
  const payload = parseJsonPayload<T>(responseText);

  if (!response.ok) {
    if (auth && response.status === 401) {
      clearSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pixory:session-expired'));
      }
    }
    throw new Error(getApiErrorMessage(payload, responseText));
  }

  return payload as T;
}

export async function fetchHealth() {
  return request<{ ok: boolean; userStorage: string }>('/api/health');
}

export async function fetchChatConversations() {
  return request<{ conversations: ChatConversation[]; models: ChatModel[] }>('/api/chat/conversations', {}, true);
}

export async function createChatConversation() {
  return request<{ conversation: ChatConversation }>('/api/chat/conversations', { method: 'POST', body: '{}' }, true);
}

export async function deleteChatConversation(id: string) {
  return request<{ ok: boolean }>(`/api/chat/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
}

export async function sendChatMessage(id: string, payload: { content: string; model: string }) {
  return request<{ conversation: ChatConversation; creditsUsed: number; creditsRemaining: number }>(
    `/api/chat/conversations/${encodeURIComponent(id)}/messages`,
    { method: 'POST', body: JSON.stringify(payload) },
    true,
  );
}

export async function fetchChatMemory() {
  return request<{ memory: ChatMemory }>('/api/chat/memory', {}, true);
}

export async function setChatMemoryEnabled(enabled: boolean) {
  return request<{ memory: ChatMemory }>('/api/chat/memory', { method: 'PUT', body: JSON.stringify({ enabled }) }, true);
}

export async function addChatMemory(content: string) {
  return request<{ memory: ChatMemory }>('/api/chat/memory/items', { method: 'POST', body: JSON.stringify({ content }) }, true);
}

export async function deleteChatMemory(id: string) {
  return request<{ memory: ChatMemory }>(`/api/chat/memory/items/${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
}

export async function claimInvitePopup() {
  return request<{ shouldShow: boolean }>('/api/ui/invite-popup/claim', { method: 'POST' });
}

export async function fetchMe() {
  const result = await request<{ user: UserInfo }>('/api/auth/me', {}, true);
  setSession(getToken() || '', result.user);
  return result.user;
}

export async function fetchPromoCoupon() {
  return request<{ coupon: PromoCouponInfo }>('/api/user/promo-coupon', {}, true);
}

export async function acknowledgePromoCoupon() {
  return request<{ coupon: PromoCouponInfo }>(
    '/api/user/promo-coupon/ack',
    {
      method: 'POST',
    },
    true,
  );
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

export async function redeemInviteCode(payload: { code: string }) {
  return request<{ redeemedCredits: number; user: UserInfo }>(
    '/api/user/redeem-invite',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true,
  );
}

export async function fetchModels() {
  return request<{
    models: ModelInfo[];
    gptImagePricing: GptImagePricing;
    providerRouting: ProviderRoutingConfig;
  }>('/api/models', {}, true);
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

export async function startGenerateImageJob(payload: {
  prompt: string;
  model: string;
  dimensions: string;
  imageSize?: string;
  quality?: string;
  optimizeChineseText?: boolean;
  reference_images: ReferenceUploadInput[];
}) {
  const result = await request<{ job: GenerationJobInfo }>(
    '/api/generate/jobs',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true,
  );
  return {
    job: {
      ...result.job,
      image: result.job.image ? normalizeGeneratedImage(result.job.image) : undefined,
    },
  };
}

export async function fetchGenerateImageJob(jobId: string) {
  const result = await request<{ job: GenerationJobInfo }>(`/api/generate/jobs/${encodeURIComponent(jobId)}`, {}, true);
  return {
    job: {
      ...result.job,
      image: result.job.image ? normalizeGeneratedImage(result.job.image) : undefined,
    },
  };
}

export async function startGenerateVideoJob(payload: {
  prompt: string;
  ratio: '16:9' | '1:1' | '9:16';
  resolution: '720p' | '1080p';
  seconds: 5;
  referenceImages: Array<{ name: string; mimeType: string; data: string }>;
}) {
  return request<{ job: VideoGenerationJobInfo }>(
    '/api/generate/video/jobs',
    { method: 'POST', body: JSON.stringify(payload) },
    true,
  );
}

export async function fetchGenerateVideoJob(jobId: string) {
  return request<{ job: VideoGenerationJobInfo }>(
    `/api/generate/video/jobs/${encodeURIComponent(jobId)}`,
    {},
    true,
  );
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
  }>(`/api/admin/overview${suffix}`, {}, true);
  return {
    ...result,
    records: result.records.map(normalizeGenerationRecord),
  };
}

function appendOptionalParam(query: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null || value === '') return;
  query.set(key, String(value));
}

export async function fetchAdminDashboard() {
  return request<{
    stats: AdminDashboardStats;
    providerMetrics: ProviderMetricRow[];
    providerRisks: ProviderRiskRecord[];
    providerRouting: ProviderRoutingConfig;
    imageStorage: AdminImageStorageStats;
    adminCredits: CreditSummary;
    visionaryDocSync: VisionaryDocSyncStatus;
  }>('/api/admin/dashboard', {}, true);
}

export async function updateAdminProviderRouting(patch: Partial<ProviderRoutingConfig>) {
  return request<{ providerRouting: ProviderRoutingConfig }>(
    '/api/admin/provider-routing',
    {
      method: 'PUT',
      body: JSON.stringify(patch),
    },
    true,
  );
}

export async function cleanupAdminImages(retentionDays = 5) {
  return request<{
    cleanup: AdminImageCleanupResult;
    imageStorage: AdminImageStorageStats;
  }>(
    '/api/admin/image-cleanup',
    {
      method: 'POST',
      body: JSON.stringify({ retentionDays }),
    },
    true,
  );
}

export async function fetchAdminInviteCodes(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  sort?: string;
  search?: string;
} = {}) {
  const query = new URLSearchParams();
  appendOptionalParam(query, 'page', params.page);
  appendOptionalParam(query, 'pageSize', params.pageSize);
  appendOptionalParam(query, 'status', params.status);
  appendOptionalParam(query, 'sort', params.sort);
  appendOptionalParam(query, 'search', params.search);
  const suffix = query.toString() ? `?${query.toString()}` : '';

  return request<{
    inviteCodes: InviteCodeInfo[];
    inviteCodesPage: PaginationInfo;
    adminCredits: CreditSummary;
  }>(`/api/admin/invite-codes${suffix}`, {}, true);
}

export async function fetchAdminUsers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
} = {}) {
  const query = new URLSearchParams();
  appendOptionalParam(query, 'page', params.page);
  appendOptionalParam(query, 'pageSize', params.pageSize);
  appendOptionalParam(query, 'search', params.search);
  appendOptionalParam(query, 'sort', params.sort);
  const suffix = query.toString() ? `?${query.toString()}` : '';

  return request<{
    users: AdminUserSummary[];
    usersPage: PaginationInfo;
  }>(`/api/admin/users${suffix}`, {}, true);
}

export async function fetchAdminUserInviteRedemptions(userId: string) {
  return request<{ redemptions: InviteRedemptionRecord[] }>(
    `/api/admin/users/${encodeURIComponent(userId)}/invite-redemptions`,
    {},
    true,
  );
}

export async function rechargeAdminUserCredits(userId: string, credits: number) {
  return request<{
    credits: CreditSummary;
    adminCredits: CreditSummary;
    rechargedCredits: number;
  }>(
    `/api/admin/users/${encodeURIComponent(userId)}/recharge`,
    {
      method: 'POST',
      body: JSON.stringify({ credits }),
    },
    true,
  );
}

export async function deductAdminUserCredits(userId: string, credits: number) {
  return request<{
    credits: CreditSummary;
    adminCredits: CreditSummary;
    deductedCredits: number;
  }>(
    `/api/admin/users/${encodeURIComponent(userId)}/deduct`,
    {
      method: 'POST',
      body: JSON.stringify({ credits }),
    },
    true,
  );
}

export async function deleteAdminUser(userId: string) {
  return request<{
    ok: true;
    returnedCredits: number;
    deletedInviteCodes: string[];
    adminCredits: CreditSummary;
  }>(
    `/api/admin/users/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
    true,
  );
}

export async function fetchAdminRecords(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  model?: string;
  resolution?: string;
  range?: string;
} = {}) {
  const query = new URLSearchParams();
  appendOptionalParam(query, 'page', params.page);
  appendOptionalParam(query, 'pageSize', params.pageSize);
  appendOptionalParam(query, 'search', params.search);
  appendOptionalParam(query, 'model', params.model);
  appendOptionalParam(query, 'resolution', params.resolution);
  appendOptionalParam(query, 'range', params.range);
  const suffix = query.toString() ? `?${query.toString()}` : '';

  const result = await request<{
    records: GenerationRecord[];
    recordsPage: PaginationInfo;
    stats: AdminRecordsStats;
    modelOptions: string[];
    resolutionOptions: string[];
  }>(`/api/admin/records${suffix}`, {}, true);

  return {
    ...result,
    records: result.records.map(normalizeGenerationRecord),
  };
}

export async function fetchPublicApiKeys() {
  return request<{ keys: PublicApiKeyInfo[] }>('/api/admin/api-keys', {}, true);
}

export async function fetchUserApiKeys() {
  return request<{ keys: UserApiKeyInfo[] }>('/api/user/api-keys', {}, true);
}

export async function createUserApiKey(name: string) {
  return request<{ apiKey: string; key: UserApiKeyInfo }>(
    '/api/user/api-keys',
    { method: 'POST', body: JSON.stringify({ name }) },
    true,
  );
}

export async function updateUserApiKey(id: string, action: 'pause' | 'resume' | 'revoke') {
  return request<{ key: UserApiKeyInfo }>(
    `/api/user/api-keys/${encodeURIComponent(id)}/${action}`,
    { method: 'POST' },
    true,
  );
}

export async function rotateUserApiKey(id: string) {
  return request<{ apiKey: string; key: UserApiKeyInfo }>(
    `/api/user/api-keys/${encodeURIComponent(id)}/rotate`,
    { method: 'POST' },
    true,
  );
}

export async function fetchPublicApiKeyBalance(apiKey: string) {
  return request<{ balance: CreditSummary }>(
    '/api/public/api-key-balance',
    {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    },
  );
}

export async function createPublicApiKey(payload: { name: string; credits: number }) {
  return request<{ apiKey: string; key: PublicApiKeyInfo }>(
    '/api/admin/api-keys',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true,
  );
}

export async function revokePublicApiKey(id: string) {
  return request<{ key: PublicApiKeyInfo }>(
    `/api/admin/api-keys/${encodeURIComponent(id)}/revoke`,
    {
      method: 'POST',
    },
    true,
  );
}

export async function deductPublicApiKeyCredits(id: string, credits: number) {
  return request<{ key: PublicApiKeyInfo; deductedCredits: number }>(
    `/api/admin/api-keys/${encodeURIComponent(id)}/deduct`,
    {
      method: 'POST',
      body: JSON.stringify({ credits }),
    },
    true,
  );
}

export async function rechargePublicApiKeyCredits(id: string, credits: number) {
  return request<{ key: PublicApiKeyInfo; rechargedCredits: number }>(
    `/api/admin/api-keys/${encodeURIComponent(id)}/recharge`,
    {
      method: 'POST',
      body: JSON.stringify({ credits }),
    },
    true,
  );
}

export async function deletePublicApiKey(id: string) {
  return request<{ ok: boolean }>(
    `/api/admin/api-keys/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
    true,
  );
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

export async function createInviteCodesBatch(payload: { credits: number; count: number }) {
  return request<{ inviteCodes: InviteCodeInfo[]; adminCredits: CreditSummary }>(
    '/api/admin/invite-codes/batch',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true,
  );
}

export async function deleteInviteCode(code: string) {
  return request<{ ok: boolean; adminCredits: CreditSummary }>(
    `/api/admin/invite-codes/${encodeURIComponent(code)}`,
    {
      method: 'DELETE',
    },
    true,
  );
}

export async function deleteInviteCodesBatch(codes: string[]) {
  return request<{ ok: boolean; deletedCodes: string[]; adminCredits: CreditSummary }>(
    '/api/admin/invite-codes/batch',
    {
      method: 'DELETE',
      body: JSON.stringify({ codes }),
    },
    true,
  );
}

export async function reclaimInviteCodeCredits(code: string, credits: number) {
  return request<{ ok: boolean; adminCredits: CreditSummary }>(
    `/api/admin/invite-codes/${encodeURIComponent(code)}/reclaim`,
    {
      method: 'POST',
      body: JSON.stringify({ credits }),
    },
    true,
  );
}

export async function rechargeInviteCodeCredits(code: string, credits: number) {
  return request<{ ok: boolean; adminCredits: CreditSummary }>(
    `/api/admin/invite-codes/${encodeURIComponent(code)}/recharge`,
    {
      method: 'POST',
      body: JSON.stringify({ credits }),
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
