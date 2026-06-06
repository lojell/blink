import type { LlamaCppModelConfig } from "../config/models.js";

/**
 * A curated, FIM-capable base coder model the picker can download. All fields
 * needed to build a full ModelConfig once the file lands on disk.
 */
export interface RecommendedModel {
  /** Doubles as the ModelConfig name and the picker row label. */
  name: string;
  uri: string;
  /** Short facts for the picker row, e.g. ["fastest", "~0.7 GB"]. */
  tags: string[];
  modelId: string;
  maxTokens: number;
  requestTimeoutMs: number;
  fim: string;
}

// Base (non-Instruct) Qwen2.5-Coder quants: instruct models lack FIM tokens
// and realLlamaEngine rejects them at load. URIs verified 2026-06-10; the
// 1.5B/7B base quants only exist under QuantFactory, not bartowski.
export const RECOMMENDED_MODELS: RecommendedModel[] = [
  {
    name: "Qwen2.5 Coder 0.5b (Q8)",
    uri: "https://huggingface.co/bartowski/Qwen2.5-Coder-0.5B-GGUF/resolve/main/Qwen2.5-Coder-0.5B-Q8_0.gguf",
    tags: ["fastest", "low RAM", "~0.7 GB"],
    modelId: "qwen2.5-coder",
    maxTokens: 256,
    requestTimeoutMs: 3000,
    fim: "<|fim_prefix|>",
  },
  {
    name: "Qwen2.5 Coder 1.5b (Q6)",
    uri: "https://huggingface.co/QuantFactory/Qwen2.5-Coder-1.5B-GGUF/resolve/main/Qwen2.5-Coder-1.5B.Q6_K.gguf",
    tags: ["fast", "~1.3 GB"],
    modelId: "qwen2.5-coder",
    maxTokens: 256,
    requestTimeoutMs: 3000,
    fim: "<|fim_prefix|>",
  },
  {
    name: "Qwen2.5 Coder 3b (Q6)",
    uri: "https://huggingface.co/bartowski/Qwen2.5-Coder-3B-GGUF/resolve/main/Qwen2.5-Coder-3B-Q6_K.gguf",
    tags: ["balanced", "~2.5 GB"],
    modelId: "qwen2.5-coder",
    maxTokens: 256,
    requestTimeoutMs: 3000,
    fim: "<|fim_prefix|>",
  },
  {
    name: "Qwen2.5 Coder 7b (Q4)",
    uri: "https://huggingface.co/QuantFactory/Qwen2.5-Coder-7B-GGUF/resolve/main/Qwen2.5-Coder-7B.Q4_K_M.gguf",
    tags: ["best quality", "~4.7 GB"],
    modelId: "qwen2.5-coder",
    maxTokens: 256,
    requestTimeoutMs: 3000,
    fim: "<|fim_prefix|>",
  },
];

/** Full ModelConfig for a recommended entry once its file is on disk. Pure. */
export function recommendedToModelConfig(rec: RecommendedModel, localModelPath: string): LlamaCppModelConfig {
  return {
    name: rec.name,
    backend: "llamacpp",
    modelId: rec.modelId,
    localModelPath,
    maxTokens: rec.maxTokens,
    requestTimeoutMs: rec.requestTimeoutMs,
    fim: rec.fim,
  };
}
