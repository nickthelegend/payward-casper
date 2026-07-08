---
name: clawback-overview
description: Understand Clawback — agent payment escrow with AI-adjudicated disputes (chargebacks for the machine economy) on Casper — before using the other clawback skills. Read this first when an agent needs to pay another agent for a deliverable with buyer protection: funds are held in escrow against a stated spec, released on a good delivery, or disputed and refunded by an AI verifier on a bad one. This is a SEPARATE settlement layer from Fund402 (which fronts credit); Clawback escrows + adjudicates.
metadata:
  author: nickthelegend
  version: "1.0.0"
---

# Clawback — overview

Clawback is **agent payment escrow with AI-adjudicated disputes** on Casper. When a
buyer agent pays a seller agent for a deliverable, the funds are **held in escrow**
against a stated **spec**. If the delivery is good, the buyer **releases** it (seller
paid). If it's junk, the buyer **disputes**, and a trusted **AI verifier** (a Groq
attester) adjudicates — paying the seller or **refunding the buyer**. Reputation
(won/lost/volume → score) accrues per agent.

It's the **chargeback primitive for the machine economy** — and a settlement layer
**separate from Fund402**: Fund402 *fronts* payments (just-in-time credit); Clawback
*escrows* them with dispute resolution.

## The flow

```
buyer ──discover──▶ rank sellers by reputation
buyer ──purchase(spec)──▶ Clawback escrow: funds HELD; seller delivers (hash recorded)
buyer ──inspect──▶ AI attester compares delivery vs spec → meets-spec?
   good  → buyer ──release──▶ seller paid (Released), reputation up
   bad   → buyer ──dispute──▶ Disputed → AI verifier ──resolve──▶ refund buyer (Refunded)
```

## Escrow states

`Held` → `Released` (seller paid) · `Refunded` (buyer clawed back) · `Disputed`
(awaiting the AI verifier).

## The tools

| Tool | Who | What |
|---|---|---|
| `clawback_discover` | buyer | find clawback-protected sellers, ranked by reputation |
| `clawback_purchase` | buyer | buy with a spec; funds **HELD** in escrow → `paymentId` |
| `clawback_inspect_delivery` | buyer | AI-compare the delivery vs the spec (Groq) → verdict |
| `clawback_release` | buyer | release escrow to the seller (good delivery) |
| `clawback_dispute` | buyer | dispute a bad delivery within the window |
| `clawback_resolve` | verifier | AI adjudicates a dispute → pay seller or refund buyer |
| `clawback_get_status` / `clawback_get_reputation` | any | read escrow state / agent reputation |

Use **clawback-escrow-buy** to run the buyer flow.

## Live deployment (casper-test)

- ClawbackEscrow package: `088655d1c0b612cf90d14d43d9fabc390e2c833189d966fcbfb195cc5888efb9`
- Settlement CEP-18 (F402): `389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0`
- Verifier = the AI attester account (runs the Groq adjudicator + signs `resolve`).

All actions are **real on-chain** via the `clawback-agent` toolkit
([clawback-casper](https://github.com/nickthelegend/clawback-casper)).
