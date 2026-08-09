import fs from 'node:fs';
import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';

export type ResourcePressureReason = 'cpu' | 'memory' | 'event-loop';

export type ResourceSnapshot = {
  cpuPercent: number;
  memoryUsedPercent: number;
  availableMemoryMb: number;
  eventLoopLagMs: number;
  sampledAt: string;
};

export type ResourcePressureThresholds = {
  cpuPausePercent: number;
  cpuResumePercent: number;
  memoryPausePercent: number;
  memoryResumePercent: number;
  minAvailableMemoryMb: number;
  resumeAvailableMemoryMb: number;
  eventLoopPauseMs: number;
  eventLoopResumeMs: number;
  pauseSamples: number;
  resumeSamples: number;
};

export type ResourcePressureStatus = {
  paused: boolean;
  reasons: ResourcePressureReason[];
  consecutivePressureSamples: number;
  consecutiveRecoverySamples: number;
  snapshot: ResourceSnapshot;
};

export const DEFAULT_RESOURCE_PRESSURE_THRESHOLDS: ResourcePressureThresholds = {
  cpuPausePercent: 85,
  cpuResumePercent: 65,
  memoryPausePercent: 85,
  memoryResumePercent: 75,
  minAvailableMemoryMb: 300,
  resumeAvailableMemoryMb: 500,
  eventLoopPauseMs: 200,
  eventLoopResumeMs: 100,
  pauseSamples: 5,
  resumeSamples: 10,
};

const EMPTY_SNAPSHOT: ResourceSnapshot = {
  cpuPercent: 0,
  memoryUsedPercent: 0,
  availableMemoryMb: 0,
  eventLoopLagMs: 0,
  sampledAt: '',
};

export class ResourcePressureGate {
  private statusValue: ResourcePressureStatus = {
    paused: false,
    reasons: [],
    consecutivePressureSamples: 0,
    consecutiveRecoverySamples: 0,
    snapshot: EMPTY_SNAPSHOT,
  };

  constructor(private readonly thresholds: ResourcePressureThresholds = DEFAULT_RESOURCE_PRESSURE_THRESHOLDS) {}

  status() {
    return this.statusValue;
  }

  observe(snapshot: ResourceSnapshot) {
    const reasons: ResourcePressureReason[] = [];
    if (snapshot.cpuPercent >= this.thresholds.cpuPausePercent) reasons.push('cpu');
    if (
      snapshot.memoryUsedPercent >= this.thresholds.memoryPausePercent ||
      snapshot.availableMemoryMb <= this.thresholds.minAvailableMemoryMb
    ) reasons.push('memory');
    if (snapshot.eventLoopLagMs >= this.thresholds.eventLoopPauseMs) reasons.push('event-loop');

    if (!this.statusValue.paused) {
      const pressureSamples = reasons.length > 0
        ? this.statusValue.consecutivePressureSamples + 1
        : 0;
      this.statusValue = {
        paused: pressureSamples >= this.thresholds.pauseSamples,
        reasons,
        consecutivePressureSamples: pressureSamples,
        consecutiveRecoverySamples: 0,
        snapshot,
      };
      return this.statusValue;
    }

    const recovered =
      snapshot.cpuPercent <= this.thresholds.cpuResumePercent &&
      snapshot.memoryUsedPercent <= this.thresholds.memoryResumePercent &&
      snapshot.availableMemoryMb >= this.thresholds.resumeAvailableMemoryMb &&
      snapshot.eventLoopLagMs <= this.thresholds.eventLoopResumeMs;
    const recoverySamples = recovered
      ? this.statusValue.consecutiveRecoverySamples + 1
      : 0;
    this.statusValue = {
      paused: recoverySamples < this.thresholds.resumeSamples,
      reasons: recoverySamples >= this.thresholds.resumeSamples ? [] : reasons.length > 0 ? reasons : this.statusValue.reasons,
      consecutivePressureSamples: reasons.length > 0 ? this.statusValue.consecutivePressureSamples + 1 : 0,
      consecutiveRecoverySamples: recoverySamples,
      snapshot,
    };
    return this.statusValue;
  }
}

export type WorkAdmissionGate = {
  isPaused(): boolean;
  subscribe(listener: () => void): () => void;
};

type CpuTotals = { idle: number; total: number };

function cpuTotals(): CpuTotals {
  return os.cpus().reduce<CpuTotals>((totals, cpu) => {
    const times = cpu.times;
    totals.idle += times.idle;
    totals.total += times.user + times.nice + times.sys + times.idle + times.irq;
    return totals;
  }, { idle: 0, total: 0 });
}

function availableMemoryBytes() {
  try {
    const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const availableKb = Number(memInfo.match(/^MemAvailable:\s+(\d+)\s+kB$/m)?.[1]);
    if (Number.isFinite(availableKb) && availableKb > 0) return availableKb * 1024;
  } catch {
    // Non-Linux environments fall back to os.freemem().
  }
  return os.freemem();
}

export class SystemResourceMonitor implements WorkAdmissionGate {
  private readonly pressureGate: ResourcePressureGate;
  private readonly listeners = new Set<() => void>();
  private readonly eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  private previousCpuTotals = cpuTotals();
  private interval: NodeJS.Timeout | null = null;

  constructor(
    thresholds: ResourcePressureThresholds = DEFAULT_RESOURCE_PRESSURE_THRESHOLDS,
    private readonly sampleIntervalMs = 2_000,
    private readonly label = 'generation-load',
  ) {
    this.pressureGate = new ResourcePressureGate(thresholds);
  }

  start() {
    if (this.interval) return this;
    this.eventLoopDelay.enable();
    this.sample();
    this.interval = setInterval(() => this.sample(), this.sampleIntervalMs);
    this.interval.unref();
    return this;
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.eventLoopDelay.disable();
  }

  isPaused() {
    return this.pressureGate.status().paused;
  }

  status() {
    return this.pressureGate.status();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  waitUntilAccepting() {
    if (!this.isPaused()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const unsubscribe = this.subscribe(() => {
        if (this.isPaused()) return;
        unsubscribe();
        resolve();
      });
    });
  }

  sample() {
    const nextCpuTotals = cpuTotals();
    const totalDelta = Math.max(0, nextCpuTotals.total - this.previousCpuTotals.total);
    const idleDelta = Math.max(0, nextCpuTotals.idle - this.previousCpuTotals.idle);
    this.previousCpuTotals = nextCpuTotals;
    const cpuPercent = totalDelta > 0 ? ((totalDelta - idleDelta) / totalDelta) * 100 : 0;
    const totalMemory = Math.max(1, os.totalmem());
    const availableMemory = Math.max(0, availableMemoryBytes());
    const memoryUsedPercent = (1 - Math.min(totalMemory, availableMemory) / totalMemory) * 100;
    const lagNs = this.eventLoopDelay.percentile(99);
    this.eventLoopDelay.reset();

    const previous = this.pressureGate.status();
    const next = this.pressureGate.observe({
      cpuPercent: Number(cpuPercent.toFixed(1)),
      memoryUsedPercent: Number(memoryUsedPercent.toFixed(1)),
      availableMemoryMb: Math.round(availableMemory / 1024 / 1024),
      eventLoopLagMs: Number((Number.isFinite(lagNs) ? lagNs / 1_000_000 : 0).toFixed(1)),
      sampledAt: new Date().toISOString(),
    });

    if (previous.paused !== next.paused) {
      const summary = `cpu=${next.snapshot.cpuPercent}% memory=${next.snapshot.memoryUsedPercent}% available=${next.snapshot.availableMemoryMb}MB lag=${next.snapshot.eventLoopLagMs}ms`;
      if (next.paused) console.warn(`[${this.label}] paused new work (${next.reasons.join(', ') || 'pressure'}): ${summary}`);
      else console.info(`[${this.label}] resumed new work: ${summary}`);
      for (const listener of this.listeners) listener();
    }
    return next;
  }
}

export class QueueCapacityError extends Error {
  constructor(readonly capacity: number) {
    super(`Generation queue is full (capacity ${capacity})`);
    this.name = 'QueueCapacityError';
  }
}

type QueuedWork<T> = {
  id: string;
  kind: string;
  run: () => Promise<T> | T;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (error: unknown) => void;
};

export class ResourceAwareWorkQueue {
  private readonly pending: QueuedWork<unknown>[] = [];
  private readonly activeByKind = new Map<string, number>();
  private active = 0;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly gate: WorkAdmissionGate,
    private readonly maxConcurrency: number,
    private readonly maxPending: number,
    private readonly maxConcurrencyByKind: Record<string, number> = {},
  ) {
    this.unsubscribe = gate.subscribe(() => this.pump());
  }

  dispose() {
    this.unsubscribe();
  }

  canAccept() {
    return this.pending.length < this.maxPending;
  }

  position(id: string) {
    const index = this.pending.findIndex((item) => item.id === id);
    return index >= 0 ? index + 1 : 0;
  }

  stats() {
    return {
      active: this.active,
      pending: this.pending.length,
      maxConcurrency: this.maxConcurrency,
      maxPending: this.maxPending,
      paused: this.gate.isPaused(),
      activeByKind: Object.fromEntries(this.activeByKind),
    };
  }

  enqueue<T>(id: string, kind: string, run: () => Promise<T> | T) {
    if (!this.canAccept()) return Promise.reject(new QueueCapacityError(this.maxPending));
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.push({ id, kind, run, resolve, reject } as QueuedWork<unknown>);
    });
    this.pump();
    return promise;
  }

  private pump() {
    if (this.gate.isPaused()) return;
    while (this.active < this.maxConcurrency) {
      const index = this.pending.findIndex((item) => {
        const kindLimit = this.maxConcurrencyByKind[item.kind] ?? this.maxConcurrency;
        return (this.activeByKind.get(item.kind) || 0) < kindLimit;
      });
      if (index < 0) return;

      const [work] = this.pending.splice(index, 1);
      this.active += 1;
      this.activeByKind.set(work.kind, (this.activeByKind.get(work.kind) || 0) + 1);
      void Promise.resolve()
        .then(work.run)
        .then(work.resolve, work.reject)
        .finally(() => {
          this.active = Math.max(0, this.active - 1);
          this.activeByKind.set(work.kind, Math.max(0, (this.activeByKind.get(work.kind) || 1) - 1));
          this.pump();
        });
    }
  }
}
