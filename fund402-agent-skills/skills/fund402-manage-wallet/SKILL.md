---
name: fund402-manage-wallet
description: Set up and manage Fund402 agents and the liquidity pool on Casper — create an agent wallet, fund it with CSPR (gas) and F402 tokens, award reputation to promote it to Tier 3 (zero-collateral borrowing), and seed pool liquidity. Use when preparing an agent before it pays/repays (fund402-pay-x402 / fund402-repay-loan), or when operating the pool as the treasury/admin. These are admin actions that require the treasury key.
metadata:
  author: nickthelegend
  version: "1.0.0"
---

# fund402-manage-wallet — wallets, funding, reputation, liquidity

Operator/admin tasks: create an agent, give it gas + tokens, promote it to a credit
tier, and seed the pool. These need the **treasury (admin) key** — they're how you
prepare an agent before it uses `fund402-pay-x402` / `fund402-repay-loan`.

Read `fund402-overview` first.

## The toolbox

These vault-admin actions (`award_reputation`, `deposit_liquidity`) and the funding
transfers are provided by the proven **fund402-agent** CLI:

```bash
git clone https://github.com/nickthelegend/fund402-agent && cd fund402-agent
npm install
cp .env.example .env     # add CSPR_CLOUD_API_KEY; set FUND402_TREASURY_PEM to the admin key
```

Each tool prints a `cspr.live` deploy link. Amounts are **base units** (F402 has 9 decimals).

| Goal | Command |
|---|---|
| Create a fresh agent wallet (ed25519 PEM in `.wallets/`) | `node src/cli.mjs create_wallet '{"name":"ada"}'` |
| Fund it with CSPR (gas) | `node src/cli.mjs fund_wallet_cspr '{"account":"ada","cspr":60}'` |
| Fund it with F402 (for collateral / repayment) | `node src/cli.mjs fund_wallet_token '{"account":"ada","amount":3000000}'` |
| Promote to **Tier 3** (zero-collateral borrowing) | `node src/cli.mjs award_reputation '{"account":"ada","delta":250}'` |
| Seed the pool with liquidity | `node src/cli.mjs deposit_liquidity '{"amount":100000000}'` |
| Check balances / pool | `node src/cli.mjs get_balances '{"account":"ada"}'` · `node src/cli.mjs get_pool_stats '{}'` |

The created PEM (`.wallets/<name>.pem`) is what you then point `FUND402_AGENT_PEM` at for
the `fund402-pay-x402` and `fund402-repay-loan` skills.

## Typical setup for a zero-collateral demo agent

```bash
node src/cli.mjs create_wallet      '{"name":"ada"}'
node src/cli.mjs fund_wallet_cspr   '{"account":"ada","cspr":60}'     # gas
node src/cli.mjs award_reputation   '{"account":"ada","delta":250}'   # → Tier 3
# (optional, only needed to repay later) give it some F402 to repay with:
node src/cli.mjs fund_wallet_token  '{"account":"ada","amount":2000000}'
```

Now `export FUND402_AGENT_PEM=$(pwd)/.wallets/ada.pem` and use the pay / repay skills.

## Notes

- The treasury is the admin + default merchant + liquidity provider; keep its key safe
  (testnet only).
- `award_reputation` is admin-gated on-chain. `delta` ≥ 200 reaches Tier 3.
- Tier-1/2 agents instead need F402 to post as collateral (150%); fund with
  `fund_wallet_token` and set `FUND402_COLLATERAL_RATIO=1.5` when paying.
