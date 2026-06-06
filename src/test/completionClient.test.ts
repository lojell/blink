import * as assert from "assert";
import { OpenAICompletionClient } from "../clients/openai/openAiClient.js";
import { openAiModel } from "./fixtures.js";

function fakeFetch(captured: { url?: string; body?: any; headers?: any }) {
  return async (url: any, init: any): Promise<Response> => {
    captured.url = String(url);
    captured.headers = init.headers;
    captured.body = JSON.parse(init.body);
    return new Response(
      JSON.stringify({ choices: [{ text: "  completed()" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}

suite("OpenAICompletionClient", () => {
  test("POSTs to /v1/completions with prompt, model, stop and bearer key", async () => {
    const captured: any = {};
    const client = new OpenAICompletionClient(fakeFetch(captured) as any);
    client.setConfig(openAiModel({
      apiBaseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      modelId: "qwen2.5-coder",
      maxTokens: 256,
      requestTimeoutMs: 3000,
    }));

    const text = await client.complete("PROMPT", ["<|endoftext|>"], new AbortController().signal);

    assert.strictEqual(text, "  completed()");
    assert.strictEqual(captured.url, "https://api.example.com/v1/completions");
    assert.strictEqual(captured.body.model, "qwen2.5-coder");
    assert.strictEqual(captured.body.prompt, "PROMPT");
    assert.strictEqual(captured.body.max_tokens, 256);
    assert.strictEqual(captured.body.temperature, 0);
    assert.deepStrictEqual(captured.body.stop, ["<|endoftext|>"]);
    assert.strictEqual(captured.headers.Authorization, "Bearer sk-test");
  });

  test("returns '' when complete is called before setConfig", async () => {
    const client = new OpenAICompletionClient((async () => new Response("{}")) as any);
    const text = await client.complete("p", [], new AbortController().signal);
    assert.strictEqual(text, "");
  });

  test("returns empty string on a non-200 response", async () => {
    const errFetch = async (): Promise<Response> =>
      new Response("rate limited", { status: 429 });
    const client = new OpenAICompletionClient(errFetch as any);
    client.setConfig(openAiModel({ apiBaseUrl: "https://x/v1", apiKey: "k", modelId: "m", maxTokens: 10, requestTimeoutMs: 1000 }));
    const text = await client.complete("P", [], new AbortController().signal);
    assert.strictEqual(text, "");
  });

  test("normalizes a baseUrl that already ends with a slash", async () => {
    const captured: any = {};
    const client = new OpenAICompletionClient(fakeFetch(captured) as any);
    client.setConfig(openAiModel({ apiBaseUrl: "https://api.example.com/v1/", apiKey: "k", modelId: "m", maxTokens: 10, requestTimeoutMs: 1000 }));
    await client.complete("P", [], new AbortController().signal);
    assert.strictEqual(captured.url, "https://api.example.com/v1/completions");
  });

  test("returns empty string when the caller signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    let fetchCalled = false;
    const hangFetch = (() => {
      fetchCalled = true;
      return new Promise<Response>(() => {}); // never resolves
    });
    const client = new OpenAICompletionClient(hangFetch as any);
    client.setConfig(openAiModel({ apiBaseUrl: "https://x/v1", apiKey: "k", modelId: "m", maxTokens: 10, requestTimeoutMs: 60000 }));
    const text = await client.complete("P", [], ctrl.signal);
    assert.strictEqual(text, "");
    void fetchCalled;
  });
});
