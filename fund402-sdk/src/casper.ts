// Real Casper wiring (casper-js-sdk@5.x / Casper 2.0 Condor). Turns the abstract
// "borrow + settle" steps into actual on-chain calls against the Fund402 Vault,
// and builds the x402 `exact` PaymentPayload the facilitator's POST /verify checks.
//
// The payload is signed off the proven `eip712.ts` digest + `signAndAddAlgorithmBytes`
// (65-byte [algorithm|sig]) — byte-identical to the official @make-software/casper-x402
// client, but WITHOUT depending on its broken CJS build at runtime.

import {
  HttpHandler,
  RpcClient,
  PrivateKey,
  PublicKey,
  KeyAlgorithm,
  Deploy,
  DeployHeader,
  ExecutableDeployItem,
  StoredVersionedContractByHash,
  ContractHash,
  Args,
  CLValue,
  Key,
  Duration,
  DEFAULT_DEPLOY_TTL,
} from "casper-js-sdk";
import { transferAuthorizationDigest, randomNonce, bytesToHex } from "./eip712";
import type { PaymentRequirements } from "./types";

export interface CasperWiringConfig {
  nodeUrl: string;
  network: string; // CAIP-2, e.g. "casper:casper-test"
  chainName: string; // "casper-test"
  vaultContractHash: string; // 64-hex contract hash (no prefix)
  agentSecretKey: string; // PEM contents or hex
  agentPublicKey: string; // account-key hex (01.. ed25519 / 02.. secp256k1)
  keyAlgorithm?: KeyAlgorithm;
  /** payment (gas) in motes for a borrow_and_pay call. Default 5 CSPR. */
  borrowGasMotes?: string;
}

export function rpc(nodeUrl: string): RpcClient {
  return new RpcClient(new HttpHandler(nodeUrl));
}

export async function loadPrivateKey(
  secret: string,
  algo: KeyAlgorithm = KeyAlgorithm.ED25519
): Promise<PrivateKey> {
  const trimmed = secret.trim();
  if (trimmed.includes("BEGIN") && trimmed.includes("PRIVATE KEY")) {
    return PrivateKey.fromPem(trimmed, algo);
  }
  return PrivateKey.fromHex(trimmed, algo);
}

const stripPkg = (s: string) => s.replace(/^(hash-|contract-package-|package-)/, "");

/**
 * Build a CLKey arg from an account address. Accepts a raw 64-hex account hash,
 * an "account-hash-…" formatted string, OR an x402 *tagged* address ("00" + 64-hex,
 * the Account tag) as carried in a payment challenge's `payTo` — the 1-byte tag is
 * stripped so the on-chain Key uses the bare 32-byte account hash.
 */
function addressKey(addr: string): CLValue {
  let h = addr.replace(/^account-hash-/, "");
  if (/^00[0-9a-fA-F]{64}$/.test(h)) h = h.slice(2); // drop the "00" account tag
  return CLValue.newCLKey(Key.newKey(`account-hash-${h}`));
}

/** Build a CLKey arg for a contract/package ("hash-<package>"). */
function pkgKey(pkgHash: string): CLValue {
  return CLValue.newCLKey(Key.newKey("hash-" + stripPkg(pkgHash)));
}

/**
 * Session item calling a stored contract BY PACKAGE HASH (StoredVersionedContractByHash,
 * latest version). This is the path proven live on testnet — the deployed Fund402
 * vault + CEP-18 are addressed by their package hash (what cspr.live shows).
 */
function callPkg(pkgHash: string, entryPoint: string, args: Args): ExecutableDeployItem {
  const s = new ExecutableDeployItem();
  s.storedVersionedContractByHash = new StoredVersionedContractByHash(
    ContractHash.newContract(stripPkg(pkgHash)),
    entryPoint,
    args,
    undefined
  );
  return s;
}

/**
 * Call the vault's `borrow_and_pay(merchant, amount, collateral, vault_id)`.
 * The vault pulls the agent's CEP-18 collateral into escrow (transfer_from) and
 * fronts the CEP-18 `amount` to the merchant from the liquidity pool. Returns the
 * settlement deploy hash. (Tier-3 agents borrow with zero collateral; lower tiers
 * must `approve` the vault for >= collateral first — see ensureCollateralAllowance.)
 */
export async function borrowAndPayOnChain(
  cfg: CasperWiringConfig,
  args: { merchant: string; amount: bigint; collateral: bigint; vaultId: string }
): Promise<{ deployHash: string }> {
  const client = rpc(cfg.nodeUrl);
  const algo = cfg.keyAlgorithm ?? KeyAlgorithm.ED25519;
  const signer = await loadPrivateKey(cfg.agentSecretKey, algo);
  const sender = PublicKey.fromHex(cfg.agentPublicKey);

  const runtimeArgs = Args.fromMap({
    merchant: addressKey(args.merchant),
    amount: CLValue.newCLUInt256(args.amount.toString()),
    collateral: CLValue.newCLUInt256(args.collateral.toString()),
    vault_id: CLValue.newCLString(args.vaultId),
  });

  const header = DeployHeader.default();
  header.account = sender;
  header.chainName = cfg.chainName;
  header.ttl = new Duration(DEFAULT_DEPLOY_TTL);

  const session = callPkg(cfg.vaultContractHash, "borrow_and_pay", runtimeArgs);

  const payment = ExecutableDeployItem.standardPayment(cfg.borrowGasMotes ?? "5000000000");
  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(signer);

  const result = await client.putDeploy(deploy);
  return { deployHash: result.deployHash.toHex() };
}

/** Repay a loan: vault pulls principal back from the agent (CEP-18 allowance required). */
export async function repayLoanOnChain(
  cfg: CasperWiringConfig,
  loanId: number
): Promise<{ deployHash: string }> {
  const client = rpc(cfg.nodeUrl);
  const algo = cfg.keyAlgorithm ?? KeyAlgorithm.ED25519;
  const signer = await loadPrivateKey(cfg.agentSecretKey, algo);
  const sender = PublicKey.fromHex(cfg.agentPublicKey);

  const header = DeployHeader.default();
  header.account = sender;
  header.chainName = cfg.chainName;
  header.ttl = new Duration(DEFAULT_DEPLOY_TTL);

  const session = callPkg(
    cfg.vaultContractHash,
    "repay_loan",
    Args.fromMap({ loan_id: CLValue.newCLUint64(BigInt(loanId)) })
  );

  const payment = ExecutableDeployItem.standardPayment("3000000000");
  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(signer);

  const result = await client.putDeploy(deploy);
  return { deployHash: result.deployHash.toHex() };
}

/**
 * Repay the agent's **most recent** open loan without needing its id (vault
 * `repay_latest`). Pulls back principal + the JIT fee — the fee accrues to the pool
 * as LP yield. The agent must first `approve` the vault for principal + fee
 * (see ensureCollateralAllowance) and hold that much of the asset.
 */
export async function repayLatestOnChain(
  cfg: CasperWiringConfig
): Promise<{ deployHash: string }> {
  const client = rpc(cfg.nodeUrl);
  const algo = cfg.keyAlgorithm ?? KeyAlgorithm.ED25519;
  const signer = await loadPrivateKey(cfg.agentSecretKey, algo);
  const sender = PublicKey.fromHex(cfg.agentPublicKey);

  const header = DeployHeader.default();
  header.account = sender;
  header.chainName = cfg.chainName;
  header.ttl = new Duration(DEFAULT_DEPLOY_TTL);

  const session = callPkg(cfg.vaultContractHash, "repay_latest", Args.fromMap({}));

  const payment = ExecutableDeployItem.standardPayment("3000000000");
  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(signer);

  const result = await client.putDeploy(deploy);
  return { deployHash: result.deployHash.toHex() };
}

/**
 * Approve the vault to pull `amount` of the CEP-18 asset from the agent (needed
 * before a collateralized borrow_and_pay can escrow, and before repay_loan can
 * pull the principal). One-time per allowance top-up.
 */
export async function ensureCollateralAllowance(
  cfg: CasperWiringConfig & { assetPackageHash: string },
  spender: { vaultContractHash: string },
  amount: bigint
): Promise<{ deployHash: string }> {
  const client = rpc(cfg.nodeUrl);
  const algo = cfg.keyAlgorithm ?? KeyAlgorithm.ED25519;
  const signer = await loadPrivateKey(cfg.agentSecretKey, algo);
  const sender = PublicKey.fromHex(cfg.agentPublicKey);

  const header = DeployHeader.default();
  header.account = sender;
  header.chainName = cfg.chainName;
  header.ttl = new Duration(DEFAULT_DEPLOY_TTL);

  const session = callPkg(
    cfg.assetPackageHash,
    "approve",
    Args.fromMap({
      spender: pkgKey(spender.vaultContractHash),
      amount: CLValue.newCLUInt256(amount.toString()),
    })
  );

  // 5 CSPR — the gas the proven live approves use; lower (e.g. 2 CSPR) is rejected
  // by Condor at submission as Invalid Deploy.
  const payment = ExecutableDeployItem.standardPayment("5000000000");
  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(signer);

  const result = await client.putDeploy(deploy);
  return { deployHash: result.deployHash.toHex() };
}

/**
 * Poll the node until a deploy executes; resolves true on success. Mirrors the
 * pattern proven live in production: stringify the whole getDeploy response (the
 * v5 SDK shape varies across Casper 1.x / 2.0 Condor), treat a non-null
 * errorMessage / "Failure" tag as failure, and "cost"/"Success" as success.
 */
export async function waitForDeploy(
  cfg: Pick<CasperWiringConfig, "nodeUrl">,
  deployHash: string,
  { tries = 60, intervalMs = 3000 }: { tries?: number; intervalMs?: number } = {}
): Promise<boolean> {
  const client = rpc(cfg.nodeUrl);
  for (let i = 0; i < tries; i++) {
    try {
      const res: any = await client.getDeploy(deployHash);
      const txt = JSON.stringify(res?.executionResults ?? res?.executionInfo ?? res ?? {});
      if (txt.includes('"Failure"') || /"error_?[Mm]essage":\s*"[^"]/.test(txt)) return false;
      if (txt.includes('"Success"') || txt.includes('"cost"')) return true;
    } catch {
      /* not propagated yet */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * LP deposits CEP-18 liquidity into the pool (minted as shares). The LP must first
 * `approve` the vault for `amount` on the asset (see ensureCollateralAllowance). As
 * borrow fees accrue, each share redeems for more — that's the LP's yield.
 */
export async function depositLiquidityOnChain(
  cfg: CasperWiringConfig,
  amount: bigint
): Promise<{ deployHash: string }> {
  const client = rpc(cfg.nodeUrl);
  const signer = await loadPrivateKey(cfg.agentSecretKey, cfg.keyAlgorithm ?? KeyAlgorithm.ED25519);
  const header = DeployHeader.default();
  header.account = PublicKey.fromHex(cfg.agentPublicKey);
  header.chainName = cfg.chainName;
  header.ttl = new Duration(DEFAULT_DEPLOY_TTL);
  const session = callPkg(
    cfg.vaultContractHash,
    "deposit_liquidity",
    Args.fromMap({ amount: CLValue.newCLUInt256(amount.toString()) })
  );
  const deploy = Deploy.makeDeploy(header, ExecutableDeployItem.standardPayment("4000000000"), session);
  deploy.sign(signer);
  const result = await client.putDeploy(deploy);
  return { deployHash: result.deployHash.toHex() };
}

/**
 * LP burns `shares` and withdraws the CEP-18 they redeem for — including accrued
 * yield (limited to the pool's free cash).
 */
export async function withdrawLiquidityOnChain(
  cfg: CasperWiringConfig,
  shares: bigint
): Promise<{ deployHash: string }> {
  const client = rpc(cfg.nodeUrl);
  const signer = await loadPrivateKey(cfg.agentSecretKey, cfg.keyAlgorithm ?? KeyAlgorithm.ED25519);
  const header = DeployHeader.default();
  header.account = PublicKey.fromHex(cfg.agentPublicKey);
  header.chainName = cfg.chainName;
  header.ttl = new Duration(DEFAULT_DEPLOY_TTL);
  const session = callPkg(
    cfg.vaultContractHash,
    "withdraw_liquidity",
    Args.fromMap({ shares: CLValue.newCLUInt256(shares.toString()) })
  );
  const deploy = Deploy.makeDeploy(header, ExecutableDeployItem.standardPayment("4000000000"), session);
  deploy.sign(signer);
  const result = await client.putDeploy(deploy);
  return { deployHash: result.deployHash.toHex() };
}

/** Casper account-hash ("00" + 32-byte hash) for the agent's public key. */
export function agentTaggedAddress(agentPublicKey: string): string {
  const pk = PublicKey.fromHex(agentPublicKey);
  const ah: any = pk.accountHash();
  let hex: string = (ah?.toHex?.() ?? ah?.toString?.() ?? String(ah)).replace(/^account-hash-/, "");
  hex = hex.replace(/^0x/, "");
  return "00" + hex; // 00 = AccountHash tag
}

/**
 * Build the real x402 v2 `exact` PaymentPayload for the casper:* family. The
 * `authorization` + 65-byte EIP-712 `signature` verify against the CSPR.cloud
 * facilitator's POST /verify. We attach the Fund402 `settlement.deployHash`
 * extension — the on-chain vault borrow_and_pay deploy the gateway checks.
 */
export async function buildExactPayload(
  cfg: CasperWiringConfig,
  req: Partial<PaymentRequirements> & { payTo: string },
  proof: { deployHash: string }
) {
  const algo = cfg.keyAlgorithm ?? KeyAlgorithm.ED25519;
  const priv = await loadPrivateKey(cfg.agentSecretKey, algo);

  const assetPkg = (req.asset ?? req.extra?.name ?? "").replace(/^0x/, "");
  const amount = String(req.amount ?? "0");
  const maxTimeoutSeconds = req.maxTimeoutSeconds ?? 300;
  const name = req.extra?.name ?? "Cep18x402";
  const version = req.extra?.version ?? "1";

  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 600;
  const validBefore = now + maxTimeoutSeconds;
  const nonce = randomNonce();
  const from = "00" + priv.publicKey.accountHash().toHex(); // tagged account hash
  const to = req.payTo;

  const digest = transferAuthorizationDigest(
    { name, version, chainName: cfg.network, contractPackageHash: assetPkg },
    { from, to, value: amount, validAfter: String(validAfter), validBefore: String(validBefore), nonce }
  );
  const signature = bytesToHex(priv.signAndAddAlgorithmBytes(digest));
  const publicKey = priv.publicKey.toHex();

  const requirements = {
    scheme: "exact" as const,
    network: cfg.network,
    asset: assetPkg,
    payTo: to,
    amount,
    maxTimeoutSeconds,
    extra: { name, version },
  };

  return {
    x402Version: 2 as const,
    resource: req.resource ? { url: req.resource } : undefined,
    accepted: requirements,
    scheme: "exact" as const,
    network: cfg.network,
    payload: {
      signature,
      publicKey,
      authorization: {
        from,
        to,
        value: amount,
        validAfter: String(validAfter),
        validBefore: String(validBefore),
        nonce,
      },
      settlement: { deployHash: proof.deployHash, asset: assetPkg },
    },
    paymentRequirements: requirements,
  };
}
