export interface ServeSample {
  latencyMs: number;
  cacheHit: boolean;
  served: boolean;
}

export interface MetricsSummary {
  requests: number;
  served: number;
  accepted: number;
  acceptRate: number;
  hitRate: number;
  p50: number;
  p95: number;
}

/**
 * In-memory, per-session completion metrics. Pure (no vscode) so it unit-tests
 * without an editor. Latency samples are kept only for model calls (cache
 * misses) so p50/p95 describe real generation cost, not instant cache hits.
 */
export class Metrics {
  private requests = 0;
  private servedCount = 0;
  private accepted = 0;
  private cacheHits = 0;
  private readonly latencies: number[] = [];

  constructor(private readonly window = 200) {}

  recordServed(sample: ServeSample): void {
    this.requests++;
    if (sample.cacheHit) {
      this.cacheHits++;
    } else {
      this.latencies.push(sample.latencyMs);
      if (this.latencies.length > this.window) {
        this.latencies.shift();
      }
    }
    if (sample.served) {
      this.servedCount++;
    }
  }

  recordAccepted(): void {
    this.accepted++;
  }

  summary(): MetricsSummary {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    return {
      requests: this.requests,
      served: this.servedCount,
      accepted: this.accepted,
      acceptRate: this.servedCount === 0 ? 0 : this.accepted / this.servedCount,
      hitRate: this.requests === 0 ? 0 : this.cacheHits / this.requests,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
    };
  }

  format(): string {
    const s = this.summary();
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    return (
      `blink metrics: ${s.requests} req, ${s.served} served, ` +
      `${pct(s.acceptRate)} accept, ${pct(s.hitRate)} cache hit, ` +
      `p50 ${s.p50}ms, p95 ${s.p95}ms`
    );
  }
}

/** Nearest-rank percentile of an ascending-sorted array; 0 for empty. */
function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) {
    return 0;
  }
  const idx = Math.min(sortedAsc.length - 1, Math.floor(q * sortedAsc.length));
  return sortedAsc[idx];
}
