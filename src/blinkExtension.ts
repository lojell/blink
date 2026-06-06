import { IConfigProvider, type BlinkConfig } from "./config/config.js";
import { isModelConfigured, modelTarget } from "./config/models.js";
import { StatusStore } from "./status/statusStore.js";
import { ICompletionEngine } from "./completion/completionEngine.js";
import { ICompletionClientManager } from "./clients/manager.js";
import { ILspContextProvider } from "./context/lspContext.js";
import { IInlineCompletionItemProvider } from "./provider/inlineProvider.js";
import { ISetupController } from "./setup/setupController.js";
import { token, Inject } from "./di/container.js";

export interface IStatusBar {
  create(): void;
}

// Merges with the interface above: one name serves as both type and token.
export const IStatusBar = token<IStatusBar>("statusBar");

/**
 * Composition root: registers the provider + status bar, subscribes to config
 * changes, and re-applies settings (status, active client, active model, enabled,
 * lsp cache) on each change. Pure wiring — no completion logic.
 */
export class BlinkExtension {
  constructor(
    @IConfigProvider private readonly config: IConfigProvider,
    @Inject(StatusStore) private readonly status: StatusStore,
    @IStatusBar private readonly statusBar: IStatusBar,
    @ICompletionClientManager private readonly clients: ICompletionClientManager,
    @ICompletionEngine private readonly engine: ICompletionEngine,
    @IInlineCompletionItemProvider private readonly inlineProvider: IInlineCompletionItemProvider,
    @ILspContextProvider private readonly lsp: ILspContextProvider,
    @ISetupController private readonly setup: ISetupController,
  ) {}

  start(): void {
    this.inlineProvider.register();
    this.statusBar.create();
    this.clients.onLoadError(() => this.status.setError("model load failed"));
    this.config.onChange((config) => this.init(config));
    const config = this.config.readConfig();
    this.init(config);
    this.setup.promptFirstRunIfNeeded(config);
  }

  private init(config: BlinkConfig): void {
    const active = this.config.getActiveModelConfig(config);
    const configured = !!active && isModelConfigured(active);

    this.status.setConfig({
      enabled: config.enabled,
      configured,
      hasModels: config.models.length > 0,
      backend: active?.backend ?? "",
      model: config.model,
      target: active ? modelTarget(active) : "—",
    });

    let clientReady = false;
    if (active && configured) {
      try {
        this.engine.setClient(this.clients.get(active));
        clientReady = true;
      } catch {
        // Unimplemented/unavailable backend (e.g. ollama): surface via status,
        // keep the provider disabled. Never let init throw out of onChange.
        this.status.setError(`${active.backend} backend unavailable`);
      }
    }
    this.inlineProvider.setModel(clientReady ? active : undefined);
    this.inlineProvider.setEnabled(config.enabled && clientReady);
    this.lsp.clear();
  }

  async dispose(): Promise<void> {
    await this.clients.dispose();
  }
}
