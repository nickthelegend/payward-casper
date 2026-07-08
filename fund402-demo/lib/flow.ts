// Shared types + the canonical x402 JIT-loan flow steps the demo visualizes.

export type StepId =
  | "request"
  | "intercepted_402"
  | "simulating_borrow"
  | "signing_authorization"
  | "borrow_submitted"
  | "facilitator_settle"
  | "request_retried"
  | "data_received";

export interface FlowStep {
  id: StepId;
  actor: "Agent" | "Gateway" | "Vault" | "Facilitator" | "Casper";
  title: string;
  detail: string;
}

export const FLOW: FlowStep[] = [
  {
    id: "request",
    actor: "Agent",
    title: "Agent requests paid data",
    detail: "GET /v/<vault>/market/casper/stats — wallet balance is 0.",
  },
  {
    id: "intercepted_402",
    actor: "Gateway",
    title: "402 Payment Required",
    detail: "Gateway returns an x402 challenge (payment-required header).",
  },
  {
    id: "simulating_borrow",
    actor: "Vault",
    title: "Simulate JIT borrow",
    detail: "Vault.simulate_borrow → required CSPR collateral at 150%.",
  },
  {
    id: "signing_authorization",
    actor: "Agent",
    title: "Sign EIP-712 authorization",
    detail: "Agent signs the casper-eip-712 transfer_with_authorization payload.",
  },
  {
    id: "borrow_submitted",
    actor: "Vault",
    title: "borrow_and_pay",
    detail: "Vault locks collateral and fronts the CEP-18 payment to the merchant.",
  },
  {
    id: "facilitator_settle",
    actor: "Facilitator",
    title: "POST /settle",
    detail: "casper-x402 facilitator submits transfer_with_authorization.",
  },
  {
    id: "request_retried",
    actor: "Casper",
    title: "Settled on Casper",
    detail: "CEP-18 transfer confirmed — deploy hash returned.",
  },
  {
    id: "data_received",
    actor: "Gateway",
    title: "200 OK · data delivered",
    detail: "Gateway proxies the protected origin response to the agent.",
  },
];

export const actorColor: Record<FlowStep["actor"], string> = {
  Agent: "#34d399",
  Gateway: "#60a5fa",
  Vault: "#f59e0b",
  Facilitator: "#a78bfa",
  Casper: "#f43f5e",
};

// Map a natural-language query to a real origin path the gateway proxies.
export function choosePath(q: string): string {
  const s = q.toLowerCase();
  // Match whole tokens, not substrings (so "something" doesn't match "eth").
  if (/\b(btc|bitcoin)\b/.test(s)) return "prices/BTC-USD/spot";
  if (/\b(eth|ethereum)\b/.test(s)) return "prices/ETH-USD/spot";
  // Coinbase has no CSPR pair; serve real USD market rates for a casper query.
  if (/\b(cspr|casper)\b/.test(s)) return "exchange-rates?currency=USD";
  return "prices/BTC-USD/spot";
}

// Map the agent-sdk's runtime events onto the visualized flow steps.
export const EVENT_TO_STEP: Record<string, StepId> = {
  intercepted_402: "intercepted_402",
  simulating_borrow: "simulating_borrow",
  signing_authorization: "signing_authorization",
  borrow_submitted: "borrow_submitted",
  payment_settled: "facilitator_settle",
  payment_sent: "facilitator_settle",
  request_retried: "request_retried",
  payment_confirmed: "data_received",
};

export interface DemoResult {
  configured: boolean;
  reason?: string;
  error?: string;
  deployHash?: string | null;
  explorerUrl?: string | null;
  data?: Record<string, unknown>;
  events?: StepId[];
}
