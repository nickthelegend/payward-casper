# Fund402 Liquidity Dashboard (Casper)

The control center for **Liquidity Providers (LPs)** in the Fund402 network. LPs
deposit CEP-18 liquidity that funds Just-In-Time loans for AI agents, and watch
the pool work in real time — Total Value Locked, capital deployed, utilization,
and a live borrower directory linking to cspr.live.

Part of **[Fund402](https://github.com/nickthelegend/fund402-casper)** (Casper Agentic Buildathon 2026) — **▶ [watch the 45-second demo](https://github.com/nickthelegend/fund402-casper/blob/main/promo/fund402-promo.mp4)**.

## Architecture

```
        Browser (LP)                         Server (Next.js API)
   ┌────────────────────┐              ┌──────────────────────────┐
   │  Treasury + table  │ ── /api/stats ─▶  reads on-chain state   │
   │  (read-only view)  │ ◀──── JSON ────  via CSPR.cloud REST     │
   ├────────────────────┤              │  • vault CEP-18 balance   │
   │  Deposit/Withdraw  │              │    (ft-token-ownership)   │
   │  via CSPR.click  ──┼──┐           │  • borrower activity      │
   └────────────────────┘  │           │    (ft-token-actions)     │
                           │           └──────────────────────────┘
        signs in the       │ approve + deposit_liquidity /
        wallet (no keys    └─▶ withdraw_liquidity deploys ──▶ Casper
        in the browser)        (lib/tx.ts, casper-js-sdk v5)      (vault)
```

- **Reads** (`app/api/stats`, `lib/casper.ts`) — server-side, via the CSPR.cloud
  REST API. TVL = the vault's CEP-18 balance; borrower activity = the vault's
  CEP-18 transfers to merchants. No mock data: shows an explicit "not configured"
  state until the env points at a deployed vault.
- **Writes** (`lib/tx.ts`, `app/providers.tsx`) — the connected **CSPR.click**
  wallet signs an `approve` + `deposit_liquidity` (or `withdraw_liquidity`) deploy
  built with casper-js-sdk v5. **No private key ever touches the browser.**

## Run

```bash
npm install
npm run dev          # http://localhost:3007
```

Copy `.env.example` → `.env.local` and set:

| Var | What |
|---|---|
| `CSPR_CLOUD_API_KEY` | CSPR.cloud key (server-side reads) |
| `VAULT_ACCOUNT_HASH` | vault package hash (its CEP-18 ownership identity) |
| `X402_ASSET_PACKAGE` | CEP-18 package hash |
| `NEXT_PUBLIC_CSPR_CLICK_APP_ID` | CSPR.click appId (register at console.cspr.build) |
| `NEXT_PUBLIC_VAULT_CONTRACT_HASH` | vault package hash (for deposit/withdraw calls) |
| `NEXT_PUBLIC_X402_ASSET_CONTRACT_HASH` | CEP-18 contract hash (for the `approve` before deposit) |

Against the live testnet deployment these are the vault `664d99de…` and the CEP-18
`389cedc5…` (see [fund402/DEPLOYMENT.md](../fund402/DEPLOYMENT.md)).

## Tech

Next.js 15 · React 19 · casper-js-sdk v5 · `@make-software/csprclick-react` ·
CSPR.cloud REST · TailwindCSS.

## Caveat

CSPR.click signing is wired against the real SDK and type-checks, but needs a
browser + wallet + a registered `appId` to exercise end-to-end. Watch the
"sign message vs raw digest" note for x402 — see `skills/cspr-click`.
