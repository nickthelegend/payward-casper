# fund402-agent

The autonomous-agent **toolbox** for [Fund402](https://github.com/nickthelegend/fund402-casper)
on Casper. A set of real, on-chain tools an AI agent can call to manage wallets,
move funds, and take just-in-time credit + x402 payments — **live on casper-test**
against the deployed vault + CEP-18.

**▶ [Watch the 45-second Fund402 demo](https://github.com/nickthelegend/fund402-casper/blob/main/promo/fund402-promo.mp4).**

Used by **[fund402-mcp](https://github.com/nickthelegend/fund402-mcp)** (MCP server +
Groq TUI), but works standalone via the CLI or as a library.

## Tools

| Tool | What it does |
|---|---|
| `create_wallet` | generate a fresh ed25519 Casper wallet (saved locally, unfunded) |
| `list_wallets` | list created wallets |
| `get_balances` | CSPR + F402 balance of any account (via CSPR.cloud) |
| `fund_wallet_cspr` | treasury → agent CSPR (gas) |
| `fund_wallet_token` | treasury → account F402 tokens |
| `deposit_liquidity` | seed the vault pool (approve + deposit_liquidity) |
| `award_reputation` | admin: grant reputation (≥200 → Tier 3, zero-collateral) |
| `borrow_and_pay` | **the x402 action** — agent borrows JIT, vault fronts the payment, settles on Casper |
| `repay_loan` | agent repays (releases collateral, +10 rep); auto-tops-up to simulate earnings |
| `sign_x402_payment` | agent signs an x402 `exact` authorization + verifies it **live** at the facilitator |
| `get_pool_stats` | vault liquidity |
| `check_deploy` | deploy status by hash |

## Verified live (casper-test)

Real end-to-end run, every step settled on-chain:
`create_wallet` → `fund_wallet_cspr` → `award_reputation` (Tier 3) → **`borrow_and_pay`**
(the vault fronts the CEP-18 payment) → `sign_x402_payment` → facilitator **`isValid: true`** →
`repay_loan`. Uses the deployed vault `664d99de…` + CEP-18 `389cedc5…`.

## Use it

```bash
npm install
cp .env.example .env      # add CSPR_CLOUD_API_KEY (+ GROQ_API_KEY for the TUI)

node src/cli.mjs list
node src/cli.mjs create_wallet '{"name":"ada"}'
node src/cli.mjs fund_wallet_cspr '{"account":"ada","cspr":60}'
node src/cli.mjs award_reputation '{"account":"ada","delta":250}'
node src/cli.mjs borrow_and_pay '{"agent":"ada","amount":1000000,"resource":"BTC-USD feed"}'
node src/cli.mjs sign_x402_payment '{"agent":"ada","verify":true}'
```

As a library:

```js
import { TOOLS, TOOL_MAP } from "fund402-agent";
const res = await TOOL_MAP.borrow_and_pay.handler({ agent: "ada", amount: 1_000_000 });
```

## How it works

- The **treasury** key (defaults to the fund402 deployer) funds agents, provides
  liquidity, and is the admin + default merchant.
- Wallets are ed25519 PEMs in `.wallets/` (gitignored). Tools sign deploys with
  casper-js-sdk v5 and submit to the public testnet RPC; reads use CSPR.cloud.
- x402 signing reuses the proven `casper-eip-712` `TransferWithAuthorization`
  digest + `signAndAddAlgorithmBytes` — accepted by the live facilitator.

All config + the live contract hashes default in `src/config.mjs` (override via `.env`).

## ⚠️ Security

Tools sign with local keys. `.env`, `.wallets/`, and `*.pem` are gitignored —
**testnet only**, never reuse on mainnet. License: Apache-2.0.
