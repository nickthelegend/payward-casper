// @nickthelegend69/fund402 — the Fund402 SDK.
//
//   SERVER (merchant): create x402-gated HTTP endpoints SETTLED BY THE LENDING POOL.
//     import { paywall } from "@nickthelegend69/fund402";
//     import { expressPaywall } from "@nickthelegend69/fund402/express";
//
//   CLIENT (agent): pay any x402 endpoint with just-in-time credit from the pool.
//     import { fund402Fetch } from "@nickthelegend69/fund402";
//
// Casper-native (CEP-18 + EIP-712 over the casper:* x402 `exact` scheme), verified
// live against the CSPR.cloud facilitator and the deployed Fund402 vault on testnet.

export * from "./types";

// Server
export {
  paywall,
  buildPaymentRequirements,
  challengeBody,
  decodePaymentSignature,
  verifyPoolSettlement,
  verifyWithFacilitator,
  explorerTx,
  type PaywallConfig,
  type Fund402Paywall,
  type VerifyResult,
  type GuardResult,
  type RequestLike,
  type HttpResponseLike,
} from "./server";

// Client
export {
  fund402Fetch,
  withPaymentInterceptor,
  payViaPool,
  decodeChallenge,
  selectCasperOption,
  testnetClient,
  mainnetClient,
  type Fund402ClientConfig,
  type Fund402Event,
} from "./client";

// On-chain primitives + crypto (advanced use)
export {
  borrowAndPayOnChain,
  repayLoanOnChain,
  repayLatestOnChain,
  depositLiquidityOnChain,
  withdrawLiquidityOnChain,
  ensureCollateralAllowance,
  buildExactPayload,
  waitForDeploy,
  agentTaggedAddress,
  loadPrivateKey,
  rpc,
  type CasperWiringConfig,
} from "./casper";

export { transferAuthorizationDigest, randomNonce, bytesToHex } from "./eip712";

// Framework adapters (also available as subpath imports /express /hono /next)
export { expressPaywall } from "./adapters/express";
export { honoPaywall } from "./adapters/hono";
export { withPaywall } from "./adapters/next";
