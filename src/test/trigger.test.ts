import * as assert from "assert";
import { shouldRequest } from "../provider/trigger.js";

suite("shouldRequest", () => {
  test("proceeds at end of line", () => {
    assert.strictEqual(shouldRequest("", false), true);
  });

  test("proceeds before whitespace", () => {
    assert.strictEqual(shouldRequest(" foo", false), true);
  });

  test("proceeds before a punctuation char", () => {
    assert.strictEqual(shouldRequest(")", false), true);
  });

  test("skips mid-identifier (next char is a word char)", () => {
    assert.strictEqual(shouldRequest("bar", false), false);
  });

  test("explicit invoke always proceeds, even mid-identifier", () => {
    assert.strictEqual(shouldRequest("bar", true), true);
  });
});
