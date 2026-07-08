// Offline tests for the server side (paywall + pure x402 logic). No network.
import { strict as assert } from "node:assert";
import {
  paywall,
  buildPaymentRequirements,
  challengeBody,
  decodePaymentSignature,
  explorerTx,
} from "../dist/index.js";

console.log("server · paywall + x402 logic\n");

const cfg = {
  network: "casper:casper-test",
  payTo: "00" + "ab".repeat(32),
  asset: "ee".repeat(32),
  price: "1000000",
  vaultContract: "66".repeat(32),
  csprCloudApiKey: "test-key",
  asset_meta: { name: "Fund402 USDC", version: "1", decimals: "9", symbol: "F402" },
};

// paywall() validates required config
assert.throws(() => paywall({ asset: cfg.asset, price: "1" }), /payTo/, "requires payTo");
assert.throws(() => paywall({ payTo: cfg.payTo, price: "1" }), /asset/, "requires asset");
const pay = paywall(cfg);
console.log("✓ paywall() config validation");

// buildPaymentRequirements — x402 v2 exact shape
const r = buildPaymentRequirements(cfg, "https://m/v/v1/market", "Fund402 data");
assert.equal(r.scheme, "exact");
assert.equal(r.network, "casper:casper-test");
assert.equal(r.payTo, cfg.payTo, "payTo = merchant");
assert.equal(r.amount, "1000000", "amount = price units");
assert.equal(r.asset, "ee".repeat(32), "asset = CEP-18 package");
assert.equal(r.maxTimeoutSeconds, 900);
assert.equal(r.extra.symbol, "F402");
console.log("✓ buildPaymentRequirements");

// challengeBody — x402 v2 envelope
const c = challengeBody(r);
assert.equal(c.x402Version, 2);
assert.ok(Array.isArray(c.accepts) && c.accepts.length === 1, "accepts[]");
assert.equal(c.error, "payment required");
console.log("✓ challengeBody");

// challenge() — 402 with base64 payment-required header + JSON body
const ch = pay.challenge("https://m/v/v1/market");
assert.equal(ch.status, 402);
assert.ok(ch.headers["payment-required"], "payment-required header present");
const decodedHeader = JSON.parse(Buffer.from(ch.headers["payment-required"], "base64").toString());
assert.equal(decodedHeader.accepts[0].asset, "ee".repeat(32), "header round-trips");
console.log("✓ challenge() 402 + header");

// decodePaymentSignature — base64(JSON) round-trip + malformed → null
const payload = { payload: { settlement: { deployHash: "ab".repeat(32) } } };
const header = Buffer.from(JSON.stringify(payload)).toString("base64");
assert.deepEqual(decodePaymentSignature(header), payload, "decode round-trip");
assert.equal(decodePaymentSignature("@@@not base64 json@@@"), null, "malformed → null");
console.log("✓ decodePaymentSignature");

// guard() — no payment header → 402 challenge (offline, no chain call)
const g = await pay.guard({ method: "GET", url: "https://m/v/v1/market", headers: {} });
assert.equal(g.paid, false, "unpaid");
assert.equal(g.response.status, 402, "challenge returned");
console.log("✓ guard() → 402 when unpaid");

// guard() — malformed payment header → 400 (offline, no chain call)
const gBad = await pay.guard({
  method: "GET",
  url: "https://m/v/v1/market",
  headers: { "payment-signature": "@@@garbage@@@" },
});
assert.equal(gBad.paid, false);
assert.equal(gBad.response.status, 400, "malformed → 400");
console.log("✓ guard() → 400 on malformed payment");

// explorerTx
assert.match(
  explorerTx("casper:casper-test", "ab".repeat(32)),
  /^https:\/\/cspr\.live\/deploy\/[a-f0-9]{64}\?network=casper-test$/
);
console.log("✓ explorerTx");

console.log("\nSERVER CHECKS PASSED ✅");
