import * as assert from "assert";
import { CompletionClientManager } from "../clients/manager.js";
import type { IBackendRegistry } from "../clients/backends.js";
import type { ManagedClient } from "../clients/types.js";
import type { BlinkBackend } from "../config/models.js";
import { llamaModel, openAiModel } from "./fixtures.js";

interface Rec extends ManagedClient {
  setConfigCalls: number;
  disposed: number;
  backend: BlinkBackend;
  fireLoadError(message: string): void;
}
function recClient(backend: BlinkBackend): Rec {
  let listener: (message: string) => void = () => {};
  const c: Rec = {
    backend,
    setConfigCalls: 0,
    disposed: 0,
    async complete() { return ""; },
    async getFimPrefix() { return null; },
    setConfig() { c.setConfigCalls++; },
    onLoadError(l) { listener = l; },
    fireLoadError(m) { listener(m); },
    async dispose() { c.disposed++; },
  };
  return c;
}
function fakeRegistry(): { registry: IBackendRegistry; created: Rec[] } {
  const created: Rec[] = [];
  const registry: IBackendRegistry = {
    create(backend) { const c = recClient(backend); created.push(c); return c; },
  };
  return { registry, created };
}

suite("CompletionClientManager", () => {
  test("first get creates a client and applies the model", () => {
    const { registry, created } = fakeRegistry();
    const mgr = new CompletionClientManager(registry);
    const c = mgr.get(llamaModel()) as Rec;
    assert.strictEqual(created.length, 1);
    assert.strictEqual(c.setConfigCalls, 1);
  });

  test("same-backend get reuses the instance and re-applies config", () => {
    const { registry, created } = fakeRegistry();
    const mgr = new CompletionClientManager(registry);
    const a = mgr.get(llamaModel({ name: "m1" }));
    const b = mgr.get(llamaModel({ name: "m2" }));
    assert.strictEqual(a, b);
    assert.strictEqual(created.length, 1);
    assert.strictEqual((a as Rec).setConfigCalls, 2);
  });

  test("different-backend get disposes the old and creates a new one", () => {
    const { registry, created } = fakeRegistry();
    const mgr = new CompletionClientManager(registry);
    const a = mgr.get(llamaModel()) as Rec;
    const b = mgr.get(openAiModel()) as Rec;
    assert.notStrictEqual(a, b);
    assert.strictEqual(created.length, 2);
    assert.strictEqual(a.disposed, 1);
    assert.strictEqual(b.backend, "openai");
  });

  test("dispose tears down the current client", async () => {
    const { registry, created } = fakeRegistry();
    const mgr = new CompletionClientManager(registry);
    mgr.get(llamaModel());
    await mgr.dispose();
    assert.strictEqual(created[0].disposed, 1);
  });

  test("onLoadError forwards load failures from the active client", () => {
    const { registry, created } = fakeRegistry();
    const mgr = new CompletionClientManager(registry);
    const seen: string[] = [];
    mgr.onLoadError((m) => seen.push(m));
    mgr.get(llamaModel());
    created[0].fireLoadError("boom");
    assert.deepStrictEqual(seen, ["boom"]);
  });

  test("propagates the registry's not-implemented throw", () => {
    const registry: IBackendRegistry = {
      create() { throw new Error("blink: the ollama backend is not implemented yet"); },
    };
    const mgr = new CompletionClientManager(registry);
    assert.throws(() => mgr.get({ ...llamaModel(), backend: "ollama" } as never), /ollama/);
  });
});
