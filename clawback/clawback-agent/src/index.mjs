// Clawback agent — tool registry (MCP/skill-friendly) + re-exports.
export { CFG, log } from "./config.mjs";
import * as T from "./tools.mjs";

const obj = (properties, required = []) => ({ type: "object", properties, required });
const S = { string: { type: "string" }, number: { type: "number" }, bool: { type: "boolean" } };

export const TOOLS = [
  { name: "create_wallet", description: "Generate a fresh ed25519 Casper agent wallet (buyer or seller).", inputSchema: obj({ name: S.string }, ["name"]), handler: T.create_wallet },
  { name: "list_wallets", description: "List created agent wallets.", inputSchema: obj({}), handler: T.list_wallets },
  { name: "get_balances", description: "CSPR + F402 balances of an agent.", inputSchema: obj({ account: S.string }, ["account"]), handler: T.get_balances },
  { name: "fund_agent", description: "Admin: fund an agent with CSPR (gas) and F402 (settlement token).", inputSchema: obj({ account: S.string, cspr: S.number, f402: S.number }, ["account"]), handler: T.fund_agent },
  { name: "clawback_discover", description: "Find clawback-protected sellers and rank by live reputation before paying.", inputSchema: obj({ query: S.string, minReputation: S.number, seller: S.string, sellerEndpoint: S.string }), handler: T.discover },
  { name: "clawback_purchase", description: "Buy from an endpoint with an explicit spec; funds are HELD in escrow during the dispute window. Returns a paymentId.", inputSchema: obj({ endpoint: S.string, spec: { type: ["string", "object"] }, maxPrice: S.number, window: S.number, buyer: S.string, seller: S.string, mode: S.string }, ["spec"]), handler: T.purchase },
  { name: "clawback_inspect_delivery", description: "AI-compare the delivered response against the purchase spec (Groq attester) → meets-spec verdict.", inputSchema: obj({ paymentId: S.string }, ["paymentId"]), handler: T.inspect_delivery },
  { name: "clawback_release", description: "Release escrow to the seller on a satisfactory delivery (builds reputation).", inputSchema: obj({ paymentId: S.string }, ["paymentId"]), handler: T.release },
  { name: "clawback_dispute", description: "Open a dispute for a clear spec violation. A Confidential AI Attester adjudicates.", inputSchema: obj({ paymentId: S.string, reason: S.string }, ["paymentId"]), handler: T.dispute },
  { name: "clawback_resolve", description: "AI verifier adjudicates a dispute: pay the seller or refund the buyer (verifier-only).", inputSchema: obj({ paymentId: S.string, deliveredOk: S.bool }, ["paymentId"]), handler: T.resolve },
  { name: "clawback_get_status", description: "Read the latest escrow state for a payment.", inputSchema: obj({ paymentId: S.string }, ["paymentId"]), handler: T.get_status },
  { name: "clawback_get_reputation", description: "Read an agent's clawback reputation (won/lost/volume/score).", inputSchema: obj({ subject: S.string }, ["subject"]), handler: T.get_reputation },
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
