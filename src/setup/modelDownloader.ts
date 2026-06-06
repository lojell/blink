import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { once } from "node:events";
import { dirname } from "node:path";
import { token } from "../di/container.js";

export interface DownloadProgress {
  received: number;
  total: number | undefined; // undefined when the server sends no content-length
}

/** Structural subset of fetch/Response so tests can fake the network. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  body: AsyncIterable<Uint8Array> | null;
}
export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<FetchResponseLike>;

export interface IModelDownloader {
  /** Stream url to destPath. Throws on HTTP error or abort; the partial file is removed. */
  download(
    url: string,
    destPath: string,
    signal: AbortSignal,
    onProgress: (p: DownloadProgress) => void,
  ): Promise<void>;
}
// Merges with the interface above: one name serves as both type and token.
export const IModelDownloader = token<IModelDownloader>("modelDownloader");

export class ModelDownloader implements IModelDownloader {
  // Node's global fetch follows redirects (HuggingFace resolve URLs redirect to a CDN).
  constructor(private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike) {}

  async download(
    url: string,
    destPath: string,
    signal: AbortSignal,
    onProgress: (p: DownloadProgress) => void,
  ): Promise<void> {
    const res = await this.fetchImpl(url, { signal });
    if (!res.ok || !res.body) {
      throw new Error(`download failed: HTTP ${res.status}`);
    }
    const length = Number(res.headers.get("content-length"));
    const total = Number.isFinite(length) && length > 0 ? length : undefined;

    await mkdir(dirname(destPath), { recursive: true });
    const out = createWriteStream(destPath);
    let received = 0;
    try {
      for await (const chunk of res.body) {
        if (signal.aborted) { throw new Error("download cancelled"); }
        received += chunk.byteLength;
        if (!out.write(chunk)) { await once(out, "drain"); }
        onProgress({ received, total });
      }
      out.end();
      await once(out, "finish");
    } catch (err) {
      out.destroy();
      await rm(destPath, { force: true });
      throw err;
    }
  }
}
