---
name: fund402-overview
description: Understand Fund402 — just-in-time credit for AI agents on Casper — before using the other fund402 skills. Read this first when a task involves paying an x402 / HTTP-402 endpoint with an empty wallet, taking or repaying on-chain credit, or creating an endpoint settled by a lending pool. Explains the model, the 3 credit tiers, the live testnet contracts, the required config, and which fund402 skill to use when.
metadata:
  author: nickthelegend
  version: "1.0.0"
---

# Fund402 — overview

Fund402 is a **just-in-time (JIT) credit protocol for AI agents on Casper**. When an
agent hits an `x402` (HTTP 402 Payment Required) paywall with **no balance**, it borrows
from an on-chain **liquidity pool (the vault)**, the pool fronts the CEP-18 payment to
the merchant, and the agent repays later. The loan + the agent's reputation live on-chain.

Think of it as **the credit card for the machine economy**: an agent can pay for an API
even with an empty wallet, and a merchant gets paid instantly by the pool.

## The flow

```
agent ──GET──▶ x402 endpoint ──402 + challenge──▶ agent
agent ──borrow_and_pay──▶ Fund402 vault (pool) ──CEP-18 transfer──▶ merchant
agent ──replay w/ payment-signature──▶ endpoint ──verifies settlement on-chain──▶ 200 + data
later: agent ──repay_loan──▶ vault (releases collateral, +10 reputation)
```

## The 3 credit tiers

| Tier | Reputation | Collateral to borrow |
|---|---|---|
| 1 — New | score < 50 | **150%** (escrowed in CEP-18; the SDK auto-approves it) |
| 2 — Established | score ≥ 50 | reduced |
| 3 — Trusted | score ≥ 200 | **none** (reputation-only) |

`+10` reputation on on-time repay. New agents are typically seeded to Tier 3 for a
collateral-free demo (see `fund402-manage-wallet`).

## Fees & LP yield

Every borrow carries a **5% JIT credit fee**. On repayment the agent pays back
**principal + fee**, and the fee accrues to the **share-based pool** — so **LPs earn
yield** (a share redeems for more than it cost as fees pile up). Agents repay with
**`repay_latest`** (no loan id — settle your newest loan from earnings). Be an LP with
`fund402-provide-liquidity`; repay with `fund402-repay-loan`.

## Which skill to use

| If you need to… | Use |
|---|---|
| Pay an x402 endpoint with JIT credit | **fund402-pay-x402** |
| Repay a loan you took | **fund402-repay-loan** |
| Create an x402 endpoint settled by the pool | **fund402-create-paywall** |
| Create/fund a wallet, set reputation, add liquidity | **fund402-manage-wallet** |

All actions are **real, on-chain** (casper-test) via the published SDK
[`@nickthelegend69/fund402`](https://www.npmjs.com/package/@nickthelegend69/fund402).

## Config (used by every fund402 skill)

Set these once in your shell. Sensible **casper-test defaults are built in** — you only
need a key and (for paying/repaying) an agent PEM:

```bash
export FUND402_AGENT_PEM=/path/to/agent_secret_key.pem   # ed25519 secret key of the paying agent
export CSPR_CLOUD_API_KEY=...                             # on-chain verification (free at console.cspr.cloud)
# optional overrides (defaults shown):
# export FUND402_NETWORK=casper:casper-test
# export FUND402_NODE=https://node.testnet.casper.network/rpc
# export FUND402_VAULT=ca4086d3a7b1abf000d0a79e23a237bb484a14807e9438f2c56f3461073e1b2f
# export FUND402_ASSET=389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0
```

Install the SDK in the working directory so the skill scripts can resolve it:

```bash
npm i @nickthelegend69/fund402
```

The agent also needs a little **CSPR for gas**. To create + fund + promote an agent, use
**fund402-manage-wallet**.

## Live deployment (casper-test)

- Vault (lending pool) package: `ca4086d3a7b1abf000d0a79e23a237bb484a14807e9438f2c56f3461073e1b2f`
- CEP-18 asset (Fund402 USDC / F402, 9 decimals): `389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0`
- Amounts are **base units**: `1000000` = 0.001 F402.
