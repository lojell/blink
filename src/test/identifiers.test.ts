import * as assert from "assert";
import { identifiersOnLine } from "../context/identifiers.js";

suite("identifiersOnLine", () => {
  test("extracts identifiers and their columns", () => {
    assert.deepStrictEqual(identifiersOnLine("foo(bar, baz)"), [
      { name: "foo", character: 0 },
      { name: "bar", character: 4 },
      { name: "baz", character: 9 },
    ]);
  });

  test("drops keywords", () => {
    assert.deepStrictEqual(identifiersOnLine("const x = doThing"), [
      { name: "x", character: 6 },
      { name: "doThing", character: 10 },
    ]);
  });

  test("empty / punctuation-only line yields none", () => {
    assert.deepStrictEqual(identifiersOnLine("   (){}.;  "), []);
  });

  test("handles $ and _ in identifiers", () => {
    assert.deepStrictEqual(identifiersOnLine("$el _x2"), [
      { name: "$el", character: 0 },
      { name: "_x2", character: 4 },
    ]);
  });
});
