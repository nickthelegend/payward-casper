// Fund402 SERVER side — create x402-gated HTTP endpoints that are SETTLED BY THE
// LENDING POOL.
//
// A normal x402 paywall makes the *caller* pay from their own balance. Fund402's
// twist: the agent borrows just-in-time from the Fund402 vault, the vault (the
// liquidity pool) fronts the CEP-18 payment to YOU (the merchant), and the agent
// repays later. To you it looks like any x402 endpoint — except your callers can
// pay even with an empty wallet, because the pool settles on their behalf.
//
// This module is framework-agnostic. `paywall()` returns a tiny object you drive
// from any HTTP handler; thin adapters for Express / Hono / Next.js live in
// ./adapters and call straight into it.

import type { PaymentRequirements, PaymentRequiredBody, ExactPaymentPayload } from "./types";

export interface PaywallConfig {
  /** CAIP-2 network. Default "casper:casper-test". */
  network?: string;
  /** Merchant account that receives the payment — tagged "00" + 32-byte hash. */
  payTo: string;
  /** CEP-18 contract **package** hash (64 hex) — the settlement asset. */
  asset: string;
  /** Price per call, token base units. */
  price: string | number | bigint;
  /** The Fund402 vault (lending pool) contract hash — settlements must target it. */
  vaultContract?: string;
  /** CSPR.cloud REST base. Default derived from `network`. */
  csprCloudRest?: string;
  /** CSPR.cloud API key — required to verify settlement on-chain. */
  csprCloudApiKey?: string;
  /** Optional x402 facilitator base URL for defense-in-depth signature verification. */
  facilitatorUrl?: string;
  /** Human description shown in the 402 challenge. */
  description?: string;
  /** Token metadata echoed in the challenge `extra`. */
  asset_meta?: { name?: string; version?: string; decimals?: string; symbol?: string };
  /** Authorization validity window the agent should target. Default 900s. */
  maxTimeoutSeconds?: number;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  status?: string;
  deployHash?: string;
  settlement?: { deployHash: string; asset?: string };
  /** base64 `payment-response` header value to echo back to the caller on success. */
  paymentResponseHeader?: string;
  paidMerchant?: boolean;
  paidAmount?: boolean;
}

export interface HttpResponseLike {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface RequestLike {
  method?: string;
  /** Full resource URL if known (preferred); adapters compute this from the request. */
  url: string;
  headers: Record<string, string | string[] | undefined>;
}

export type GuardResult =
  | { paid: true; deployHash: string; settlement: VerifyResult; paymentResponseHeader: string }
  | { paid: false; response: HttpResponseLike };

const DEFAULT_NETWORK = "casper:casper-test";

function isTestnet(network: string): boolean {
  return network.includes("test");
}

function defaultRest(network: string): string {
  return isTestnet(network) ? "https://api.testnet.cspr.cloud" : "https://api.cspr.cloud";
}

function headerGet(headers: RequestLike["headers"], name: string): string | undefined {
  const want = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === want) {
      const v = headers[k];
      return Array.isArray(v) ? v[0] : v ?? undefined;
    }
  }
  return undefined;
}

/** Build the x402 v2 `exact` PaymentRequirements for this paywall + resource. */
export function buildPaymentRequirements(
  cfg: PaywallConfig,
  resource: string,
  description?: string
): PaymentRequirements {
  const network = cfg.network ?? DEFAULT_NETWORK;
  return {
    scheme: "exact",
    network,
    payTo: cfg.payTo,
    amount: String(BigInt(cfg.price as any)),
    asset: cfg.asset.replace(/^0x/, ""),
    resource,
    description: description ?? cfg.description ?? "Fund402 x402-gated resource",
    mimeType: "application/json",
    maxTimeoutSeconds: cfg.maxTimeoutSeconds ?? 900,
    extra: {
      name: cfg.asset_meta?.name ?? "Cep18x402",
      version: cfg.asset_meta?.version ?? "1",
      decimals: cfg.asset_meta?.decimals ?? "9",
      symbol: cfg.asset_meta?.symbol ?? "USDC",
    },
  };
}

/** Wrap requirements in the x402 v2 `402 Payment Required` envelope. */
export function challengeBody(req: PaymentRequirements): PaymentRequiredBody {
  return { x402Version: 2, accepts: [req], error: "payment required" };
}

/** Decode a base64(JSON) x402 payment header. Returns null if malformed. */
export function decodePaymentSignature(header: string): ExactPaymentPayload | null {
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

/** cspr.live explorer URL for a deploy. */
export function explorerTx(network: string, deployHash: string): string {
  return `https://cspr.live/deploy/${deployHash}?network=${isTestnet(network) ? "casper-test" : "casper"}`;
}

/**
 * Verify, on-chain via CSPR.cloud, that the Fund402 vault `borrow_and_pay` deploy
 * actually executed and paid the required merchant + amount. THIS is the real
 * settlement proof — the pool already moved the funds to the merchant; the gateway
 * trusts the chain, not the caller.
 */
export async function verifyPoolSettlement(
  cfg: PaywallConfig,
  deployHash: string,
  opts: { tries?: number; intervalMs?: number } = {}
): Promise<VerifyResult> {
  const network = cfg.network ?? DEFAULT_NETWORK;
  const rest = cfg.csprCloudRest ?? defaultRest(network);
  if (!cfg.csprCloudApiKey) {
    return { valid: false, reason: "csprCloudApiKey not set — cannot verify settlement on-chain" };
  }
  if (!/^[0-9a-fA-F]{64}$/.test(deployHash)) {
    return { valid: false, reason: "malformed deploy hash" };
  }

  // The deploy is RPC-confirmed before CSPR.cloud finishes indexing it, so a
  // 404 / "pending" right after settlement is transient — poll a bounded window.
  // An executed *failure* is terminal and breaks out immediately.
  const tries = opts.tries ?? 12;
  const intervalMs = opts.intervalMs ?? 3000;
  let d: any;
  let lastReason = "deploy not found on cspr.cloud yet";
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${rest}/deploys/${deployHash}`, {
        headers: { Authorization: cfg.csprCloudApiKey },
      });
      if (res.ok) {
        const body: any = await res.json();
        const cand = body?.data ?? body;
        const st: string = cand?.status ?? "unknown";
        if (cand?.error_message || /fail|error/i.test(st)) {
          return { valid: false, reason: `deploy failed on-chain (status=${st})`, status: st };
        }
        if (st === "processed") {
          d = cand;
          break;
        }
        lastReason = `deploy not processed yet (status=${st})`;
      } else {
        lastReason = `cspr.cloud /deploys ${res.status}`;
      }
    } catch (e: any) {
      lastReason = `cspr.cloud fetch failed: ${e?.message}`;
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (!d) return { valid: false, reason: lastReason };

  const status: string = d?.status ?? "processed";
  const expectAmount = String(BigInt(cfg.price as any));
  const expectMerchant = cfg.payTo;
  const args = d?.args ?? {};
  const argAmount = String(args?.amount?.parsed ?? "");
  const argMerchant = String(args?.merchant?.parsed ?? args?.merchant?.parsed?.Account ?? "");
  const paidAmount = !argAmount || argAmount === expectAmount;
  const paidMerchant =
    !argMerchant ||
    argMerchant.toLowerCase().includes(expectMerchant.replace(/^00/, "").toLowerCase());

  // The vault is addressed by its PACKAGE hash; CSPR.cloud exposes that as
  // `contract_package_hash` (NOT `contract_hash`, which is the versioned contract).
  const vault = (cfg.vaultContract ?? "").replace(/^(hash-|contract-package-|package-)/, "");
  const onChainPkg = String(d?.contract_package_hash ?? d?.contract_hash ?? "").toLowerCase();
  if (vault && onChainPkg && !onChainPkg.includes(vault.toLowerCase())) {
    return { valid: false, reason: "deploy did not target the configured vault pool", status };
  }

  const valid = paidAmount && paidMerchant;
  const paymentResponseHeader = Buffer.from(
    JSON.stringify({ success: valid, network, deployHash, explorer: explorerTx(network, deployHash) })
  ).toString("base64");

  return {
    valid,
    status,
    deployHash,
    settlement: { deployHash },
    paymentResponseHeader,
    paidMerchant,
    paidAmount,
  };
}

/**
 * Optional defense-in-depth: ask an x402 facilitator to verify the agent's signed
 * `exact` authorization. Returns `{ isValid }`. Never throws — network/decode
 * problems resolve to `{ isValid:false, reason }`.
 */
export async function verifyWithFacilitator(
  facilitatorUrl: string,
  payload: ExactPaymentPayload
): Promise<{ isValid: boolean; reason?: string }> {
  try {
    const res = await fetch(`${facilitatorUrl.replace(/\/$/, "")}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j: any = await res.json().catch(() => ({}));
    return { isValid: !!(j?.isValid ?? j?.valid), reason: j?.invalidReason ?? j?.reason };
  } catch (e: any) {
    return { isValid: false, reason: e?.message };
  }
}

export interface Fund402Paywall {
  config: PaywallConfig;
  /** The 402 challenge response for a resource. */
  challenge(resource: string, description?: string): HttpResponseLike;
  /** Verify a payment header (base64 x402 payload) settled on-chain. */
  verify(paymentHeader: string): Promise<VerifyResult>;
  /** One-call guard: inspect a request, return paid:true or the response to send. */
  guard(req: RequestLike): Promise<GuardResult>;
}

/**
 * Create a paywall. Drive it from any framework (or use ./adapters).
 *
 * ```ts
 * const pay = paywall({ payTo, asset, price: "1000000", vaultContract,
 *                       csprCloudApiKey: process.env.CSPR_CLOUD_API_KEY });
 * const g = await pay.guard({ url: fullUrl, headers: req.headers });
 * if (!g.paid) return send(g.response);          // 402 challenge / error
 * res.setHeader("payment-response", g.paymentResponseHeader); // settled — serve it
 * ```
 */
export function paywall(config: PaywallConfig): Fund402Paywall {
  if (!config.payTo) throw new Error("paywall: `payTo` (merchant account) is required");
  if (!config.asset) throw new Error("paywall: `asset` (CEP-18 package hash) is required");
  const network = config.network ?? DEFAULT_NETWORK;

  function challenge(resource: string, description?: string): HttpResponseLike {
    const req = buildPaymentRequirements(config, resource, description);
    const body = challengeBody(req);
    return {
      status: 402,
      headers: {
        "content-type": "application/json",
        "payment-required": Buffer.from(JSON.stringify(body)).toString("base64"),
      },
      body,
    };
  }

  async function verify(paymentHeader: string): Promise<VerifyResult> {
    const payload = decodePaymentSignature(paymentHeader);
    if (!payload) return { valid: false, reason: "malformed payment header" };
    const deployHash =
      payload?.payload?.settlement?.deployHash ?? (payload as any)?.settlement?.deployHash;
    if (!deployHash) return { valid: false, reason: "payment payload missing settlement.deployHash" };

    const settled = await verifyPoolSettlement(config, deployHash);
    if (!settled.valid) return settled;

    // Optional: also verify the signed authorization at the facilitator.
    if (config.facilitatorUrl) {
      const fac = await verifyWithFacilitator(config.facilitatorUrl, payload);
      if (!fac.isValid) {
        return { ...settled, valid: false, reason: `facilitator rejected signature: ${fac.reason}` };
      }
    }
    return settled;
  }

  async function guard(req: RequestLike): Promise<GuardResult> {
    const resource = req.url;
    const header =
      headerGet(req.headers, "payment-signature") ?? headerGet(req.headers, "x-payment");

    if (!header) return { paid: false, response: challenge(resource) };

    const result = await verify(header);
    if (!result.valid) {
      const malformed = result.reason?.startsWith("malformed");
      return {
        paid: false,
        response: {
          status: malformed ? 400 : 402,
          headers: { "content-type": "application/json" },
          body: malformed
            ? { error: result.reason }
            : { ...challengeBody(buildPaymentRequirements(config, resource)), reason: result.reason },
        },
      };
    }
    return {
      paid: true,
      deployHash: result.deployHash!,
      settlement: result,
      paymentResponseHeader: result.paymentResponseHeader!,
    };
  }

  return { config: { ...config, network }, challenge, verify, guard };
}
