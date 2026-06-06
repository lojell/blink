import * as assert from "assert";
import { Metrics } from "../metrics.js";

suite("Metrics", () => {
  test("empty summary is all zeros", () => {
    assert.deepStrictEqual(new Metrics().summary(), {
      requests: 0,
      served: 0,
      accepted: 0,
      acceptRate: 0,
      hitRate: 0,
      p50: 0,
      p95: 0,
    });
  });

  test("acceptRate is accepted / served", () => {
    const m = new Metrics();
    m.recordServed({ latencyMs: 10, cacheHit: false, served: true });
    m.recordServed({ latencyMs: 20, cacheHit: false, served: true });
    m.recordServed({ latencyMs: 0, cacheHit: false, served: false });
    m.recordAccepted();
    const s = m.summary();
    assert.strictEqual(s.served, 2);
    assert.strictEqual(s.accepted, 1);
    assert.strictEqual(s.acceptRate, 0.5);
  });

  test("hitRate counts hits over all requests; hits add no latency sample", () => {
    const m = new Metrics();
    m.recordServed({ latencyMs: 50, cacheHit: false, served: true });
    m.recordServed({ latencyMs: 0, cacheHit: true, served: true });
    const s = m.summary();
    assert.strictEqual(s.requests, 2);
    assert.strictEqual(s.hitRate, 0.5);
    assert.strictEqual(s.p50, 50); // only the miss contributed a sample
    assert.strictEqual(s.p95, 50);
  });

  test("percentiles use nearest-rank over miss latencies", () => {
    const m = new Metrics();
    for (const ms of [10, 20, 30, 40]) {
      m.recordServed({ latencyMs: ms, cacheHit: false, served: true });
    }
    const s = m.summary();
    assert.strictEqual(s.p50, 30); // floor(0.5*4)=2 -> sorted[2]
    assert.strictEqual(s.p95, 40); // floor(0.95*4)=3 -> sorted[3]
  });

  test("latency window is bounded", () => {
    const m = new Metrics(3);
    for (const ms of [1, 2, 3, 4, 5]) {
      m.recordServed({ latencyMs: ms, cacheHit: false, served: true });
    }
    assert.strictEqual(m.summary().p50, 4); // keeps [3,4,5]; floor(0.5*3)=1 -> 4
  });
});
