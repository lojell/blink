import * as vscode from "vscode";
import type { LlamaCppModelConfig } from "../config/models.js";
import { ILogger } from "../common/logging.js";
import { token } from "../di/container.js";
import { ExtensionContext } from "../di/vscodeTokens.js";
import { ICudaInstaller, type CudaProgress } from "./cudaInstaller.js";
import { shouldOfferCuda } from "./cudaSupport.js";

const DECLINED_KEY = "blink.cudaOfferDeclined";

export interface ICudaController {
  /** Restore links after an extension update. Cheap, silent, never throws. */
  ensureLinks(): Promise<void>;
  /** One-shot session offer when CUDA would help this machine. */
  offerIfApplicable(model: LlamaCppModelConfig): Promise<void>;
  /** Whether the picker should show the install entry. */
  canInstall(): Promise<boolean>;
  /** Download + install with a cancellable progress notification. */
  install(): Promise<void>;
  onInstalled(listener: () => void): void;
}
// Merges with the interface above: one name serves as both type and token.
export const ICudaController = token<ICudaController>("cuda");

export class CudaController implements ICudaController {
  private offered = false;
  private installedListener: () => void = () => {};

  constructor(
    @ICudaInstaller private readonly installer: ICudaInstaller,
    @ExtensionContext private readonly context: vscode.ExtensionContext,
    @ILogger private readonly logger: ILogger,
  ) {}

  onInstalled(listener: () => void): void {
    this.installedListener = listener;
  }

  async ensureLinks(): Promise<void> {
    try {
      await this.installer.ensureLinks();
    } catch (err) {
      // Non-fatal: auto falls back to Vulkan; the picker entry offers a retry.
      this.logger.info(`blink: cuda link refresh failed: ${String(err)}`);
    }
  }

  async canInstall(): Promise<boolean> {
    return this.installer.supported()
      && await this.installer.isNvidiaDriverPresent()
      && !(await this.installer.isInstalled());
  }

  async offerIfApplicable(model: LlamaCppModelConfig): Promise<void> {
    if (this.offered) { return; }
    const offer = shouldOfferCuda({
      platform: process.platform,
      arch: process.arch,
      gpu: model.gpu,
      driverPresent: await this.installer.isNvidiaDriverPresent(),
      installed: await this.installer.isInstalled(),
      declined: this.context.globalState.get<boolean>(DECLINED_KEY, false),
    });
    if (!offer) { return; }
    this.offered = true;
    const choice = await vscode.window.showInformationMessage(
      "blink: NVIDIA GPU detected — enable CUDA acceleration? (~580 MB download)",
      "Enable", "Not now", "Don't ask again",
    );
    if (choice === "Enable") {
      await this.install();
    } else if (choice === "Don't ask again") {
      await this.context.globalState.update(DECLINED_KEY, true);
    }
  }

  async install(): Promise<void> {
    let cancelled = false;
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "blink: downloading CUDA binaries",
          cancellable: true,
        },
        async (progress, progressToken) => {
          const ac = new AbortController();
          progressToken.onCancellationRequested(() => { cancelled = true; ac.abort(); });
          let lastPct = 0;
          let lastIndex = -1;
          await this.installer.install(ac.signal, (p: CudaProgress) => {
            if (p.index !== lastIndex) { lastIndex = p.index; lastPct = 0; }
            if (!p.total) { return; }
            // Each package owns an equal slice of the 100% bar.
            const pct = Math.floor((p.received / p.total) * (100 / p.count));
            if (pct > lastPct) {
              progress.report({
                increment: pct - lastPct,
                message: `${p.index + 1}/${p.count} — ${Math.round(p.received / 1e6)} / ${Math.round(p.total / 1e6)} MB`,
              });
              lastPct = pct;
            }
          });
        },
      );
      this.logger.info("blink: CUDA binaries installed");
      void vscode.window.showInformationMessage("blink: CUDA acceleration enabled.");
      this.installedListener();
    } catch (err) {
      if (cancelled) {
        this.logger.info("blink: CUDA download cancelled");
      } else {
        // logger.error logs and pops a vscode error message.
        this.logger.error(`blink: CUDA install failed: ${String(err)}`);
      }
    }
  }
}
