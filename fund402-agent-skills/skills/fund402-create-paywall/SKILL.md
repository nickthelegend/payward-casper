---
name: fund402-create-paywall
description: Create an x402 / HTTP-402 endpoint that is settled by the Fund402 lending pool on Casper, so callers (AI agents) can pay even with an empty wallet. Use when you need to monetize an API/resource with per-request CEP-18 micropayments where the pool fronts the payment to you (the merchant) and you verify the settlement on-chain. Provides a runnable demo merchant and the drop-in Express/Hono/Next middleware.
metadata:
  author: nickthelegend
  version: "1.0.0"
---

# fund402-create-paywall — an x402 endpoint settled by the pool

Stand up a paid endpoint where the **Fund402 lending pool fronts the payment** to you.
To callers it looks like any x402 endpoint — except an agent with an empty wallet can
still pay, because the pool settles on its behalf. You verify that settlement on-chain
before serving the resource.

Read `fund402-overview` first for the model and config.

## Run the demo merchant

```bash
npm i @nickthelegend69/fund402            # in your working directory
export CSPR_CLOUD_API_KEY=...             # needed to verify settlement on-chain
export FUND402_AGENT_PEM=./merchant.pem   # who gets paid (or set FUND402_MERCHANT=00<accountHash>)
node merchant.mjs
# → http://127.0.0.1:4021/v/demo/resource
```

Then pay it from another shell with the **fund402-pay-x402** skill:

```bash
node pay.mjs http://127.0.0.1:4021/v/demo/resource
```

Unpaid requests get a `402` + x402 challenge; once the agent borrows + settles, the
server confirms it on CSPR.cloud and returns `200` + the resource with a
`payment-response` header.

## Drop into your own app

Framework-agnostic core + adapters (`@nickthelegend69/fund402`):

```ts
// Express
import { expressPaywall } from "@nickthelegend69/fund402/express";
app.use("/v", expressPaywall({
  payTo: "00" + MERCHANT_ACCOUNT_HASH,   // tagged account hash
  asset: "389cedc5…",                    // CEP-18 settlement token (F402)
  price: "1000000",                      // base units per call
  vaultContract: "664d99de…",            // the lending pool
  csprCloudApiKey: process.env.CSPR_CLOUD_API_KEY,
}));
app.get("/v/price/:pair", (req, res) => res.json({ pair: req.params.pair, settledBy: req.fund402.deployHash }));
```

Also available: `honoPaywall` (`@nickthelegend69/fund402/hono`) and `withPaywall`
(`@nickthelegend69/fund402/next`), or the framework-agnostic `paywall().guard(req)`.

## How settlement is verified

`verifyPoolSettlement` reads the agent's `borrow_and_pay` deploy from CSPR.cloud and
confirms it is `processed`, paid the right **merchant + amount**, and targeted the
configured **vault package** — the server trusts the chain, not the caller. It tolerates
indexer lag (polls briefly) and fails fast on an on-chain failure.

## Notes

- `price` is in **base units** (F402 has 9 decimals): `1000000` = 0.001 F402.
- `payTo` is a **tagged** account hash (`00` + 32-byte hash). `merchant.mjs` derives it
  from `FUND402_AGENT_PEM`, or pass `FUND402_MERCHANT` directly.
