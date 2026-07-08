---
name: fund402-pay-x402
description: Pay an x402 / HTTP-402 paywalled endpoint with just-in-time credit from the Fund402 lending pool on Casper — even with an empty wallet. Use when an agent must call a paid API/resource that returns 402 Payment Required and you want the pool to front the CEP-18 micropayment, settle it on-chain, and get back the real 200 response. Borrowing is automatic; trusted (Tier-3) agents pay with zero collateral.
metadata:
  author: nickthelegend
  version: "1.0.0"
---

# fund402-pay-x402 — borrow + pay an x402 endpoint

Pay a `402 Payment Required` endpoint via the Fund402 lending pool. The agent borrows
just-in-time, the **pool fronts the CEP-18 payment to the merchant**, the settlement is
verified on-chain, and the original request is replayed and served — the agent's own
token balance can be **zero**.

Read `fund402-overview` first for the model and config. New to Fund402 prerequisites:
the agent needs a little **CSPR for gas**; use `fund402-manage-wallet` to create/fund it.

## Prerequisites

```bash
npm i @nickthelegend69/fund402          # in your working directory
export FUND402_AGENT_PEM=./agent.pem    # the paying agent's ed25519 secret key
# Tier-1/2 agents only (Tier-3 = zero collateral, the default):
# export FUND402_COLLATERAL_RATIO=1.5   # SDK auto-approves + escrows 150% collateral
```

## Run it

```bash
node pay.mjs <x402-url>
# e.g.
node pay.mjs http://127.0.0.1:4021/v/demo/resource
```

It prints the served JSON plus the on-chain `settlement` (the vault `borrow_and_pay`
deploy) and a `cspr.live` link. Progress events stream to stderr:
`intercepted_402 → borrowing → payment_settled → request_retried → payment_confirmed`
(a Tier-1/2 borrow adds `approving → approve_submitted` first).

## What happens

1. `fund402Fetch` calls the endpoint, gets `402` + the x402 challenge.
2. It calls the vault `borrow_and_pay(merchant, amount, collateral, vault_id)`; the pool
   transfers the CEP-18 `amount` to the merchant and books the loan.
3. It signs the x402 `exact` authorization, attaches the settlement deploy hash, and
   replays the request with a `payment-signature` header.
4. The endpoint verifies the settlement on-chain and returns `200` + the resource.

## In code (if you'd rather call it yourself)

```js
import { fund402Fetch, loadPrivateKey } from "@nickthelegend69/fund402";
import { readFileSync } from "node:fs";
const pem = readFileSync(process.env.FUND402_AGENT_PEM, "utf8");
const pub = (await loadPrivateKey(pem)).publicKey.toHex();
const f = fund402Fetch({ agentSecretKey: pem, agentPublicKey: pub,
  vaultContract: "664d99de…", network: "casper:casper-test" });
const res = await f("https://merchant.example/v/price/BTC-USD"); // paid + served
```

## After paying — repay

The borrow opens a loan. To release collateral and earn reputation, repay it with
**fund402-repay-loan** (`node repay.mjs <loanId>`). The loan id is the vault's loan
counter for your borrow — visible as the `LoanIssued` event on the borrow deploy's
[cspr.live](https://testnet.cspr.live) page.

## Notes

- Amounts are **base units** (F402 has 9 decimals): `1000000` = 0.001 F402.
- Tier-3 agents borrow with **zero collateral** (`FUND402_COLLATERAL_RATIO=0`, default).
  For Tier-1/2 set it to `1.5`; the agent must then hold ≥150% of the price in F402.
- Testnet only — `FUND402_AGENT_PEM` must never be a mainnet key.
