---
name: clawback-escrow-buy
description: Buy a deliverable from another agent through Clawback escrow on Casper, then inspect it and either release payment or dispute and get refunded. Use when a buyer agent pays a seller agent for data/work and wants buyer protection — funds held against a spec, an AI attester checking the delivery, and chargeback (refund) if it's junk. Covers the full buyer flow: discover → purchase → inspect → release or dispute → AI resolve.
metadata:
  author: nickthelegend
  version: "1.0.0"
---

# clawback-escrow-buy — pay with escrow + dispute protection

Run the Clawback buyer flow: discover a seller, purchase with a spec (funds **held**),
inspect the delivery with the AI attester, then **release** a good one or **dispute** a
bad one (the AI verifier refunds you). Read `clawback-overview` first.

## Setup

```bash
git clone https://github.com/nickthelegend/clawback-casper && cd clawback-casper/clawback-agent
npm install
# .env: CSPR_CLOUD_API_KEY + GROQ_API_KEY (the AI attester); CLAWBACK_ESCROW_PACKAGE is preset.
```

Create + fund a buyer and seller agent (admin uses the treasury key):

```bash
node src/cli.mjs create_wallet '{"name":"buyer"}'
node src/cli.mjs create_wallet '{"name":"seller"}'
node src/cli.mjs fund_agent '{"account":"buyer","cspr":60,"f402":3000000}'
node src/cli.mjs fund_agent '{"account":"seller","cspr":25}'
```

## The buyer flow

```bash
# 1. discover a clawback-protected seller (ranked by reputation)
node src/cli.mjs clawback_discover '{"query":"BTC-USD price feed","seller":"seller"}'

# 2. purchase with an explicit spec — funds are HELD in escrow. Returns a paymentId.
node src/cli.mjs clawback_purchase '{"spec":"Deliver a BTC-USD price feed matching the schema; no junk/errors/omissions.","maxPrice":1000000,"buyer":"buyer","seller":"seller","mode":"good"}'

# 3. inspect the delivery against the spec (Groq attester) → meets-spec verdict
node src/cli.mjs clawback_inspect_delivery '{"paymentId":"0x…"}'

# 4a. good delivery → release escrow to the seller
node src/cli.mjs clawback_release '{"paymentId":"0x…"}'

# 4b. bad delivery → dispute, then the AI verifier resolves (refunds you)
node src/cli.mjs clawback_dispute '{"paymentId":"0x…","reason":"junk response, violates spec"}'
node src/cli.mjs clawback_resolve '{"paymentId":"0x…"}'   # verifier (Groq) adjudicates
```

`mode:"good"` vs `"bad"` selects a matching vs junk delivery for demos. Each step is a
real on-chain deploy (cspr.live); the spec/response are hashed and committed.

## One command — the live demo

```bash
node src/demo.mjs both    # honest (release) + bad (dispute → AI refund), with logging
```

## What happens

1. `clawback_purchase` fetches the delivery, then on-chain: buyer `approve`s the escrow
   and `open`s the deal (funds **Held**); the seller records the delivery hash.
2. `clawback_inspect_delivery` runs the **Groq attester** over spec vs response.
3. `clawback_release` pays the seller; or `clawback_dispute` + `clawback_resolve` lets
   the **AI verifier** refund the buyer on a junk delivery. Reputation updates on-chain.

## Verified live (casper-test)

The honest + dispute paths run end-to-end on-chain. Example: release
[`87a30923…`](https://testnet.cspr.live/deploy/87a30923652d57dc13a4372d7890c93218685a0a01d5aacbae7395446f74a889);
AI-refund resolve
[`f6f6c5db…`](https://testnet.cspr.live/deploy/f6f6c5db8bb63b8bd946ff468f4a63aa9ed9ed441818fa56d0100b5fb5989435).
