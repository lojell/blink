import * as assert from "assert";
import { renderTooltipMarkdown } from "../status/tooltip.js";
import type { StatusDisplay } from "../status/statusStore.js";

function display(over: Partial<StatusDisplay> = {}): StatusDisplay {
  return {
    state: "idle",
    icon: "$(sparkle)",
    label: "blink",
    detail: "Ready",
    backend: "llamacpp",
    model: "local-qwen",
    target: "qwen2.5-coder-3b-base-q6_k.gguf",
    enabled: true,
    filePattern: null,
    matchedPattern: null,
    ...over,
  };
}

suite("renderTooltipMarkdown", () => {
  test("header line shows Blink, the version, and a Settings link scoped to blink", () => {
    const md = renderTooltipMarkdown(display(), "0.1.0");
    assert.ok(md.includes("**$(sparkle) Blink** · v0.1.0"));
    assert.ok(md.includes("[$(gear) Settings](command:workbench.action.openSettings?%22blink%22)"));
  });

  test("renders three rows separated by horizontal rules — header / model / actions", () => {
    const md = renderTooltipMarkdown(display(), "0.1.0");
    assert.strictEqual(md.split("\n\n---\n\n").length, 3); // two rules => three rows
  });

  test("model line is a switch link", () => {
    const md = renderTooltipMarkdown(display({ model: "local-qwen" }), "0.1.0");
    assert.ok(md.includes("[local-qwen $(chevron-down)](command:blink.switchModel)"));
  });

  test("long model names are ellipsized to keep the tooltip aligned", () => {
    const long = "an-extremely-long-model-name-that-overflows";
    const md = renderTooltipMarkdown(display({ model: long }), "0.1.0");
    assert.ok(!md.includes(long));
    assert.ok(md.includes("…"));
  });

  test("model line falls back to 'no model' when none is selected", () => {
    const md = renderTooltipMarkdown(display({ model: "" }), "0.1.0");
    assert.ok(md.includes("no model"));
  });

  test("toggle line shows a Disable link when enabled", () => {
    const md = renderTooltipMarkdown(display({ enabled: true }), "0.1.0");
    assert.ok(md.includes("[$(blink-disabled) Disable](command:blink.disable)"));
    assert.ok(!md.includes("command:blink.enable"));
  });

  test("toggle line shows an Enable link when disabled", () => {
    const md = renderTooltipMarkdown(display({ enabled: false }), "0.1.0");
    assert.ok(md.includes("[$(blink-logo) Enable](command:blink.enable)"));
    assert.ok(!md.includes("command:blink.disable"));
  });

  test("offers 'Disable for <pattern>' when the active file is not blacklisted", () => {
    const md = renderTooltipMarkdown(display({ filePattern: "*.ts", matchedPattern: null }), "0.1.0");
    const arg = encodeURIComponent(JSON.stringify(["*.ts"]));
    assert.ok(md.includes(`[$(blink-disabled) Disable for *.ts](command:blink.disableForFileType?${arg})`));
    assert.ok(!md.includes("command:blink.enableForFileType"));
  });

  test("offers 'Enable for <pattern>' when the active file is blacklisted", () => {
    const md = renderTooltipMarkdown(display({ filePattern: "*.md", matchedPattern: "*.md" }), "0.1.0");
    const arg = encodeURIComponent(JSON.stringify(["*.md"]));
    assert.ok(md.includes(`[$(blink-logo) Enable for *.md](command:blink.enableForFileType?${arg})`));
    assert.ok(!md.includes("command:blink.disableForFileType"));
  });

  test("the enable link targets the matched entry, not the file's own pattern", () => {
    // notes.md blocked by a broader entry: removing must remove that entry.
    const md = renderTooltipMarkdown(display({ filePattern: "*.md", matchedPattern: "notes.*" }), "0.1.0");
    const arg = encodeURIComponent(JSON.stringify(["notes.*"]));
    assert.ok(md.includes(`[$(blink-logo) Enable for notes.*](command:blink.enableForFileType?${arg})`));
  });

  test("omits the file toggle when there is no active file editor", () => {
    const md = renderTooltipMarkdown(display({ filePattern: null, matchedPattern: null }), "0.1.0");
    assert.ok(!md.includes("Disable for"));
    assert.ok(!md.includes("Enable for"));
  });

  test("file toggle joins the actions row (still three rows total)", () => {
    const md = renderTooltipMarkdown(display({ filePattern: "*.ts", matchedPattern: null }), "0.1.0");
    assert.strictEqual(md.split("\n\n---\n\n").length, 3);
  });
});
