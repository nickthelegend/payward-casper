// LIVE end-to-end proof of the COLLATERALIZED (Tier-1/2) path through the SDK.
//
// Unlike the Tier-3 flow, here the agent has NO reputation, so the vault requires
// 150% collateral. fund402Fetch (autoApprove, default) must therefore:
//   1. approve the vault on the CEP-18 asset for the collateral, then
//   2. borrow_and_pay — the vault escrows the collateral via transfer_from and
//      fronts the payment to the merchant.
// This exercises real CEP-18 escrow end-to-end through the published SDK.
//
// Run:  node test/e2e-collateral.mjs   (needs a funded Tier-1 wallet `borrower`,
// see the setup in the surrounding task; reads CSPR key from ../../fund402-agent/.env)

import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fund402Fetch, paywall, loadPrivateKey, agentTaggedAddress } from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const p = (...x) => join(HERE, "..", "..", ...x);

const NETWORK = "casper:casper-test";
const NODE = "https://node.testnet.casper.network/rpc";
const VAULT = "664d99de146b9b573161a387d89fefc649677351d8a6d2acbe22109bf88f6b12";
const ASSET = "389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0";
const PRICE = "1000000"; // borrow 0.001 F402 → 150% = 1,500,000 collateral

const envTxt = readFileSync(p("fund402-agent", ".env"), "utf8");
const CSPR_KEY = (envTxt.match(/CSPR_CLOUD_API_KEY\s*=\s*(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const REST = "https://api.testnet.cspr.cloud";

const treasuryPriv = await loadPrivateKey(readFileSync(p("fund402", ".keys", "deployer_secret.pem"), "utf8"));
const MERCHANT = agentTaggedAddress(treasuryPriv.publicKey.toHex());

// the Tier-1 agent (no reputation) funded with CSPR + F402 collateral
const reg = JSON.parse(readFileSync(p("fund402-agent", ".wallets", "wallets.json"), "utf8"));
if (!reg.borrower) throw new Error("wallet `borrower` not found — run the setup first");
const BORROWER_PUB = reg.borrower.publicKey;
const borrowerPem = readFileSync(p("fund402-agent", ".wallets", "borrower.pem"), "utf8");

const log = (...a) => console.error(...a);
log("\n=== Fund402 SDK · LIVE Tier-1 COLLATERAL e2e (casper-test) ===");
log("agent (Tier 1, collateralized):", BORROWER_PUB.slice(0, 16) + "…");
log("borrow:", PRICE, "→ 150% collateral = 1500000 (escrowed via transfer_from)\n");

const pay = paywall({
  network: NETWORK, payTo: MERCHANT, asset: ASSET, price: PRICE, vaultContract: VAULT,
  csprCloudApiKey: CSPR_KEY,
  asset_meta: { name: "Fund402 USDC", version: "1", decimals: "9", symbol: "F402" },
});

const server = http.createServer(async (req, res) => {
  const url = `http://${req.headers.host}${req.url}`;
  const g = await pay.guard({ method: req.method, url, headers: req.headers });
  if (!g.paid) { res.writeHead(g.response.status, g.response.headers); return res.end(JSON.stringify(g.response.body)); }
  res.setHeader("payment-response", g.paymentResponseHeader);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ secret: "🔓 collateralized borrow unlocked the resource", deployHash: g.deployHash }));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const RESOURCE = `http://127.0.0.1:${server.address().port}/v/vault_1/price/ETH-USD`;

let pass = false, deployHash = null, sawApprove = false;
const f = fund402Fetch({
  network: NETWORK, nodeUrl: NODE, vaultContract: VAULT,
  agentSecretKey: borrowerPem, agentPublicKey: BORROWER_PUB,
  collateralRatio: 1.5, // Tier 1 → must over-collateralize; autoApprove (default) handles the approve
  onEvent: (e) => {
    log("  [client] ·", e.type, JSON.stringify(e.data));
    if (e.type === "approving" || e.type === "approve_submitted") sawApprove = true;
  },
});

try {
  log("  [client] GET", RESOURCE);
  const res = await f(RESOURCE);
  const body = await res.json();
  deployHash = body?.deployHash;
  log("  [client] final status:", res.status, "| body:", JSON.stringify(body));

  // verify the on-chain borrow actually escrowed 150% collateral
  let collateralArg = null, status = null;
  if (deployHash) {
    const d = (await (await fetch(`${REST}/deploys/${deployHash}`, { headers: { Authorization: CSPR_KEY } })).json())?.data ?? {};
    collateralArg = d?.args?.collateral?.parsed;
    status = d.status;
    log("  [chain] deploy status:", status, "| collateral arg:", collateralArg, "| amount:", d?.args?.amount?.parsed);
  }
  pass = res.status === 200 && !!body?.secret && sawApprove && collateralArg === "1500000" && status === "processed";
} catch (e) {
  log("  [client] ERROR:", e?.message ?? e);
}
server.close();

if (pass) {
  log("\nLIVE COLLATERAL E2E PASSED ✅ — Tier-1 agent approved + escrowed 1.5M collateral, pool settled the borrow.");
  log("  settlement deploy: https://testnet.cspr.live/deploy/" + deployHash);
  process.exit(0);
} else {
  log("\nLIVE COLLATERAL E2E FAILED ❌  (approve seen:", sawApprove + ")");
  process.exit(1);
}
