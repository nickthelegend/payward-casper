// Shared x402 types for the Fund402 SDK. The `exact` scheme over the casper:*
// network family, as the CSPR.cloud x402 facilitator expects.

/** CAIP-2 network id, e.g. "casper:casper-test" or "casper:casper". */
export type CasperNetwork = `casper:${string}`;

/** x402 v2 `exact` PaymentRequirements (one entry of a 402 challenge's `accepts`). */
export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  /** Merchant account, tagged: "00" + 32-byte account hash. */
  payTo: string;
  /** Token base units required for this call. */
  amount: string;
  /** CEP-18 contract **package** hash (64 hex) — the settlement asset. */
  asset: string;
  resource?: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  extra?: { name?: string; version?: string; decimals?: string; symbol?: string };
}

/** x402 v2 `402 Payment Required` body. */
export interface PaymentRequiredBody {
  x402Version: 2;
  accepts: PaymentRequirements[];
  error?: string;
}

/** The Fund402 settlement extension carried inside the x402 payload. */
export interface Fund402Settlement {
  /** The vault `borrow_and_pay` deploy hash that actually moved the funds. */
  deployHash: string;
  /** CEP-18 package hash that was transferred. */
  asset?: string;
}

/** The decoded x402 `exact` payment payload an agent sends back (header value). */
export interface ExactPaymentPayload {
  x402Version: 2;
  scheme: "exact";
  network: string;
  resource?: { url: string };
  accepted?: Partial<PaymentRequirements>;
  paymentRequirements?: Partial<PaymentRequirements>;
  payload: {
    signature: string; // 65-byte [algo|sig] hex
    publicKey: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
    settlement?: Fund402Settlement;
  };
}
