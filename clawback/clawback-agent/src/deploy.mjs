#!/usr/bin/env node
// Deploy ClawbackEscrow to casper-test via casper-js-sdk ModuleBytes (odra_cfg_*),
// init(asset_token = F402 CEP-18, verifier = treasury). Prints the package hash to
// add to .env as CLAWBACK_ESCROW_PACKAGE.
import casperPkg from "casper-js-sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CFG, log, explorer } from "./config.mjs";

const casper = casperPkg.default ?? casperPkg;
const {
  HttpHandler, RpcClient, PrivateKey, KeyAlgorithm, Deploy, DeployHeader,
  ExecutableDeployItem, Args, CLValue, Key, Duration, DEFAULT_DEPLOY_TTL, AccountIdentifier,
} = casper;

const HERE = dirname(fileURLToPath(import.meta.url));
const WASM = join(HERE, "..", "..", "contracts", "clawback_escrow", "wasm", "ClawbackEscrow.wasm");
const client = new RpcClient(new HttpHandler(CFG.nodeUrl));
const deployer = PrivateKey.fromPem(readFileSync(CFG.treasuryPem, "utf8"), KeyAlgorithm.ED25519);
const pkgHex = (s) => String(s).replace(/^(hash-|contract-package-|package-)/, "");

async function waitDeploy(hash, tries = 60, intervalMs = 3000) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await client.getDeploy(hash);
      const txt = JSON.stringify(res?.executionResults ?? res?.executionInfo ?? res ?? {});
      if (txt.includes('"Failure"') || /"error_?[Mm]essage":\s*"[^"]/.test(txt)) return false;
      if (txt.includes('"Success"') || txt.includes('"cost"')) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function readNamedKey(name) {
  const res = await client.getAccountInfo(null, new AccountIdentifier(undefined, deployer.publicKey));
  const raw = res?.rawJSON?.account?.named_keys ?? res?.account?.namedKeys ?? [];
  const f = (Array.isArray(raw) ? raw : []).find((k) => k.name === name);
  return f ? String(f.key) : null;
}

const verifierAccountHash = deployer.publicKey.accountHash().toHex(); // treasury = AI attester
const args = Args.fromMap({
  asset_token: CLValue.newCLKey(Key.newKey("hash-" + pkgHex(CFG.cep18Package))),
  verifier: CLValue.newCLKey(Key.newKey("account-hash-" + verifierAccountHash)),
  odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
  odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
  odra_cfg_allow_key_override: CLValue.newCLValueBool(true),
  odra_cfg_package_hash_key_name: CLValue.newCLString("clawback_escrow_package_hash"),
});

const wasm = new Uint8Array(readFileSync(WASM));
const header = DeployHeader.default();
header.account = deployer.publicKey;
header.chainName = CFG.chainName;
header.ttl = new Duration(DEFAULT_DEPLOY_TTL);
const deploy = Deploy.makeDeploy(
  header,
  ExecutableDeployItem.standardPayment(String(BigInt(300) * 10n ** 9n)), // 300 CSPR
  ExecutableDeployItem.newModuleBytes(wasm, args)
);
deploy.sign(deployer);

log(`Deploying ClawbackEscrow (asset=F402 ${pkgHex(CFG.cep18Package).slice(0, 10)}…, verifier=${verifierAccountHash.slice(0, 10)}…)`);
const { deployHash } = await client.putDeploy(deploy);
const hash = deployHash.toHex();
log(`  install: ${hash}\n  ${explorer(hash)}`);
const ok = await waitDeploy(hash);
log(`  install: ${ok ? "SUCCESS ✓" : "FAILED ✗"}`);
if (!ok) process.exit(1);

const pkg = await readNamedKey("clawback_escrow_package_hash");
log(`\nClawbackEscrow package: ${pkg}`);
log(`Add to clawback-agent/.env:\n  CLAWBACK_ESCROW_PACKAGE=${pkgHex(pkg)}`);
console.log(pkgHex(pkg));
