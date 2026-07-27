export type ProviderMetricAttempt = {
  modelId: string;
  provider: string;
  configuration: string;
  durationMs: number;
  success: boolean;
  timestamp?: string;
};

export type ProviderMetricRow = {
  modelId: string;
  provider: string;
  configuration: string;
  callCount: number;
  successCount: number;
  failureCount: number;
  averageResponseMs: number;
  totalResponseMs: number;
};

type MetricsStore = {
  get: (key: string, fallback: string) => Promise<string>;
  set: (key: string, value: string) => Promise<void>;
};

type ProviderMetricsOptions = {
  store: MetricsStore;
  timeZone?: string;
  settingPrefix?: string;
  logger?: Pick<Console, 'warn'>;
};

type StoredMetricRow = Omit<ProviderMetricRow, 'averageResponseMs'>;

function dateKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function normalizeRows(raw: string): StoredMetricRow[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      modelId: String(item?.modelId || ''),
      provider: String(item?.provider || ''),
      configuration: String(item?.configuration || ''),
      callCount: Math.max(0, Number(item?.callCount || 0)),
      successCount: Math.max(0, Number(item?.successCount || 0)),
      failureCount: Math.max(0, Number(item?.failureCount || 0)),
      totalResponseMs: Math.max(0, Number(item?.totalResponseMs || 0)),
    })).filter((item) => item.modelId && item.provider && item.configuration);
  } catch {
    return [];
  }
}

function publicRows(rows: StoredMetricRow[]): ProviderMetricRow[] {
  return rows
    .map((row) => ({
      ...row,
      averageResponseMs: row.callCount > 0 ? Math.round(row.totalResponseMs / row.callCount) : 0,
    }))
    .sort((left, right) =>
      right.callCount - left.callCount ||
      left.modelId.localeCompare(right.modelId) ||
      left.provider.localeCompare(right.provider) ||
      left.configuration.localeCompare(right.configuration));
}

export function createProviderMetrics(options: ProviderMetricsOptions) {
  const timeZone = options.timeZone || 'Asia/Shanghai';
  const prefix = options.settingPrefix || 'provider_metrics_daily_v1:';
  const logger = options.logger || console;
  const cache = new Map<string, StoredMetricRow[]>();
  let writeQueue = Promise.resolve();

  function keyFor(day: string) {
    return `${prefix}${day}`;
  }

  async function load(day: string) {
    const cached = cache.get(day);
    if (cached) return cached;
    const rows = normalizeRows(await options.store.get(keyFor(day), ''));
    cache.set(day, rows);
    return rows;
  }

  async function record(attempt: ProviderMetricAttempt) {
    const timestamp = attempt.timestamp ? new Date(attempt.timestamp) : new Date();
    const day = dateKey(timestamp, timeZone);
    writeQueue = writeQueue.then(async () => {
      const rows = await load(day);
      const modelId = String(attempt.modelId || 'unknown');
      const provider = String(attempt.provider || 'unknown');
      const configuration = String(attempt.configuration || 'default');
      let row = rows.find((item) =>
        item.modelId === modelId &&
        item.provider === provider &&
        item.configuration === configuration);
      if (!row) {
        row = {
          modelId,
          provider,
          configuration,
          callCount: 0,
          successCount: 0,
          failureCount: 0,
          totalResponseMs: 0,
        };
        rows.push(row);
      }
      row.callCount += 1;
      row.successCount += attempt.success ? 1 : 0;
      row.failureCount += attempt.success ? 0 : 1;
      row.totalResponseMs += Math.max(0, Math.round(attempt.durationMs || 0));
      await options.store.set(keyFor(day), JSON.stringify(rows));
    }).catch((error) => {
      logger.warn('[provider-metrics] failed to persist attempt:', error instanceof Error ? error.message : error);
    });
    await writeQueue;
  }

  async function getToday() {
    await writeQueue;
    return publicRows(await load(dateKey(new Date(), timeZone)));
  }

  return { record, getToday };
}

