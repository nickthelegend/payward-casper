# fund402-agent-skills

**Agent Skills that teach any coding agent to use [Fund402](https://github.com/nickthelegend/fund402-casper) — borrow just-in-time credit, pay x402 APIs, and repay — live on Casper.**

**▶ [Watch the 45-second Fund402 demo](https://github.com/nickthelegend/fund402-casper/blob/main/promo/fund402-promo.mp4).**

Drop these skills into Claude Code (or any agent that reads [Agent Skills](https://skills.sh)) and it learns, on demand, how to:

- pay an `x402` (HTTP 402) paywalled endpoint **with an empty wallet** — the Fund402 lending pool fronts the payment,
- repay the loan it just took,
- stand up its own pool-settled x402 endpoint, and
- manage agent wallets, liquidity, and on-chain reputation.

Every skill runs **real on-chain actions on casper-test** via the published SDK
[`@nickthelegend69/fund402`](https://www.npmjs.com/package/@nickthelegend69/fund402).

## Install

```bash
# the vercel-labs `skills` CLI — `add` is the install command
npx skills add nickthelegend/fund402-agent-skills
```

This installs the skills into your agent (`~/.claude/skills/…` for Claude Code).
Then just ask your agent — e.g. *"use fund402 to pay this endpoint and repay the loan."*

Prefer to try one without installing? `npx skills use nickthelegend/fund402-agent-skills@fund402-pay-x402`.

## The skills

| Skill | What the agent can do |
|---|---|
| **fund402-overview** | Understand Fund402 — the pool, the 3 credit tiers, the live contracts, which skill to use when. |
| **fund402-pay-x402** | Borrow JIT credit and pay an x402 endpoint (`fund402Fetch`). The pool settles on-chain; the request is replayed and served. |
| **fund402-repay-loan** | Repay the newest loan with **no loan id** (`repay_latest`) — pays principal + the 5% fee (→ LP yield), releases collateral, +10 reputation. |
| **fund402-provide-liquidity** | Be an **LP**: deposit to back agents' borrows, **earn the 5% JIT fee as yield**, and withdraw more than you deposited. |
| **fund402-create-paywall** | Stand up an x402 endpoint **settled by the pool** (`paywall()` + Express) — a runnable demo merchant. |
| **fund402-manage-wallet** | Operator: create wallets, fund CSPR/F402, award reputation (→ Tier 3), seed pool liquidity. |

## Configure (once)

The runnable scripts read config from the environment (sensible **casper-test
defaults** are built in — you only need a key):

```bash
export FUND402_AGENT_PEM=/path/to/agent_secret_key.pem   # the agent that pays/repays (ed25519)
export CSPR_CLOUD_API_KEY=...                             # for on-chain verification (free at console.cspr.cloud)

# optional overrides (these are the live testnet defaults):
# export FUND402_NETWORK=casper:casper-test
# export FUND402_NODE=https://node.testnet.casper.network/rpc
# export FUND402_VAULT=ca4086d3a7b1abf000d0a79e23a237bb484a14807e9438f2c56f3461073e1b2f
# export FUND402_ASSET=389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0
```

Install the SDK in your working directory so the scripts can find it:

```bash
npm i @nickthelegend69/fund402
```

> The agent must have a little **CSPR** for gas. Trusted (Tier-3) agents borrow with
> **zero collateral**; new agents post 150% collateral (the SDK auto-approves it).
> See **fund402-manage-wallet** to create + fund + promote an agent.

## Run the demo

[`prompt.md`](./prompt.md) is a copy-paste workflow for a live Claude Code demo:
install the skills → start a pool-settled merchant → the agent borrows to pay it
(on-chain) → the agent repays → show the cspr.live proofs.

**Verified live** (the installed skills + published SDK, on the yield-bearing v2 vault,
casper-test): a Tier-3 agent borrowed to pay the merchant, then repaid via
**`repay_latest` (no loan id)** — its 5% fee accruing to LP yield —
borrow [`f8fd70f8…`](https://testnet.cspr.live/deploy/f8fd70f87958bdaffe6f4f0c42a16d6c6e3c3652d1b9a43bbacabefe0708cd3f),
repay [`53d7d756…`](https://testnet.cspr.live/deploy/53d7d7564fc1fa988b9ccf0bf1182318ffefd5ce838d6a7e8a04b008c8caa018).
And an LP earned yield (`fund402-provide-liquidity`): deposited `2_000_000`, withdrew
`2_050_000` ([withdraw `44318b5b…`](https://testnet.cspr.live/deploy/44318b5b303dab8dbbb3c3b26ac0f148bf7b44701996fbd446f17f9f7622023c)).

## Live deployment (casper-test)

| | |
|---|---|
| Vault (lending pool) | `ca4086d3a7b1abf000d0a79e23a237bb484a14807e9438f2c56f3461073e1b2f` |
| CEP-18 asset (F402) | `389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0` |
| Network | `casper:casper-test` |

## ⚠️ Security

These skills sign **real deploys** with a local key. Testnet only — never point
`FUND402_AGENT_PEM` at a mainnet key, and keep PEMs out of source control. MIT.
