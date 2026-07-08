# Fund402 Demo — Live JIT-Credit Cockpit (Casper)

An immersive, projector-ready demo of an autonomous AI agent that pays for a
gated resource it **can't afford**. With an empty wallet, the agent borrows
just-in-time credit from the **Fund402** vault, the loan settles on **Casper**,
and the data comes back — no human, no pre-funding.

Part of **[Fund402](https://github.com/nickthelegend/fund402-casper)** (Casper Agentic Buildathon 2026) — **▶ [watch the 45-second demo](https://github.com/nickthelegend/fund402-casper/blob/main/promo/fund402-promo.mp4)**.

## What a judge sees in 10 seconds

Not a chat box — a **mission cockpit**:

```
  ┌── THE AGENT ──────────────┐   ┌── THE MISSION ────────────────┐
  │  ◎ agent-0x7f…            │   │  "Fetch BTC-USD spot price"    │
  │  wallet: 0.00 CSPR  ⚠     │   │  [ ▶ Dispatch agent ]          │
  └───────────────────────────┘   └───────────────────────────────┘

   [ AI Agent ]══▶[ x402 Paywall ]══▶[ Fund402 Vault ]══▶[ Casper ]
      idle           402 required        fronts payment     settled
        (animated credit pipeline — pulses travel as real events fire)

  ┌── agent.log (live) ───────┐   ┌── SETTLEMENT ─────────────────┐
  │ ▸ GET /v/…/BTC-USD        │   │ ✓ loan fronted · settled       │
  │ ▸ 402 Payment Required    │   │ data: $— USD                   │
  │ ▸ wallet 0 → request JIT  │   │ deploy: 5fadfa… ↗ (cspr.live)  │
  │ ▸ borrow_and_pay → Casper │   │ reputation ▰▱▱▱  +10 → Tier 2  │
  │ ▸ settled · data delivered│   │                                │
  └───────────────────────────┘   └───────────────────────────────┘
```

A pulsing **0.00 CSPR** balance (the constraint), an animated 4-stage credit
pipeline, a streaming console of the agent's real actions, and a settlement card
with the **real cspr.live deploy link**, the data the agent paid for, and a
reputation meter climbing toward collateral-free Tier 3.

## How it works

- **`Dispatch agent`** calls `POST /api/agent`, which runs the **real**
  `@fund402/agent-sdk` against the gateway: it hits a `402`, calls the vault's
  `borrow_and_pay`, settles on Casper, and replays the request.
- The page animates the **actual** event trace returned by the run (`CreditPipeline.tsx`)
  and shows the real deploy hash + returned data in the settlement panel.
- **No fake data.** Before the vault is deployed/configured it shows an explicit
  "flow preview — deploy to settle on Casper" state (no fabricated hashes).

## Run

```bash
npm install          # links @fund402/agent-sdk (file: dependency) + builds it
npm run dev          # http://localhost:3006
```

For live on-chain settlement, point `.env.local` at the running gateway + the
deployed vault (see `.env.example` and [fund402/DEPLOYMENT.md](../fund402/DEPLOYMENT.md)):

```
DEMO_VAULT_URL=http://localhost:3005/v/<vault_id>/
FUND402_VAULT_CONTRACT=664d99de146b9b573161a387d89fefc649677351d8a6d2acbe22109bf88f6b12
FUND402_AGENT_SECRET_KEY_PATH=../fund402/.keys/agent_secret.pem
FUND402_AGENT_PUBLIC_KEY=01bdaee4…
CSPR_CLOUD_API_KEY=<key>
```

## Tech

Next.js 15 · React 19 · framer-motion · `@fund402/agent-sdk` · casper-x402
facilitator · TailwindCSS.
