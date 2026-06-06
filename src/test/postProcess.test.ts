import * as assert from "assert";
import { postProcess } from "../completion/postProcess.js";

const STOP = ["<|endoftext|>", "<|fim_pad|>"];

suite("postProcess", () => {
  test("returns the raw text unchanged when nothing to strip", () => {
    assert.strictEqual(postProcess("a + b", { prefix: "", suffix: ")", stop: STOP }), "a + b");
  });

  test("strips a stop token and everything after it", () => {
    assert.strictEqual(
      postProcess("a + b<|endoftext|>junk", { prefix: "", suffix: ")", stop: STOP }),
      "a + b",
    );
  });

  test("drops a completion that merely repeats the suffix", () => {
    assert.strictEqual(postProcess(") {}", { prefix: "", suffix: ") {}", stop: STOP }), "");
  });

  test("trims a trailing overlap with the suffix", () => {
    assert.strictEqual(postProcess("value)", { prefix: "", suffix: ")", stop: STOP }), "value");
  });

  test("returns empty string for whitespace-only output", () => {
    assert.strictEqual(postProcess("   \n  ", { prefix: "", suffix: "", stop: STOP }), "");
  });

  test("clamps to a single line when code follows the cursor on the line", () => {
    const ctx = { prefix: "const x = ", suffix: " + 1;\n", stop: STOP };
    assert.strictEqual(postProcess("foo()\nbar()\nbaz()", ctx), "foo()");
  });

  test("keeps multiple lines when the cursor line has no trailing code", () => {
    const ctx = { prefix: "function f() {\n  ", suffix: "\n}", stop: STOP };
    const raw = "const a = 1;\n  const b = 2;\n  return a + b;";
    assert.strictEqual(postProcess(raw, ctx), raw);
  });

  test("stops multi-line output when a line dedents below the cursor", () => {
    const ctx = { prefix: "function f() {\n  ", suffix: "", stop: STOP };
    const raw = "doA();\n  doB();\n}\nafter();";
    assert.strictEqual(postProcess(raw, ctx), "doA();\n  doB();");
  });

  test("trims an extra trailing bracket the suffix supplies", () => {
    const ctx = { prefix: "foo(", suffix: ")", stop: STOP };
    assert.strictEqual(postProcess("a, b))", ctx), "a, b)");
  });

  test("leaves a balanced completion untouched", () => {
    const ctx = { prefix: "x = ", suffix: ")", stop: STOP };
    assert.strictEqual(postProcess("compute(a, b)", ctx), "compute(a, b)");
  });

  test("ignores brackets inside string literals when balancing", () => {
    const ctx = { prefix: "", suffix: ")", stop: STOP };
    assert.strictEqual(postProcess('g("(")', ctx), 'g("(")');
  });
});
