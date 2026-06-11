import * as assert from "assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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
});
