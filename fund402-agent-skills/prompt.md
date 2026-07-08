# Fund402 live demo — paste this into Claude Code

A copy-paste workflow that shows an **AI agent borrowing just-in-time credit to pay an
x402 API, then repaying the loan — live on Casper**, end to end. Everything below is
real: real contracts on casper-test, real deploys you can open on cspr.live.

---

## Before you start (one-time)

1. A **funded, Tier-3 agent** key (ed25519 PEM) — borrows with zero collateral.
   Don't have one? Use the **fund402-manage-wallet** skill to `create_wallet` →
   `fund_wallet_cspr` → `award_reputation` (Tier 3), then point at the new PEM.
2. A free **CSPR.cloud API key** (console.cspr.cloud).

```bash
export FUND402_AGENT_PEM=/absolute/path/to/agent.pem
export CSPR_CLOUD_API_KEY=...
```

---

## The prompt (paste into Claude Code)

> Install the Fund402 agent skills and run a live borrow-and-repay demo on Casper testnet.
>
> 1. Install the skills: `npx skills add nickthelegend/fund402-agent-skills`.
> 2. Read the `fund402-overview` skill so you understand the model, then read
>    `fund402-create-paywall`, `fund402-pay-x402`, and `fund402-repay-loan`.
> 3. In a scratch directory, run `npm i @nickthelegend69/fund402`.
> 4. **Stand up a merchant** (an x402 endpoint settled by the pool) using the
>    `fund402-create-paywall` skill — run its `merchant.mjs` in the background with my
>    `CSPR_CLOUD_API_KEY` and a merchant PEM. It will print a URL like
>    `http://127.0.0.1:4021/v/demo/resource`.
> 5. **Pay it as the agent** using the `fund402-pay-x402` skill: run `pay.mjs <that-url>`
>    with `FUND402_AGENT_PEM` set to my agent. Show me the served JSON and the on-chain
>    settlement — open the `borrow_and_pay` deploy on cspr.live.
> 6. **Repay the loan** using the `fund402-repay-loan` skill: make sure the agent holds
>    ≥ principal + 5% fee in F402 (if not, fund it via `fund402-manage-wallet`), then run
>    `repay.mjs` — it uses `repay_latest`, so **no loan id is needed**. Show me the repay
>    deploy on cspr.live.
> 7. (Optional) Show the LP side with `fund402-provide-liquidity`: the 5% fee the agent
>    just paid accrued to the pool, so an LP can `withdraw` more than it deposited.
> 8. Summarize: the agent paid an API it had no balance for (the pool fronted it) and
>    then repaid — the fee became LP yield — with cspr.live links.

---

## What the audience sees

- A normal-looking API that returns **402 Payment Required**.
- An agent with **zero token balance** calling it — and getting **200 + data**, because
  the **Fund402 lending pool fronted the CEP-18 payment** on-chain.
- The agent then **repaying** its loan (collateral released, reputation +10).
- Two real Casper deploys on **cspr.live** as proof.

## One-liner (skip the merchant; pay a known endpoint)

If you already have an x402 URL to pay:

```bash
npm i @nickthelegend69/fund402
node ~/.claude/skills/fund402-pay-x402/pay.mjs <x402-url>
node ~/.claude/skills/fund402-repay-loan/repay.mjs        # repay_latest — no loan id
```

## Verified live

This exact flow — driven entirely through these installed skills + the published
`@nickthelegend69/fund402` SDK — has been run on casper-test (yield-bearing vault v2). A
Tier-3 agent with **zero token balance** paid the pool-settled merchant and then repaid
via `repay_latest` (the 5% fee becoming LP yield):
- borrow / settle (`pay.mjs`): [`f8fd70f8…`](https://testnet.cspr.live/deploy/f8fd70f87958bdaffe6f4f0c42a16d6c6e3c3652d1b9a43bbacabefe0708cd3f) — `200 + 🔓 protected resource`
- repay (`repay.mjs`, no loan id): [`53d7d756…`](https://testnet.cspr.live/deploy/53d7d7564fc1fa988b9ccf0bf1182318ffefd5ce838d6a7e8a04b008c8caa018) — principal + fee, +10 reputation
- LP yield (`fund402-provide-liquidity`): deposited 2_000_000 → withdrew [`44318b5b…`](https://testnet.cspr.live/deploy/44318b5b303dab8dbbb3c3b26ac0f148bf7b44701996fbd446f17f9f7622023c) = 2_050_000
