// Clawback agent tools — the escrow purchase + AI-adjudicated dispute flow on Casper.
// Escrow transitions are REAL on-chain deploys (open/mark_delivered/release/dispute/
// resolve) against the deployed ClawbackEscrow + F402 CEP-18. A local mirror tracks
// deal + reputation snapshots (the contract is the authority; reads mirror it).
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CFG, log, explorer } from "./config.mjs";
import {
  casper, PrivateKey, KeyAlgorithm, loadKeyFile, treasury, accountHashHex,
  send, callPkg, transferSession, accountKey, pkgKey, u256, u64, strv,
  tokenBalance, csprBalance,
} from "./casper.mjs";
import { hashSpec, hashResponse, dealId as computeDealId, randomSalt } from "./hash.mjs";
import { adjudicate } from "./groq.mjs";

const { CLValue, PublicKey } = casper;

// ----------------------------------------------------------------- registries
function ensureDir() { if (!existsSync(CFG.walletsDir)) mkdirSync(CFG.walletsDir, { recursive: true }); }
const dealsPath = () => join(CFG.walletsDir, "deals.json");
const repPath = () => join(CFG.walletsDir, "reputation.json");
const walletsPath = () => join(CFG.walletsDir, "wallets.json");
const loadJson = (p, def) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : def);
const saveJson = (p, v) => { ensureDir(); writeFileSync(p, JSON.stringify(v, null, 2)); };

// ----------------------------------------------------------------- wallets
function pem(name) { return join(CFG.walletsDir, `${name}.pem`); }
export function loadAgentKey(name) {
  if (name === "treasury" || name === "verifier") return treasury();
  if (!existsSync(pem(name))) throw new Error(`unknown wallet "${name}" — create_wallet first`);
  return loadKeyFile(pem(name));
}
function registry() { return loadJson(walletsPath(), {}); }

export async function create_wallet({ name } = {}) {
  if (!name) throw new Error("name required");
  ensureDir();
  const key = PrivateKey.generate(KeyAlgorithm.ED25519);
  writeFileSync(pem(name), key.toPem(), { mode: 0o600 });
  const publicKey = key.publicKey.toHex();
  const accountHash = key.publicKey.accountHash().toHex();
  const reg = registry();
  reg[name] = { publicKey, accountHash, createdAt: Date.now() };
  saveJson(walletsPath(), reg);
  log(`Created wallet "${name}" — ${publicKey.slice(0, 14)}…`);
  return { name, publicKey, accountHash, note: "Unfunded — fund with CSPR (gas) + F402." };
}

export async function list_wallets() {
  return { wallets: registry() };
}

export async function get_balances({ account } = {}) {
  const k = loadAgentKey(account);
  const hash = accountHashHex(k);
  const [cspr, tok] = await Promise.all([csprBalance(hash), tokenBalance(hash)]);
  return { account, accountHash: hash, cspr, f402: tok / 1e9, f402_base_units: tok };
}

// Admin (treasury) funds an agent with CSPR + F402.
export async function fund_agent({ account, cspr = 30, f402 = 2_000_000 } = {}) {
  const k = loadAgentKey(account);
  const pub = k.publicKey.toHex(), hash = accountHashHex(k);
  if (cspr > 0) await send(treasury(), transferSession(pub, cspr, Date.now() % 1e9), 1, `fund-cspr ${account}`);
  if (f402 > 0) await send(treasury(), callPkg(CFG.cep18Package, "transfer", casper.Args.fromMap({ recipient: accountKey(hash), amount: u256(f402) })), 5, `fund-f402 ${account}`);
  return { account, cspr, f402, explorer: `https://testnet.cspr.live/account/${pub}` };
}

// ----------------------------------------------------------------- reputation
function repOf(key) { const r = loadJson(repPath(), {}); return r[key] || { won: 0, lost: 0, volume: 0 }; }
function recordRep(key, won, amount) {
  const r = loadJson(repPath(), {});
  const c = r[key] || { won: 0, lost: 0, volume: 0 };
  if (won) c.won += 1; else c.lost += 1;
  c.volume += Number(amount);
  r[key] = c; saveJson(repPath(), r);
}
function score({ won, lost, volume }) {
  const s = 400 + won * 50 + Math.floor(volume / 1_000_000) - lost * 125;
  return s < 0 ? 0 : s;
}

export async function get_reputation({ subject } = {}) {
  // subject = wallet name or account hash; mirrors the on-chain ClawbackEscrow.score.
  let key = subject;
  try { key = accountHashHex(loadAgentKey(subject)); } catch { /* treat as raw */ }
  const c = repOf(key);
  return { subject, accountHash: key, ...c, score: score(c), trustBadge: score(c) >= 450 ? "trusted.data-oracle.clawback.eth" : undefined };
}

// ----------------------------------------------------------------- escrow flow
const SELLER_PRICE = Number(process.env.CLAWBACK_SELLER_PRICE || 1_000_000);
const SELLER_URL = process.env.CLAWBACK_SELLER_URL || "http://127.0.0.1:4021/data";

export async function discover({ query = "data", minReputation = 0, sellerEndpoint, seller = "seller" } = {}) {
  const sellerHash = accountHashHex(loadAgentKey(seller));
  const rep = score(repOf(sellerHash));
  if (rep < minReputation) return { results: [] };
  return {
    results: [{
      endpoint: sellerEndpoint || SELLER_URL,
      price: SELLER_PRICE,
      sellerAgent: sellerHash,
      reputation: rep,
      trustBadge: rep >= 450 ? "trusted.data-oracle.clawback.eth" : undefined,
    }],
  };
}

export async function purchase({ endpoint = SELLER_URL, spec, maxPrice = SELLER_PRICE, window = CFG.windowMs, buyer = "buyer", seller = "seller", mode } = {}) {
  const amount = SELLER_PRICE;
  if (Number(maxPrice) < amount) throw new Error("maxPrice below seller price");
  const buyerKey = loadAgentKey(buyer), sellerKey = loadAgentKey(seller);
  const buyerHash = accountHashHex(buyerKey), sellerHash = accountHashHex(sellerKey);

  // 1. Fetch the delivery from the seller (good = matching, bad = junk).
  log(`Fetching delivery from ${endpoint} …`);
  const url = mode ? `${endpoint}?mode=${mode}` : endpoint;
  let response;
  try {
    const r = await fetch(url, { headers: { "x-clawback-spec": JSON.stringify(spec ?? "") } });
    response = await r.json();
  } catch (e) { response = { status: "error", body: `seller unreachable: ${e.message}` }; }

  const specHash = hashSpec(spec);
  const responseHash = hashResponse(response);
  const salt = randomSalt();
  const paymentId = computeDealId({ buyer: buyerHash, seller: sellerHash, amount, window, specHash, salt });

  // 2. Buyer approves + opens escrow (funds Held).
  log(`Buyer approves escrow + opens deal ${paymentId.slice(0, 12)}… (amount ${amount}) …`);
  await send(buyerKey, callPkg(CFG.cep18Package, "approve", casper.Args.fromMap({ spender: pkgKey(CFG.escrowPackage), amount: u256(amount) })), 5, "approve-escrow");
  const openDeploy = await send(buyerKey, callPkg(CFG.escrowPackage, "open", casper.Args.fromMap({
    deal_id: strv(paymentId), seller: accountKey(sellerHash), amount: u256(amount), window: u64(window), spec_hash: strv(specHash),
  })), 10, "open-escrow");

  // 3. Seller records the delivery hash.
  const deliveredDeploy = await send(sellerKey, callPkg(CFG.escrowPackage, "mark_delivered", casper.Args.fromMap({
    deal_id: strv(paymentId), response_hash: strv(responseHash),
  })), 5, "mark-delivered");

  const deal = {
    paymentId, endpoint, spec, specHash, response, responseHash,
    buyerAgent: buyerHash, sellerAgent: sellerHash, buyerWallet: buyer, sellerWallet: seller,
    amount, deadline: Date.now() + window, status: "held", openDeploy, deliveredDeploy,
  };
  const deals = loadJson(dealsPath(), {}); deals[paymentId] = deal; saveJson(dealsPath(), deals);
  log(`  💰 escrow HELD — ${explorer(openDeploy)}`);
  return { paymentId, status: "held", openDeploy, deliveredDeploy };
}

function requireDeal(paymentId) {
  const deals = loadJson(dealsPath(), {});
  const d = deals[paymentId];
  if (!d) throw new Error(`unknown paymentId ${paymentId}`);
  return d;
}
function saveDeal(d) { const deals = loadJson(dealsPath(), {}); deals[d.paymentId] = d; saveJson(dealsPath(), deals); }

export async function inspect_delivery({ paymentId } = {}) {
  const d = requireDeal(paymentId);
  const specDiff = await adjudicate(d.spec, d.response);
  return { paymentId, responseHash: d.responseHash, response: d.response, specDiff };
}

export async function release({ paymentId } = {}) {
  const d = requireDeal(paymentId);
  if (d.status !== "held") throw new Error(`deal not held (status=${d.status})`);
  const buyerKey = loadAgentKey(d.buyerWallet);
  log(`Buyer releases escrow ${paymentId.slice(0, 12)}… → seller paid`);
  const releaseDeploy = await send(buyerKey, callPkg(CFG.escrowPackage, "release", casper.Args.fromMap({ deal_id: strv(paymentId) })), 8, "release");
  d.status = "released"; saveDeal(d);
  recordRep(d.sellerAgent, true, d.amount); recordRep(d.buyerAgent, true, d.amount);
  log(`  ✅ RELEASED — ${explorer(releaseDeploy)}`);
  return { paymentId, status: "released", releaseDeploy };
}

export async function dispute({ paymentId, reason = "delivery does not meet spec" } = {}) {
  const d = requireDeal(paymentId);
  if (d.status !== "held") throw new Error(`deal not held (status=${d.status})`);
  const buyerKey = loadAgentKey(d.buyerWallet);
  log(`Buyer disputes escrow ${paymentId.slice(0, 12)}… (${reason})`);
  const disputeDeploy = await send(buyerKey, callPkg(CFG.escrowPackage, "dispute", casper.Args.fromMap({ deal_id: strv(paymentId) })), 8, "dispute");
  d.status = "disputed"; d.disputeReason = reason; saveDeal(d);
  log(`  ⚖️  DISPUTED — ${explorer(disputeDeploy)}`);
  return { paymentId, status: "disputed", disputeDeploy };
}

export async function resolve({ paymentId, deliveredOk } = {}) {
  const d = requireDeal(paymentId);
  if (d.status !== "disputed") throw new Error(`deal not disputed (status=${d.status})`);
  let verdict;
  if (typeof deliveredOk !== "boolean") {
    verdict = await adjudicate(d.spec, d.response);
    deliveredOk = verdict.deliveredOk;
  }
  log(`AI verifier adjudicates ${paymentId.slice(0, 12)}… → deliveredOk=${deliveredOk}`);
  const resolveDeploy = await send(loadAgentKey("verifier"), callPkg(CFG.escrowPackage, "resolve", casper.Args.fromMap({
    deal_id: strv(paymentId), delivered_ok: CLValue.newCLValueBool(Boolean(deliveredOk)),
  })), 10, "resolve");
  d.status = deliveredOk ? "released" : "refunded"; saveDeal(d);
  recordRep(d.sellerAgent, deliveredOk, d.amount); recordRep(d.buyerAgent, !deliveredOk, d.amount);
  log(`  ${deliveredOk ? "✅ seller paid" : "↩️  buyer refunded"} — ${explorer(resolveDeploy)}`);
  return { paymentId, status: d.status, deliveredOk, verdict, resolveDeploy };
}

export async function get_status({ paymentId } = {}) {
  return requireDeal(paymentId);
}
