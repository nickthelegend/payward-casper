#!/usr/bin/env node
// Clawback LIVE demo on casper-test: a buyer agent pays a seller agent through escrow,
// inspects the delivery (Groq attester), and either RELEASES (honest) or DISPUTES →
// the AI verifier REFUNDS (bad). Real on-chain deploys + F402 settlement.
//
//   node src/demo.mjs           # both scenarios
//   node src/demo.mjs honest    # only the honest path
//   node src/demo.mjs bad       # only the dispute/refund path
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CFG } from "./config.mjs";
import { TOOL_MAP } from "./index.mjs";
import { start as startSeller } from "./seller.mjs";

const c = { d: "\x1b[2m", g: "\x1b[32m", c: "\x1b[36m", y: "\x1b[33m", m: "\x1b[35m", r: "\x1b[31m", b: "\x1b[1m", x: "\x1b[0m" };
const line = () => console.log(c.d + "─".repeat(96) + c.x);
const think = (s) => { line(); console.log(`${c.b}• ${s}${c.x}`); };
async function call(tool, args) {
  console.log(`\n${c.c}• Called ${c.b}clawback.${tool}${c.x}${c.c}(${JSON.stringify(args)})${c.x}`);
  const res = await TOOL_MAP[tool].handler(args);
  console.log(`${c.d}  └ ${JSON.stringify(res)}${c.x}`);
  return res;
}
const SPEC = "Deliver a BTC-USD price feed payload that matches the requested schema (status ok, pair, price, source). No junk, errors, substitutions, or omissions.";

async function ensureAgents() {
  for (const name of ["buyer", "seller"]) {
    if (!existsSync(join(CFG.walletsDir, `${name}.pem`))) await TOOL_MAP.create_wallet.handler({ name });
  }
  console.log(`${c.y}funding buyer + seller (CSPR gas + F402)…${c.x}`);
  await TOOL_MAP.fund_agent.handler({ account: "buyer", cspr: 60, f402: 3_000_000 });
  await TOOL_MAP.fund_agent.handler({ account: "seller", cspr: 25, f402: 0 });
}

async function balances(tag) {
  const [b, s] = await Promise.all([TOOL_MAP.get_balances.handler({ account: "buyer" }), TOOL_MAP.get_balances.handler({ account: "seller" })]);
  console.log(`${c.m}  ${tag}: buyer F402=${b.f402_base_units}  seller F402=${s.f402_base_units}${c.x}`);
  return { buyer: b.f402_base_units, seller: s.f402_base_units };
}

async function honest() {
  console.log(`\n${c.b}${c.g}══ HONEST scenario — good delivery → release ══${c.x}`);
  think("I need a BTC-USD price feed. Let me discover a clawback-protected seller and check its reputation before paying.");
  const disc = await call("clawback_discover", { query: "BTC-USD price feed", minReputation: 0, seller: "seller", sellerEndpoint: "http://127.0.0.1:4021/data" });
  const before = await balances("before");
  think("Reputation is fine. Purchasing with the seller price as maxPrice — funds will be HELD in escrow until I'm satisfied.");
  const buy = await call("clawback_purchase", { endpoint: disc.results[0].endpoint, spec: SPEC, maxPrice: disc.results[0].price, buyer: "buyer", seller: "seller", mode: "good" });
  think("Escrow is held. Before releasing, I inspect the delivery against my spec with the AI attester.");
  const insp = await call("clawback_inspect_delivery", { paymentId: buy.paymentId });
  think(`Verdict "${insp.specDiff.verdict}" (by ${insp.specDiff.by}) — delivery meets spec. Releasing escrow to the seller.`);
  const rel = await call("clawback_release", { paymentId: buy.paymentId });
  const after = await balances("after");
  console.log(`${c.g}  → seller earned ${after.seller - before.seller} F402 (escrow released).${c.x}`);
  return {
    paymentId: buy.paymentId, responseHash: insp.responseHash,
    verdict: insp.specDiff.verdict, verdictBy: insp.specDiff.by,
    deploys: { open: buy.openDeploy, delivered: buy.deliveredDeploy, release: rel.releaseDeploy },
    outcome: "released", sellerEarned: after.seller - before.seller, buyerBefore: before.buyer, buyerAfter: after.buyer,
  };
}

async function bad() {
  console.log(`\n${c.b}${c.r}══ BAD scenario — junk delivery → dispute → AI refund ══${c.x}`);
  think("Same flow against a different seller endpoint. I'll only release if the inspection confirms the payload matches.");
  const disc = await call("clawback_discover", { query: "BTC-USD price feed", seller: "seller", sellerEndpoint: "http://127.0.0.1:4022/data" });
  const before = await balances("before");
  think("Purchasing the 4022 endpoint; funds held in escrow, then I rely on inspection before any release.");
  const buy = await call("clawback_purchase", { endpoint: disc.results[0].endpoint, spec: SPEC, maxPrice: disc.results[0].price, buyer: "buyer", seller: "seller", mode: "bad" });
  think("Inspecting payment now.");
  const insp = await call("clawback_inspect_delivery", { paymentId: buy.paymentId });
  think(`Inspection says deliveredOk:false and the response is an error body — disputing escrow.`);
  const dis = await call("clawback_dispute", { paymentId: buy.paymentId, reason: "response is junk with no requested data; violates the stated spec" });
  think("Dispute opened. The Confidential AI Attester adjudicates the spec vs the delivered response.");
  const res = await call("clawback_resolve", { paymentId: buy.paymentId });
  const after = await balances("after");
  console.log(`${c.r}  → seller earned ${after.seller - before.seller} F402 on the junk delivery; the buyer's ${SELLER_PRICE} escrow was clawed back (refunded) by the AI verifier.${c.x}`);
  return {
    paymentId: buy.paymentId, responseHash: insp.responseHash,
    verdict: insp.specDiff.verdict, verdictBy: insp.specDiff.by, verdictNotes: (res.verdict?.notes || []).join("; "),
    deploys: { open: buy.openDeploy, delivered: buy.deliveredDeploy, dispute: dis.disputeDeploy, resolve: res.resolveDeploy },
    outcome: "refunded", buyerRefunded: SELLER_PRICE, sellerEarned: after.seller - before.seller,
  };
}
const SELLER_PRICE = 1_000_000;

async function main() {
  const which = process.argv[2] || "both";
  const goodSrv = startSeller(4021, "good");
  const badSrv = startSeller(4022, "bad");
  await new Promise((r) => setTimeout(r, 300));
  await ensureAgents();
  const out = { note: "Real on-chain results of the live Clawback demo on casper-test. Every hash is a real deploy on cspr.live — no simulated data.", network: "casper-test", escrow: CFG.escrowPackage, asset: CFG.cep18Package, amount: SELLER_PRICE };
  try {
    if (which === "honest" || which === "both") out.honest = await honest();
    if (which === "bad" || which === "both") out.bad = await bad();
  } finally {
    goodSrv.close(); badSrv.close();
  }
  // Persist the REAL run for the dashboard (clawback-web reads this — no mock data).
  if (out.honest && out.bad) {
    try {
      const statePath = join(CFG.walletsDir, "..", "..", "clawback-web", "demo-state.json");
      writeFileSync(statePath, JSON.stringify(out, null, 2));
      console.log(`${c.d}wrote real demo state → ${statePath}${c.x}`);
    } catch (e) { console.log(`${c.d}(could not write demo-state.json: ${e.message})${c.x}`); }
  }
  line();
  console.log(`${c.b}${c.g}Clawback demo complete — escrow purchase, AI-adjudicated dispute, on-chain settlement.${c.x}`);
  process.exit(0);
}

main().catch((e) => { console.error(c.r + (e?.stack || e) + c.x); process.exit(1); });
