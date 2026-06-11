import { UnsupportedModelError, type EngineLoader, type LlamaEngine } from "./localLlamaClient.js";

type Gpu = "auto" | "cuda" | "vulkan" | "metal" | false;

/**
 * Concrete EngineLoader backed by node-llama-cpp. The ONLY file that imports
 * node-llama-cpp, and it does so via dynamic import() so the (heavy, native)
 * module is loaded on first completion — never at activation. A Qwen base coder
 * model is driven with native FIM: the prompt already contains
 * <|fim_prefix|>…<|fim_suffix|>…<|fim_middle|>, so we tokenize WITH special-token
 * parsing enabled and let the model continue after <|fim_middle|>.
 */
export const loadRealLlamaEngine: EngineLoader = async (cfg): Promise<LlamaEngine> => {
  const { getLlama, LlamaCompletion } = await import("node-llama-cpp");

  const llama = await getLlama({ gpu: cfg.gpu as Gpu });
  try {
    const model = await llama.loadModel({ modelPath: cfg.modelPath });
    // Cap the KV cache: auto-sizing otherwise allocates the largest context
    // that fits free VRAM (up to the model's full train context) — far more
    // than a FIM completion prompt ever uses.
    const context = await model.createContext({ contextSize: { max: 8192 } });
    const completion = new LlamaCompletion({ contextSequence: context.getSequence() });
    if (!completion.infillSupported) {
      throw new UnsupportedModelError(
        "blink: model has no FIM/infill tokens. Point blink.localModelPath at a code " +
        "model with FIM support (e.g. qwen2.5-coder).",
      );
    }

    return {
      async complete(prompt, opts): Promise<string> {
        // `true` => parse <|fim_*|> as real special tokens, not literal text.
        const tokens = model.tokenize(prompt, true);
        return completion.generateCompletion(tokens, {
          maxTokens: opts.maxTokens,
          customStopTriggers: opts.stop,
          signal: opts.signal,
          temperature: 0.05, // TODO: make it configurable
          topP: 0.9,
        });
      },
      async dispose(): Promise<void> {
        await context.dispose();
        await model.dispose();
        await llama.dispose();
      },
      getFimPrefix() {
        return model.tokens.infill.prefixString;
      }
    };
  } catch (err) {
    // A partially-completed load (e.g. weights loaded but the context didn't
    // fit in VRAM) must not keep the weights resident for the life of the
    // extension host — llama.dispose() cascades to the model and context.
    try { await llama.dispose(); } catch { /* best-effort */ }
    throw err;
  }
};
