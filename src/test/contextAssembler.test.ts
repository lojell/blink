import * as assert from "assert";
import { assembleContext } from "../completion/contextAssembler.js";

suite("contextAssembler", () => {
  test("splits prefix and suffix at the cursor offset", () => {
    const text = "const a = 1;\nconst b = ";
    const { prefix, suffix } = assembleContext(text, text.length, 2000, 1000);
    assert.strictEqual(prefix, "const a = 1;\nconst b = ");
    assert.strictEqual(suffix, "");
  });

  test("suffix is the text after the cursor", () => {
    const text = "foo(BAR)";
    const offset = 4; // between '(' and 'BAR'
    const { prefix, suffix } = assembleContext(text, offset, 2000, 1000);
    assert.strictEqual(prefix, "foo(");
    assert.strictEqual(suffix, "BAR)");
  });

  test("truncates prefix to the last maxPrefixChars characters", () => {
    const text = "0123456789";
    const { prefix } = assembleContext(text, 10, 4, 1000);
    assert.strictEqual(prefix, "6789");
  });

  test("truncates suffix to the first maxSuffixChars characters", () => {
    const text = "0123456789";
    const { suffix } = assembleContext(text, 0, 1000, 4);
    assert.strictEqual(suffix, "0123");
  });

  test("handles empty file", () => {
    const { prefix, suffix } = assembleContext("", 0, 2000, 1000);
    assert.strictEqual(prefix, "");
    assert.strictEqual(suffix, "");
  });

  test("keeps the header lines and a clean tail when the prefix overflows", () => {
    const before = "im1\nim2\naaaa\nbbbb\nCURSOR(";
    const { prefix } = assembleContext(before, before.length, 20, 1000, 8);
    assert.strictEqual(prefix, "im1\nim2\n\nCURSOR(");
  });

  test("falls back to a plain tail slice when no whole header line fits", () => {
    const before = "x".repeat(15) + "END(";
    const { prefix } = assembleContext(before, before.length, 10, 1000, 4);
    assert.strictEqual(prefix, before.slice(-10));
  });

  test("ignores the header budget when the prefix already fits", () => {
    const before = "short(";
    const { prefix } = assembleContext(before, before.length, 2000, 1000, 500);
    assert.strictEqual(prefix, "short(");
  });
});
