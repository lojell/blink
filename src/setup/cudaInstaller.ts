import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as tar from "tar";
import { token } from "../di/container.js";
import type { IModelDownloader } from "./modelDownloader.js";
import { cudaVariants, expectedSha512, registryVersionUrl, tarballInfo } from "./cudaSupport.js";

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

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) { throw new Error(`blink: npm registry request failed: HTTP ${res.status}`); }
  return res.json();
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
    const variants = this.variants();
    const pinned = await this.pinnedVersion();
    if (!variants || !pinned) { return; }
    for (const v of variants) {
      if (await this.versionAt(this.storedDir(pinned, v)) !== pinned) { return; } // storage incomplete
    }
    for (const v of variants) { await this.link(v, pinned); }
  }

  async install(signal: AbortSignal, onProgress: (p: CudaProgress) => void): Promise<void> {
    const variants = this.variants();
    const pinned = await this.pinnedVersion();
    if (!variants || !pinned) {
      throw new Error("blink: prebuilt CUDA binaries are not available for this platform");
    }
    try {
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        await this.installVariant(variant, pinned, signal, (received, total) =>
          onProgress({ variant, index: i, count: variants.length, received, total }));
      }
    } catch (err) {
      await fs.promises.rm(path.join(this.opts.storageDir, pinned), { recursive: true, force: true });
      throw err;
    }
    for (const v of variants) { await this.link(v, pinned); }
    await this.gc(pinned);
  }

  /** Download + verify + extract one package into storage (idempotent across windows). */
  private async installVariant(
    variant: string,
    version: string,
    signal: AbortSignal,
    onProgress: (received: number, total: number | undefined) => void,
  ): Promise<void> {
    const dest = this.storedDir(version, variant);
    if (await this.versionAt(dest) === version) { return; } // already there (e.g. another window)

    const fetchJson = this.opts.fetchJson ?? defaultFetchJson;
    const meta = await fetchJson(registryVersionUrl(`@node-llama-cpp/${variant}`, version));
    const { url, integrity } = tarballInfo(meta);

    const tgz = path.join(this.opts.storageDir, `${variant}-${version}.tgz`);
    const tmp = `${dest}.tmp`;
    try {
      await this.opts.downloader.download(url, tgz, signal, (p) => onProgress(p.received, p.total));
      await this.verifySha512(tgz, expectedSha512(integrity));
      await fs.promises.rm(tmp, { recursive: true, force: true });
      await fs.promises.mkdir(tmp, { recursive: true });
      await tar.extract({ file: tgz, cwd: tmp, strip: 1 }); // npm tarballs prefix entries with package/
      try {
        await fs.promises.rename(tmp, dest);
      } catch (err) {
        // Lost a race with another VS Code window? Identical content — fine.
        if (await this.versionAt(dest) !== version) { throw err; }
      }
    } finally {
      await fs.promises.rm(tgz, { force: true });
      await fs.promises.rm(tmp, { recursive: true, force: true });
    }
  }

  private async verifySha512(file: string, expectedB64: string): Promise<void> {
    const hash = createHash("sha512");
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(file)
        .on("data", (chunk) => hash.update(chunk))
        .on("end", () => resolve())
        .on("error", reject);
    });
    if (hash.digest("base64") !== expectedB64) {
      throw new Error("blink: CUDA package failed integrity verification");
    }
  }

  /** Point <extensionRoot>/node_modules/@node-llama-cpp/<variant> at storage. */
  private async link(variant: string, version: string): Promise<void> {
    const linkPath = this.linkPath(variant);
    const target = this.storedDir(version, variant);
    try {
      const st = await fs.promises.lstat(linkPath);
      if (st.isSymbolicLink()
        && path.resolve(await fs.promises.readlink(linkPath)) === path.resolve(target)) {
        return; // already correct
      }
      await fs.promises.rm(linkPath, { recursive: true, force: true });
    } catch {
      // linkPath doesn't exist — create below
    }
    await fs.promises.mkdir(path.dirname(linkPath), { recursive: true });
    // "junction" needs no admin on Windows; the type arg is ignored on POSIX.
    await fs.promises.symlink(target, linkPath, "junction");
  }

  /** Keep only the pinned version's dir in storage. */
  private async gc(keepVersion: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(this.opts.storageDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && e.name !== keepVersion) {
        await fs.promises.rm(path.join(this.opts.storageDir, e.name), { recursive: true, force: true });
      }
    }
  }
}
