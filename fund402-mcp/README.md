# fund402-mcp

Talk to the [Fund402](https://github.com/nickthelegend/fund402-casper) JIT-credit
protocol in plain English and watch it take **real on-chain actions** on Casper.

**▶ [Watch the 45-second Fund402 demo](https://github.com/nickthelegend/fund402-casper/blob/main/promo/fund402-promo.mp4).**

Two front-ends over the same [fund402-agent](https://github.com/nickthelegend/fund402-agent)
toolbox:

1. **TUI** — a terminal chat console. You type; **Groq** (the LLM) decides which
   tools to call; the tools execute **live on casper-test** and stream their logs
   (deploy hashes, cspr.live links, balances) right in front of you.
2. **MCP server** — exposes every Fund402 tool over stdio to any MCP client
   (Claude Desktop, etc.).

```
 you ──▶ TUI / MCP client ──▶ Groq (tool-calling) ──▶ fund402-agent tools ──▶ Casper testnet
                                                                      └─▶ x402 facilitator
```

## The TUI

```bash
npm install
# config (key) lives in ../fund402-agent/.env — GROQ_API_KEY + CSPR_CLOUD_API_KEY
npm run tui
```

Then just talk:

```
you ▸ create a wallet called bob, fund it, make it Tier 3, and borrow 0.001 to pay for a price feed

🔧 create_wallet {"name":"bob"}
🔧 fund_wallet_cspr {"account":"bob","cspr":60}
🔧 award_reputation {"account":"bob","delta":250}
🔧 borrow_and_pay {"agent":"bob","amount":1000000,"resource":"price feed"}
🤖 Done. bob is Tier 3 and just borrowed 0.001 F402 — the vault fronted the
   payment on-chain. Deploy: https://testnet.cspr.live/deploy/…
```

The model knows the protocol rules (fund-before-sign, Tier-3-for-zero-collateral,
9-decimal amounts) from its system prompt, so one sentence drives the whole sequence.

## The MCP server (Claude Desktop)

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "fund402": {
      "command": "node",
      "args": ["/absolute/path/to/fund402-mcp/src/server.mjs"]
    }
  }
}
```

stdout is the JSON-RPC channel; all tool logs go to stderr, so the protocol stays clean.
Run `npm test` for an MCP client smoke test (lists tools, calls `get_pool_stats` +
`get_balances` live).

## Tools

All 12 [fund402-agent](https://github.com/nickthelegend/fund402-agent) tools are
exposed: `create_wallet`, `list_wallets`, `get_balances`, `fund_wallet_cspr`,
`fund_wallet_token`, `deposit_liquidity`, `award_reputation`, **`borrow_and_pay`**,
`repay_loan`, `sign_x402_payment`, `get_pool_stats`, `check_deploy`.

## Verified live

Driven entirely from the TUI against the deployed vault `664d99de…` + CEP-18
`389cedc5…` on casper-test: a fresh agent was created → funded → made Tier 3 →
**borrowed via the vault (x402 payment fronted + settled on-chain)** → repaid
(collateral released). Every step returned a real cspr.live deploy.

## ⚠️ Security

The TUI/MCP execute real signed deploys via fund402-agent's local keys. Keep
`.env` and `.wallets/` out of git — **testnet only**. License: Apache-2.0.
