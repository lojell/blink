import * as assert from "assert";
import {
  LocalLlamaCompletionClient,
  UnsupportedModelError,
  type LlamaEngine,
  type EngineLoader,
} from "../clients/llamacpp/localLlamaClient.js";
import { llamaModel } from "./fixtures.js";

function fakeEngine(behavior: {
  text?: string;
  throwOnComplete?: boolean;
  gate?: Promise<void>;
  calls?: { complete: number; dispose: number };
  capture?: { maxTokens?: number; stop?: string[] };
}): LlamaEngine {
  return {
    async complete(prompt, o) {
      if (behavior.calls) { behavior.calls.complete++; }
      if (behavior.capture) {
        behavior.capture.maxTokens = o.maxTokens;
        behavior.capture.stop = o.stop;
      }
      if (behavior.gate) { await behavior.gate; }
      if (behavior.throwOnComplete) { throw new Error("gen boom"); }
      return behavior.text ?? "OUT";
    },
    async dispose() {
      if (behavior.calls) { behavior.calls.dispose++; }
    },
    getFimPrefix() { return "<|fim_prefix|>"; },
  };
}

function configured(loader: EngineLoader, model = llamaModel({ maxTokens: 64 })): LocalLlamaCompletionClient {
  const c = new LocalLlamaCompletionClient(loader);
  c.setConfig(model);
  return c;
}

const sig = () => new AbortController().signal;

suite("LocalLlamaCompletionClient", () => {
  test("returns '' before setConfig", async () => {
    const c = new LocalLlamaCompletionClient(async () => fakeEngine({ text: "x" }));
    assert.strictEqual(await c.complete("p", [], sig()), "");
  });

  test("returns the engine's generated text and passes maxTokens + stop", async () => {
    const capture: { maxTokens?: number; stop?: string[] } = {};
    const c = configured(async () => fakeEngine({ text: "hello()", capture }), llamaModel({ maxTokens: 99 }));
    const out = await c.complete("PROMPT", ["<|endoftext|>"], sig());
    assert.strictEqual(out, "hello()");
    assert.strictEqual(capture.maxTokens, 99);
    assert.deepStrictEqual(capture.stop, ["<|endoftext|>"]);
  });

  test("loads the engine lazily and only once across calls", async () => {
    let loads = 0;
    const c = configured(async () => { loads++; return fakeEngine({ text: "x" }); });
    await c.complete("a", [], sig());
    await c.complete("b", [], sig());
    assert.strictEqual(loads, 1);
  });

  test("prewarm loads the engine before complete (complete does not reload)", async () => {
    let loads = 0;
    const c = configured(async () => { loads++; return fakeEngine({ text: "x" }); });
    c.prewarm();
    await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget load settle
    assert.strictEqual(loads, 1);
    await c.complete("a", [], sig());
    assert.strictEqual(loads, 1);
  });

  test("prewarm is idempotent (multiple calls load once)", async () => {
    let loads = 0;
    const c = configured(async () => { loads++; return fakeEngine({ text: "x" }); });
    c.prewarm();
    c.prewarm();
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(loads, 1);
  });

  test("prewarm no-ops before setConfig", async () => {
    let loads = 0;
    const c = new LocalLlamaCompletionClient(async () => { loads++; return fakeEngine({ text: "x" }); });
    c.prewarm();
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(loads, 0);
  });

  test("prewarm surfaces a load failure via logger and listener once", async () => {
    const errors: string[] = [];
    const listened: string[] = [];
    const c = new LocalLlamaCompletionClient(
      async () => { throw new Error("disk gone"); },
      { info: () => {}, error: (m) => { errors.push(m); } },
    );
    c.onLoadError((m) => listened.push(m));
    c.setConfig(llamaModel());
    c.prewarm();
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].startsWith("blink: failed to load the local model"));
    assert.deepStrictEqual(listened, errors);
  });

  test("prewarm no-ops after a prior load failure", async () => {
    let loads = 0;
    const c = configured(async () => { loads++; throw new Error("load boom"); });
    await c.complete("a", [], sig()); // first load fails, sets loadFailed
    c.prewarm();
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(loads, 1);
  });

  test("setConfig with a changed path reloads on next complete", async () => {
    let loads = 0;
    const c = configured(async () => { loads++; return fakeEngine({ text: "x" }); }, llamaModel({ localModelPath: "A.gguf" }));
    await c.complete("a", [], sig());
    c.setConfig(llamaModel({ localModelPath: "B.gguf" }));
    await c.complete("b", [], sig());
    assert.strictEqual(loads, 2);
  });

  test("setConfig with an unchanged path keeps the engine warm", async () => {
    let loads = 0;
    const c = configured(async () => { loads++; return fakeEngine({ text: "x" }); }, llamaModel({ localModelPath: "A.gguf" }));
    await c.complete("a", [], sig());
    c.setConfig(llamaModel({ localModelPath: "A.gguf", maxTokens: 128 }));
    await c.complete("b", [], sig());
    assert.strictEqual(loads, 1);
  });

  test("returns '' and does not retry after a load failure", async () => {
    let loads = 0;
    const c = configured(async () => { loads++; throw new Error("load boom"); });
    assert.strictEqual(await c.complete("a", [], sig()), "");
    assert.strictEqual(await c.complete("b", [], sig()), "");
    assert.strictEqual(loads, 1);
  });

  test("reports a generic load failure via logger.error and the listener (once)", async () => {
    const errors: string[] = [];
    const listened: string[] = [];
    const c = new LocalLlamaCompletionClient(
      async () => { throw new Error("disk gone"); },
      { info: () => {}, error: (m) => { errors.push(m); } },
    );
    c.onLoadError((m) => listened.push(m));
    c.setConfig(llamaModel());
    await c.complete("a", [], sig());
    await c.complete("b", [], sig());
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].startsWith("blink: failed to load the local model"));
    assert.deepStrictEqual(listened, errors);
  });

  test("includes the underlying error message in the load failure report", async () => {
    const errors: string[] = [];
    const listened: string[] = [];
    const c = new LocalLlamaCompletionClient(
      async () => { throw new Error("A context size of 24 is too large for the available VRAM"); },
      { info: () => {}, error: (m) => { errors.push(m); } },
    );
    c.onLoadError((m) => listened.push(m));
    c.setConfig(llamaModel());
    await c.complete("a", [], sig());
    assert.strictEqual(errors.length, 1);
    assert.ok(
      errors[0].includes("A context size of 24 is too large for the available VRAM"),
      `expected underlying detail in: ${errors[0]}`,
    );
    assert.deepStrictEqual(listened, errors);
  });

  test("logs the underlying load error to the output channel", async () => {
    const infos: string[] = [];
    const c = new LocalLlamaCompletionClient(
      async () => { throw new Error("CUDA out of memory"); },
      { info: (m) => { infos.push(m); }, error: () => {} },
    );
    c.setConfig(llamaModel());
    await c.complete("a", [], sig());
    assert.ok(
      infos.some((m) => m.includes("CUDA out of memory")),
      `expected the raw error in the channel log, got: ${JSON.stringify(infos)}`,
    );
  });

  test("surfaces the specific message for an UnsupportedModelError", async () => {
    const errors: string[] = [];
    const c = new LocalLlamaCompletionClient(
      async () => { throw new UnsupportedModelError("blink: no FIM tokens"); },
      { info: () => {}, error: (m) => { errors.push(m); } },
    );
    c.setConfig(llamaModel());
    await c.complete("a", [], sig());
    assert.deepStrictEqual(errors, ["blink: no FIM tokens"]);
  });

  test("returns '' on a generation error", async () => {
    const c = configured(async () => fakeEngine({ throwOnComplete: true }));
    assert.strictEqual(await c.complete("a", [], sig()), "");
  });

  test("returns '' for an already-aborted signal without loading", async () => {
    let loads = 0;
    const c = configured(async () => { loads++; return fakeEngine({ text: "x" }); });
    const ctrl = new AbortController();
    ctrl.abort();
    assert.strictEqual(await c.complete("a", [], ctrl.signal), "");
    assert.strictEqual(loads, 0);
  });

  test("serializes generations (second waits for the first)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const calls = { complete: 0, dispose: 0 };
    const c = configured(async () => fakeEngine({ text: "x", gate, calls }));
    const p1 = c.complete("a", [], sig());
    const p2 = c.complete("b", [], sig());
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(calls.complete, 1);
    release();
    await Promise.all([p1, p2]);
    assert.strictEqual(calls.complete, 2);
  });

  test("dispose tears down the loaded engine", async () => {
    const calls = { complete: 0, dispose: 0 };
    const c = configured(async () => fakeEngine({ text: "x", calls }));
    await c.complete("a", [], sig());
    await c.dispose();
    assert.strictEqual(calls.dispose, 1);
  });
});
