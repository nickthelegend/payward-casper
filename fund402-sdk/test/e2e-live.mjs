// LIVE end-to-end proof, on Casper testnet, of the whole SDK loop:
//
//   [server]  an x402-gated HTTP endpoint built with paywall()  ── settled by ──┐
//   [client]  an agent paying it with fund402Fetch()                            │
//   [chain]   the deployed Fund402 vault (lending pool) fronts the CEP-18  ◄─────┘
//             payment to the merchant; the server verifies that on-chain.
//
// Run:  npm run test:e2e
// Needs: CSPR.cloud key (read from ../../fund402-agent/.env), the funded Tier-3
// `ada` wallet (../../fund402-agent/.wallets/ada.pem) and the treasury key
// (../../fund402/.keys/deployer_secret.pem) as the merchant. Makes a REAL deploy.

import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fund402Fetch, paywall, loadPrivateKey, agentTaggedAddress } from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const p = (...x) => join(HERE, "..", "..", ...x);

// ---- config (the deployed Fund402 testnet contracts) ----
const NETWORK = "casper:casper-test";
const NODE = "https://node.testnet.casper.network/rpc";
const VAULT = "664d99de146b9b573161a387d89fefc649677351d8a6d2acbe22109bf88f6b12"; // vault package
const ASSET = "389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0"; // CEP-18 package (F402)
const PRICE = "1000000"; // 0.001 F402

const envTxt = readFileSync(p("fund402-agent", ".env"), "utf8");
const CSPR_KEY = (envTxt.match(/CSPR_CLOUD_API_KEY\s*=\s*(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (!CSPR_KEY) throw new Error("CSPR_CLOUD_API_KEY not found in fund402-agent/.env");

// merchant = the treasury account (it receives the F402 the pool fronts)
const treasuryPriv = await loadPrivateKey(readFileSync(p("fund402", ".keys", "deployer_secret.pem"), "utf8"));
const MERCHANT = agentTaggedAddress(treasuryPriv.publicKey.toHex());

// paying agent = the funded, Tier-3 `ada` wallet (zero-collateral borrows)
const adaPem = readFileSync(p("fund402-agent", ".wallets", "ada.pem"), "utf8");
const ADA_PUB = "01baa8d850814f2219b124f8f9ccc2b0c7ea21dc519569a3f94804a9d43eb7a503";

const log = (...a) => console.error(...a);
log("\n=== Fund402 SDK · LIVE end-to-end (casper-test) ===");
log("merchant (treasury):", MERCHANT.slice(0, 14) + "…");
log("vault pool:", VAULT.slice(0, 14) + "…  asset:", ASSET.slice(0, 14) + "…  price:", PRICE, "(0.001 F402)\n");

// ---------- SERVER: create an x402 endpoint settled by the lending pool ----------
const pay = paywall({
  network: NETWORK,
  payTo: MERCHANT,
  asset: ASSET,
  price: PRICE,
  vaultContract: VAULT,
  csprCloudApiKey: CSPR_KEY,
  asset_meta: { name: "Fund402 USDC", version: "1", decimals: "9", symbol: "F402" },
});

const server = http.createServer(async (req, res) => {
  const url = `http://${req.headers.host}${req.url}`;
  try {
    const g = await pay.guard({ method: req.method, url, headers: req.headers });
    if (!g.paid) {
      log("  [server] →", g.response.status, "(payment required / not yet settled)");
      res.writeHead(g.response.status, g.response.headers);
      return res.end(JSON.stringify(g.response.body));
    }
    log("  [server] ✓ settlement verified on-chain:", g.deployHash);
    res.setHeader("payment-response", g.paymentResponseHeader);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ secret: "🔓 fund402 unlocked the resource", paidVia: "lending-pool", deployHash: g.deployHash }));
  } catch (e) {
    res.writeHead(500); res.end(JSON.stringify({ error: String(e?.message ?? e) }));
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;
const RESOURCE = `http://127.0.0.1:${PORT}/v/vault_1/price/BTC-USD`;
log("  [server] x402 endpoint live at", RESOURCE, "\n");

// ---------- CLIENT: agent pays via just-in-time pool credit ----------
const f = fund402Fetch({
  network: NETWORK,
  nodeUrl: NODE,
  vaultContract: VAULT,
  agentSecretKey: adaPem,
  agentPublicKey: ADA_PUB,
  collateralRatio: 0, // ada is Tier 3 → zero collateral
  onEvent: (e) => log("  [client] ·", e.type, JSON.stringify(e.data)),
});

log("  [client] GET", RESOURCE);
const t0 = Date.now();
let pass = false, deployHash = null;
try {
  const res = await f(RESOURCE);
  const body = await res.json();
  const payResp = res.headers.get("payment-response");
  const settle = payResp ? JSON.parse(Buffer.from(payResp, "base64").toString()) : null;
  deployHash = settle?.deployHash ?? body?.deployHash;

  log("\n  [client] final status:", res.status);
  log("  [client] body:", JSON.stringify(body));
  if (settle) log("  [client] payment-response:", JSON.stringify(settle));

  pass = res.status === 200 && !!body?.secret && !!deployHash;
} catch (e) {
  log("  [client] ERROR:", e?.message ?? e);
}
server.close();

log(`\n  elapsed: ${Math.round((Date.now() - t0) / 1000)}s`);
if (pass) {
  log("\nLIVE E2E PASSED ✅  — x402 endpoint settled by the lending pool, on-chain.");
  log("  settlement deploy: https://testnet.cspr.live/deploy/" + deployHash);
  process.exit(0);
} else {
  log("\nLIVE E2E FAILED ❌");
  process.exit(1);
}
