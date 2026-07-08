# Payward — the credit & settlement layer for AI agents on Casper

**Casper Agentic Buildathon 2026.** Autonomous AI agents can browse, call APIs, and act on
their own — but they **can't pay**. The moment an agent's wallet is empty it hits an HTTP
`402` and stops; and when one agent pays another, there's **no protection** if the work comes
back wrong. **Payward** fixes both, as two on‑chain primitives that ship as one platform:

| Layer | Direction | What it does |
|---|---|---|
| **[Fund402](#fund402--the-credit-layer)** | credit **in** | An agent pays a `402` paywall with an **empty wallet** — a Casper liquidity pool fronts the CEP‑18 micropayment, settles it on‑chain, and the agent repays later (a 5% fee becomes LP yield). |
| **[Clawback](#clawback--the-settlement-layer)** | settlement **out** | Agent‑to‑agent payments are held in **escrow**; on a dispute a **Groq AI verifier** adjudicates the delivery against the spec and **claws the payment back** to the buyer. |

> One `npm install`. Two on‑chain primitives. **Live on Casper testnet — every hash below is a real deploy.**

- 🎥 **Demo video (1:45, narrated):** `fund402/promo/payward-promo.mp4`
- 📦 **npm SDK:** `npm i @nickthelegend69/fund402`
- 🌐 **Network:** Casper testnet (`casper-test`)
- 🔗 **Component repos:** [fund402-casper](https://github.com/nickthelegend/fund402-casper) · [clawback-casper](https://github.com/nickthelegend/clawback-casper) · [fund402-sdk](https://github.com/nickthelegend/fund402-sdk)

---

## ✅ Live on Casper — no mocks

Every runtime path uses real on‑chain data. The only test double anywhere is a `MockCep18`
in two contract unit tests — and every behavior it covers is *also* proven live.

| Proof | On‑chain |
|---|---|
| **Fund402 Vault v2** (yield‑bearing) | package `ca4086d3…073e1b2f` |
| **CEP‑18 "Fund402 USDC" (F402)** | package `389cedc5…7b866bccd0` |
| **ClawbackEscrow** | `088655d1…5888efb9` |
| Empty‑wallet agent (0 balance, 0 collateral) borrows `1e6` F402; pool pays the merchant | [borrow_and_pay ↗](https://testnet.cspr.live/deploy/5fadfa774f9d87f0f0b4e0219cf89086cd93aa8677cb0da8e0edda3740b9be17) |
| Full SDK loop `402 → borrow → settle‑verify → 200 + data` | [settlement ↗](https://testnet.cspr.live/deploy/96f30ddfac9b3b8bc04a9fe274b1c006aff398ac624e7360669a2c1f3dc28264) |
| LP realizes yield: 2,000,000 in → **2,050,000 out (+2.5%)** | [repay ↗](https://testnet.cspr.live/deploy/80e90a43120b40524038a405088f3f83c4ce45674a9ff3e28c577a20552cba9e) · [withdraw ↗](https://testnet.cspr.live/deploy/44318b5b303dab8dbbb3c3b26ac0f148bf7b44701996fbd446f17f9f7622023c) |
| Clawback **honest**: AI meets‑spec → release (seller +1e6) | [open ↗](https://testnet.cspr.live/deploy/02bfd9cf6c55118ca0ea5eb34b4f36aeea120ca20cc9b565d8c39e164b7f91b1) · [release ↗](https://testnet.cspr.live/deploy/87a30923652d57dc13a4372d7890c93218685a0a01d5aacbae7395446f74a889) |
| Clawback **dispute**: AI does‑not‑meet‑spec → refund (clawback) | [dispute ↗](https://testnet.cspr.live/deploy/0106f5e033c94b99ad2847c0089763b8e33cfd66ced56c94d84e837da4c94d12) · [resolve ↗](https://testnet.cspr.live/deploy/f6f6c5db8bb63b8bd946ff468f4a63aa9ed9ed441818fa56d0100b5fb5989435) |

---

## How it works

```
FUND402 — credit in
  agent (empty wallet) ─GET /v/price─▶ paywall() ─402─▶ fund402Fetch() ─borrow_and_pay─▶ Fund402 Vault
          ▲                                                                                  │ (CEP-18 pool
     200 OK + data ◀── verify settlement on-chain (CSPR.cloud) ◀── settled on Casper ◀───────┘  fronts the pay)

CLAWBACK — settlement out
  buyer.open(spec) ▶ HELD ▶ seller delivers ▶ Groq AI verifier adjudicates
        good → release (seller paid)          bad → dispute → resolve(false) → clawback (buyer refunded)
```

**Credit on the way in, protection on the way out — both settling on Casper.**

---

## Repository layout

This monorepo bundles every Payward component. Each directory mirrors its own standalone repo.

```
payward-casper/
├── fund402/                 # Credit layer — the hub: Odra vault contract, x402 gateway, agent-sdk
│   ├── contracts/           #   Odra 2.8 Rust→WASM vault (deposit / borrow_and_pay / repay / yield)
│   ├── packages/agent-sdk/  #   x402 `exact` payload + on-chain borrow/repay wiring
│   ├── src/                 #   Next.js x402 gateway  (GET /api/v/:vault/*path → 402 → verify → serve)
│   ├── scripts/             #   e2e.mjs / yield-e2e.mjs / demo-borrow.mjs (live on-chain flows)
│   └── promo/               #   the 1:45 narrated demo video
├── fund402-sdk/             # The published npm package  @nickthelegend69/fund402  (paywall + fund402Fetch)
├── fund402-dashboard/       # LP liquidity dashboard (Next.js) — TVL/utilization + CSPR.click deposit
├── fund402-demo/            # JIT-credit "cockpit" — watch 402 → borrow → settle → 200 live
├── fund402-agent/           # Autonomous agent toolbox — 12 on-chain tools (CLI)
├── fund402-mcp/             # MCP server (Claude Desktop) + Groq TUI over the toolbox
├── fund402-agent-skills/    # Installable Agent Skills (`npx skills add`)
└── clawback/                # Settlement layer
    ├── contracts/           #   ClawbackEscrow (Odra) — HELD → DELIVERED → RELEASED / DISPUTED → REFUNDED
    ├── clawback-agent/      #   buyer/seller agents + the Groq AI verifier
    ├── clawback-mcp/        #   MCP server + tools for escrow / dispute / resolve
    └── clawback-web/        #   Clawback dashboard (escrow lanes + tx firehose)
```

---

## Fund402 — the credit layer

When an agent hits a `402`, a CEP‑18 **liquidity pool fronts** the payment, settles it on
Casper, and records the loan + the agent's **on‑chain reputation**. 3‑tier credit
(collateralized → reputation‑only, so a trusted agent borrows with **zero collateral**). The
agent repays later; a **5% fee becomes LP yield** (share‑based pool — LPs withdraw more than
they deposit).

**The SDK — one install, two functions:**

```ts
// SERVER — gate any route with the pool as the settlement layer
import { paywall } from "@nickthelegend69/fund402";
export const GET = paywall({ price: "1000000", payTo: MERCHANT, asset: F402 })(handler);

// AGENT — a drop-in fetch that pays 402s from the pool, even with an empty wallet
import { fund402Fetch } from "@nickthelegend69/fund402";
const res = await fund402Fetch(url, { agentSecretKey, vaultPackageHash });
```

**Run it locally** (needs a funded key + `CSPR_CLOUD_API_KEY` — see `fund402/.env.example`):

```bash
cd fund402 && npm i
npm run dev            # x402 gateway on :3005
npm run demo:borrow    # the money shot: empty-wallet agent borrows → settles → gets data
```

- **LP dashboard:** `cd fund402-dashboard && npm i && npm run dev` → http://localhost:3000
- **JIT cockpit:**  `cd fund402-demo && npm i && npm run dev` → http://localhost:3006
- **Agent tools:**  `cd fund402-agent && node src/cli.mjs list` (12 on-chain tools)
- **MCP + Groq TUI:** `cd fund402-mcp && npm run tui`  (or `npm start` = MCP server for Claude Desktop)
- **Agent Skills:** `npx skills add nickthelegend/fund402-agent-skills`

---

## Clawback — the settlement layer

A buyer agent's payment is **held in escrow** against a stated spec. Good delivery →
**released** to the seller; bad delivery → **disputed**, and a **Groq AI verifier** adjudicates
the delivery against the spec and **claws the payment back** to the buyer. On‑chain reputation
accrues per agent. Chargebacks for the machine economy.

**Run it locally** (see `clawback/clawback-agent/.env.example`):

```bash
cd clawback/clawback-agent && npm i
npm run seller         # a seller agent exposing a paid, spec'd deliverable
npm run demo both      # runs BOTH: honest (release) + bad delivery (dispute → clawback)
```

- **Clawback dashboard:** `cd clawback/clawback-web && node serve.mjs`
- **MCP tools:** in `clawback/clawback-mcp` (escrow / deliver / dispute / resolve from chat)

---

## Tech

Casper 2.0 / Condor · **Odra 2.8** (Rust → WASM) · CEP‑18 · **x402 v2 `exact`** scheme with
EIP‑712 authorization signing verified against the **live CSPR.cloud facilitator** · **Groq
`llama‑3.3‑70b`** AI verifier · TypeScript SDK on npm · **Model Context Protocol** · CSPR.click
wallet signing.

## Why it matters

Agents that transact need what humans take for granted: **a line of credit** (so an empty
wallet isn't a dead end) and **buyer protection** (so paying another agent isn't a leap of
faith). Payward is those two primitives — native to Casper, drop‑in via one `npm install`.

## What's next

On‑chain loan‑TTL enforcement · an autonomous scheduler that repays from an x402 revenue
stream · browser‑tested CSPR.click LP deposits · mainnet.

## License

Apache‑2.0 (Fund402) · MIT (Clawback). See each component directory for its `LICENSE`.
