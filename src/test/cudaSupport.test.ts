import * as assert from "assert";
import {
  cudaVariants, expectedSha512, registryVersionUrl, shouldOfferCuda, tarballInfo,
} from "../setup/cudaSupport.js";

suite("cudaSupport", () => {
  suite("cudaVariants", () => {
    test("win32/linux x64 get binary + ext pairs; everything else is unsupported", () => {
      assert.deepStrictEqual(cudaVariants("win32", "x64"), ["win-x64-cuda", "win-x64-cuda-ext"]);
      assert.deepStrictEqual(cudaVariants("linux", "x64"), ["linux-x64-cuda", "linux-x64-cuda-ext"]);
      assert.strictEqual(cudaVariants("darwin", "arm64"), undefined);
      assert.strictEqual(cudaVariants("darwin", "x64"), undefined);
      assert.strictEqual(cudaVariants("win32", "arm64"), undefined);
      assert.strictEqual(cudaVariants("linux", "arm64"), undefined);
    });
  });

  suite("registryVersionUrl", () => {
    test("builds the npm version-manifest URL", () => {
      assert.strictEqual(
        registryVersionUrl("@node-llama-cpp/win-x64-cuda", "3.18.1"),
        "https://registry.npmjs.org/@node-llama-cpp/win-x64-cuda/3.18.1",
      );
    });
  });

  suite("tarballInfo", () => {
    test("extracts dist.tarball and dist.integrity", () => {
      const meta = { dist: { tarball: "https://r/x.tgz", integrity: "sha512-abc" } };
      assert.deepStrictEqual(tarballInfo(meta), { url: "https://r/x.tgz", integrity: "sha512-abc" });
    });

    test("rejects malformed metadata", () => {
      assert.throws(() => tarballInfo({}), /registry/);
      assert.throws(() => tarballInfo({ dist: { tarball: "x" } }), /registry/);
      assert.throws(() => tarballInfo(null), /registry/);
    });
  });

  suite("expectedSha512", () => {
    test("strips the sha512- prefix", () => {
      assert.strictEqual(expectedSha512("sha512-Zm9v"), "Zm9v");
    });
    test("rejects other algorithms", () => {
      assert.throws(() => expectedSha512("sha1-Zm9v"), /integrity/);
    });
  });

  suite("shouldOfferCuda", () => {
    const base = {
      platform: "win32", arch: "x64", gpu: "auto" as const,
      driverPresent: true, installed: false, declined: false,
    };
    test("offers on a supported NVIDIA machine with gpu auto", () => {
      assert.strictEqual(shouldOfferCuda(base), true);
    });
    test("undefined gpu behaves like auto", () => {
      assert.strictEqual(shouldOfferCuda({ ...base, gpu: undefined }), true);
    });
    test("no offer without an NVIDIA driver", () => {
      assert.strictEqual(shouldOfferCuda({ ...base, driverPresent: false }), false);
    });
    test("no offer when already installed", () => {
      assert.strictEqual(shouldOfferCuda({ ...base, installed: true }), false);
    });
    test("no offer on unsupported platform/arch", () => {
      assert.strictEqual(shouldOfferCuda({ ...base, platform: "darwin", arch: "arm64" }), false);
      assert.strictEqual(shouldOfferCuda({ ...base, arch: "arm64" }), false);
    });
    test("declined memento suppresses the auto offer", () => {
      assert.strictEqual(shouldOfferCuda({ ...base, declined: true }), false);
    });
    test("explicit gpu cuda overrides declined", () => {
      assert.strictEqual(shouldOfferCuda({ ...base, gpu: "cuda", declined: true }), true);
    });
    test("an explicit non-cuda gpu pin never offers", () => {
      assert.strictEqual(shouldOfferCuda({ ...base, gpu: "vulkan" }), false);
      assert.strictEqual(shouldOfferCuda({ ...base, gpu: "off" }), false);
      assert.strictEqual(shouldOfferCuda({ ...base, gpu: "metal" }), false);
    });
  });
});
