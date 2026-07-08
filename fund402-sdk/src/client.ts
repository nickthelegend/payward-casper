// Fund402 CLIENT side — let an autonomous agent PAY x402 endpoints with
// just-in-time credit from the Fund402 lending pool.
//
// `fund402Fetch(config)` returns a drop-in `fetch`. When a request comes back
// `402 Payment Required`, it:
//   1. decodes the x402 challenge,
//   2. calls the vault `borrow_and_pay` (the pool fronts the CEP-18 payment to the
//      merchant) and waits for settlement,
//   3. builds the signed x402 `exact` payload, and
//   4. replays the request with a `payment-signature` header — returning the real
//      200 response. The agent's own balance can be zero; the pool covers it.
//
// `withPaymentInterceptor(config)` is the same behaviour as an Axios instance
// (Axios is an optional peer dependency, required lazily).

import { KeyAlgorithm } from "casper-js-sdk";
import {
  borrowAndPayOnChain,
  buildExactPayload,
  ensureCollateralAllowance,
  waitForDeploy,
  type CasperWiringConfig,
} from "./casper";
import type { PaymentRequiredBody, PaymentRequirements } from "./types";

export interface Fund402ClientConfig {
  /** Agent signing key — PEM contents or hex. */
  agentSecretKey: string;
  /** Agent account-key hex (01.. ed25519 / 02.. secp256k1). */
  agentPublicKey: string;
  /** Fund402 vault (lending pool) contract hash, 64 hex. */
  vaultContract: string;
  /** CAIP-2 network. Default "casper:casper-test". */
  network?: string;
  /** Casper JSON-RPC node. Default derived from network (CSPR.cloud public node). */
  nodeUrl?: string;
  /** Chain name. Default derived ("casper-test" / "casper"). */
  chainName?: string;
  keyAlgorithm?: KeyAlgorithm;
  /** Over-collateralisation ratio the agent posts (vault re-checks on-chain). Default 1.5. */
  collateralRatio?: number;
  /** Auto-approve the vault to escrow collateral before a Tier-1/2 borrow. Default true. */
  autoApprove?: boolean;
  /** Gas (motes) for the borrow_and_pay deploy. Default 5 CSPR. */
  borrowGasMotes?: string;
  /** Underlying fetch implementation. Default global fetch. */
  fetchImpl?: typeof fetch;
  onEvent?: (event: Fund402Event) => void;
}

export interface Fund402Event {
  type:
    | "intercepted_402"
    | "approving"
    | "approve_submitted"
    | "borrowing"
    | "borrow_submitted"
    | "payment_settled"
    | "payment_sent"
    | "request_retried"
    | "payment_confirmed";
  data: Record<string, unknown>;
  timestamp: number;
}

const DEFAULT_NETWORK = "casper:casper-test";

function chainNameFor(network: string): string {
  return network.includes("test") ? "casper-test" : "casper";
}

function nodeUrlFor(network: string): string {
  return network.includes("test")
    ? "https://node.testnet.cspr.cloud/rpc"
    : "https://node.mainnet.cspr.cloud/rpc";
}

function wiringFrom(config: Fund402ClientConfig): CasperWiringConfig {
  const network = config.network ?? DEFAULT_NETWORK;
  return {
    network,
    nodeUrl: config.nodeUrl ?? nodeUrlFor(network),
    chainName: config.chainName ?? chainNameFor(network),
    vaultContractHash: config.vaultContract.replace(/^hash-/, ""),
    agentSecretKey: config.agentSecretKey,
    agentPublicKey: config.agentPublicKey,
    keyAlgorithm: config.keyAlgorithm,
    borrowGasMotes: config.borrowGasMotes,
  };
}

function emit(config: Fund402ClientConfig, type: Fund402Event["type"], data: Record<string, unknown>) {
  config.onEvent?.({ type, data, timestamp: Date.now() });
}

function deriveVaultId(resource: string): string {
  const m = resource.match(/\/v\/([^/]+)/);
  return m ? m[1] : "vault_1";
}

/** Decode an x402 challenge from a `payment-required` header or a JSON body. */
export function decodeChallenge(
  paymentRequiredHeader: string | null | undefined,
  body: unknown
): PaymentRequiredBody | null {
  if (paymentRequiredHeader) {
    try {
      return JSON.parse(Buffer.from(paymentRequiredHeader, "base64").toString("utf-8"));
    } catch {
      /* fall through to body */
    }
  }
  if (body && typeof body === "object" && "accepts" in (body as any)) {
    return body as PaymentRequiredBody;
  }
  return null;
}

/** Pick the casper:* payment option from a challenge. */
export function selectCasperOption(challenge: PaymentRequiredBody): PaymentRequirements | undefined {
  return challenge.accepts.find((o) => o.network.startsWith("casper")) ?? challenge.accepts[0];
}

/**
 * Settle one x402 challenge through the lending pool: borrow_and_pay on the vault,
 * wait, and build the signed `exact` payload + base64 `payment-signature` header.
 */
export async function payViaPool(
  config: Fund402ClientConfig,
  option: PaymentRequirements,
  resource: string
): Promise<{ paymentHeader: string; deployHash: string }> {
  const wiring = wiringFrom(config);
  const amount = BigInt(option.amount);
  const ratio = config.collateralRatio ?? 1.5;
  const collateral = (amount * BigInt(Math.round(ratio * 100))) / 100n;

  // Tier-1/2 collateralized borrow: the vault escrows `collateral` via transfer_from,
  // so the agent must approve it on the CEP-18 asset first. Tier-3 borrows post zero
  // collateral and skip this entirely.
  if (collateral > 0n && config.autoApprove !== false) {
    const asset = (option.asset ?? "").replace(/^0x/, "");
    if (!asset) throw new Error("402 challenge has no `asset` — cannot approve collateral");
    emit(config, "approving", { asset, collateral: collateral.toString() });
    const { deployHash: approveHash } = await ensureCollateralAllowance(
      { ...wiring, assetPackageHash: asset },
      { vaultContractHash: wiring.vaultContractHash },
      collateral
    );
    emit(config, "approve_submitted", { deployHash: approveHash });
    const okApprove = await waitForDeploy(wiring, approveHash);
    if (!okApprove) throw new Error(`collateral approve deploy failed: ${approveHash}`);
  }

  emit(config, "borrowing", { amount: amount.toString(), collateral: collateral.toString() });
  const { deployHash } = await borrowAndPayOnChain(wiring, {
    merchant: option.payTo,
    amount,
    collateral,
    vaultId: deriveVaultId(option.resource ?? resource),
  });
  emit(config, "borrow_submitted", { deployHash });

  const ok = await waitForDeploy(wiring, deployHash);
  emit(config, "payment_settled", { deployHash, success: ok });
  if (!ok) throw new Error(`vault borrow_and_pay deploy failed: ${deployHash}`);

  const payload = await buildExactPayload(wiring, option, { deployHash });
  const paymentHeader = Buffer.from(JSON.stringify(payload)).toString("base64");
  emit(config, "payment_sent", { deployHash });
  return { paymentHeader, deployHash };
}

/**
 * A `fetch` that transparently pays x402-gated endpoints via the Fund402 pool.
 *
 * ```ts
 * const f = fund402Fetch({ agentSecretKey, agentPublicKey, vaultContract });
 * const res = await f("https://merchant.example/v/vault_1/price/BTC-USD");
 * const data = await res.json(); // paid + served, agent balance can be zero
 * ```
 */
export function fund402Fetch(config: Fund402ClientConfig): typeof fetch {
  const baseFetch = config.fetchImpl ?? globalThis.fetch;
  if (!baseFetch) throw new Error("fund402Fetch: no fetch implementation available");

  const wrapped = async (input: any, init?: any): Promise<Response> => {
    const res = await baseFetch(input as any, init as any);
    if (res.status !== 402) return res;

    const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    const hdr = res.headers.get("payment-required");
    const body = await res.clone().json().catch(() => undefined);
    const challenge = decodeChallenge(hdr, body);
    if (!challenge) return res; // not an x402 challenge we understand

    const option = selectCasperOption(challenge);
    if (!option) throw new Error("no casper payment option in 402 challenge");
    emit(config, "intercepted_402", { resource: option.resource, amount: option.amount });

    const { paymentHeader, deployHash } = await payViaPool(config, option, url);

    const headers = new Headers(init?.headers ?? (typeof input === "object" ? input.headers : undefined));
    headers.set("payment-signature", paymentHeader);

    emit(config, "request_retried", { url });
    const retried = await baseFetch(url, { ...(init ?? {}), headers } as any);
    emit(config, "payment_confirmed", { deployHash });
    return retried;
  };

  return wrapped as unknown as typeof fetch;
}

/**
 * Axios variant — returns an AxiosInstance that pays 402s via the pool. Axios is
 * an optional peer dependency, required lazily so the server side stays dep-free.
 */
export function withPaymentInterceptor(config: Fund402ClientConfig): any {
  let axios: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    axios = require("axios");
  } catch {
    throw new Error("withPaymentInterceptor requires `axios` (npm i axios). Or use fund402Fetch().");
  }
  const instance = axios.create();

  instance.interceptors.response.use(
    (r: any) => r,
    async (error: any) => {
      if (error.response?.status !== 402) throw error;
      const hdr = error.response.headers?.["payment-required"];
      const challenge = decodeChallenge(hdr, error.response.data);
      if (!challenge) throw error;
      const option = selectCasperOption(challenge);
      if (!option) throw new Error("no casper payment option in 402 challenge");

      const resource = option.resource ?? error.config?.url ?? "";
      emit(config, "intercepted_402", { resource, amount: option.amount });
      const { paymentHeader, deployHash } = await payViaPool(config, option, resource);

      const originalRequest = error.config;
      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers["payment-signature"] = paymentHeader;
      emit(config, "request_retried", { url: originalRequest.url });
      const retried = await instance(originalRequest);
      emit(config, "payment_confirmed", { deployHash });
      return retried;
    }
  );

  return instance;
}

/** Convenience presets. */
export function testnetClient(): Partial<Fund402ClientConfig> {
  return { network: "casper:casper-test", chainName: "casper-test", nodeUrl: nodeUrlFor("casper:casper-test") };
}
export function mainnetClient(): Partial<Fund402ClientConfig> {
  return { network: "casper:casper", chainName: "casper", nodeUrl: nodeUrlFor("casper:casper") };
}
