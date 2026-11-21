import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { complete, LlmError } from "../src/lib/llm/index.ts";

const KEYS = ["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "LLM_PROVIDER", "LLM_FALLBACK", "ANTHROPIC_MODEL_STANDARD"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  process.env.ANTHROPIC_API_KEY = "sk-ant-TESTSECRETVALUE123456";
  process.env.OPENROUTER_API_KEY = "sk-or-v1-TESTSECRETVALUE123456";
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const REQ = { system: "SYS", user: "USER", tier: "standard" as const, maxTokens: 1000 };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

interface Call { url: string; headers: Record<string, string>; body: any }
function mockFetch(handlers: Array<(c: Call) => Response>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    const call = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
    calls.push(call);
    const h = handlers[Math.min(calls.length - 1, handlers.length - 1)];
    return h(call);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const anthropicOk = () =>
  json(200, {
    content: [{ type: "text", text: "Bonjour" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 7 },
  });

test("Anthropic : requête, cache de prompt et usage", async () => {
  const { fn, calls } = mockFetch([anthropicOk]);
  const r = await complete(REQ, fn);
  assert.equal(r.text, "Bonjour");
  assert.equal(r.provider, "anthropic");
  assert.equal(r.model, "claude-sonnet-5-5");
  assert.deepEqual(r.usage, { input: 10, output: 20, cacheRead: 5, cacheWrite: 7 });
  const c = calls[0];
  assert.equal(c.url, "https://api.anthropic.com/v1/messages");
  assert.equal(c.headers["x-api-key"], "sk-ant-TESTSECRETVALUE123456");
  assert.equal(c.headers["anthropic-version"], "2023-06-01");
  assert.deepEqual(c.body.system, [{ type: "text", text: "SYS", cache_control: { type: "ephemeral" } }]);
  assert.deepEqual(c.body.messages, [{ role: "user", content: "USER" }]);
  assert.equal(c.body.max_tokens, 1000);
});

test("réponse tronquée → erreur explicite non rejouable", async () => {
  const { fn, calls } = mockFetch([() => json(200, { content: [{ type: "text", text: "x…" }], stop_reason: "max_tokens", usage: {} })]);
  await assert.rejects(complete(REQ, fn), (e: unknown) => e instanceof LlmError && /tronquée/.test(e.message) && !e.retryable);
  assert.equal(calls.length, 1);
});

test("repli sur OpenRouter quand Anthropic est saturé (529)", async () => {
  const { fn, calls } = mockFetch([
    () => json(529, { error: { message: "overloaded" } }),
    () =>
      json(200, {
        choices: [{ message: { content: "Salut" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 60 } },
      }),
  ]);
  const r = await complete(REQ, fn);
  assert.equal(r.provider, "openrouter");
  assert.equal(r.model, "anthropic/claude-sonnet-5.5");
  assert.deepEqual(r.usage, { input: 40, output: 30, cacheRead: 60, cacheWrite: 0 });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(calls[1].headers.authorization, "Bearer sk-or-v1-TESTSECRETVALUE123456");
  assert.equal(calls[1].body.messages[0].role, "system");
  assert.deepEqual(calls[1].body.messages[0].content[0].cache_control, { type: "ephemeral" });
});

test("repli aussi quand le crédit Anthropic est épuisé", async () => {
  const { fn, calls } = mockFetch([
    () => json(400, { error: { message: "Your credit balance is too low to access the Anthropic API." } }),
    () => json(200, { choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: {} }),
  ]);
  assert.equal((await complete(REQ, fn)).provider, "openrouter");
  assert.equal(calls.length, 2);
});

test("pas de repli sur une erreur non rejouable (clé invalide 401)", async () => {
  const { fn, calls } = mockFetch([() => json(401, { error: { message: "invalid x-api-key" } })]);
  await assert.rejects(complete(REQ, fn), (e: unknown) => e instanceof LlmError && e.status === 401 && !e.retryable);
  assert.equal(calls.length, 1);
});

test("pas de repli si LLM_FALLBACK=off ou clé absente", async () => {
  process.env.LLM_FALLBACK = "off";
  const a = mockFetch([() => json(503, {})]);
  await assert.rejects(complete(REQ, a.fn), LlmError);
  assert.equal(a.calls.length, 1);

  delete process.env.LLM_FALLBACK;
  delete process.env.OPENROUTER_API_KEY;
  const b = mockFetch([() => json(503, {})]);
  await assert.rejects(complete(REQ, b.fn), LlmError);
  assert.equal(b.calls.length, 1);
});

test("OpenRouter seul : requête correcte", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { fn, calls } = mockFetch([() => json(200, { choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: {} })]);
  const r = await complete({ ...REQ, tier: "economy" }, fn);
  assert.equal(r.model, "anthropic/claude-haiku-5.5");
  assert.equal(calls[0].body.model, "anthropic/claude-haiku-5.5");
});

test("OpenRouter : refuse les fournisseurs qui conservent les prompts (data_collection=deny)", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const ok = () => json(200, { choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: {} });
  const a = mockFetch([ok]);
  await complete(REQ, a.fn);
  assert.deepEqual(a.calls[0].body.provider, { data_collection: "deny" });
  process.env.OPENROUTER_DATA_COLLECTION = "allow";
  try {
    const b = mockFetch([ok]);
    await complete(REQ, b.fn);
    assert.deepEqual(b.calls[0].body.provider, { data_collection: "allow" });
  } finally {
    delete process.env.OPENROUTER_DATA_COLLECTION;
  }
});

test("aucune clé → erreur claire", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  await assert.rejects(complete(REQ, mockFetch([anthropicOk]).fn), /Aucune clé IA/);
});

test("les messages d'erreur ne recopient jamais une clé", async () => {
  const { fn } = mockFetch([() => new Response("bad key sk-ant-abcdef0123456789SECRETSECRET", { status: 401 })]);
  await assert.rejects(complete(REQ, fn), (e: unknown) => e instanceof Error && !/SECRETSECRET/.test(e.message));
});
