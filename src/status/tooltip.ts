import type { StatusDisplay } from "./statusStore.js";

/** Max characters shown for the model name before it is ellipsized. */
const MODEL_NAME_MAX = 24;

function truncateModel(model: string): string {
  return model.length > MODEL_NAME_MAX
    ? model.slice(0, MODEL_NAME_MAX - 1) + "…"
    : model;
}

/**
 * Build the Markdown for the status bar item's hover tooltip, styled after the
 * TypeScript status bar tooltip: header (name + version + config link), the
 * current model with a switch link, and the enable/disable action — each on its
 * own row, separated by horizontal rules, with its action link inline. Pure
 * (returns a string) so it is unit-testable; the caller wraps it in a trusted
 * MarkdownString with theme-icon support.
 */
export function renderTooltipMarkdown(display: StatusDisplay, version: string): string {
  const settingsArg = encodeURIComponent(JSON.stringify("blink"));
  const toggle = display.enabled
    ? "[$(blink-disabled) Disable](command:blink.disable)"
    : "[$(blink-logo) Enable](command:blink.enable)";
  const model = truncateModel(display.model || "no model");
  return [
    `**${display.icon} Blink** · v${version}`,
    `---`,
    `[${model} $(chevron-down)](command:blink.switchModel)`,
    `---`,
    `[$(gear) Settings](command:workbench.action.openSettings?${settingsArg}) &emsp;|&emsp; ${toggle}`,
  ].join("\n\n");
}
