// Deterministic hashes for Clawback deals (keccak-256, hex with 0x prefix).
import { keccak_256 } from "@noble/hashes/sha3";

const enc = new TextEncoder();
const hex = (b) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

const canon = (v) => (typeof v === "string" ? v : JSON.stringify(v ?? ""));

export const hashSpec = (spec) => hex(keccak_256(enc.encode(canon(spec))));
export const hashResponse = (response) => hex(keccak_256(enc.encode(canon(response))));

/** A unique deal id committing to the parties + terms (the on-chain escrow key). */
export function dealId({ buyer, seller, amount, window, specHash, salt }) {
  const s = `${buyer}|${seller}|${amount}|${window}|${specHash}|${salt}`;
  return hex(keccak_256(enc.encode(s)));
}

export function randomSalt() {
  const b = new Uint8Array(16);
  (globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(b) : b.fill(0));
  return hex(b);
}
