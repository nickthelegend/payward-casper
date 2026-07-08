// The Fund402 agent toolbox. Every tool is an async fn returning JSON-serializable
// data; all human-facing progress goes to stderr via log() so the MCP stdout stays
// clean. These run LIVE against the deployed vault + CEP-18 on casper-test.
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CFG, log, explorer, accountExplorer } from "./config.mjs";
import {
  PrivateKey, PublicKey, KeyAlgorithm, Args,
  client, treasury, accountHashHex, send, callPkg, transferSession,
  accountKey, pkgKey, u256, u64, i64v, strv,
  csprBalance, tokenBalance, deployStatus, explorer as exp,
} from "./casper.mjs";
import { buildX402Payload, verifyWithFacilitator } from "./eip712.mjs";

mkdirSync(CFG.walletsDir, { recursive: true });
const walletPath = (name) => join(CFG.walletsDir, `${name}.pem`);
const metaPath = join(CFG.walletsDir, "wallets.json");
const loadMeta = () => (existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {});
const saveMeta = (m) => writeFileSync(metaPath, JSON.stringify(m, null, 2));

function loadAgentKey(agent) {
  if (!agent || agent === "treasury") return treasury();
  if (existsSync(walletPath(agent))) return PrivateKey.fromPem(readFileSync(walletPath(agent), "utf8"), KeyAlgorithm.ED25519);
  // maybe a public key that maps to a saved wallet
  const meta = loadMeta();
  const hit = Object.entries(meta).find(([, v]) => v.publicKey === agent || v.accountHash === agent);
  if (hit && existsSync(walletPath(hit[0]))) return PrivateKey.fromPem(readFileSync(walletPath(hit[0]), "utf8"), KeyAlgorithm.ED25519);
  throw new Error(`unknown agent "${agent}" — create_wallet first (have: ${Object.keys(meta).join(", ") || "none"})`);
}
function resolveHash(account) {
  if (!account || account === "treasury") return accountHashHex(treasury());
  if (/^0[12][0-9a-fA-F]{64,66}$/.test(account)) return PublicKey.fromHex(account).accountHash().toHex();
  if (/^[0-9a-fA-F]{64}$/.test(account)) return account.toLowerCase();
  if (existsSync(walletPath(account))) return accountHashHex(PrivateKey.fromPem(readFileSync(walletPath(account), "utf8"), KeyAlgorithm.ED25519));
  const meta = loadMeta();
  if (meta[account]) return meta[account].accountHash;
  throw new Error(`cannot resolve account "${account}"`);
}
function resolvePub(account) {
  if (!account || account === "treasury") return treasury().publicKey.toHex();
  if (/^0[12][0-9a-fA-F]{64,66}$/.test(account)) return account;
  if (existsSync(walletPath(account))) return PrivateKey.fromPem(readFileSync(walletPath(account), "utf8"), KeyAlgorithm.ED25519).publicKey.toHex();
  const meta = loadMeta();
  if (meta[account]?.publicKey) return meta[account].publicKey;
  throw new Error(`need a public key for "${account}"`);
}

// ---------------------------------------------------------------- the tools

export async function create_wallet({ name } = {}) {
  const id = (name || `agent-${Object.keys(loadMeta()).length + 1}`).replace(/[^a-zA-Z0-9_-]/g, "");
  if (existsSync(walletPath(id))) throw new Error(`wallet "${id}" already exists`);
  log(`Generating a fresh ed25519 Casper wallet "${id}"…`);
  const pk = PrivateKey.generate(KeyAlgorithm.ED25519);
  const publicKey = pk.publicKey.toHex();
  const accountHash = pk.publicKey.accountHash().toHex();
  writeFileSync(walletPath(id), pk.toPem(), { mode: 0o600 });
  const meta = loadMeta();
  meta[id] = { publicKey, accountHash, createdAt: Date.now() };
  saveMeta(meta);
  log(`  publicKey:   ${publicKey}`);
  log(`  accountHash: ${accountHash}`);
  log(`  ${accountExplorer(publicKey)}`);
  return { name: id, publicKey, accountHash, explorer: accountExplorer(publicKey), note: "Unfunded — call fund_wallet_cspr to give it gas." };
}

export async function list_wallets() {
  const meta = loadMeta();
  return { count: Object.keys(meta).length, wallets: Object.entries(meta).map(([name, v]) => ({ name, ...v })) };
}

export async function get_balances({ account = "treasury" } = {}) {
  const hash = resolveHash(account);
  log(`Reading balances for ${account} (${hash.slice(0, 10)}…) via CSPR.cloud…`);
  const [cspr, tok] = await Promise.all([csprBalance(hash), tokenBalance(hash)]);
  const token = tok / 1e9; // F402 has 9 decimals
  log(`  CSPR: ${cspr.toFixed(4)}   F402: ${token.toFixed(4)}`);
  return { account, accountHash: hash, cspr, f402: token, f402_base_units: tok };
}

export async function fund_wallet_cspr({ account, cspr = 50 } = {}) {
  const pub = resolvePub(account);
  log(`Treasury → ${account}: sending ${cspr} CSPR (gas)…`);
  const hash = await send(treasury(), transferSession(pub, cspr, Date.now() % 1e9), 1, "fund-cspr");
  return { account, cspr, deployHash: hash, explorer: exp(hash) };
}

export async function fund_wallet_token({ account, amount = 1000000 } = {}) {
  const hash = resolveHash(account);
  log(`Treasury → ${account}: sending ${amount} F402 base units…`);
  const args = Args.fromMap({ recipient: accountKey(hash), amount: u256(amount) });
  const dh = await send(treasury(), callPkg(CFG.cep18Package, "transfer", args), 5, "fund-token");
  return { account, amount, deployHash: dh, explorer: exp(dh) };
}

export async function deposit_liquidity({ amount = 100000000 } = {}) {
  log(`Treasury (LP) seeding ${amount} F402 into the vault pool…`);
  const approve = await send(treasury(), callPkg(CFG.cep18Package, "approve", Args.fromMap({ spender: pkgKey(CFG.vaultPackage), amount: u256(amount) })), 5, "approve-vault");
  const dep = await send(treasury(), callPkg(CFG.vaultPackage, "deposit_liquidity", Args.fromMap({ amount: u256(amount) })), 10, "deposit_liquidity");
  return { amount, approveDeploy: approve, depositDeploy: dep, explorer: exp(dep) };
}

export async function award_reputation({ account, delta = 250 } = {}) {
  const hash = resolveHash(account);
  log(`Admin awarding ${delta} reputation to ${account} (→ Tier ${delta >= 200 ? 3 : delta >= 50 ? 2 : 1})…`);
  const dh = await send(treasury(), callPkg(CFG.vaultPackage, "award_reputation", Args.fromMap({ agent: accountKey(hash), delta: i64v(delta) })), 5, "award_reputation");
  return { account, delta, deployHash: dh, explorer: exp(dh) };
}

export async function borrow_and_pay({ agent, merchant, amount = 1000000, collateral = 0, vaultId = "vault_1", resource } = {}) {
  const signer = loadAgentKey(agent);
  const merchantHash = resolveHash(merchant || "treasury");
  log(`Agent "${agent}" borrowing ${amount} F402 (collateral ${collateral}) to pay merchant ${merchantHash.slice(0, 10)}…`);
  if (resource) log(`  paying for resource: ${resource}`);
  const args = Args.fromMap({
    merchant: accountKey(merchantHash),
    amount: u256(amount),
    collateral: u256(collateral),
    vault_id: strv(vaultId),
  });
  const dh = await send(signer, callPkg(CFG.vaultPackage, "borrow_and_pay", args), 20, "borrow_and_pay");
  log(`  💸 JIT loan settled on Casper — the vault fronted ${amount} F402 to the merchant.`);
  return { agent, merchant: merchantHash, amount, collateral, deployHash: dh, explorer: exp(dh), settled: true };
}

export async function repay_loan({ agent, loanId = 0, amount = 1000000, autofund = true } = {}) {
  const signer = loadAgentKey(agent);
  const agentHash = accountHashHex(signer);
  if (autofund) {
    log(`Topping up agent with ${amount} F402 to repay (simulates earnings)…`);
    await send(treasury(), callPkg(CFG.cep18Package, "transfer", Args.fromMap({ recipient: accountKey(agentHash), amount: u256(amount) })), 5, "earnings-topup");
  }
  log(`Agent "${agent}" repaying loan #${loanId} (${amount} F402)…`);
  await send(signer, callPkg(CFG.cep18Package, "approve", Args.fromMap({ spender: pkgKey(CFG.vaultPackage), amount: u256(amount) })), 5, "approve-repay");
  const dh = await send(signer, callPkg(CFG.vaultPackage, "repay_loan", Args.fromMap({ loan_id: u64(loanId) })), 10, "repay_loan");
  log(`  ✓ Loan repaid — collateral released, reputation +10.`);
  return { agent, loanId, amount, deployHash: dh, explorer: exp(dh) };
}

export async function sign_x402_payment({ agent, payTo, amount = 1000000, asset, verify = true } = {}) {
  const signer = loadAgentKey(agent);
  const payToHash = "00" + resolveHash(payTo || "treasury");
  log(`Agent "${agent}" signing an x402 exact payment authorization (${amount} F402 → ${payToHash.slice(0, 10)}…)…`);
  const built = buildX402Payload(signer, { asset: asset || CFG.cep18Package, payTo: payToHash, amount });
  log(`  signature: ${built.payload.signature.slice(0, 18)}… (${built.payload.signature.length / 2} bytes)`);
  let verification = null;
  if (verify) {
    log(`  POST ${CFG.facilitatorUrl}/verify …`);
    verification = await verifyWithFacilitator(built);
    log(`  facilitator: ${verification.isValid ? "isValid: true ✓" : "isValid: false — " + (verification.invalidReason || "")}`);
  }
  return { agent, authorization: built.payload.authorization, signature: built.payload.signature, publicKey: built.payload.publicKey, verification };
}

export async function get_pool_stats() {
  const vaultHash = "ca4086d3a7b1abf000d0a79e23a237bb484a14807e9438f2c56f3461073e1b2f";
  const pool = (await tokenBalance(CFG.vaultPackage === vaultHash ? vaultHash : CFG.vaultPackage)) / 1e9;
  log(`Vault liquidity pool: ${pool.toFixed(4)} F402`);
  return { vaultPackage: CFG.vaultPackage, cep18Package: CFG.cep18Package, poolLiquidityF402: pool };
}

export async function check_deploy({ deployHash } = {}) {
  const s = await deployStatus(deployHash);
  return { deployHash, ...s, explorer: explorer(deployHash) };
}
