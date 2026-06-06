import * as assert from "assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  ModelDownloader, type DownloadProgress, type FetchLike, type FetchResponseLike,
} from "../setup/modelDownloader.js";

function chunksOf(...texts: string[]): Uint8Array[] {
  return texts.map((t) => new TextEncoder().encode(t));
}

function fakeResponse(chunks: Uint8Array[], over: Partial<FetchResponseLike> = {}): FetchResponseLike {
  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  return {
    ok: true,
    status: 200,
    headers: { get: (n: string) => (n.toLowerCase() === "content-length" ? String(total) : null) },
    body: (async function* () { for (const c of chunks) { yield c; } })(),
    ...over,
  };
}

suite("ModelDownloader", () => {
  let dir: string;
  setup(async () => { dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "blink-dl-")); });
  teardown(async () => { await fs.promises.rm(dir, { recursive: true, force: true }); });

  test("streams chunks to the destination and reports progress", async () => {
    const fetchImpl: FetchLike = async () => fakeResponse(chunksOf("hello ", "world"));
    const dest = path.join(dir, "sub", "m.gguf");
    const progress: DownloadProgress[] = [];
    await new ModelDownloader(fetchImpl).download("https://x/m.gguf", dest, new AbortController().signal, (p) => progress.push(p));
    assert.strictEqual(await fs.promises.readFile(dest, "utf8"), "hello world");
    assert.deepStrictEqual(progress, [
      { received: 6, total: 11 },
      { received: 11, total: 11 },
    ]);
  });

  test("missing content-length yields undefined total", async () => {
    const fetchImpl: FetchLike = async () =>
      fakeResponse(chunksOf("abc"), { headers: { get: () => null } });
    const dest = path.join(dir, "m.gguf");
    const progress: DownloadProgress[] = [];
    await new ModelDownloader(fetchImpl).download("https://x/m.gguf", dest, new AbortController().signal, (p) => progress.push(p));
    assert.deepStrictEqual(progress, [{ received: 3, total: undefined }]);
  });

  test("HTTP error rejects and writes nothing", async () => {
    const fetchImpl: FetchLike = async () => fakeResponse([], { ok: false, status: 404, body: null });
    const dest = path.join(dir, "m.gguf");
    await assert.rejects(
      () => new ModelDownloader(fetchImpl).download("https://x/m.gguf", dest, new AbortController().signal, () => {}),
      /HTTP 404/,
    );
    assert.strictEqual(fs.existsSync(dest), false);
  });

  test("abort mid-stream rejects and removes the partial file", async () => {
    const fetchImpl: FetchLike = async () => fakeResponse(chunksOf("part1", "part2", "part3"));
    const dest = path.join(dir, "m.gguf");
    const ac = new AbortController();
    await assert.rejects(
      () => new ModelDownloader(fetchImpl).download("https://x/m.gguf", dest, ac.signal, (p) => {
        if (p.received >= 5) { ac.abort(); }
      }),
      /cancelled/,
    );
    assert.strictEqual(fs.existsSync(dest), false);
  });
});
