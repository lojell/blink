import * as assert from "assert";
import { RECOMMENDED_MODELS, recommendedToModelConfig } from "../setup/recommendedModels.js";
import { isModelConfigured } from "../config/models.js";

suite("recommendedModels", () => {
  test("has entries with unique names", () => {
    assert.ok(RECOMMENDED_MODELS.length >= 4);
    const names = RECOMMENDED_MODELS.map((r) => r.name);
    assert.strictEqual(new Set(names).size, names.length);
  });

  test("every uri is an https gguf download", () => {
    for (const r of RECOMMENDED_MODELS) {
      const url = new URL(r.uri);
      assert.strictEqual(url.protocol, "https:");
      assert.ok(url.pathname.toLowerCase().endsWith(".gguf"), r.uri);
    }
  });

  test("every entry has tags and full model wiring", () => {
    for (const r of RECOMMENDED_MODELS) {
      assert.ok(r.tags.length > 0, r.name);
      assert.ok(r.modelId.length > 0, r.name);
      assert.ok(r.maxTokens > 0, r.name);
      assert.ok(r.requestTimeoutMs > 0, r.name);
      assert.strictEqual(r.fim, "<|fim_prefix|>");
    }
  });

  test("recommendedToModelConfig builds a configured llamacpp model", () => {
    const m = recommendedToModelConfig(RECOMMENDED_MODELS[0], "C:\\store\\models\\a.gguf");
    assert.strictEqual(m.backend, "llamacpp");
    assert.strictEqual(m.name, RECOMMENDED_MODELS[0].name);
    assert.strictEqual(m.localModelPath, "C:\\store\\models\\a.gguf");
    assert.strictEqual(isModelConfigured(m), true);
  });
});
