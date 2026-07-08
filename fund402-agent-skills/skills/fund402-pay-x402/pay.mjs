#!/usr/bin/env node
// fund402-pay-x402 — borrow just-in-time credit from the Fund402 pool and pay an
// x402 (HTTP 402) endpoint, live on Casper. The pool fronts the CEP-18 payment; the
// request is replayed with the payment proof and served.
//
//   FUND402_AGENT_PEM=./agent.pem CSPR_CLOUD_API_KEY=... \
//     node pay.mjs <x402-url>
//
// Tier-3 (trusted) agents borrow with zero collateral (default). For a Tier-1/2 agent
// set FUND402_COLLATERAL_RATIO=1.5 — the SDK auto-approves + escrows the collateral.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const reqCwd = createRequire(join(process.cwd(), "_fund402_resolver_.cjs"));
async function fromCwd(spec) {
  try { return await import(spec); } catch { /* not resolvable from here */ }
  try { return await import(pathToFileURL(reqCwd.resolve(spec)).href); } catch {
    throw new Error(`Cannot find ${spec}. Run \`npm i @nickthelegend69/fund402\` in this directory.`);
  }
}

const CFG = {
  network: process.env.FUND402_NETWORK || "casper:casper-test",
  node: process.env.FUND402_NODE || "https://node.testnet.casper.network/rpc",
  vault: process.env.FUND402_VAULT || "ca4086d3a7b1abf000d0a79e23a237bb484a14807e9438f2c56f3461073e1b2f",
};

const url = process.argv[2];
if (!url) { console.error("usage: node pay.mjs <x402-url>"); process.exit(1); }
const pemPath = process.env.FUND402_AGENT_PEM;
if (!pemPath) { console.error("set FUND402_AGENT_PEM to your agent's ed25519 secret-key PEM path"); process.exit(1); }

const sdk = await fromCwd("@nickthelegend69/fund402");
const pem = readFileSync(pemPath, "utf8");
const priv = await sdk.loadPrivateKey(pem);
const pub = priv.publicKey.toHex();
console.error(`agent ${pub.slice(0, 12)}…  →  ${url}`);

const f = sdk.fund402Fetch({
  network: CFG.network,
  nodeUrl: CFG.node,
  vaultContract: CFG.vault,
  agentSecretKey: pem,
  agentPublicKey: pub,
  collateralRatio: Number(process.env.FUND402_COLLATERAL_RATIO ?? 0), // 0 = Tier-3; 1.5 for Tier-1/2
  onEvent: (e) => console.error("  ·", e.type, JSON.stringify(e.data)),
});

const res = await f(url);
const raw = await res.text();
let body; try { body = JSON.parse(raw); } catch { body = raw; }
const payResp = res.headers.get("payment-response");
const settlement = payResp ? JSON.parse(Buffer.from(payResp, "base64").toString()) : null;

console.log(JSON.stringify({ status: res.status, body, settlement }, null, 2));
if (settlement?.deployHash) {
  console.error(`\n✓ paid via the Fund402 pool — loan opened on-chain.`);
  console.error(`  settlement: https://testnet.cspr.live/deploy/${settlement.deployHash}`);
  console.error(`  to repay later: node repay.mjs <loanId>  (the loan you just opened)`);
}
process.exit(res.status === 200 ? 0 : 1);
