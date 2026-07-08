// Unit tests for fund402-agent pure logic (no network). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { transferAuthorizationDigest, bytesToHex, randomNonce } from "../src/eip712.mjs";
import { motes, pkgHex, u256, accountKey, pkgKey } from "../src/casper.mjs";
import { TOOLS, TOOL_MAP, CFG } from "../src/index.mjs";

const DOMAIN = { name: "Fund402 USDC", version: "1", chainName: "casper:casper-test", contractPackageHash: "ee".repeat(32) };
const MSG = { from: "00" + "11".repeat(32), to: "00" + "22".repeat(32), value: "1000000", validAfter: "1000", validBefore: "2000", nonce: "ab".repeat(32) };
// Same vector the SDK + canonical casper-eip-712 produce (facilitator-accepted).
const PINNED = "dead770e830cb1cf8d6dcf4663d9d51b3c9c592399149230e3b14848a6326b51";

test("eip712: digest matches the canonical / facilitator-accepted vector", () => {
  const d = transferAuthorizationDigest(DOMAIN, MSG);
  assert.equal(d.length, 32);
  assert.equal(bytesToHex(d), PINNED);
});

test("eip712: deterministic + sensitive to every field", () => {
  assert.equal(bytesToHex(transferAuthorizationDigest(DOMAIN, MSG)), PINNED);
  for (const mut of [
    { ...MSG, value: "1000001" },
    { ...MSG, to: "00" + "23".repeat(32) },
    { ...MSG, nonce: "ac".repeat(32) },
  ]) assert.notEqual(bytesToHex(transferAuthorizationDigest(DOMAIN, mut)), PINNED);
  assert.notEqual(bytesToHex(transferAuthorizationDigest({ ...DOMAIN, name: "X" }, MSG)), PINNED);
});

test("eip712: randomNonce is 32-byte hex, non-repeating", () => {
  const a = randomNonce(), b = randomNonce();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("casper helpers: motes + pkgHex", () => {
  assert.equal(motes(1), "1000000000");
  assert.equal(motes(0.001), "1000000");
  assert.equal(pkgHex("hash-abc"), "abc");
  assert.equal(pkgHex("contract-package-def"), "def");
  assert.equal(pkgHex("ee"), "ee");
});

test("casper helpers: CLValue encoders don't throw", () => {
  assert.ok(u256(1000000));
  assert.ok(accountKey("ab".repeat(32)));
  assert.ok(pkgKey("hash-" + "cd".repeat(32)));
});

test("tools: exactly 12 well-formed tools, TOOL_MAP consistent", () => {
  assert.equal(TOOLS.length, 12);
  for (const t of TOOLS) {
    assert.equal(typeof t.name, "string");
    assert.ok(t.name.length > 0);
    assert.equal(typeof t.description, "string");
    assert.ok(t.description.length > 10, `${t.name} needs a real description`);
    assert.equal(t.inputSchema?.type, "object", `${t.name} inputSchema.type`);
    assert.equal(typeof t.handler, "function", `${t.name} handler`);
    assert.equal(TOOL_MAP[t.name], t);
  }
  assert.equal(Object.keys(TOOL_MAP).length, 12);
});

test("tools: the core agent capabilities are present", () => {
  const names = new Set(TOOLS.map((t) => t.name));
  for (const need of ["create_wallet", "fund_wallet_cspr", "award_reputation", "borrow_and_pay", "repay_loan", "sign_x402_payment", "get_pool_stats"])
    assert.ok(names.has(need), `missing tool: ${need}`);
});

test("config: live casper-test defaults + 64-hex package hashes", () => {
  assert.equal(CFG.network, "casper:casper-test");
  assert.equal(CFG.chainName, "casper-test");
  assert.match(CFG.vaultPackage, /^[0-9a-f]{64}$/);
  assert.match(CFG.cep18Package, /^[0-9a-f]{64}$/);
  assert.equal(CFG.cep18Name, "Fund402 USDC");
});
