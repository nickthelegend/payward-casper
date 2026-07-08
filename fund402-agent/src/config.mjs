// Central config + a stderr logger (stdout is reserved for the MCP protocol).
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..");

// Anchor a configured path to the module root when it's relative. Env paths like
// FUND402_TREASURY_PEM=../fund402/.keys/deployer_secret.pem must NOT resolve
// against process.cwd() — the MCP server is spawned by Claude Desktop from an
// arbitrary directory (often "/"), so a cwd-relative key path silently vanishes.
const fromRoot = (p) => (p ? (isAbsolute(p) ? p : join(ROOT, p)) : undefined);

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
  network: process.env.FUND402_NETWORK || "casper:casper-test",
  chainName: process.env.FUND402_CHAIN || "casper-test",
  nodeUrl: process.env.FUND402_NODE_URL || "https://node.testnet.casper.network/rpc",
  csprCloudRest: process.env.CSPR_CLOUD_REST || "https://api.testnet.cspr.cloud",
  csprCloudKey: process.env.CSPR_CLOUD_API_KEY || "",
  facilitatorUrl: process.env.FUND402_FACILITATOR_URL || "https://x402-facilitator.cspr.cloud",
  vaultPackage: strip(process.env.FUND402_VAULT_PACKAGE || "ca4086d3a7b1abf000d0a79e23a237bb484a14807e9438f2c56f3461073e1b2f"),
  cep18Package: strip(process.env.FUND402_CEP18_PACKAGE || "389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0"),
  cep18Name: process.env.FUND402_CEP18_NAME || "Fund402 USDC",
  cep18Version: process.env.FUND402_CEP18_VERSION || "1",
  treasuryPem: fromRoot(process.env.FUND402_TREASURY_PEM) || join(ROOT, "..", "fund402", ".keys", "deployer_secret.pem"),
  walletsDir: fromRoot(process.env.FUND402_WALLETS_DIR) || join(ROOT, ".wallets"),
  groqKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
};

// All human-facing logs go to STDERR so the MCP stdio protocol (stdout) stays clean.
export function log(msg = "") {
  process.stderr.write(String(msg) + "\n");
}
export function explorer(deployHash) {
  return `https://testnet.cspr.live/deploy/${deployHash}`;
}
export function accountExplorer(pub) {
  return `https://testnet.cspr.live/account/${pub}`;
}
