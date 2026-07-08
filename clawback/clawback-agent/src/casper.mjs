// Low-level Casper helpers (casper-js-sdk v5) — proven patterns from the live e2e.
import casperPkg from "casper-js-sdk";
import { readFileSync } from "node:fs";
import { CFG, log, explorer } from "./config.mjs";

const casper = casperPkg.default ?? casperPkg;
const {
  HttpHandler, RpcClient, PrivateKey, PublicKey, KeyAlgorithm,
  Deploy, DeployHeader, ExecutableDeployItem, StoredVersionedContractByHash,
  TransferDeployItem, Args, CLValue, Key, ContractHash, Duration, DEFAULT_DEPLOY_TTL, AccountIdentifier,
} = casper;

export const client = new RpcClient(new HttpHandler(CFG.nodeUrl));
export { casper, PrivateKey, PublicKey, KeyAlgorithm, Args };

export const motes = (cspr) => String(BigInt(Math.round(Number(cspr) * 1e9)));
export const pkgHex = (s) => String(s).replace(/^(hash-|contract-package-|package-)/, "");
export { explorer };

export function loadKeyPem(pem, algo = KeyAlgorithm.ED25519) {
  return PrivateKey.fromPem(pem, algo);
}
export function loadKeyFile(path, algo = KeyAlgorithm.ED25519) {
  return PrivateKey.fromPem(readFileSync(path, "utf8"), algo);
}
export const treasury = () => loadKeyFile(CFG.treasuryPem);
export const accountHashHex = (pk) => pk.publicKey.accountHash().toHex();

function header(senderPub) {
  const h = DeployHeader.default();
  h.account = senderPub;
  h.chainName = CFG.chainName;
  h.ttl = new Duration(DEFAULT_DEPLOY_TTL);
  return h;
}

export async function send(signer, session, payCspr, label) {
  const deploy = Deploy.makeDeploy(header(signer.publicKey), ExecutableDeployItem.standardPayment(motes(payCspr)), session);
  deploy.sign(signer);
  const { deployHash } = await client.putDeploy(deploy);
  const hash = deployHash.toHex();
  log(`  ▸ ${label} submitted: ${hash}`);
  log(`    ${explorer(hash)}`);
  const ok = await waitDeploy(hash);
  log(`  ▸ ${label}: ${ok ? "SUCCESS ✓" : "FAILED ✗"}`);
  if (!ok) throw new Error(`${label} deploy failed — ${explorer(hash)}`);
  return hash;
}

export async function waitDeploy(hash, tries = 60, intervalMs = 3000) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await client.getDeploy(hash);
      const txt = JSON.stringify(res?.executionResults ?? res?.executionInfo ?? res ?? {});
      if (txt.includes('"Failure"')) return false;
      if (txt.includes('"Success"') || txt.includes('"cost"')) return true;
    } catch {
      /* not propagated yet */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export function callPkg(pkgStr, entryPoint, args) {
  const s = new ExecutableDeployItem();
  s.storedVersionedContractByHash = new StoredVersionedContractByHash(
    ContractHash.newContract(pkgHex(pkgStr)),
    entryPoint,
    args,
    undefined
  );
  return s;
}

export function transferSession(toPubHex, cspr, id = 1) {
  const s = new ExecutableDeployItem();
  s.transfer = TransferDeployItem.newTransfer(motes(cspr), PublicKey.fromHex(toPubHex), null, id);
  return s;
}

// CLValue arg helpers
export const accountKey = (h) => CLValue.newCLKey(Key.newKey("account-hash-" + String(h).replace(/^account-hash-/, "")));
export const pkgKey = (pkgStr) => CLValue.newCLKey(Key.newKey("hash-" + pkgHex(pkgStr)));
export const u256 = (v) => CLValue.newCLUInt256(String(v));
export const u64 = (v) => CLValue.newCLUint64(BigInt(v));
export const i64v = (v) => CLValue.newCLInt64(Number(v));
export const strv = (v) => CLValue.newCLString(String(v));

// ---- CSPR.cloud reads ----
const cloudHeaders = () => (CFG.csprCloudKey ? { Authorization: CFG.csprCloudKey } : {});

export async function csprBalance(idHexOrPub) {
  try {
    const r = await fetch(`${CFG.csprCloudRest}/accounts/${idHexOrPub}`, { headers: cloudHeaders() });
    const j = await r.json();
    return j?.data?.balance ? Number(j.data.balance) / 1e9 : 0;
  } catch {
    return 0;
  }
}

export async function tokenBalance(ownerHash, pkg = CFG.cep18Package) {
  try {
    const r = await fetch(`${CFG.csprCloudRest}/contract-packages/${pkgHex(pkg)}/ft-token-ownership?page_size=100`, { headers: cloudHeaders() });
    const j = await r.json();
    const row = (j?.data ?? []).find((x) => String(x.owner_hash).toLowerCase() === String(ownerHash).toLowerCase());
    return row ? Number(row.balance) : 0;
  } catch {
    return 0;
  }
}

export async function deployStatus(hash) {
  try {
    const r = await fetch(`${CFG.csprCloudRest}/deploys/${hash}`, { headers: cloudHeaders() });
    const d = (await r.json())?.data ?? {};
    return { status: d.status, error: d.error_message, cost: d.cost ? Number(d.cost) / 1e9 : null };
  } catch (e) {
    return { status: "unknown", error: String(e) };
  }
}

export async function readNamedKey(signerPub, keyName) {
  const res = await client.getAccountInfo(null, new AccountIdentifier(undefined, signerPub));
  const raw = res?.rawJSON?.account?.named_keys ?? res?.account?.namedKeys ?? [];
  const f = (Array.isArray(raw) ? raw : []).find((k) => k.name === keyName);
  return f ? String(f.key) : null;
}
