// The Fund402 agent tool registry — consumed by the MCP server and the Groq TUI.
import * as T from "./tools.mjs";
export { CFG, log } from "./config.mjs";

export const TOOLS = [
  {
    name: "create_wallet",
    description: "Generate a fresh ed25519 Casper wallet for an agent. Saved locally (PEM), starts unfunded.",
    inputSchema: { type: "object", properties: { name: { type: "string", description: "wallet name/id (optional)" } } },
    handler: T.create_wallet,
  },
  {
    name: "list_wallets",
    description: "List the agent wallets created so far.",
    inputSchema: { type: "object", properties: {} },
    handler: T.list_wallets,
  },
  {
    name: "get_balances",
    description: "Get the CSPR + F402 (CEP-18) balance of an account — wallet name, public key, or account hash. Defaults to the treasury.",
    inputSchema: { type: "object", properties: { account: { type: "string" } } },
    handler: T.get_balances,
  },
  {
    name: "fund_wallet_cspr",
    description: "Send CSPR (gas) from the funded treasury to an agent wallet. Needed before an agent can sign any deploy.",
    inputSchema: { type: "object", properties: { account: { type: "string" }, cspr: { type: "number", description: "amount of CSPR (default 50)" } }, required: ["account"] },
    handler: T.fund_wallet_cspr,
  },
  {
    name: "fund_wallet_token",
    description: "Send F402 (CEP-18) tokens from the treasury to an account (e.g. to give an agent collateral or repayment funds).",
    inputSchema: { type: "object", properties: { account: { type: "string" }, amount: { type: "number", description: "base units, 9 decimals" } }, required: ["account"] },
    handler: T.fund_wallet_token,
  },
  {
    name: "deposit_liquidity",
    description: "Seed the Fund402 vault's liquidity pool with F402 from the treasury (approve + deposit_liquidity).",
    inputSchema: { type: "object", properties: { amount: { type: "number", description: "base units (default 1e8)" } } },
    handler: T.deposit_liquidity,
  },
  {
    name: "award_reputation",
    description: "Admin: award on-chain reputation to an agent. >=200 makes it Tier 3 (borrows with ZERO collateral).",
    inputSchema: { type: "object", properties: { account: { type: "string" }, delta: { type: "number", description: "default 250" } }, required: ["account"] },
    handler: T.award_reputation,
  },
  {
    name: "borrow_and_pay",
    description: "THE CORE x402 ACTION: the agent borrows F402 just-in-time and the vault fronts the payment to a merchant, settling on Casper. Returns the on-chain deploy + cspr.live link.",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "agent wallet name/pubkey (the borrower; needs CSPR gas)" },
        merchant: { type: "string", description: "merchant account (default treasury)" },
        amount: { type: "number", description: "F402 base units to pay (default 1e6)" },
        collateral: { type: "number", description: "F402 collateral; 0 for Tier-3 agents (default 0)" },
        resource: { type: "string", description: "what the agent is paying for (label)" },
      },
      required: ["agent"],
    },
    handler: T.borrow_and_pay,
  },
  {
    name: "repay_loan",
    description: "The agent repays a loan by id (releases collateral, +10 reputation). Auto-tops-up the agent with the principal first to simulate earnings.",
    inputSchema: { type: "object", properties: { agent: { type: "string" }, loanId: { type: "number" }, amount: { type: "number" } }, required: ["agent"] },
    handler: T.repay_loan,
  },
  {
    name: "sign_x402_payment",
    description: "The agent signs an x402 `exact` EIP-712 payment authorization and (by default) verifies it against the LIVE CSPR.cloud facilitator (/verify → isValid).",
    inputSchema: { type: "object", properties: { agent: { type: "string" }, payTo: { type: "string" }, amount: { type: "number" }, verify: { type: "boolean" } }, required: ["agent"] },
    handler: T.sign_x402_payment,
  },
  {
    name: "get_pool_stats",
    description: "Get the Fund402 vault liquidity pool stats (current F402 liquidity).",
    inputSchema: { type: "object", properties: {} },
    handler: T.get_pool_stats,
  },
  {
    name: "check_deploy",
    description: "Check a Casper deploy's on-chain status (processed/error/cost) by hash.",
    inputSchema: { type: "object", properties: { deployHash: { type: "string" } }, required: ["deployHash"] },
    handler: T.check_deploy,
  },
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
