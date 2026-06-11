import * as assert from "assert";
import { CudaController } from "../setup/cudaController.js";
import type { ICudaInstaller } from "../setup/cudaInstaller.js";
import type { ILogger } from "../common/logging.js";
import { llamaModel } from "./fixtures.js";

/**
 * Simulates the first activation after an extension update: globalStorage
 * still holds the pinned binaries, but the links in the fresh extension
 * folder are gone — isInstalled() is false until ensureLinks() has run.
 */
function makeFakes() {
  const calls: string[] = [];
  let linksEnsured = false;
  const installer: ICudaInstaller = {
    supported: () => true,
    isNvidiaDriverPresent: async () => { calls.push("driver"); return true; },
    pinnedVersion: async () => "3.18.1",
    isInstalled: async () => { calls.push("isInstalled"); return linksEnsured; },
    ensureLinks: async () => { calls.push("ensureLinks"); linksEnsured = true; },
    install: async () => { calls.push("install"); },
  };
  const context = {
    globalState: { get: (_key: string, def: boolean) => def, update: async () => {} },
  } as unknown as import("vscode").ExtensionContext;
  const logger: ILogger = { info: () => {}, error: () => {} };
  return { controller: new CudaController(installer, context, logger), calls };
}

suite("CudaController", () => {
  test("offerIfApplicable restores links before reading the installed state (no spurious offer after an update)", async () => {
    const { controller, calls } = makeFakes();
    await controller.offerIfApplicable(llamaModel());
    assert.deepStrictEqual(calls, ["ensureLinks", "driver", "isInstalled"]);
  });

  test("canInstall restores links first, so a persisted install is not offered again", async () => {
    const { controller, calls } = makeFakes();
    assert.strictEqual(await controller.canInstall(), false);
    assert.strictEqual(calls[0], "ensureLinks");
  });
});
