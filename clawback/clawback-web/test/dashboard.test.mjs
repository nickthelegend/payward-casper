// Unit tests for the Clawback dashboard: the demo state is REAL on-chain data, and the
// dashboard renders only that data (no simulated/random values). No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const state = JSON.parse(readFileSync(join(DIR, "demo-state.json"), "utf8"));
const html = readFileSync(join(DIR, "index.html"), "utf8");

const isHash = (h) => /^[0-9a-f]{64}$/.test(h);
const isDeal = (h) => /^0x[0-9a-f]{64}$/.test(h);

test("demo-state.json is real: 64-hex deploys + escrow on casper-test", () => {
  assert.equal(state.network, "casper-test");
  assert.ok(isHash(state.escrow), "escrow package is a 64-hex hash");
  assert.ok(isHash(state.asset), "asset package is a 64-hex hash");
});

test("honest run carries real open/delivered/release deploys + a meets-spec verdict", () => {
  const h = state.honest;
  assert.ok(isDeal(h.paymentId), "paymentId is a 0x deal id");
  for (const k of ["open", "delivered", "release"]) assert.ok(isHash(h.deploys[k]), `honest.${k} is a real deploy hash`);
  assert.equal(h.verdict, "meets-spec");
  assert.equal(h.outcome, "released");
  assert.ok(h.sellerEarned > 0, "seller earned the escrow");
});

test("bad run carries real open/delivered/dispute/resolve deploys + a refund", () => {
  const b = state.bad;
  for (const k of ["open", "delivered", "dispute", "resolve"]) assert.ok(isHash(b.deploys[k]), `bad.${k} is a real deploy hash`);
  assert.equal(b.verdict, "does-not-meet-spec");
  assert.equal(b.outcome, "refunded");
  assert.ok(b.buyerRefunded > 0, "buyer was refunded");
  assert.equal(b.sellerEarned, 0, "seller earned nothing on the junk delivery");
});

test("dashboard renders ONLY real data — no simulated/random hashes", () => {
  assert.ok(/fetch\(["']demo-state\.json["']\)/.test(html), "loads the real demo state");
  assert.ok(!/\brnd\s*\(/.test(html), "no rnd() simulated-hash generator");
  assert.ok(!/Math\.random/.test(html), "no Math.random");
  assert.ok(html.includes("testnet.cspr.live/deploy/"), "firehose links to real cspr.live deploys");
  assert.ok(html.includes(state.escrow), "references the deployed escrow package");
});
