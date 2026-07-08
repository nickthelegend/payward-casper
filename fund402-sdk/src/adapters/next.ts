// Next.js App Router adapter. Wrap a route handler so it only runs once payment
// has settled on-chain; otherwise the wrapper returns the 402 x402 challenge.
//
//   // app/api/v/[...path]/route.ts
//   import { withPaywall } from "@nickthelegend69/fund402/next";
//   export const GET = withPaywall(
//     { payTo, asset, price: "1000000", vaultContract, csprCloudApiKey: process.env.CSPR_CLOUD_API_KEY },
//     async (req) => Response.json({ data: "the protected resource" })
//   );

import { paywall, type PaywallConfig, type Fund402Paywall } from "../server";

type NextHandler = (req: any, ctx?: any) => Response | Promise<Response>;

export function withPaywall(
  config: PaywallConfig | Fund402Paywall,
  handler: NextHandler
): NextHandler {
  const pay: Fund402Paywall = "guard" in config ? config : paywall(config);
  return async function fund402Route(req: any, ctx?: any): Promise<Response> {
    const url = req?.nextUrl?.href ?? req?.url ?? "";
    const headers: Record<string, string> = {};
    if (req?.headers?.forEach) req.headers.forEach((v: string, k: string) => (headers[k] = v));
    const g = await pay.guard({ method: req?.method, url, headers });

    if (!g.paid) {
      return new Response(JSON.stringify(g.response.body), {
        status: g.response.status,
        headers: g.response.headers,
      });
    }

    const out = await handler(req, ctx);
    try {
      out.headers.set("payment-response", g.paymentResponseHeader);
    } catch {
      /* immutable response headers — best effort */
    }
    return out;
  };
}
