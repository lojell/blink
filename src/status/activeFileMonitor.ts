import * as vscode from "vscode";
import * as path from "node:path";
import { IConfigProvider } from "../config/config.js";
import { matchDisabledFile, patternForFile } from "../config/fileBlacklist.js";
import { StatusStore } from "./statusStore.js";
import { token, Inject } from "../di/container.js";
import { ExtensionContext } from "../di/vscodeTokens.js";

export interface IActiveFileMonitor {
  register(): void;
}

// Merges with the interface above: one name serves as both type and token.
export const IActiveFileMonitor = token<IActiveFileMonitor>("activeFileMonitor");

/**
 * Thin vscode adapter: keeps StatusStore.setActiveFile in sync with the active
 * editor and blink.disabledFiles, so the status bar and tooltip can reflect
 * "disabled for this file type". F5-verified (no unit test).
 */
export class ActiveFileMonitor implements IActiveFileMonitor {
  constructor(
    @ExtensionContext private readonly context: vscode.ExtensionContext,
    @IConfigProvider private readonly config: IConfigProvider,
    @Inject(StatusStore) private readonly status: StatusStore,
  ) { }

  register(): void {
    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
    );
    this.config.onChange(() => this.refresh());
    this.refresh();
  }

  private refresh(): void {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc || (doc.uri.scheme !== "file" && doc.uri.scheme !== "untitled")) {
      this.status.setActiveFile({ filePattern: null, matchedPattern: null });
      return;
    }
    const basename = path.basename(doc.fileName);
    this.status.setActiveFile({
      filePattern: patternForFile(basename),
      matchedPattern: matchDisabledFile(basename, this.config.readConfig().disabledFiles) ?? null,
    });
  }
}
