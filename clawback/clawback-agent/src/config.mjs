// Clawback agent config + a stderr logger (stdout reserved for MCP).
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..");

// Minimal .env loader (no dependency).
const envPath = join(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const strip = (s) => String(s || "").replace(/^(hash-|contract-package-|package-)/, "");

export const CFG = {
  network: process.env.CLAWBACK_NETWORK || "casper:casper-test",
  chainName: process.env.CLAWBACK_CHAIN || "casper-test",
  nodeUrl: process.env.CLAWBACK_NODE_URL || "https://node.testnet.casper.network/rpc",
  csprCloudRest: process.env.CSPR_CLOUD_REST || "https://api.testnet.cspr.cloud",
  csprCloudKey: process.env.CSPR_CLOUD_API_KEY || "",
  // ClawbackEscrow package (set after deploy via .env CLAWBACK_ESCROW_PACKAGE).
  escrowPackage: strip(process.env.CLAWBACK_ESCROW_PACKAGE || ""),
  // Settlement CEP-18 — reuse the Fund402 USDC (F402).
  cep18Package: strip(process.env.CLAWBACK_CEP18_PACKAGE || "389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0"),
  cep18Name: process.env.CLAWBACK_CEP18_NAME || "Fund402 USDC",
  // Admin / liquidity / default verifier keys (the AI attester signs `resolve`).
  treasuryPem: process.env.CLAWBACK_TREASURY_PEM || join(ROOT, "..", "..", "fund402", ".keys", "deployer_secret.pem"),
  verifierPem: process.env.CLAWBACK_VERIFIER_PEM || join(ROOT, "..", "..", "fund402", ".keys", "deployer_secret.pem"),
  walletsDir: process.env.CLAWBACK_WALLETS_DIR || join(ROOT, ".wallets"),
  groqKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  // default dispute window (ms) — block_time is ms on Casper.
  windowMs: Number(process.env.CLAWBACK_WINDOW_MS || 3_600_000),
};

export function log(msg = "") {
  process.stderr.write(String(msg) + "\n");
}
export function explorer(deployHash) {
  return `https://testnet.cspr.live/deploy/${deployHash}`;
}
export function accountExplorer(pub) {
  return `https://testnet.cspr.live/account/${pub}`;
}
