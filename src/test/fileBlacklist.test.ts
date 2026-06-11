import * as assert from "assert";
import { matchDisabledFile, patternForFile } from "../config/fileBlacklist.js";

suite("matchDisabledFile", () => {
  test("matches a basename against a *.ext glob", () => {
    assert.strictEqual(matchDisabledFile("README.md", ["*.md"]), "*.md");
  });

  test("returns undefined when nothing matches", () => {
    assert.strictEqual(matchDisabledFile("index.ts", ["*.md", "*.markdown"]), undefined);
  });

  test("returns the first matching pattern", () => {
    assert.strictEqual(matchDisabledFile("notes.md", ["*.txt", "*.md", "notes.*"]), "*.md");
  });

  test("matching is case-insensitive", () => {
    assert.strictEqual(matchDisabledFile("README.MD", ["*.md"]), "*.md");
  });

  test("? matches exactly one character", () => {
    assert.strictEqual(matchDisabledFile("a1.ts", ["a?.ts"]), "a?.ts");
    assert.strictEqual(matchDisabledFile("a12.ts", ["a?.ts"]), undefined);
  });

  test("the pattern must cover the whole basename (no substring match)", () => {
    assert.strictEqual(matchDisabledFile("foo.md.ts", ["*.md"]), undefined);
  });

  test("regex metacharacters in patterns are literal (dot does not become any-char)", () => {
    assert.strictEqual(matchDisabledFile("axmd", ["*.md"]), undefined);
  });

  test("exact-basename entries match files without extensions", () => {
    assert.strictEqual(matchDisabledFile("Makefile", ["Makefile"]), "Makefile");
  });

  test("empty and whitespace-only patterns never match and never throw", () => {
    assert.strictEqual(matchDisabledFile("a.md", ["", "   "]), undefined);
  });

  test("empty pattern list matches nothing", () => {
    assert.strictEqual(matchDisabledFile("a.md", []), undefined);
  });
});

suite("patternForFile", () => {
  test("file with extension -> *.ext", () => {
    assert.strictEqual(patternForFile("index.ts"), "*.ts");
  });

  test("multi-dot name uses the last extension", () => {
    assert.strictEqual(patternForFile("app.test.ts"), "*.ts");
  });

  test("no extension -> exact basename", () => {
    assert.strictEqual(patternForFile("Makefile"), "Makefile");
  });

  test("dotfile counts as extensionless -> exact basename", () => {
    assert.strictEqual(patternForFile(".gitignore"), ".gitignore");
  });

  test("trailing dot -> exact basename", () => {
    assert.strictEqual(patternForFile("weird."), "weird.");
  });
});
