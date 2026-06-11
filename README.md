# blink — Local AI Code Completions

Lightning-fast inline AI completions (ghost text) for VS Code — **local-first**
and **bring-your-own-key**. Run a GGUF code model **in-process** via
[llama.cpp](https://github.com/ggml-org/llama.cpp) — no server, no account, no
cloud — or point blink at any OpenAI-compatible `/v1/completions` endpoint.

<!-- TODO(user): record the hero demo and un-comment:
![blink completing code](media/demo.gif) -->

## Features

- **Inline ghost text** as you type, accepted with `Tab` — driven by native
  fill-in-the-middle (FIM), not chat prompting.
- **Local models, in-process** — pick a recommended Qwen2.5-Coder GGUF
  (0.5B–7B) and blink downloads and runs it inside VS Code. Nothing leaves
  your machine.
- **BYOK remote option** — any OpenAI-compatible completions endpoint (vLLM,
  llama-server, TGI, a cloud provider) with your own key.
- **Model registry** — configure several models once, switch instantly with
  **blink: Select Model…** from the palette or the status bar.
- **GPU out of the box** — Vulkan on Windows/Linux x64, Metal on Apple
  Silicon; CPU works everywhere. On NVIDIA machines blink offers a one-click
  **CUDA** download (~580 MB) for peak throughput.
- **Status bar control** — live state plus hover actions: settings, model
  switch, enable/disable.

## Quick start

1. Install blink and open any code file.
2. Run **blink: Select Model…** (Command Palette, or click the blink status
   bar item) and pick a recommended model — blink downloads it with progress.
3. Type. Ghost text appears; press `Tab` to accept.

To use your own endpoint instead, add an entry to `blink.models` (below) and
select it via **blink: Select Model…** or the `blink.model` setting.

## Requirements

- **RAM ≈ model size**: ~0.7 GB for the smallest recommended quant, ~4.7 GB
  for the 7B. A GPU is optional but recommended (Vulkan / Metal).
- **Local models must support FIM** (fill-in-the-middle). blink rejects GGUFs
  without infill tokens at load — base *coder* models work (Qwen2.5-Coder);
  instruct/chat models usually don't.
- Platforms: Windows x64 & arm64, Linux x64 & arm64, macOS Intel & Apple
  Silicon.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `blink.enabled` | `true` | Master switch for inline completions. |
| `blink.model` | `""` | Name of the active entry in `blink.models`. |
| `blink.models` | `[]` | The model registry (examples below). |

One registry entry per model; the two backends:

```jsonc
"blink.models": [
  {
    "name": "local-qwen",                // select with "blink.model": "local-qwen"
    "backend": "llamacpp",
    "modelId": "qwen2.5-coder",
    "localModelPath": "C:/models/Qwen2.5-Coder-3B-Q6_K.gguf",
    "gpu": "auto"                        // auto | vulkan | metal | off
  },
  {
    "name": "my-endpoint",
    "backend": "openai",
    "modelId": "qwen2.5-coder-7b",       // the API "model" param
    "apiBaseUrl": "https://my-host/v1",
    "apiKey": "sk-…",
    "fim": "<|fim_prefix|>"              // the model family's FIM token
  }
]
```

## Privacy

- **Local models:** everything runs and stays on your machine.
- **OpenAI-compatible backend:** the assembled prompt (code around your
  cursor, plus your editor's own completion suggestions for that spot) is
  sent **only to the endpoint you configure**. No other network traffic,
  **no telemetry**.
- Your API key lives in VS Code settings (`blink.models`). In Restricted
  Mode the model registry is read from **user** settings only, so an
  untrusted workspace cannot redirect it. Moving keys to VS Code
  SecretStorage is on the roadmap.

## Known limitations (v0.1)

- **CUDA is a separate download** — the VSIX ships Vulkan (which already
  accelerates NVIDIA); blink offers the ~580 MB CUDA binaries when it detects
  an NVIDIA GPU, or via **blink: Select Model…**.
- **No ollama backend yet** — point the `openai` backend at any
  OpenAI-compatible server instead.
- Completions only — blink is not a chat assistant.
- Prompt caching, latency tuning, and richer context sources (recent edits,
  LSP signatures) are in active development.

## License

[MIT](LICENSE)
