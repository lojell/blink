import * as assert from "assert";
import { FimTemplates } from "../completion/fimTemplates.js";
import type { CompletionRequest } from "../completion/completionEngine.js";

function req(over: Partial<CompletionRequest> = {}): CompletionRequest {
  return { repoName: "workspace", prefix: "", suffix: "", files: [], ...over };
}

suite("FimTemplates", () => {
  const fims = new FimTemplates();

  test("the fim_prefix marker selects the qwen repo-level template", () => {
    const t = fims.get("<|fim_prefix|>");
    assert.strictEqual(
      t.render(req({ prefix: "PRE", suffix: "SUF", filePath: "src/a.ts", repoName: "myrepo" })),
      "<|repo_name|>myrepo\n<|file_sep|>src/a.ts\n<|fim_prefix|>PRE<|fim_suffix|>SUF<|fim_middle|>",
    );
  });

  test("qwen renders context files before the current file", () => {
    const t = fims.get("<|fim_prefix|>");
    assert.strictEqual(
      t.render(req({
        prefix: "PRE",
        suffix: "SUF",
        filePath: "src/cur.ts",
        repoName: "myrepo",
        files: [
          { path: "src/a.ts", content: "AAA" },
          { path: "src/b.ts", content: "BBB" },
        ],
      })),
      "<|repo_name|>myrepo\n" +
        "<|file_sep|>src/a.ts\nAAA\n" +
        "<|file_sep|>src/b.ts\nBBB\n" +
        "<|file_sep|>src/cur.ts\n" +
        "<|fim_prefix|>PRE<|fim_suffix|>SUF<|fim_middle|>",
    );
  });

  test("qwen with no context files renders single-file repo output", () => {
    const t = fims.get("<|fim_prefix|>");
    assert.strictEqual(
      t.render(req({ prefix: "P", suffix: "S", filePath: "a.ts", repoName: "r" })),
      "<|repo_name|>r\n<|file_sep|>a.ts\n<|fim_prefix|>P<|fim_suffix|>S<|fim_middle|>",
    );
  });

  test("qwen's stop list includes the fim and repo tokens", () => {
    const t = fims.get("<|fim_prefix|>");
    assert.ok(t.stop.includes("<|endoftext|>"));
    assert.ok(t.stop.includes("<|repo_name|>"));
    assert.ok(t.stop.includes("<|file_sep|>"));
  });

  test("an unknown marker falls back to the default cursor template", () => {
    const t = fims.get("auto");
    assert.strictEqual(t.render(req({ prefix: "PRE", suffix: "SUF" })), "PRE<|cursor|>SUF");
    assert.deepStrictEqual(t.stop, []);
  });
});
