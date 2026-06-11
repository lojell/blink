import type { LlamaCppModelConfig } from "../config/models.js";

/**
 * Pure logic for the runtime CUDA download: which npm packages a platform
 * needs, registry URLs/metadata shapes, and the single offer gate. No IO.
 */

/** The @node-llama-cpp package suffixes a platform needs for CUDA (binary + runtime ext), or undefined when no prebuilt CUDA exists. */
export function cudaVariants(platform: string, arch: string): string[] | undefined {
  if (arch !== "x64") { return undefined; }
  if (platform === "win32") { return ["win-x64-cuda", "win-x64-cuda-ext"]; }
  if (platform === "linux") { return ["linux-x64-cuda", "linux-x64-cuda-ext"]; }
  return undefined;
}

/** npm version-manifest URL; its `dist` carries the tarball URL + integrity. */
export function registryVersionUrl(pkg: string, version: string): string {
  return `https://registry.npmjs.org/${pkg}/${version}`;
}

export interface TarballInfo {
  url: string;
  integrity: string; // "sha512-<base64>"
}

/** Pull dist.tarball + dist.integrity out of a registry version manifest. */
export function tarballInfo(metadata: unknown): TarballInfo {
  const dist = (metadata as { dist?: { tarball?: unknown; integrity?: unknown } } | null)?.dist;
  if (typeof dist?.tarball !== "string" || typeof dist?.integrity !== "string") {
    throw new Error("blink: unexpected npm registry response (missing dist.tarball / dist.integrity)");
  }
  return { url: dist.tarball, integrity: dist.integrity };
}

/** "sha512-<base64>" -> the base64 digest. Anything else is unsupported. */
export function expectedSha512(integrity: string): string {
  if (!integrity.startsWith("sha512-")) {
    throw new Error(`blink: unsupported integrity algorithm in "${integrity}"`);
  }
  return integrity.slice("sha512-".length);
}

export interface CudaOfferInputs {
  platform: string; // process.platform
  arch: string;     // process.arch
  gpu: LlamaCppModelConfig["gpu"]; // the active model's gpu setting
  driverPresent: boolean;
  installed: boolean;
  declined: boolean; // the "Don't ask again" memento
}

/**
 * The offer gate. Callers only invoke this for an active llamacpp model.
 * An explicit gpu:"cuda" is a direct user ask, so it bypasses `declined`;
 * any other explicit pin (vulkan/metal/off) means auto-CUDA would never be
 * used, so there is nothing to offer.
 */
export function shouldOfferCuda(i: CudaOfferInputs): boolean {
  if (!cudaVariants(i.platform, i.arch)) { return false; }
  if (!i.driverPresent || i.installed) { return false; }
  const gpu = i.gpu ?? "auto";
  if (gpu === "cuda") { return true; }
  return gpu === "auto" && !i.declined;
}
