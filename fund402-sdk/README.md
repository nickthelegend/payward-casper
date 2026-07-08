# @nickthelegend69/fund402

**Create x402-gated HTTP endpoints that are settled by a lending pool — on Casper.**

A normal [x402](https://x402.org) paywall makes the *caller* pay from their own
balance. Fund402 adds one twist that changes everything for AI agents:

> the caller borrows **just-in-time** from the Fund402 vault, the **lending pool
> fronts the CEP-18 payment to you (the merchant)**, and the agent repays later.

To you it looks like any x402 endpoint — except your callers can pay **even with an
empty wallet**, because the pool settles on their behalf. One SDK, both sides:

| | |
|---|---|
| 🟢 **Server (merchant)** | `paywall()` + drop-in middleware for **Express / Hono / Next.js** — issue the 402 challenge, verify the pool settled on-chain, serve the resource. |
| 🔵 **Client (agent)** | `fund402Fetch()` — a drop-in `fetch` that pays any Fund402 endpoint with JIT pool credit and replays the request. |

Casper-native: CEP-18 token + EIP-712 `exact` scheme over the `casper:*` network
family, verified against the live **CSPR.cloud x402 facilitator** and the deployed
**Fund402 vault** on testnet.

```
   ┌────────────┐  1. GET (no payment)         ┌─────────────────────┐
   │            │ ───────────────────────────▶ │   your API           │
   │   agent    │  2. 402 + x402 challenge      │   paywall(...)       │
   │ fund402-   │ ◀─────────────────────────── │   (Express/Hono/Next)│
   │   Fetch    │                               └─────────┬───────────┘
   │            │  3. borrow_and_pay  ┌─────────────────┐ │ 5. verify settlement
   │            │ ──────────────────▶ │  Fund402 vault  │ │    on-chain (CSPR.cloud)
   │            │     (pool fronts $) │  (lending pool) │◀┘
   │            │  4. retry + payment-signature           ▲
   │            │ ───────────────────────────▶ pays merchant from pool
   └────────────┘  6. 200 + resource
```

## Install

```bash
npm i @nickthelegend69/fund402
# the agent/client side also needs a Casper key; axios is optional (fetch is built in)
```

---

## Server — create an endpoint settled by the pool

### Express

```ts
import express from "express";
import { expressPaywall } from "@nickthelegend69/fund402/express";

const app = express();

app.use("/v", expressPaywall({
  payTo: "00" + MERCHANT_ACCOUNT_HASH,   // who gets paid (tagged account hash)
  asset: CEP18_PACKAGE_HASH,             // the CEP-18 settlement token
  price: "1000000",                      // base units per call (0.001 @ 9 decimals)
  vaultContract: VAULT_PACKAGE_HASH,     // the lending pool that settles
  csprCloudApiKey: process.env.CSPR_CLOUD_API_KEY,
}));

app.get("/v/price/:pair", (req, res) => {
  // only runs once the pool settled on-chain; proof is on req.fund402
  res.json({ pair: req.params.pair, price: 64250.12, settledBy: req.fund402.deployHash });
});

app.listen(3000);
```

### Next.js (App Router)

```ts
// app/api/v/[...path]/route.ts
import { withPaywall } from "@nickthelegend69/fund402/next";

export const GET = withPaywall(
  { payTo, asset, price: "1000000", vaultContract, csprCloudApiKey: process.env.CSPR_CLOUD_API_KEY },
  async () => Response.json({ data: "the protected resource" })
);
```

### Hono (Node, Bun, Workers, Deno)

```ts
import { Hono } from "hono";
import { honoPaywall } from "@nickthelegend69/fund402/hono";

const app = new Hono();
app.use("/v/*", honoPaywall({ payTo, asset, price: "1000000", vaultContract, csprCloudApiKey }));
app.get("/v/price", (c) => c.json({ price: 64250.12 }));
```

### Any framework

```ts
import { paywall } from "@nickthelegend69/fund402";

const pay = paywall({ payTo, asset, price: "1000000", vaultContract, csprCloudApiKey });

const g = await pay.guard({ method: req.method, url: fullUrl, headers: req.headers });
if (!g.paid) return send(g.response);                 // 402 challenge / 400 / error
res.setHeader("payment-response", g.paymentResponseHeader);
return serveTheResource();                            // g.settlement has the on-chain proof
```

---

## Client — pay an endpoint with JIT pool credit

```ts
import { fund402Fetch } from "@nickthelegend69/fund402";

const f = fund402Fetch({
  agentSecretKey,        // PEM or hex
  agentPublicKey,        // 01.. / 02.. account-key hex
  vaultContract: VAULT_PACKAGE_HASH,
  network: "casper:casper-test",
  onEvent: (e) => console.log(e.type, e.data),   // intercepted_402 → borrowing → … → payment_confirmed
});

// transparent: on 402, it borrows from the pool, settles on-chain, retries.
const res = await f("https://merchant.example/v/price/BTC-USD");
const data = await res.json();   // paid + served — the agent's own balance can be zero
```

Prefer Axios? `withPaymentInterceptor(config)` returns an `AxiosInstance` with the
same behaviour (Axios is an optional peer dependency).

**Tiers & collateral.** Trusted (Tier-3) agents borrow with **zero collateral**.
New/established (Tier-1/2) agents must post 150% collateral — `fund402Fetch`
**auto-approves** the vault to escrow it before borrowing (`collateralRatio`, default
`1.5`; set `autoApprove: false` to manage the allowance yourself, or `collateralRatio: 0`
for Tier-3).

---

## How settlement works (and why you can trust it)

1. The agent calls the vault's `borrow_and_pay(merchant, amount, collateral, vault_id)`.
   The **pool transfers `amount` CEP-18 to the merchant** and books a loan.
2. The agent attaches the resulting **deploy hash** to a signed x402 `exact` payload
   and replays the request.
3. The server calls `verifyPoolSettlement()` — it reads the deploy from **CSPR.cloud**
   and confirms it `processed`, paid the right **merchant + amount**, and targeted
   the configured **vault package**. The gateway trusts the chain, not the caller.
4. Optionally also POSTs the signed authorization to an x402 **facilitator** `/verify`
   (set `facilitatorUrl`) for defense-in-depth.

`verifyPoolSettlement` is resilient to indexer lag — it polls a bounded window while
the deploy is still propagating, and fails fast on an executed on-chain failure.

## Yield-bearing pool

The vault charges a **5% JIT credit fee** on every borrow. On repayment the agent pays
back principal **+ fee**, and the fee accrues to the pool's value — so **LPs earn yield**:
deposits are minted as shares, and a share redeems for more than it cost as fees pile up.
Agents can settle their newest loan with **`repayLatestOnChain`** (no loan id needed),
which makes auto-repay-from-earnings trivial.

**Proven live (casper-test):** an LP deposited `2_000_000`, an agent borrowed `1_000_000`
and repaid via `repay_latest`, the pool grew to `2_050_000`, and the LP **withdrew
`2_050_000` for its `2_000_000` deposit — `+50_000` realized yield.**
[repay `80e90a43…`](https://testnet.cspr.live/deploy/80e90a43120b40524038a405088f3f83c4ce45674a9ff3e28c577a20552cba9e) ·
[LP withdraw `44318b5b…`](https://testnet.cspr.live/deploy/44318b5b303dab8dbbb3c3b26ac0f148bf7b44701996fbd446f17f9f7622023c)

## Live deployment (casper-test)

| | |
|---|---|
| Vault (yield-bearing lending pool) package | `ca4086d3a7b1abf000d0a79e23a237bb484a14807e9438f2c56f3461073e1b2f` |
| CEP-18 asset (Fund402 USDC / F402) | `389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0` |
| Network | `casper:casper-test` |
| Facilitator | `https://x402-facilitator.cspr.cloud` |

Point `vaultContract` / `asset` at your own deployment for production.

## Verified live ✅

`npm run test:e2e` stands up a real HTTP server with `paywall()`, points a
`fund402Fetch()` agent at it, and runs the **whole loop on casper-test**: the agent
hits the endpoint → gets a 402 → borrows from the pool (the vault fronts the F402 to
the merchant) → retries → the server verifies the settlement on-chain via CSPR.cloud
→ serves the resource.

Both credit paths are proven live through the SDK:

- **Tier-3 (zero collateral)** — agent `01baa8d8…` borrowed `1000000` F402; the pool
  fronted it to the merchant.
  [settlement deploy `96f30ddf…` ↗](https://testnet.cspr.live/deploy/96f30ddfac9b3b8bc04a9fe274b1c006aff398ac624e7360669a2c1f3dc28264) (`status: processed`).
- **Tier-1 (150% collateral)** — agent `017e90a1…` had `fund402Fetch` auto-approve and
  **escrow `1500000` collateral** ([approve `f088362a…`](https://testnet.cspr.live/deploy/f088362a89720107dfe475ba8bc0660dbdb278cf25c3d633cf4e846414d8aa47)),
  then borrow; verified on-chain (`collateral=1500000`).
  [settlement deploy `a9dd1581…` ↗](https://testnet.cspr.live/deploy/a9dd158199ca65fda900863cd43db577983c1dcf3d6661409bf8d4c56bab649f) (`status: processed`).

Run them yourself: `npm run test:e2e` (Tier-3) and `npm run test:e2e:collateral` (Tier-1).

## API

**Server:** `paywall(cfg)` → `{ challenge, verify, guard }` · `buildPaymentRequirements`
· `challengeBody` · `decodePaymentSignature` · `verifyPoolSettlement` ·
`verifyWithFacilitator` · `explorerTx` · adapters `expressPaywall` / `honoPaywall` /
`withPaywall` (Next).

**Client:** `fund402Fetch(cfg)` · `withPaymentInterceptor(cfg)` (Axios) · `payViaPool`
· `decodeChallenge` · `selectCasperOption` · `testnetClient` / `mainnetClient`.

**On-chain primitives:** `borrowAndPayOnChain` · `repayLoanOnChain` ·
`repayLatestOnChain` (repay your newest loan — no loan id) · `ensureCollateralAllowance`
· `buildExactPayload` · `waitForDeploy` · `agentTaggedAddress` ·
`transferAuthorizationDigest`.

## ⚠️ Security

The client side signs real deploys with a local key — **testnet only**, never reuse
keys on mainnet. Keep keys out of source control. MIT licensed.

Part of [Fund402](https://github.com/nickthelegend/fund402-casper) — JIT credit for AI agents on Casper. **▶ [Watch the 45-second demo](https://github.com/nickthelegend/fund402-casper/blob/main/promo/fund402-promo.mp4)**.
