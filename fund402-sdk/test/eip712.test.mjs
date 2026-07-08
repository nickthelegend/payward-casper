// EIP-712 TransferWithAuthorization digest — regression + properties.
// The digest format is locked: it is byte-identical to the make-software/casper-x402
// + casper-ecosystem/casper-eip-712 output that the live CSPR.cloud facilitator's
// POST /verify accepts (cross-checked in the agent-sdk's signing test). The pinned
// vector below guards the wire format against accidental drift.
import { strict as assert } from "node:assert";
import { transferAuthorizationDigest, bytesToHex, randomNonce } from "../dist/eip712.js";

const domain = {
  name: "Fund402 USDC",
  version: "1",
  chainName: "casper:casper-test",
  contractPackageHash: "ee".repeat(32),
};
const msg = {
  from: "00" + "11".repeat(32),
  to: "00" + "22".repeat(32),
  value: "1000000",
  validAfter: "1000",
  validBefore: "2000",
  nonce: "ab".repeat(32),
};

console.log("eip712 · TransferWithAuthorization digest\n");

// 1. Pinned known-answer vector (locks the facilitator-accepted wire format).
const PINNED = "dead770e830cb1cf8d6dcf4663d9d51b3c9c592399149230e3b14848a6326b51";
const d = transferAuthorizationDigest(domain, msg);
assert.equal(d.length, 32, "digest is 32 bytes");
assert.equal(bytesToHex(d), PINNED, "digest matches pinned vector");
console.log("✓ known-answer vector");

// 2. Determinism — same inputs → same digest.
assert.equal(bytesToHex(transferAuthorizationDigest(domain, msg)), PINNED, "deterministic");
console.log("✓ deterministic");

// 3. Sensitivity — any field change flips the digest.
for (const mut of [
  { ...msg, value: "1000001" },
  { ...msg, to: "00" + "23".repeat(32) },
  { ...msg, nonce: "ac".repeat(32) },
  { ...msg, validBefore: "2001" },
]) {
  assert.notEqual(bytesToHex(transferAuthorizationDigest(domain, mut)), PINNED, "mutation changes digest");
}
assert.notEqual(
  bytesToHex(transferAuthorizationDigest({ ...domain, name: "Other" }, msg)),
  PINNED,
  "domain change changes digest"
);
console.log("✓ sensitivity (message + domain)");

// 4. randomNonce — 32-byte hex, non-repeating.
const n1 = randomNonce(), n2 = randomNonce();
assert.match(n1, /^[0-9a-f]{64}$/, "nonce is 32-byte hex");
assert.notEqual(n1, n2, "nonce is random");
console.log("✓ randomNonce");

console.log("\nEIP-712 CHECKS PASSED ✅");
