# Change Log

## [0.1.0] — 2026-06-10

Initial release.

- Inline ghost-text completions via native fill-in-the-middle (FIM).
- Local GGUF models in-process via llama.cpp, with GPU acceleration: Vulkan
  (Windows/Linux x64), Metal (Apple Silicon).
- OpenAI-compatible `/v1/completions` backend (bring your own key).
- Model registry (`blink.models`) + **blink: Select Model…** picker with
  curated, downloadable Qwen2.5-Coder models (0.5B–7B).
- Status bar indicator with hover actions: settings, model switch,
  enable/disable.
