import * as assert from "assert";
import { EditTracker, expandRange } from "../edits/editTracker.js";

function region(path: string, startLine: number, endLine: number, text: string, seq: number) {
  return { path, startLine, endLine, text, seq };
}

// record()/select() never touch the injected deps (context/config/logger are
// only used by register()), so stubs are safe here.
function makeTracker() {
  return new EditTracker(null as never, null as never, null as never);
}

suite("expandRange", () => {
  test("pads and clamps to document bounds", () => {
    assert.deepStrictEqual(expandRange(5, 6, 100, 2), { startLine: 3, endLine: 8 });
    assert.deepStrictEqual(expandRange(0, 0, 100, 2), { startLine: 0, endLine: 2 });
    assert.deepStrictEqual(expandRange(98, 99, 100, 2), { startLine: 96, endLine: 99 });
  });

  test("keeps start <= end even past the end of the document", () => {
    const r = expandRange(50, 60, 10, 2); // both beyond a now-short doc
    assert.ok(r.startLine <= r.endLine);
    assert.ok(r.endLine <= 9);
  });
});

suite("EditTracker", () => {
  test("coalesces an overlapping same-file edit (refreshes text + recency)", () => {
    const t = makeTracker();
    t.record(region("a.ts", 10, 12, "old", 1));
    t.record(region("a.ts", 11, 13, "new", 2)); // overlaps -> replace
    const out = t.select(undefined, 10, 10000);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].content, "new");
  });

  test("treats adjacent lines as the same region", () => {
    const t = makeTracker();
    t.record(region("a.ts", 10, 11, "x", 1));
    t.record(region("a.ts", 12, 13, "y", 2)); // abuts (11 and 12) -> replace
    assert.strictEqual(t.select(undefined, 10, 10000).length, 1);
  });

  test("keeps distinct regions and different files separate", () => {
    const t = makeTracker();
    t.record(region("a.ts", 0, 1, "a", 1));
    t.record(region("a.ts", 50, 51, "b", 2)); // far apart
    t.record(region("b.ts", 0, 1, "c", 3));    // different file
    assert.strictEqual(t.select(undefined, 10, 10000).length, 3);
  });

  test("evicts oldest beyond the cap", () => {
    const t = makeTracker();
    for (let i = 0; i <= 20; i++) {
      t.record(region(`f${i}.ts`, 0, 0, `c${i}`, i + 1)); // 21 distinct files
    }
    const out = t.select(undefined, 100, 1_000_000);
    assert.strictEqual(out.length, 20);
    const paths = out.map((f) => f.path);
    assert.ok(!paths.includes("f0.ts")); // oldest dropped
    assert.ok(paths.includes("f1.ts"));
  });

  test("select excludes the current file and returns oldest-first within budget", () => {
    const t = makeTracker();
    t.record(region("a.ts", 0, 0, "AA", 1));
    t.record(region("b.ts", 0, 0, "BB", 2));
    t.record(region("cur.ts", 0, 0, "CC", 3));
    const out = t.select("cur.ts", 10, 10000);
    assert.deepStrictEqual(out, [
      { path: "a.ts", content: "AA" }, // older first
      { path: "b.ts", content: "BB" },
    ]);
  });

  test("select honors maxSnippets (keeping the most recent)", () => {
    const t = makeTracker();
    t.record(region("a.ts", 0, 0, "AA", 1));
    t.record(region("b.ts", 0, 0, "BB", 2));
    t.record(region("c.ts", 0, 0, "CC", 3));
    const out = t.select(undefined, 2, 10000);
    assert.deepStrictEqual(out, [
      { path: "b.ts", content: "BB" }, // 2 most recent (b,c), oldest-first
      { path: "c.ts", content: "CC" },
    ]);
  });

  test("select skips a snippet that would breach maxChars", () => {
    const t = makeTracker();
    t.record(region("a.ts", 0, 0, "12345", 1));
    t.record(region("b.ts", 0, 0, "12345", 2));
    const out = t.select(undefined, 10, 6); // 5 fits, +5 would be 10 > 6 -> skip
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].content, "12345"); // the most recent that fits (b)
    assert.strictEqual(out[0].path, "b.ts");
  });
});
