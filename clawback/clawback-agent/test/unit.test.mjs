// Unit tests for clawback-agent pure logic (no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashSpec, hashResponse, dealId, randomSalt } from "../src/hash.mjs";
import { evaluateDelivery } from "../src/groq.mjs";
import { TOOLS, TOOL_MAP } from "../src/index.mjs";

test("hashes are deterministic, prefixed, and sensitive", () => {
  assert.equal(hashSpec("a"), hashSpec("a"));
  assert.match(hashSpec("a"), /^0x[0-9a-f]{64}$/);
  assert.notEqual(hashSpec("a"), hashSpec("b"));
  assert.notEqual(hashResponse({ ok: true }), hashResponse({ ok: false }));
});

test("dealId commits to the parties + terms + salt", () => {
  const base = { buyer: "b", seller: "s", amount: 1000000, window: 3600000, specHash: hashSpec("x"), salt: "0xabcd" };
  assert.equal(dealId(base), dealId(base));
  assert.notEqual(dealId(base), dealId({ ...base, salt: "0xbeef" }));
  assert.notEqual(dealId(base), dealId({ ...base, amount: 2 }));
  assert.match(randomSalt(), /^0x[0-9a-f]{32}$/);
});

test("evaluateDelivery: good payload meets spec, junk does not", () => {
  const good = evaluateDelivery("BTC-USD price feed status ok pair price source", { status: "ok", pair: "BTC-USD", price: 1, source: "oracle" });
  assert.equal(good.deliveredOk, true);
  const bad = evaluateDelivery("BTC-USD price feed", { status: "error", body: "junk response with no requested data" });
  assert.equal(bad.deliveredOk, false);
  assert.equal(bad.verdict, "does-not-meet-spec");
});

test("tool registry: 12 well-formed tools incl. the clawback flow", () => {
  assert.equal(TOOLS.length, 12);
  for (const t of TOOLS) {
    assert.equal(typeof t.name, "string");
    assert.ok(t.description.length > 10, `${t.name} description`);
    assert.equal(t.inputSchema?.type, "object", `${t.name} schema`);
    assert.equal(typeof t.handler, "function", `${t.name} handler`);
    assert.equal(TOOL_MAP[t.name], t);
  }
  for (const need of ["clawback_discover", "clawback_purchase", "clawback_inspect_delivery", "clawback_release", "clawback_dispute", "clawback_resolve", "clawback_get_status"])
    assert.ok(TOOL_MAP[need], `missing tool ${need}`);
});
