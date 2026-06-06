import type { ModelConfig, BlinkBackend } from "../config/models.js";
import type { CompletionClient, ManagedClient } from "./types.js";
import { IBackendRegistry } from "./backends.js";
import { token } from "../di/container.js";

export interface ICompletionClientManager {
  get(model: ModelConfig): CompletionClient;
  /** Subscribe to model-load failures from whichever client is active. */
  onLoadError(listener: (message: string) => void): void;
  dispose(): Promise<void>;
}

// Merges with the interface above: one name serves as both type and token.
export const ICompletionClientManager = token<ICompletionClientManager>("clients");

/**
 * Single-active client holder. Delegates client creation to the BackendRegistry
 * (keyed on model.backend) and applies per-model config via setConfig. Keeps at
 * most one client alive; switching backends disposes the previous one.
 */
export class CompletionClientManager implements ICompletionClientManager {

  private current: ManagedClient | undefined;
  private currentBackend: BlinkBackend | undefined;
  private loadErrorListener: (message: string) => void = () => {};

  constructor(@IBackendRegistry private readonly registry: IBackendRegistry) {}

  onLoadError(listener: (message: string) => void): void {
    this.loadErrorListener = listener;
    this.current?.onLoadError(listener);
  }

  get(model: ModelConfig): CompletionClient {
    if (!this.current || this.currentBackend !== model.backend) {
      void this.current?.dispose();
      this.current = this.registry.create(model.backend);
      this.current.onLoadError(this.loadErrorListener);
      this.currentBackend = model.backend;
    }
    this.current.setConfig(model);
    return this.current;
  }

  async dispose(): Promise<void> {
    const c = this.current;
    this.current = undefined;
    this.currentBackend = undefined;
    await c?.dispose();
  }
}
