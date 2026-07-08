#!/usr/bin/env node
// fund402-provide-liquidity — be an LP in the Fund402 pool and earn yield. Deposit
// CEP-18 (minted as shares); as agents borrow + repay, the 5% fee accrues to the pool,
// so your shares redeem for MORE than you put in. Withdraw to realize the yield.
//
//   FUND402_AGENT_PEM=./lp.pem node liquidity.mjs deposit  <amountBaseUnits>
//   FUND402_AGENT_PEM=./lp.pem node liquidity.mjs withdraw <shares>
//   FUND402_AGENT_PEM=./lp.pem node liquidity.mjs balance      # your F402 balance (needs CSPR key)
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const reqCwd = createRequire(join(process.cwd(), "_fund402_resolver_.cjs"));
async function fromCwd(spec) {
  try { return await import(spec); } catch {}
  try { return await import(pathToFileURL(reqCwd.resolve(spec)).href); } catch {
    throw new Error(`Cannot find ${spec}. Run \`npm i @nickthelegend69/fund402\` in this directory.`);
  }
}

const CFG = {
  network: process.env.FUND402_NETWORK || "casper:casper-test",
  node: process.env.FUND402_NODE || "https://node.testnet.casper.network/rpc",
  vault: process.env.FUND402_VAULT || "ca4086d3a7b1abf000d0a79e23a237bb484a14807e9438f2c56f3461073e1b2f",
  asset: process.env.FUND402_ASSET || "389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0",
  rest: process.env.FUND402_CSPR_REST || "https://api.testnet.cspr.cloud",
  csprKey: process.env.CSPR_CLOUD_API_KEY || "",
};

const cmd = process.argv[2];
const arg = process.argv[3];
const pemPath = process.env.FUND402_AGENT_PEM;
if (!pemPath) { console.error("set FUND402_AGENT_PEM to the LP's ed25519 secret-key PEM path"); process.exit(1); }
if (!["deposit", "withdraw", "balance"].includes(cmd)) {
  console.error("usage: node liquidity.mjs <deposit <amount> | withdraw <shares> | balance>"); process.exit(1);
}

const sdk = await fromCwd("@nickthelegend69/fund402");
const pem = readFileSync(pemPath, "utf8");
const priv = await sdk.loadPrivateKey(pem);
const pub = priv.publicKey.toHex();
const chainName = CFG.network.includes("test") ? "casper-test" : "casper";
const wiring = { network: CFG.network, nodeUrl: CFG.node, chainName, vaultContractHash: CFG.vault, agentSecretKey: pem, agentPublicKey: pub };

async function lpTokenBalance() {
  if (!CFG.csprKey) return null;
  const ownerHash = sdk.agentTaggedAddress(pub).replace(/^00/, "");
  const r = await fetch(`${CFG.rest}/contract-packages/${CFG.asset}/ft-token-ownership?page_size=200`, { headers: { Authorization: CFG.csprKey } });
  const j = await r.json();
  const row = (j?.data ?? []).find((x) => String(x.owner_hash).toLowerCase() === ownerHash.toLowerCase());
  return row ? BigInt(row.balance) : 0n;
}

if (cmd === "balance") {
  const bal = await lpTokenBalance();
  console.log(JSON.stringify({ lp: pub, f402Balance: bal === null ? "set CSPR_CLOUD_API_KEY to read" : bal.toString() }, null, 2));
  process.exit(0);
}

if (cmd === "deposit") {
  const amount = BigInt(arg || "2000000");
  console.error(`LP ${pub.slice(0, 12)}…  depositing ${amount} F402 into the pool`);
  console.error("  · approving the vault for the deposit…");
  const ap = await sdk.ensureCollateralAllowance({ ...wiring, assetPackageHash: CFG.asset }, { vaultContractHash: CFG.vault }, amount);
  if (!(await sdk.waitForDeploy(wiring, ap.deployHash))) { console.error(`  ✗ approve failed: ${ap.deployHash}`); process.exit(1); }
  console.error("  · deposit_liquidity…");
  const dep = await sdk.depositLiquidityOnChain(wiring, amount);
  const ok = await sdk.waitForDeploy(wiring, dep.deployHash);
  console.log(JSON.stringify({ action: "deposit", amount: amount.toString(), approveDeploy: ap.deployHash, depositDeploy: dep.deployHash, success: ok }, null, 2));
  console.error(ok ? `\n✓ deposited — you hold shares now; they earn yield as agents repay.\n  https://testnet.cspr.live/deploy/${dep.deployHash}` : `\n✗ deposit failed: ${dep.deployHash}`);
  process.exit(ok ? 0 : 1);
}

if (cmd === "withdraw") {
  const shares = BigInt(arg || "0");
  if (shares <= 0n) { console.error("usage: node liquidity.mjs withdraw <shares>"); process.exit(1); }
  const before = await lpTokenBalance();
  console.error(`LP ${pub.slice(0, 12)}…  withdrawing ${shares} shares`);
  const wd = await sdk.withdrawLiquidityOnChain(wiring, shares);
  const ok = await sdk.waitForDeploy(wiring, wd.deployHash);
  const after = await lpTokenBalance();
  const received = before !== null && after !== null ? (after - before).toString() : "set CSPR_CLOUD_API_KEY to measure";
  console.log(JSON.stringify({ action: "withdraw", shares: shares.toString(), received, withdrawDeploy: wd.deployHash, success: ok }, null, 2));
  console.error(ok ? `\n✓ withdrawn — received ${received} F402 for ${shares} shares (more than deposited = yield).\n  https://testnet.cspr.live/deploy/${wd.deployHash}` : `\n✗ withdraw failed: ${wd.deployHash}`);
  process.exit(ok ? 0 : 1);
}
