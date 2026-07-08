// x402 `exact` EIP-712 — the casper-eip-712 TransferWithAuthorization digest the
// CSPR.cloud facilitator verifies. Cross-checked byte-identical to the canonical
// package in the fund402 agent-sdk signing test. Sign with casper-js-sdk's
// signAndAddAlgorithmBytes (65-byte [algo|sig]) — same as the official client.
import { keccak_256 } from "@noble/hashes/sha3";
import { CFG } from "./config.mjs";

const enc = new TextEncoder();
const concat = (...parts) => {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const keccak = (...parts) => keccak_256(concat(...parts));
const hexToBytes = (hex) => {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
};
export const bytesToHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const uint256 = (value) => {
  let v = BigInt(value);
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
};
const typeHash = (s) => keccak_256(enc.encode(s));
const encodeAddress = (addr) => keccak_256(hexToBytes(addr)); // 33-byte tagged → keccak

const DOMAIN_TYPE = "EIP712Domain(string name,string version,string chain_name,bytes32 contract_package_hash)";
const MESSAGE_TYPE = "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)";

function domainSeparator(d) {
  return keccak(
    typeHash(DOMAIN_TYPE),
    keccak_256(enc.encode(d.name)),
    keccak_256(enc.encode(d.version)),
    keccak_256(enc.encode(d.chainName)),
    hexToBytes(d.contractPackageHash)
  );
}
function structHash(m) {
  return keccak(
    typeHash(MESSAGE_TYPE),
    encodeAddress(m.from),
    encodeAddress(m.to),
    uint256(m.value),
    uint256(m.validAfter),
    uint256(m.validBefore),
    hexToBytes(m.nonce)
  );
}
export function transferAuthorizationDigest(domain, message) {
  return keccak(new Uint8Array([0x19, 0x01]), domainSeparator(domain), structHash(message));
}
export function randomNonce() {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return bytesToHex(b);
}

/**
 * Build the x402 v2 `exact` PaymentPayload for an agent paying `to` for `amount`
 * of the CEP-18 asset, signed with the agent's private key (casper-js-sdk).
 */
export function buildX402Payload(priv, { asset, payTo, amount, name, version, network, maxTimeoutSeconds = 300 }) {
  const assetPkg = String(asset).replace(/^(hash-|0x)/, "");
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 600;
  const validBefore = now + maxTimeoutSeconds;
  const nonce = randomNonce();
  const from = "00" + priv.publicKey.accountHash().toHex();
  const to = String(payTo);
  const digest = transferAuthorizationDigest(
    { name: name || CFG.cep18Name, version: version || CFG.cep18Version, chainName: network || CFG.network, contractPackageHash: assetPkg },
    { from, to, value: String(amount), validAfter: String(validAfter), validBefore: String(validBefore), nonce }
  );
  const signature = bytesToHex(priv.signAndAddAlgorithmBytes(digest));
  const requirements = {
    scheme: "exact",
    network: network || CFG.network,
    asset: assetPkg,
    payTo: to,
    amount: String(amount),
    maxTimeoutSeconds,
    extra: { name: name || CFG.cep18Name, version: version || CFG.cep18Version },
  };
  return {
    x402Version: 2,
    accepted: requirements,
    paymentRequirements: requirements,
    payload: {
      signature,
      publicKey: priv.publicKey.toHex(),
      authorization: { from, to, value: String(amount), validAfter: String(validAfter), validBefore: String(validBefore), nonce },
    },
  };
}

/** POST the payload to the live facilitator /verify (needs the CSPR.cloud key). */
export async function verifyWithFacilitator(built) {
  if (!CFG.csprCloudKey) return { isValid: false, invalidReason: "CSPR_CLOUD_API_KEY not set" };
  const body = {
    paymentPayload: {
      x402Version: 2,
      resource: { url: "fund402-agent://x402" },
      accepted: built.accepted,
      payload: built.payload,
    },
    paymentRequirements: built.paymentRequirements,
  };
  const res = await fetch(`${CFG.facilitatorUrl}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: CFG.csprCloudKey },
    body: JSON.stringify(body),
  });
  return await res.json().catch(() => ({ isValid: false, invalidReason: `HTTP ${res.status}` }));
}
