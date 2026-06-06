import * as assert from "assert";
import { OpenAICompletionClient } from "../clients/openai/openAiClient.js";
import { openAiModel } from "./fixtures.js";

suite("OpenAICompletionClient", () => {
  test("getFimPrefix returns the configured model's fim token", async () => {
    const c = new OpenAICompletionClient();
    c.setConfig(openAiModel({ fim: "<|fim_prefix|>" }));
    assert.strictEqual(await c.getFimPrefix(), "<|fim_prefix|>");
  });

  test("getFimPrefix is null before setConfig (engine falls back to the auto template)", async () => {
    const c = new OpenAICompletionClient();
    assert.strictEqual(await c.getFimPrefix(), null);
  });

  test("config exposes the applied model", () => {
    const c = new OpenAICompletionClient();
    const m = openAiModel();
    c.setConfig(m);
    assert.strictEqual(c.config, m);
  });
});
