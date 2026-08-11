import type { GptImagePricing } from './model-pricing';
import type { ModelCreditPricing } from './model-credit-config';

export type ImageCategory = 'favorite' | 'backup' | 'discarded';

export interface UserInfo {
  id: string;
  username: string;
  isAdmin?: boolean;
  canRedeemInvite?: boolean;
  creditsRemaining?: number;
  creditBalances?: CreditBalances;
}

export interface CreditBalances {
  gpt: number;
  banana: number;
  general: number;
}

export type NotificationKind = 'normal' | 'update' | 'maintenance' | 'urgent';
export type NotificationStatus = 'draft' | 'published' | 'archived';

export interface SiteNotification {
  id: string;
  title: string;
  content: string;
  kind: NotificationKind;
  status: NotificationStatus;
  popupOnFirstView: boolean;
  publishedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  read?: boolean;
  popupShown?: boolean;
}

export interface NotificationPayload {
  notifications: SiteNotification[];
  unreadCount: number;
  popup: SiteNotification | null;
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
  queuePosition?: number;
  resourcePaused?: boolean;
}

export interface VideoGenerationJobInfo {
  id: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  progress: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  videoUrl?: string;
  modelId?: string;
  modelName?: string;
  error?: string;
  creditsUsed?: number;
  creditsRemaining?: number;
  queuePosition?: number;
  resourcePaused?: boolean;
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
  creditBalances?: CreditBalances;
  apiKeyId?: string;
  quotaSource?: 'key' | 'account';
  ownerUserId?: string;
  ownerUsername?: string;
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
  creditBalances?: CreditBalances;
}

export interface PromoCouponInfo {
  couponId: string;
  discountPercent: number;
  issuedAt: string;
  expiresAt: string;
  nextEligibleAt: string;
  purchaseUrl: string;
  redemptionCode: string;
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

export type ProviderResolution = '1K' | '2K' | '4K';
export type Image2ProviderId = 'junliai-economy' | 'junliai-firefly' | 'visionary';
export type BananaProviderId = 'flux' | 'visionary' | 'junliai' | 'junliai-nano-banana-2';

export interface ProviderChannel<T extends string = string> {
  id: T;
  enabled: boolean;
}

export interface ProviderRoutingConfig {
  image2Routes: Record<ProviderResolution, Array<ProviderChannel<Image2ProviderId>>>;
  bananaRoutes: Record<ProviderResolution, Array<ProviderChannel<BananaProviderId>>>;
  junliaiGeminiVeo31: boolean;
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
  billingMode: 'legacy' | 'account';
  quotaSource: 'key' | 'account';
  ownerUserId: string;
  ownerUsername: string;
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

function fileExtensionForDownload(source: string, mimeType: string) {
  const mimeExtensions: Record<string, string> = {
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  };
  const normalizedMimeType = mimeType.split(';')[0].trim().toLowerCase();
  if (mimeExtensions[normalizedMimeType]) return mimeExtensions[normalizedMimeType];

  try {
    const pathname = new URL(source, window.location.href).pathname;
    const extension = pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
    if (extension) return extension === 'jpeg' ? 'jpg' : extension;
  } catch {
    // Use PNG when the source does not expose a usable file extension.
  }
  return 'png';
}

export async function downloadAsset(source: string, suggestedName = 'pixory-image') {
  if (!source) throw new Error('下载地址无效');

  let response: Response;
  if (source.startsWith('data:')) {
    response = await fetch(source);
  } else {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    response = await fetch(toApiUrl('/api/user/assets/download'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ source }),
    });
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    console.error('[downloadAsset] 请求失败 status:', response.status, 'response:', responseText);
    throw new Error(getApiErrorMessage(parseJsonPayload(responseText), responseText) || '下载失败');
  }

  const blob = await response.blob();
  console.log('[downloadAsset] blob 大小:', blob.size, '类型:', blob.type);
  const extension = fileExtensionForDownload(source, blob.type);
  const baseName = suggestedName.replace(/\.[a-zA-Z0-9]{2,5}$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${baseName || 'pixory-image'}.${extension}`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  console.log('[downloadAsset] 下载触发完成:', link.download);
  // 延迟移除，避免浏览器在下载触发前就清理了元素
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }, 100);
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

function getApiErrorCode(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const code = (payload as Record<string, unknown>).code;
  return typeof code === 'string' ? code : '';
}

async function request<T>(input: string, init: RequestInit = {}, auth = false, timeoutMs = 30_000): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');

  if (auth) {
    const token = getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;
  const abortFromCaller = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', abortFromCaller, { once: true });
  }

  let response: Response;
  let responseText: string;
  try {
    response = await fetch(toApiUrl(input), {
      ...init,
      headers,
      signal: controller.signal,
    });
    responseText = await response.text();
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error('请求超时，请稍后重试');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }

  const payload = parseJsonPayload<T>(responseText);

  if (!response.ok) {
    const errorCode = getApiErrorCode(payload);
    if (auth && response.status === 401 && ['AUTH_TOKEN_INVALID', 'AUTH_SESSION_REPLACED'].includes(errorCode)) {
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

export async function fetchNotifications() {
  return request<NotificationPayload>('/api/notifications', {}, true);
}

export async function markNotificationRead(id: string) {
  return request<{ ok: boolean }>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' }, true);
}

export async function markNotificationPopupShown(id: string) {
  return request<{ ok: boolean }>(`/api/notifications/${encodeURIComponent(id)}/popup-shown`, { method: 'POST', body: '{}' }, true);
}

export async function markAllNotificationsRead() {
  return request<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST', body: '{}' }, true);
}

export async function fetchAdminNotifications() {
  return request<{ notifications: SiteNotification[] }>('/api/admin/notifications', {}, true);
}

export async function createAdminNotification(input: {
  content: string;
}) {
  return request<{ notification: SiteNotification }>('/api/admin/notifications', {
    method: 'POST',
    body: JSON.stringify(input),
  }, true);
}

export async function updateAdminNotification(id: string, input: {
  content: string;
}) {
  return request<{ notification: SiteNotification }>(`/api/admin/notifications/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }, true);
}

export async function publishAdminNotification(id: string) {
  return request<{ notification: SiteNotification }>(`/api/admin/notifications/${encodeURIComponent(id)}/publish`, { method: 'POST', body: '{}' }, true);
}

export async function archiveAdminNotification(id: string) {
  return request<{ notification: SiteNotification }>(`/api/admin/notifications/${encodeURIComponent(id)}/archive`, { method: 'POST', body: '{}' }, true);
}

export async function deleteAdminNotification(id: string) {
  return request<{ ok: boolean }>(`/api/admin/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
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
    120_000,
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

export async function claimPromoCoupon() {
  return request<{ coupon: PromoCouponInfo }>(
    '/api/user/promo-coupon/claim',
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
    modelCreditPricing: ModelCreditPricing;
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
  billAiEnhancement?: boolean;
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
  billAiEnhancement?: boolean;
  reference_images: ReferenceUploadInput[];
}) {
  const result = await request<{ job: GenerationJobInfo }>(
    '/api/generate/jobs',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true,
    10 * 60_000,
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
  modelId: 'gemini-veo31' | 'firefly-video';
  prompt: string;
  ratio: '16:9' | '1:1' | '9:16';
  resolution: '720p' | '1080p';
  seconds: 4 | 5 | 6 | 8;
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

export async function fetchAdminModelCreditPricing() {
  return request<{ modelCreditPricing: ModelCreditPricing }>('/api/admin/model-credit-pricing', {}, true);
}

export async function updateAdminModelCreditPricing(pricing: ModelCreditPricing) {
  return request<{ modelCreditPricing: ModelCreditPricing }>(
    '/api/admin/model-credit-pricing',
    {
      method: 'PUT',
      body: JSON.stringify(pricing),
    },
    true,
  );
}

export async function cleanupAdminImages(retentionDays = 2) {
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

export async function rechargeAdminUserCredits(userId: string, credits: CreditBalances) {
  return request<{
    credits: CreditSummary;
    adminCredits: CreditSummary;
    rechargedCredits: number;
    rechargedByType: CreditBalances;
  }>(
    `/api/admin/users/${encodeURIComponent(userId)}/recharge`,
    {
      method: 'POST',
      body: JSON.stringify({
        gptCredits: credits.gpt,
        bananaCredits: credits.banana,
        generalCredits: credits.general,
      }),
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
