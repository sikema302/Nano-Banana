export type ProviderRiskAttempt = {
  traceId: string;
  modelId: string;
  provider: string;
  configuration: string;
  durationMs: number;
  success: boolean;
  failureReason?: string;
  timestamp?: string;
};

export type ProviderRiskRecord = {
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
};

type RiskStore = {
  get: (key: string, fallback: string) => Promise<string>;
  set: (key: string, value: string) => Promise<void>;
};

function dateKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function normalizeRecords(raw: string): ProviderRiskRecord[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item) => item?.traceId) : [];
  } catch {
    return [];
  }
}

function evaluate(record: ProviderRiskRecord) {
  if (record.junliaiStatus === 'uncertain' && record.visionaryStatus !== 'not_called') {
    record.riskLevel = 'suspected_duplicate';
    record.riskReason = 'Junliai 结果未知后又调用了 Visionary，存在双上游计费风险';
  } else if (record.junliaiStatus === 'success' && record.visionaryStatus !== 'not_called') {
    record.riskLevel = 'suspected_duplicate';
    record.riskReason = 'Junliai 已成功但同一任务又调用了 Visionary';
  } else if (record.junliaiStatus === 'uncertain') {
    record.riskLevel = 'review';
    record.riskReason = 'Junliai 超时或断连，需结合上游消费流水核对';
  } else {
    record.riskLevel = 'normal';
    record.riskReason = record.junliaiStatus === 'explicit_failure' && record.visionaryStatus === 'success'
      ? 'Junliai 明确失败后正常回退'
      : '未发现重复计费风险';
  }
}

export function createProviderRiskMonitor(options: {
  store: RiskStore;
  timeZone?: string;
  settingPrefix?: string;
  retention?: number;
}) {
  const timeZone = options.timeZone || 'Asia/Shanghai';
  const prefix = options.settingPrefix || 'provider_risk_daily_v1:';
  const retention = Math.max(20, options.retention || 300);
  const cache = new Map<string, ProviderRiskRecord[]>();
  let writeQueue = Promise.resolve();

  async function load(day: string) {
    const cached = cache.get(day);
    if (cached) return cached;
    const records = normalizeRecords(await options.store.get(`${prefix}${day}`, '[]'));
    cache.set(day, records);
    return records;
  }

  async function record(attempt: ProviderRiskAttempt) {
    const timestamp = attempt.timestamp ? new Date(attempt.timestamp) : new Date();
    const day = dateKey(timestamp, timeZone);
    writeQueue = writeQueue.then(async () => {
      const records = await load(day);
      const now = timestamp.toISOString();
      let record = records.find((item) => item.traceId === attempt.traceId);
      if (!record) {
        record = {
          traceId: attempt.traceId,
          modelId: attempt.modelId,
          configuration: attempt.configuration,
          createdAt: now,
          updatedAt: now,
          junliaiStatus: 'not_called',
          junliaiDurationMs: 0,
          visionaryStatus: 'not_called',
          visionaryDurationMs: 0,
          riskLevel: 'normal',
          riskReason: '未发现重复计费风险',
        };
        records.unshift(record);
      }
      record.updatedAt = now;
      if (attempt.provider === 'Junliai') {
        record.junliaiStatus = attempt.success
          ? 'success'
          : attempt.failureReason === 'uncertain'
            ? 'uncertain'
            : 'explicit_failure';
        record.junliaiDurationMs = Math.max(0, Math.round(attempt.durationMs));
      } else if (attempt.provider === 'Visionary') {
        record.visionaryStatus = attempt.success ? 'success' : 'failure';
        record.visionaryDurationMs = Math.max(0, Math.round(attempt.durationMs));
      }
      evaluate(record);
      records.splice(retention);
      await options.store.set(`${prefix}${day}`, JSON.stringify(records));
    });
    await writeQueue;
  }

  async function getToday() {
    await writeQueue;
    return load(dateKey(new Date(), timeZone));
  }

  return { record, getToday };
}
