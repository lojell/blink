import * as assert from "assert";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as tar from "tar";
import { CudaInstaller } from "../setup/cudaInstaller.js";
import type { IModelDownloader } from "../setup/modelDownloader.js";

const PIN = "3.18.1";

/** A downloader that must not be reached. */
const noDownloader: IModelDownloader = {
  download: async () => { throw new Error("unexpected download"); },
};

async function makeRoot(): Promise<string> {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), "blink-cuda-"));
}

/** Lay down <root>/ext/node_modules/node-llama-cpp/package.json with the version pins. */
async function writePins(root: string, variants: string[] = ["win-x64-cuda", "win-x64-cuda-ext"]): Promise<string> {
  const extRoot = path.join(root, "ext");
  const nlcDir = path.join(extRoot, "node_modules", "node-llama-cpp");
  await fs.promises.mkdir(nlcDir, { recursive: true });
  const optionalDependencies = Object.fromEntries(variants.map((v) => [`@node-llama-cpp/${v}`, PIN]));
  await fs.promises.writeFile(path.join(nlcDir, "package.json"), JSON.stringify({ optionalDependencies }));
  return extRoot;
}

function makeInstaller(root: string, extRoot: string, over: Partial<ConstructorParameters<typeof CudaInstaller>[0]> = {}) {
  return new CudaInstaller({
    storageDir: path.join(root, "storage", "cuda"),
    extensionRoot: extRoot,
    downloader: noDownloader,
    platform: "win32",
    arch: "x64",
    ...over,
  });
}

suite("CudaInstaller", () => {
  let root: string;
  setup(async () => { root = await makeRoot(); });
  teardown(async () => { await fs.promises.rm(root, { recursive: true, force: true }); });

  suite("supported", () => {
    test("true on win32/linux x64, false elsewhere", async () => {
      const extRoot = await writePins(root);
      assert.strictEqual(makeInstaller(root, extRoot).supported(), true);
      assert.strictEqual(makeInstaller(root, extRoot, { platform: "darwin", arch: "arm64" }).supported(), false);
    });
  });

  suite("isNvidiaDriverPresent", () => {
    test("win32: true iff System32/nvml.dll exists under env.windir", async () => {
      const extRoot = await writePins(root);
      const windir = path.join(root, "windows");
      await fs.promises.mkdir(path.join(windir, "System32"), { recursive: true });
      const inst = makeInstaller(root, extRoot, { env: { windir } });
      assert.strictEqual(await inst.isNvidiaDriverPresent(), false);
      await fs.promises.writeFile(path.join(windir, "System32", "nvml.dll"), "");
      assert.strictEqual(await inst.isNvidiaDriverPresent(), true);
    });

    test("linux: true when nvidia-smi is on PATH", async () => {
      const extRoot = await writePins(root, ["linux-x64-cuda", "linux-x64-cuda-ext"]);
      const bin = path.join(root, "bin");
      await fs.promises.mkdir(bin, { recursive: true });
      const inst = makeInstaller(root, extRoot, { platform: "linux", env: { PATH: bin } });
      assert.strictEqual(await inst.isNvidiaDriverPresent(), false);
      await fs.promises.writeFile(path.join(bin, "nvidia-smi"), "");
      assert.strictEqual(await inst.isNvidiaDriverPresent(), true);
    });

    test("unsupported platforms report no driver", async () => {
      const extRoot = await writePins(root);
      const inst = makeInstaller(root, extRoot, { platform: "darwin", env: {} });
      assert.strictEqual(await inst.isNvidiaDriverPresent(), false);
    });
  });

  suite("pinnedVersion", () => {
    test("reads node-llama-cpp's optionalDependencies pin", async () => {
      const extRoot = await writePins(root);
      assert.strictEqual(await makeInstaller(root, extRoot).pinnedVersion(), PIN);
    });

    test("undefined when node-llama-cpp's package.json is missing", async () => {
      const inst = makeInstaller(root, path.join(root, "nowhere"));
      assert.strictEqual(await inst.pinnedVersion(), undefined);
    });
  });

  suite("isInstalled", () => {
    test("false when links are absent", async () => {
      const extRoot = await writePins(root);
      assert.strictEqual(await makeInstaller(root, extRoot).isInstalled(), false);
    });
  });

  /** Build a fake npm package tarball; returns its integrity string. */
  async function makePackageTgz(tgzPath: string, variant: string): Promise<string> {
    const srcDir = path.join(root, `pkg-src-${variant}`);
    await fs.promises.mkdir(path.join(srcDir, "bins"), { recursive: true });
    await fs.promises.writeFile(
      path.join(srcDir, "package.json"),
      JSON.stringify({ name: `@node-llama-cpp/${variant}`, version: PIN }),
    );
    await fs.promises.writeFile(path.join(srcDir, "bins", "fake.dll"), `binary:${variant}`);
    await fs.promises.mkdir(path.dirname(tgzPath), { recursive: true });
    // npm tarballs put everything under "package/"
    await tar.create({ gzip: true, file: tgzPath, cwd: srcDir, prefix: "package" }, ["package.json", "bins"]);
    const hash = createHash("sha512").update(await fs.promises.readFile(tgzPath)).digest("base64");
    return `sha512-${hash}`;
  }

  /** An installer whose registry + downloads are served from local fixture tarballs. */
  async function makeInstallable(extRoot: string, over: Partial<ConstructorParameters<typeof CudaInstaller>[0]> = {}) {
    const tarballs = new Map<string, { file: string; integrity: string }>();
    for (const variant of ["win-x64-cuda", "win-x64-cuda-ext"]) {
      const file = path.join(root, "fixtures", `${variant}.tgz`);
      const integrity = await makePackageTgz(file, variant);
      tarballs.set(`https://registry.npmjs.org/@node-llama-cpp/${variant}/${PIN}`, { file, integrity });
    }
    const downloader: IModelDownloader = {
      download: async (url, dest, _signal, onProgress) => {
        const hit = [...tarballs.values()].find((t) => url === `file://${t.file}`);
        if (!hit) { throw new Error(`no fixture for ${url}`); }
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        await fs.promises.copyFile(hit.file, dest);
        const size = (await fs.promises.stat(dest)).size;
        onProgress({ received: size, total: size });
      },
    };
    const fetchJson = async (url: string) => {
      const hit = tarballs.get(url);
      if (!hit) { throw new Error(`no metadata for ${url}`); }
      return { dist: { tarball: `file://${hit.file}`, integrity: hit.integrity } };
    };
    return { inst: makeInstaller(root, extRoot, { downloader, fetchJson, ...over }), tarballs };
  }

  suite("install", () => {
    test("downloads, extracts, links, and reports installed", async () => {
      const extRoot = await writePins(root);
      const { inst } = await makeInstallable(extRoot);
      const progress: string[] = [];
      await inst.install(new AbortController().signal, (p) => progress.push(`${p.index}/${p.count}:${p.variant}`));

      // extracted into storage, package/ prefix stripped
      const stored = path.join(root, "storage", "cuda", PIN, "win-x64-cuda");
      assert.strictEqual(
        await fs.promises.readFile(path.join(stored, "bins", "fake.dll"), "utf8"),
        "binary:win-x64-cuda",
      );
      // links resolve from the extension's node_modules
      const linked = path.join(extRoot, "node_modules", "@node-llama-cpp", "win-x64-cuda-ext", "package.json");
      const pkg = JSON.parse(await fs.promises.readFile(linked, "utf8")) as { version: string };
      assert.strictEqual(pkg.version, PIN);
      assert.strictEqual(await inst.isInstalled(), true);
      assert.deepStrictEqual([...new Set(progress)], ["0/2:win-x64-cuda", "1/2:win-x64-cuda-ext"]);
    });

    test("bad integrity rejects, cleans the version dir, creates no links", async () => {
      const extRoot = await writePins(root);
      const { inst, tarballs } = await makeInstallable(extRoot);
      for (const t of tarballs.values()) { t.integrity = "sha512-AAAA"; }
      await assert.rejects(
        () => inst.install(new AbortController().signal, () => {}),
        /integrity/,
      );
      assert.strictEqual(fs.existsSync(path.join(root, "storage", "cuda", PIN)), false);
      assert.strictEqual(await inst.isInstalled(), false);
    });

    test("installing the pinned version removes other version dirs (GC)", async () => {
      const extRoot = await writePins(root);
      const stale = path.join(root, "storage", "cuda", "0.0.1");
      await fs.promises.mkdir(stale, { recursive: true });
      const { inst } = await makeInstallable(extRoot);
      await inst.install(new AbortController().signal, () => {});
      assert.strictEqual(fs.existsSync(stale), false);
    });
  });

  suite("ensureLinks", () => {
    test("recreates missing links from storage without downloading", async () => {
      const extRoot = await writePins(root);
      const { inst } = await makeInstallable(extRoot);
      await inst.install(new AbortController().signal, () => {});
      // Simulate an extension update: links gone (fresh extension folder), storage intact.
      await fs.promises.rm(path.join(extRoot, "node_modules", "@node-llama-cpp"), { recursive: true, force: true });
      const offline = makeInstaller(root, extRoot); // noDownloader: any download throws
      await offline.ensureLinks();
      assert.strictEqual(await offline.isInstalled(), true);
    });

    test("does nothing when storage lacks the pinned version", async () => {
      const extRoot = await writePins(root);
      const inst = makeInstaller(root, extRoot);
      await inst.ensureLinks(); // must not throw
      assert.strictEqual(await inst.isInstalled(), false);
    });
  });
});
