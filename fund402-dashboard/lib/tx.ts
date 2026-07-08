"use client";
// Real on-chain writes for the Fund402 LP dashboard.
//
// Builds `deposit_liquidity` / `withdraw_liquidity` (vault) and `approve`
// (CEP-18) deploys with casper-js-sdk v5, then SIGNS + SUBMITS them through the
// connected CSPR.click wallet via `clickRef.send(deployJson, publicKey, wait)`.
// No private key ever touches the browser — the wallet signs.

import {
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
  PublicKey,
} from "casper-js-sdk";

const CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME ?? "casper-test";
// The vault + CEP-18 are versioned packages on Condor — all calls target the
// package hash (StoredVersionedContractByHash), never an entity/contract hash.
const VAULT_PACKAGE_HASH = (process.env.NEXT_PUBLIC_VAULT_PACKAGE_HASH ?? "").replace(
  /^(hash-|contract-)/,
  ""
);
const ASSET_PACKAGE_HASH = (process.env.NEXT_PUBLIC_X402_ASSET_CONTRACT_HASH ?? "").replace(
  /^(hash-|contract-)/,
  ""
);
const ASSET_DECIMALS = Number(process.env.NEXT_PUBLIC_X402_ASSET_DECIMALS ?? "9");

import { toBaseUnits as toBaseUnitsRaw } from "./units";
/** Parse a decimal string into CEP-18 base units, defaulting to the asset's decimals. */
export function toBaseUnits(decimal: string, decimals = ASSET_DECIMALS): bigint {
  return toBaseUnitsRaw(decimal, decimals);
}

/** Minimal subset of the CSPR.click SDK we use (the value from `useClickRef()`). */
export interface ClickLike {
  getActivePublicKey(): Promise<string | undefined>;
  send(
    deployJson: string | object,
    signingPublicKey: string,
    waitProcessing?: boolean,
    timeout?: number
  ): Promise<{ deployHash?: string; deploy_hash?: string } | undefined>;
}

/** Build an unsigned versioned-package call and serialize to deploy JSON. */
function buildCallJson(
  senderHex: string,
  packageHash: string,
  entryPoint: string,
  args: Args,
  gasMotes: string
): object {
  const sender = PublicKey.fromHex(senderHex);
  const header = DeployHeader.default();
  header.account = sender;
  header.chainName = CHAIN_NAME;
  header.ttl = new Duration(DEFAULT_DEPLOY_TTL);

  const session = new ExecutableDeployItem();
  // Call the latest version of the package (Condor versioned contract).
  session.storedVersionedContractByHash = new StoredVersionedContractByHash(
    ContractHash.newContract(packageHash),
    entryPoint,
    args,
    undefined
  );

  const payment = ExecutableDeployItem.standardPayment(gasMotes);
  const deploy = Deploy.makeDeploy(header, payment, session);
  return Deploy.toJSON(deploy) as object;
}

function hashOf(res: { deployHash?: string; deploy_hash?: string } | undefined): string {
  return res?.deployHash ?? res?.deploy_hash ?? "";
}

async function activeKey(click: ClickLike): Promise<string> {
  const pub = await click.getActivePublicKey();
  if (!pub) throw new Error("No active CSPR.click account — connect a wallet first.");
  return pub;
}

/** Approve the vault to pull `amount` of the CEP-18 asset from the connected account. */
export async function approveVault(click: ClickLike, amount: bigint): Promise<string> {
  if (!VAULT_PACKAGE_HASH) throw new Error("NEXT_PUBLIC_VAULT_PACKAGE_HASH not set.");
  if (!ASSET_PACKAGE_HASH) throw new Error("NEXT_PUBLIC_X402_ASSET_CONTRACT_HASH not set.");
  const pub = await activeKey(click);
  const args = Args.fromMap({
    // Spender is the vault package (the CEP-18 grants the vault the allowance).
    spender: CLValue.newCLKey(Key.newKey("hash-" + VAULT_PACKAGE_HASH)),
    amount: CLValue.newCLUInt256(amount.toString()),
  });
  // A CEP-18 approve on Condor is rejected at submission with < 5 CSPR gas.
  const json = buildCallJson(pub, ASSET_PACKAGE_HASH, "approve", args, "5000000000");
  return hashOf(await click.send(json, pub, true));
}

/**
 * Deposit CEP-18 liquidity into the vault. Two signed deploys: `approve` the
 * vault for `amount`, then `deposit_liquidity(amount)` (the vault does
 * transfer_from(lp → vault)).
 */
export async function depositLiquidity(click: ClickLike, amount: bigint): Promise<string> {
  if (!VAULT_PACKAGE_HASH) throw new Error("NEXT_PUBLIC_VAULT_PACKAGE_HASH not set.");
  const pub = await activeKey(click);
  await approveVault(click, amount);
  const args = Args.fromMap({ amount: CLValue.newCLUInt256(amount.toString()) });
  const json = buildCallJson(pub, VAULT_PACKAGE_HASH, "deposit_liquidity", args, "10000000000");
  return hashOf(await click.send(json, pub, true));
}

/** Withdraw previously deposited liquidity from the vault (v2 burns `shares`). */
export async function withdrawLiquidity(click: ClickLike, amount: bigint): Promise<string> {
  if (!VAULT_PACKAGE_HASH) throw new Error("NEXT_PUBLIC_VAULT_PACKAGE_HASH not set.");
  const pub = await activeKey(click);
  const args = Args.fromMap({ shares: CLValue.newCLUInt256(amount.toString()) });
  const json = buildCallJson(pub, VAULT_PACKAGE_HASH, "withdraw_liquidity", args, "10000000000");
  return hashOf(await click.send(json, pub, true));
}
