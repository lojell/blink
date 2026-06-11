import * as vscode from "vscode";
import { IConfigProvider } from "./config/config.js";
import { Metrics } from "./metrics.js";
import { ILogger } from "./common/logging.js";
import { ISetupController } from "./setup/setupController.js";
import { DID_ACCEPT_COMMAND } from "./provider/inlineProvider.js";
import { token, Inject } from "./di/container.js";
import { ExtensionContext } from "./di/vscodeTokens.js";

export interface ICommands {
  register(): void;
}

// Merges with the interface above: one name serves as both type and token.
export const ICommands = token<ICommands>("commands");

/** Registers all palette/internal commands into the extension subscriptions. */
export class Commands implements ICommands {
  constructor(
    @ExtensionContext private readonly context: vscode.ExtensionContext,
    @IConfigProvider private readonly config: IConfigProvider,
    @ISetupController private readonly setup: ISetupController,
    @Inject(Metrics) private readonly metrics: Metrics,
    @ILogger private readonly log: ILogger,
  ) {}

  register(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand("blink.switchModel", () => this.setup.showPicker()),
      vscode.commands.registerCommand("blink.enable", () => this.config.setEnabled(true)),
      vscode.commands.registerCommand("blink.disable", () => this.config.setEnabled(false)),
      vscode.commands.registerCommand(DID_ACCEPT_COMMAND, () => this.metrics.recordAccepted()),
      vscode.commands.registerCommand("blink.showMetrics", () => this.log.info(this.metrics.format())),
    );
  }
}
