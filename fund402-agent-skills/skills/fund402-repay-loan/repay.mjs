#!/usr/bin/env node
// fund402-repay-loan — repay the agent's most recent open loan on Casper. Uses the
// vault's repay_latest, so NO loan id is needed: the agent approves the vault for
// principal + the 5% JIT fee, then repays. The vault recovers principal, the fee
// accrues to the pool (LP yield), collateral is released, and reputation +10.
//
//   FUND402_AGENT_PEM=./agent.pem node repay.mjs [principalBaseUnits]
//
// The agent must hold >= principal + fee in F402 (this is the "earnings" it repays
// with). Default principal is 1000000 (0.001 F402); pass the actual borrowed amount.
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
};

const principal = BigInt(process.argv[2] || process.env.FUND402_LOAN_AMOUNT || "1000000");
const fee = (principal * 500n) / 10000n;       // 5% JIT credit fee → LP yield
const due = principal + fee;                    // approve principal + fee
const pemPath = process.env.FUND402_AGENT_PEM;
if (!pemPath) { console.error("set FUND402_AGENT_PEM to your agent's ed25519 secret-key PEM path"); process.exit(1); }

const sdk = await fromCwd("@nickthelegend69/fund402");
const pem = readFileSync(pemPath, "utf8");
const priv = await sdk.loadPrivateKey(pem);
const pub = priv.publicKey.toHex();
const chainName = CFG.network.includes("test") ? "casper-test" : "casper";
const wiring = { network: CFG.network, nodeUrl: CFG.node, chainName, vaultContractHash: CFG.vault, agentSecretKey: pem, agentPublicKey: pub };

console.error(`agent ${pub.slice(0, 12)}…  repaying newest loan  (principal ${principal} + fee ${fee} = ${due})`);

// 1. Approve the vault to pull principal + fee.
console.error("  · approving principal + fee for repayment…");
const { deployHash: approveHash } = await sdk.ensureCollateralAllowance(
  { ...wiring, assetPackageHash: CFG.asset }, { vaultContractHash: CFG.vault }, due
);
if (!(await sdk.waitForDeploy(wiring, approveHash))) {
  console.error(`  ✗ approve failed: https://testnet.cspr.live/deploy/${approveHash}`); process.exit(1);
}

// 2. Repay the newest loan — no loan id needed (vault repay_latest).
console.error("  · calling repay_latest…");
const { deployHash: repayHash } = await sdk.repayLatestOnChain(wiring);
const ok = await sdk.waitForDeploy(wiring, repayHash);

console.log(JSON.stringify({ principal: principal.toString(), fee: fee.toString(), approveDeploy: approveHash, repayDeploy: repayHash, success: ok }, null, 2));
if (ok) console.error(`\n✓ loan repaid — fee ${fee} accrued to LP yield, collateral released, +10 reputation.\n  https://testnet.cspr.live/deploy/${repayHash}`);
else console.error(`\n✗ repay failed (no open loan? insufficient F402/allowance?): https://testnet.cspr.live/deploy/${repayHash}`);
process.exit(ok ? 0 : 1);
