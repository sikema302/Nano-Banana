import crypto from 'node:crypto';

import {
  DEFAULT_GPT_IMAGE_PRICING,
  normalizeGptImagePricing,
  type GptImagePricing,
} from '../src/lib/model-pricing.js';

export const VISIONARY_DOC_SYNC_SETTING_KEY = 'visionary_doc_sync_v1';
const DEFAULT_INTERVAL_HOURS = 72;
const RETRY_INTERVAL_MS = 60 * 60 * 1_000;

type SettingStore = {
  get: (key: string, fallback: string) => Promise<string>;
  set: (key: string, value: string) => Promise<void>;
};

type VisionaryCreditConfig = {
  publicModel?: unknown;
  billingMode?: unknown;
  imageSize?: unknown;
  quality?: unknown;
  credits?: unknown;
  isEnabled?: unknown;
  priority?: unknown;
};

export type VisionaryDocSyncStatus = {
  lastAttemptAt: string;
  lastCheckedAt: string;
  nextCheckAt: string;
  documentHash: string;
  pricingHash: string;
  documentChangedAt: string;
  pricingChangedAt: string;
  reviewRequired: boolean;
  lastError: string;
  pricing: GptImagePricing;
};

let activePricing = { ...DEFAULT_GPT_IMAGE_PRICING };
let syncStatus: VisionaryDocSyncStatus = {
  lastAttemptAt: '',
  lastCheckedAt: '',
  nextCheckAt: '',
  documentHash: '',
  pricingHash: '',
  documentChangedAt: '',
  pricingChangedAt: '',
  reviewRequired: false,
  lastError: '',
  pricing: { ...DEFAULT_GPT_IMAGE_PRICING },
};
let syncRun: Promise<VisionaryDocSyncStatus> | null = null;

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function positiveHours(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeStatus(value: unknown): VisionaryDocSyncStatus {
  const source = value && typeof value === 'object' ? (value as Partial<VisionaryDocSyncStatus>) : {};
  return {
    lastAttemptAt: String(source.lastAttemptAt || ''),
    lastCheckedAt: String(source.lastCheckedAt || ''),
    nextCheckAt: String(source.nextCheckAt || ''),
    documentHash: String(source.documentHash || ''),
    pricingHash: String(source.pricingHash || ''),
    documentChangedAt: String(source.documentChangedAt || ''),
    pricingChangedAt: String(source.pricingChangedAt || ''),
    reviewRequired: Boolean(source.reviewRequired),
    lastError: String(source.lastError || ''),
    pricing: normalizeGptImagePricing(source.pricing),
  };
}

function configKey(size: string, quality: string) {
  return `${size}:${quality}`;
}

export function parseVisionaryGptImagePricing(
  payload: unknown,
  current: GptImagePricing = DEFAULT_GPT_IMAGE_PRICING,
) {
  const record = payload && typeof payload === 'object' ? (payload as { data?: unknown }) : {};
  if (!Array.isArray(record.data)) throw new Error('Visionary pricing response is missing data');

  const selected = new Map<string, { credits: number; priority: number }>();
  for (const item of record.data as VisionaryCreditConfig[]) {
    if (String(item.publicModel || '').toLowerCase() !== 'gpt-image-2') continue;
    if (String(item.billingMode || '').toLowerCase() !== 'standard') continue;
    if (item.isEnabled === false) continue;

    const size = String(item.imageSize || '').toUpperCase();
    const quality = String(item.quality || '').toLowerCase();
    if (!['STANDARD', '2K', '4K'].includes(size)) continue;
    if (!['auto', 'low', 'medium', 'high'].includes(quality)) continue;

    const credits = Number(item.credits);
    if (!Number.isSafeInteger(credits) || credits <= 0 || credits > 10_000) {
      throw new Error(`Visionary returned invalid credits for ${size}/${quality}`);
    }

    const key = configKey(size, quality);
    const priority = Number(item.priority || 0);
    const existing = selected.get(key);
    if (!existing || priority > existing.priority) selected.set(key, { credits, priority });
  }

  const readSize = (size: '2K' | '4K') => {
    const regular = ['auto', 'low', 'medium'].map((quality) => selected.get(configKey(size, quality))?.credits);
    const high = selected.get(configKey(size, 'high'))?.credits;
    if (regular.some((credits) => credits === undefined) || high === undefined) {
      throw new Error(`Visionary pricing matrix is incomplete for ${size}`);
    }
    if (new Set(regular).size !== 1) {
      throw new Error(`Visionary ${size} auto/low/medium prices diverged and require review`);
    }
    return { regular: regular[0]!, high };
  };

  const twoK = readSize('2K');
  const fourK = readSize('4K');
  const standardCredits = ['auto', 'low', 'medium', 'high']
    .map((quality) => selected.get(configKey('STANDARD', quality))?.credits)
    .filter((credits): credits is number => credits !== undefined);
  if (standardCredits.length > 1 && new Set(standardCredits).size !== 1) {
    throw new Error('Visionary STANDARD quality prices diverged and require review');
  }

  return normalizeGptImagePricing({
    standard: standardCredits[0] ?? current.standard,
    twoK: twoK.regular,
    twoKHigh: twoK.high,
    fourK: fourK.regular,
    fourKHigh: fourK.high,
  });
}

async function fetchText(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Visionary request failed (${response.status})`);
  return response.text();
}

function nextCheckAt(checkedAt: string, intervalMs: number) {
  const checkedTime = new Date(checkedAt).getTime();
  return Number.isFinite(checkedTime) ? new Date(checkedTime + intervalMs).toISOString() : '';
}

export function getActiveGptImagePricing() {
  return { ...activePricing };
}

export function getVisionaryDocSyncStatus() {
  return { ...syncStatus, pricing: { ...syncStatus.pricing } };
}

export async function runVisionaryDocSync(
  store: SettingStore,
  options: { baseUrl?: string; intervalHours?: number; force?: boolean } = {},
) {
  if (syncRun) return syncRun;

  syncRun = (async () => {
    const baseUrl = String(options.baseUrl || 'https://visionary.beer').replace(/\/+$/, '');
    const intervalMs = positiveHours(options.intervalHours, DEFAULT_INTERVAL_HOURS) * 60 * 60 * 1_000;
    const now = new Date();
    const lastCheckedTime = new Date(syncStatus.lastCheckedAt).getTime();
    if (!options.force && Number.isFinite(lastCheckedTime) && now.getTime() - lastCheckedTime < intervalMs) {
      return getVisionaryDocSyncStatus();
    }

    syncStatus = { ...syncStatus, lastAttemptAt: now.toISOString(), lastError: '' };
    try {
      const [documentText, pricingText] = await Promise.all([
        fetchText(`${baseUrl}/api-docs`),
        fetchText(`${baseUrl}/api/model-credit-configs`),
      ]);
      const parsedPricing = parseVisionaryGptImagePricing(JSON.parse(pricingText), activePricing);
      const documentHash = hash(documentText);
      const pricingHash = hash(JSON.stringify(parsedPricing));
      const checkedAt = new Date().toISOString();
      const hasBaseline = Boolean(syncStatus.lastCheckedAt);
      const documentChanged = hasBaseline && syncStatus.documentHash !== documentHash;
      const pricingChanged = hasBaseline && syncStatus.pricingHash !== pricingHash;

      activePricing = parsedPricing;
      syncStatus = {
        ...syncStatus,
        lastAttemptAt: checkedAt,
        lastCheckedAt: checkedAt,
        nextCheckAt: nextCheckAt(checkedAt, intervalMs),
        documentHash,
        pricingHash,
        documentChangedAt: documentChanged ? checkedAt : syncStatus.documentChangedAt,
        pricingChangedAt: pricingChanged ? checkedAt : syncStatus.pricingChangedAt,
        reviewRequired: syncStatus.reviewRequired || documentChanged,
        lastError: '',
        pricing: parsedPricing,
      };
      await store.set(VISIONARY_DOC_SYNC_SETTING_KEY, JSON.stringify(syncStatus));
      console.log(
        `[visionary-doc-sync] checked pricingChanged=${pricingChanged} documentChanged=${documentChanged}`,
      );
      return getVisionaryDocSyncStatus();
    } catch (error) {
      syncStatus = {
        ...syncStatus,
        lastError: error instanceof Error ? error.message : 'Visionary document sync failed',
      };
      await store.set(VISIONARY_DOC_SYNC_SETTING_KEY, JSON.stringify(syncStatus)).catch(() => undefined);
      throw error;
    }
  })().finally(() => {
    syncRun = null;
  });

  return syncRun;
}

export async function startVisionaryDocSyncScheduler(
  store: SettingStore,
  options: { baseUrl?: string; intervalHours?: number } = {},
) {
  const raw = await store.get(VISIONARY_DOC_SYNC_SETTING_KEY, '');
  if (raw) {
    try {
      syncStatus = normalizeStatus(JSON.parse(raw));
      activePricing = { ...syncStatus.pricing };
    } catch {
      syncStatus = normalizeStatus(null);
    }
  }

  void runVisionaryDocSync(store, options).catch((error) => {
    console.error('[visionary-doc-sync] check failed:', error);
  });

  const timer = setInterval(() => {
    void runVisionaryDocSync(store, options).catch((error) => {
      console.error('[visionary-doc-sync] check failed:', error);
    });
  }, RETRY_INTERVAL_MS);
  timer.unref();
  return timer;
}
