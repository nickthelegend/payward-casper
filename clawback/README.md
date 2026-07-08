# Clawback — agent payment escrow on Casper

**Chargebacks for the machine economy.** When a buyer agent pays a seller agent for a
deliverable, Clawback **holds the payment in escrow** against a stated spec. A good
delivery is **released** (seller paid); a bad one is **disputed**, and a trusted **AI
verifier** (a Groq attester) adjudicates — **refunding the buyer**. Reputation accrues
per agent. Casper port of the original Arc/Solidity [Clawback](https://github.com/EdwardJXLi/Clawback).

Clawback is a **settlement layer separate from [Fund402](https://github.com/nickthelegend/fund402-casper)**:
Fund402 *fronts* payments (just-in-time credit); Clawback *escrows* them with dispute
resolution. Run both — credit on the way in, protection on the way out.

**▶ [Watch the 45-second Fund402 demo](https://github.com/nickthelegend/fund402-casper/blob/main/promo/fund402-promo.mp4)** — Clawback features as the settlement layer in the ecosystem montage.

## ✅ Live on casper-test

| | |
|---|---|
| **ClawbackEscrow** package | `088655d1c0b612cf90d14d43d9fabc390e2c833189d966fcbfb195cc5888efb9` ([install ↗](https://testnet.cspr.live/deploy/408e7bcf7bd8001b74e29ff71da65811dad6f654629a8047f47bb9b05c9517b5)) |
| Settlement CEP-18 (F402) | `389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0` |
| Verifier | the AI attester account (runs the Groq adjudicator + signs `resolve`) |

**Both paths proven live, end-to-end (with real Groq adjudication):**
- **Honest** — buyer escrows, seller delivers, Groq attester says *meets-spec*, buyer
  **releases** → seller paid `1,000,000` F402.
  [open ↗](https://testnet.cspr.live/deploy/02bfd9cf6c55118ca0ea5eb34b4f36aeea120ca20cc9b565d8c39e164b7f91b1) ·
  [release ↗](https://testnet.cspr.live/deploy/87a30923652d57dc13a4372d7890c93218685a0a01d5aacbae7395446f74a889)
- **Bad** — junk delivery, Groq says *does-not-meet-spec* ("status is 'error' instead of
  'ok'"), buyer **disputes**, the AI verifier **resolves(false)** → buyer **refunded**
  (clawback), seller earns nothing.
  [dispute ↗](https://testnet.cspr.live/deploy/0106f5e033c94b99ad2847c0089763b8e33cfd66ced56c94d84e837da4c94d12) ·
  [resolve ↗](https://testnet.cspr.live/deploy/f6f6c5db8bb63b8bd946ff468f4a63aa9ed9ed441818fa56d0100b5fb5989435)

## The escrow state machine

```
buyer.open(spec) ──▶ HELD ──seller.mark_delivered──▶ (delivery hashed)
   good: buyer.release ─────────────────────────────▶ RELEASED  (seller paid)
   bad:  buyer.dispute ──▶ DISPUTED ──verifier.resolve(deliveredOk)──▶
                                            true  → RELEASED (seller paid)
                                            false → REFUNDED (buyer clawed back)
```

`open` pulls the buyer's CEP-18 into escrow (`transfer_from`, buyer approves first).
`resolve` is **verifier-only** — the off-chain Groq attester adjudicates the spec vs the
delivered response, then signs the on-chain verdict. Reputation: winner +win, loser +loss.

## Layout

| Component | Path | What it is |
|---|---|---|
| **Escrow contract** | `contracts/clawback_escrow` | Odra/Rust — open/mark_delivered/release/dispute/resolve + reputation. **7/7** OdraVM tests. |
| **Agent toolkit** | `clawback-agent` | 12 tools (discover/purchase/inspect/dispute/release/resolve/status/reputation), the **Groq AI attester**, a good/bad seller, a CLI + live demo. |
| **MCP server** | `clawback-mcp` | Exposes the clawback tools to any MCP client (Claude Desktop). |
| **Dashboard** | `clawback-web` | The buyer↔seller escrow lane + transaction firehose (Honest/Bad). |

Skills: `clawback-overview` + `clawback-escrow-buy` in
[fund402-agent-skills](https://github.com/nickthelegend/fund402-agent-skills) (`npx skills add`).

## Run the live demo

```bash
cd clawback-agent && npm install
# .env: CSPR_CLOUD_API_KEY + GROQ_API_KEY (the AI attester); CLAWBACK_ESCROW_PACKAGE is preset
node src/demo.mjs both    # honest (release) + bad (dispute → AI refund), with logging
```

It funds a buyer + seller agent, then runs both scenarios as real on-chain deploys with
terminal-style agent logging (discover → purchase → inspect → release / dispute → resolve).

Open `clawback-web/index.html` (or `node clawback-web/serve.mjs`) for the dashboard.

## Tests

```bash
cargo +nightly-2026-01-01 test --manifest-path contracts/clawback_escrow/Cargo.toml --lib  # 7/7
cd clawback-agent && npm test          # hashes, evaluateDelivery, tool registry
cd clawback-mcp   && npm test          # MCP server up, 12 tools
```

## ⚠️ Security

The agent signs real deploys with local keys (`.env`, `.wallets/` gitignored) —
**testnet only**. The verifier key adjudicates disputes; keep it safe. MIT.
