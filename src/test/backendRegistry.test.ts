import * as assert from "assert";
import { BackendRegistry } from "../clients/backends.js";

function registry(): BackendRegistry {
  return new BackendRegistry({ info: () => {}, error: () => {} });
}

suite("BackendRegistry", () => {
  test("creates a managed client for llamacpp", () => {
    const c = registry().create("llamacpp");
    assert.strictEqual(typeof c.complete, "function");
    assert.strictEqual(typeof c.setConfig, "function");
    assert.strictEqual(typeof c.onLoadError, "function");
    assert.strictEqual(typeof c.dispose, "function");
  });

  test("creates a managed client for openai", () => {
    assert.strictEqual(typeof registry().create("openai").complete, "function");
  });

  test("creates a fresh instance each call", () => {
    const r = registry();
    assert.notStrictEqual(r.create("openai"), r.create("openai"));
  });

  test("throws for the not-yet-implemented ollama backend", () => {
    assert.throws(() => registry().create("ollama"), /ollama/);
  });
});
