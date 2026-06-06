import * as assert from "assert";
import { CompletionComposer } from "../context/composer.js";
import type { IEditTracker } from "../edits/editTracker.js";
import type { ILspContextProvider } from "../context/lspContext.js";
import type { ContextFile } from "../edits/editTracker.js";
import { globalConfig } from "./fixtures.js";

function fakeEdits(out: ContextFile[]): IEditTracker {
  return { record() {}, select: () => out };
}
function fakeLsp(out: ContextFile[]): ILspContextProvider {
  return { collect: async () => out, clear() {} };
}

// Minimal vscode.TextDocument / Position stand-ins: compose() only touches
// isUntitled, getText(), and offsetAt(position).
function fakeDoc(text: string): never {
  return {
    isUntitled: true,
    getText: () => text,
    offsetAt: (p: { offset: number }) => p.offset,
  } as never;
}
const pos = (offset: number) => ({ offset } as never);

suite("CompletionComposer", () => {
  test("splits the document into prefix and suffix at the cursor", async () => {
    const c = new CompletionComposer(fakeEdits([]), fakeLsp([]));
    const text = "const x = 1";
    const out = await c.compose(fakeDoc(text), pos("const x = ".length), globalConfig());
    assert.strictEqual(out.prefix, "const x = ");
    assert.strictEqual(out.suffix, "1");
  });

  test("untitled documents have no file path and no context files", async () => {
    const c = new CompletionComposer(fakeEdits([{ path: "e.ts", content: "E" }]), fakeLsp([]));
    const out = await c.compose(fakeDoc("abc"), pos(3), globalConfig());
    assert.strictEqual(out.filePath, undefined);
    assert.deepStrictEqual(out.files, []);
    assert.strictEqual(typeof out.repoName, "string");
  });
});
