import * as assert from "assert";
import {
  resolveActiveModel,
  isModelConfigured,
  modelTarget,
  type LlamaCppModelConfig,
  type OpenAiModelConfig,
  type OllamaModelConfig,
} from "../config/models.js";

const llama: LlamaCppModelConfig = {
  name: "local-qwen", backend: "llamacpp", modelId: "qwen2.5-coder",
  localModelPath: "C:\\models\\qwen.gguf", maxTokens: 256, fim: "<|fim_prefix|>", requestTimeoutMs: 3000,
};
const openai: OpenAiModelConfig = {
  name: "gpt", backend: "openai", modelId: "gpt-4", apiBaseUrl: "https://api.host/v1",
  apiKey: "k", maxTokens: 256, fim: "<|fim_prefix|>", requestTimeoutMs: 3000,
};
const ollama: OllamaModelConfig = {
  name: "oll", backend: "ollama", modelId: "qwen2.5-coder", baseUrl: "http://localhost:11434",
  maxTokens: 256, fim: "<|fim_prefix|>", requestTimeoutMs: 3000,
};

suite("config/models", () => {
  test("resolveActiveModel finds by name", () => {
    assert.strictEqual(resolveActiveModel([llama, openai], "gpt"), openai);
  });
  test("resolveActiveModel returns undefined for a missing name", () => {
    assert.strictEqual(resolveActiveModel([llama], "nope"), undefined);
  });
  test("isModelConfigured: llamacpp needs a path", () => {
    assert.strictEqual(isModelConfigured(llama), true);
    assert.strictEqual(isModelConfigured({ ...llama, localModelPath: "  " }), false);
  });
  test("isModelConfigured: openai needs baseUrl and key", () => {
    assert.strictEqual(isModelConfigured(openai), true);
    assert.strictEqual(isModelConfigured({ ...openai, apiKey: "" }), false);
  });
  test("isModelConfigured: ollama needs a baseUrl", () => {
    assert.strictEqual(isModelConfigured(ollama), true);
    assert.strictEqual(isModelConfigured({ ...ollama, baseUrl: "" }), false);
  });
  test("modelTarget describes the connection", () => {
    assert.strictEqual(modelTarget(llama), "qwen.gguf");
    assert.strictEqual(modelTarget(openai), "api.host");
    assert.strictEqual(modelTarget(ollama), "http://localhost:11434");
  });
});
