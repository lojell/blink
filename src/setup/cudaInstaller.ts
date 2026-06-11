import * as fs from "node:fs";
import * as path from "node:path";
import { token } from "../di/container.js";
import type { IModelDownloader } from "./modelDownloader.js";
import { cudaVariants } from "./cudaSupport.js";

export interface CudaProgress {
  variant: string;          // package suffix, e.g. "win-x64-cuda"
  index: number;            // 0-based package index
  count: number;            // total packages
  received: number;
  total: number | undefined;
}

export interface ICudaInstaller {
  /** Whether prebuilt CUDA packages exist for this platform/arch at all. */
  supported(): boolean;
  isNvidiaDriverPresent(): Promise<boolean>;
  /** The CUDA package version node-llama-cpp pins (undefined when unreadable/unsupported). */
  pinnedVersion(): Promise<string | undefined>;
  /** True when every variant link resolves to the pinned version. */
  isInstalled(): Promise<boolean>;
  /** Recreate missing links when storage already holds the pinned version (after extension updates). */
  ensureLinks(): Promise<void>;
  /** Download, verify, extract, link. Throws on failure after cleaning up the partial version dir. */
  install(signal: AbortSignal, onProgress: (p: CudaProgress) => void): Promise<void>;
}
// Merges with the interface above: one name serves as both type and token.
export const ICudaInstaller = token<ICudaInstaller>("cudaInstaller");

export interface CudaInstallerOptions {
  storageDir: string;     // e.g. <globalStorage>/cuda — holds <version>/<variant>/ trees
  extensionRoot: string;  // the dir containing node_modules/node-llama-cpp
  downloader: IModelDownloader;
  platform?: string;                       // test seam; defaults to process.platform
  arch?: string;                           // test seam; defaults to process.arch
  env?: NodeJS.ProcessEnv;                 // test seam; defaults to process.env
  fetchJson?: (url: string) => Promise<unknown>; // test seam; defaults to global fetch
}

async function exists(p: string): Promise<boolean> {
  try { await fs.promises.access(p); return true; } catch { return false; }
}

/**
 * Installs the prebuilt CUDA packages node-llama-cpp pins, into globalStorage,
 * and links them into the extension's node_modules so getLlama can import
 * them. Node-only — no vscode. Factory-registered (plain-value config).
 */
export class CudaInstaller implements ICudaInstaller {
  constructor(private readonly opts: CudaInstallerOptions) {}

  private get platform(): string { return this.opts.platform ?? process.platform; }
  private get arch(): string { return this.opts.arch ?? process.arch; }
  private get env(): NodeJS.ProcessEnv { return this.opts.env ?? process.env; }

  private variants(): string[] | undefined {
    return cudaVariants(this.platform, this.arch);
  }

  supported(): boolean {
    return this.variants() !== undefined;
  }

  async isNvidiaDriverPresent(): Promise<boolean> {
    // Same signals node-llama-cpp's own GPU detection uses.
    if (this.platform === "win32") {
      const windir = this.env.windir ?? "C:\\Windows";
      return exists(path.join(windir, "System32", "nvml.dll"));
    }
    if (this.platform === "linux") {
      if (await exists("/proc/driver/nvidia/version")) { return true; }
      for (const dir of (this.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
        if (await exists(path.join(dir, "nvidia-smi"))) { return true; }
      }
    }
    return false;
  }

  async pinnedVersion(): Promise<string | undefined> {
    const variants = this.variants();
    if (!variants) { return undefined; }
    try {
      const raw = await fs.promises.readFile(
        path.join(this.opts.extensionRoot, "node_modules", "node-llama-cpp", "package.json"), "utf8");
      const pkg = JSON.parse(raw) as { optionalDependencies?: Record<string, string> };
      return pkg.optionalDependencies?.[`@node-llama-cpp/${variants[0]}`];
    } catch {
      return undefined;
    }
  }

  private linkPath(variant: string): string {
    return path.join(this.opts.extensionRoot, "node_modules", "@node-llama-cpp", variant);
  }

  private storedDir(version: string, variant: string): string {
    return path.join(this.opts.storageDir, version, variant);
  }

  /** The package.json version readable at dir (through links), or undefined. */
  private async versionAt(dir: string): Promise<string | undefined> {
    try {
      const raw = await fs.promises.readFile(path.join(dir, "package.json"), "utf8");
      return (JSON.parse(raw) as { version?: string }).version;
    } catch {
      return undefined;
    }
  }

  async isInstalled(): Promise<boolean> {
    const variants = this.variants();
    const pinned = await this.pinnedVersion();
    if (!variants || !pinned) { return false; }
    for (const v of variants) {
      if (await this.versionAt(this.linkPath(v)) !== pinned) { return false; }
    }
    return true;
  }

  async ensureLinks(): Promise<void> {
    throw new Error("not implemented"); // next: install/links
  }

  async install(_signal: AbortSignal, _onProgress: (p: CudaProgress) => void): Promise<void> {
    throw new Error("not implemented"); // next: install/links
  }
}
