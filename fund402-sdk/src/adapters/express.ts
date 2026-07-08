// Express adapter. `app.use("/v", expressPaywall({...}))` gates everything under
// it: unpaid requests get the 402 x402 challenge; settled ones fall through to
// your handler with `req.fund402` set to the on-chain settlement proof.

import { paywall, type PaywallConfig, type Fund402Paywall } from "../server";

function fullUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}${req.originalUrl ?? req.url ?? ""}`;
}

export function expressPaywall(config: PaywallConfig | Fund402Paywall) {
  const pay: Fund402Paywall = "guard" in config ? config : paywall(config);
  return async function fund402Middleware(req: any, res: any, next: any) {
    try {
      const g = await pay.guard({ method: req.method, url: fullUrl(req), headers: req.headers });
      if (g.paid) {
        res.setHeader("payment-response", g.paymentResponseHeader);
        req.fund402 = g.settlement;
        return next();
      }
      const r = g.response;
      for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
      return res.status(r.status).json(r.body);
    } catch (e: any) {
      return res.status(500).json({ error: `fund402 paywall error: ${e?.message ?? e}` });
    }
  };
}
