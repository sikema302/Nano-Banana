type EphemeralImageResult = {
  source: string;
  expiresAt: number;
};

export class EphemeralImageResultCache {
  private readonly entries = new Map<string, EphemeralImageResult>();

  constructor(
    private readonly ttlMs = 10 * 60 * 1_000,
    private readonly maxEntries = 8,
    private readonly now: () => number = Date.now,
  ) {}

  set(taskId: string, source: string) {
    this.prune();
    this.entries.delete(taskId);
    this.entries.set(taskId, { source, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldestTaskId = this.entries.keys().next().value;
      if (typeof oldestTaskId !== 'string') break;
      this.entries.delete(oldestTaskId);
    }
  }

  get(taskId: string) {
    this.prune();
    return this.entries.get(taskId)?.source || '';
  }

  private prune() {
    const currentTime = this.now();
    for (const [taskId, entry] of this.entries) {
      if (entry.expiresAt <= currentTime) this.entries.delete(taskId);
    }
  }
}

export function durablePublicImageResultSource(source: string) {
  const normalized = source.trim();
  return /^https?:\/\//i.test(normalized) ? normalized : '';
}
