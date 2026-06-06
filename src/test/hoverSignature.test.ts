import * as assert from "assert";
import { extractSignature } from "../context/hoverSignature.js";

suite("extractSignature", () => {
  test("extracts a fenced code block", () => {
    const hover = "```typescript\nfunction foo(a: number): string\n```";
    assert.strictEqual(extractSignature(hover), "function foo(a: number): string");
  });

  test("keeps a multi-line fenced block", () => {
    const hover = "```ts\ninterface X {\n  a: number\n}\n```\nDoc text";
    assert.strictEqual(extractSignature(hover), "interface X {\n  a: number\n}");
  });

  test("falls back to the first non-empty line when no fence", () => {
    assert.strictEqual(extractSignature("\n\n const x: number \nmore"), "const x: number");
  });

  test("returns null for empty or fence-only hover", () => {
    assert.strictEqual(extractSignature(""), null);
    assert.strictEqual(extractSignature("```ts\n\n```"), null);
  });
});
