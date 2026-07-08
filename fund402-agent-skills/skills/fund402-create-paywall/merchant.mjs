#!/usr/bin/env node
// fund402-create-paywall — stand up an x402 (HTTP 402) endpoint that is SETTLED BY THE
// FUND402 LENDING POOL. Callers can pay even with an empty wallet (the pool fronts it);
// this server verifies the settlement on-chain before serving the resource.
//
//   CSPR_CLOUD_API_KEY=... FUND402_MERCHANT=00<accountHash> node merchant.mjs
//   # or derive the merchant account from a PEM:
//   CSPR_CLOUD_API_KEY=... FUND402_AGENT_PEM=./merchant.pem node merchant.mjs
//
// Then pay it with the fund402-pay-x402 skill:
//   node pay.mjs http://127.0.0.1:4021/v/demo/resource
import http from "node:http";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const reqCwd = createRequire(join(process.cwd(), "_fund402_resolver_.cjs"));
async function fromCwd(spec) {
  try { return await import(spec); } catch {}
  try { return await import(pathToFileURL(reqCwd.resolve(spec)).href); } catch {
    throw new Error(`Cannot find ${spec}. Run \`npm i @nickthelegend69/fund402\` in this directory.`);
  }
}

const CFG = {
  network: process.env.FUND402_NETWORK || "casper:casper-test",
  vault: process.env.FUND402_VAULT || "ca4086d3a7b1abf000d0a79e23a237bb484a14807e9438f2c56f3461073e1b2f",
  asset: process.env.FUND402_ASSET || "389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0",
  price: process.env.FUND402_PRICE || "1000000",
  port: Number(process.env.PORT || 4021),
  csprKey: process.env.CSPR_CLOUD_API_KEY || "",
};
if (!CFG.csprKey) { console.error("set CSPR_CLOUD_API_KEY (needed to verify settlement on-chain)"); process.exit(1); }

const sdk = await fromCwd("@nickthelegend69/fund402");

// Who gets paid: an explicit tagged account hash, or derived from a PEM.
let payTo = process.env.FUND402_MERCHANT;
if (!payTo) {
  if (!process.env.FUND402_AGENT_PEM) { console.error("set FUND402_MERCHANT (00<accountHash>) or FUND402_AGENT_PEM"); process.exit(1); }
  const priv = await sdk.loadPrivateKey(readFileSync(process.env.FUND402_AGENT_PEM, "utf8"));
  payTo = sdk.agentTaggedAddress(priv.publicKey.toHex());
}

const pay = sdk.paywall({
  network: CFG.network, payTo, asset: CFG.asset, price: CFG.price, vaultContract: CFG.vault,
  csprCloudApiKey: CFG.csprKey,
  asset_meta: { name: "Fund402 USDC", version: "1", decimals: "9", symbol: "F402" },
});

const server = http.createServer(async (req, res) => {
  const url = `http://${req.headers.host}${req.url}`;
  try {
    const g = await pay.guard({ method: req.method, url, headers: req.headers });
    if (!g.paid) {
      console.error(`  → ${g.response.status} ${req.url}`);
      res.writeHead(g.response.status, g.response.headers);
      return res.end(JSON.stringify(g.response.body));
    }
    console.error(`  ✓ settled on-chain: ${g.deployHash}`);
    res.setHeader("payment-response", g.paymentResponseHeader);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: "🔓 protected resource", paidVia: "fund402-lending-pool", deployHash: g.deployHash }));
  } catch (e) {
    res.writeHead(500); res.end(JSON.stringify({ error: String(e?.message ?? e) }));
  }
});

server.listen(CFG.port, () => {
  console.error(`fund402 merchant up — x402 endpoint settled by the pool`);
  console.error(`  http://127.0.0.1:${CFG.port}/v/demo/resource   (payTo ${payTo.slice(0, 12)}…, price ${CFG.price})`);
  console.error(`  pay it:  node pay.mjs http://127.0.0.1:${CFG.port}/v/demo/resource`);
});
