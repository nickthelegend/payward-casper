// Hono adapter. `app.use("/v/*", honoPaywall({...}))`. Works on any Hono runtime
// (Node, Bun, Workers, Deno). Settled requests expose the proof via `c.get("fund402")`.

import { paywall, type PaywallConfig, type Fund402Paywall } from "../server";

export function honoPaywall(config: PaywallConfig | Fund402Paywall) {
  const pay: Fund402Paywall = "guard" in config ? config : paywall(config);
  return async function fund402Middleware(c: any, next: any) {
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((v: string, k: string) => (headers[k] = v));
    const g = await pay.guard({ method: c.req.method, url: c.req.url, headers });
    if (g.paid) {
      c.header("payment-response", g.paymentResponseHeader);
      c.set("fund402", g.settlement);
      return next();
    }
    const r = g.response;
    return c.json(r.body, r.status as any, r.headers);
  };
}
