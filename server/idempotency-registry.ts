export class IdempotencyRegistry {
  private readonly entries = new Map<string, { createdAt: number; jobId: string }>();

  constructor(private readonly ttlMs: number) {}

  reserve(key: string, jobId: string): { jobId: string; reused: boolean } {
    this.prune();
    const existing = this.entries.get(key);
    if (existing) return { jobId: existing.jobId, reused: true };
    this.entries.set(key, { createdAt: Date.now(), jobId });
    return { jobId, reused: false };
  }

  release(key: string, jobId: string) {
    if (this.entries.get(key)?.jobId === jobId) this.entries.delete(key);
  }

  private prune() {
    const cutoff = Date.now() - this.ttlMs;
    for (const [key, entry] of this.entries) {
      if (entry.createdAt < cutoff) this.entries.delete(key);
    }
  }
}
