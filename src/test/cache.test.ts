import * as assert from "assert";
import { CompletionCache, reuseCompletion } from "../cache.js";

suite("CompletionCache", () => {
  test("makeKey combines model, prefix tail and suffix head", () => {
    const cache = new CompletionCache(10);
    const k1 = cache.makeKey("m", "abc", "xyz");
    const k2 = cache.makeKey("m", "abc", "xyz");
    const k3 = cache.makeKey("m", "abd", "xyz");
    assert.strictEqual(k1, k2);
    assert.notStrictEqual(k1, k3);
  });

  test("makeKey distinguishes different file paths and formats", () => {
    const cache = new CompletionCache(10);
    const k1 = cache.makeKey("m", "abc", "xyz", "a.ts", "auto");
    const k2 = cache.makeKey("m", "abc", "xyz", "b.ts", "auto");
    const k3 = cache.makeKey("m", "abc", "xyz", "a.ts", "file");
    assert.notStrictEqual(k1, k2); // different path
    assert.notStrictEqual(k1, k3); // different format
  });

  test("makeKey distinguishes different context signatures", () => {
    const cache = new CompletionCache(10);
    const k1 = cache.makeKey("m", "abc", "xyz", "a.ts", "auto", "ctxA");
    const k2 = cache.makeKey("m", "abc", "xyz", "a.ts", "auto", "ctxB");
    assert.notStrictEqual(k1, k2);
  });

  test("get returns what was set", () => {
    const cache = new CompletionCache(10);
    cache.set("k", "value");
    assert.strictEqual(cache.get("k"), "value");
  });

  test("get returns undefined for a missing key", () => {
    const cache = new CompletionCache(10);
    assert.strictEqual(cache.get("nope"), undefined);
  });

  test("evicts the least-recently-used entry past capacity", () => {
    const cache = new CompletionCache(2);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.get("a");          // touch 'a' so 'b' is now LRU
    cache.set("c", "3");     // capacity 2 -> evict 'b'
    assert.strictEqual(cache.get("a"), "1");
    assert.strictEqual(cache.get("b"), undefined);
    assert.strictEqual(cache.get("c"), "3");
  });
});

suite("reuseCompletion", () => {
  const last = { scope: "s", prefix: "conso", suffix: ";", completion: "le.log()" };

  test("serves the tail when typing forward into the suggestion", () => {
    assert.strictEqual(reuseCompletion(last, "s", "consol", ";"), "e.log()");
  });

  test("honors a multi-char delta", () => {
    assert.strictEqual(reuseCompletion(last, "s", "console", ";"), ".log()");
  });

  test("null when the typed char does not match the suggestion", () => {
    assert.strictEqual(reuseCompletion(last, "s", "consox", ";"), null);
  });

  test("null when the suffix changed", () => {
    assert.strictEqual(reuseCompletion(last, "s", "consol", ")"), null);
  });

  test("null on scope mismatch", () => {
    assert.strictEqual(reuseCompletion(last, "other", "consol", ";"), null);
  });

  test("null when the delta consumes the whole completion", () => {
    assert.strictEqual(reuseCompletion(last, "s", "console.log()", ";"), null);
  });

  test("null on an empty delta (same prefix)", () => {
    assert.strictEqual(reuseCompletion(last, "s", "conso", ";"), null);
  });

  test("null when there is no last entry", () => {
    assert.strictEqual(reuseCompletion(null, "s", "consol", ";"), null);
  });
});

suite("CompletionCache reuse", () => {
  test("recordServed then reuse round-trips the tail", () => {
    const cache = new CompletionCache(10);
    cache.recordServed("s", "foo", "", "bar()");
    assert.strictEqual(cache.reuse("s", "foob", ""), "ar()");
  });

  test("a different scope does not reuse", () => {
    const cache = new CompletionCache(10);
    cache.recordServed("s", "foo", "", "bar()");
    assert.strictEqual(cache.reuse("other", "foob", ""), null);
  });
});
