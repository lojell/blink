import * as assert from "assert";
import { delay, type Cancellable } from "../provider/debounce.js";

suite("delay", () => {
  test("resolves true after the delay when not cancelled", async () => {
    const token: Cancellable = { isCancellationRequested: false };
    const ok = await delay(10, token);
    assert.strictEqual(ok, true);
  });

  test("resolves false immediately when already cancelled", async () => {
    const token: Cancellable = { isCancellationRequested: true };
    const ok = await delay(10, token);
    assert.strictEqual(ok, false);
  });

  test("resolves false when cancelled during the wait", async () => {
    const token: Cancellable = { isCancellationRequested: false };
    const p = delay(50, token);
    token.isCancellationRequested = true;
    const ok = await p;
    assert.strictEqual(ok, false);
  });
});
