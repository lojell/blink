import * as vscode from "vscode";
import { StatusStore } from "./statusStore.js";
import { renderTooltipMarkdown } from "./tooltip.js";
import { ILogger } from "../common/logging.js";
import { IStatusBar } from "../blinkExtension.js";
import { Inject } from "../di/container.js";
import { ExtensionContext } from "../di/vscodeTokens.js";

/**
 * Create the blink status bar item, bound to the store. Hovering shows a rich
 * tooltip (status + action command links); clicking opens the model picker.
 * Returns a Disposable that unsubscribes and removes the item.
 */

export class BlinkStatusBar {
  constructor(
    @Inject(StatusStore) private readonly store: StatusStore,
    @ExtensionContext private readonly context: vscode.ExtensionContext,
    @ILogger private readonly logger: ILogger
  ) { }

  create() {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    // Settings stay reachable via the tooltip's "Open Settings" link.
    item.command = { command: "blink.switchModel", title: "Select blink model" };

    const version = String(this.context.extension.packageJSON.version ?? "");

    const render = () => {
      const d = this.store.getDisplay();
      item.text = `${d.icon} ${d.label}`;
      const md = new vscode.MarkdownString(renderTooltipMarkdown(d, version), true); // supportThemeIcons
      md.isTrusted = true; // allow command: links to be clickable
      item.tooltip = md;
    };

    render();
    item.show();
    const unsubscribe = this.store.subscribe(render);

    this.context.subscriptions.push(new vscode.Disposable(() => {
      unsubscribe();
      item.dispose();
    }));
  }
}