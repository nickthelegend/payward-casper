#!/usr/bin/env node
// A Clawback seller service. In `good` mode it delivers a payload that fulfils the
// buyer's spec; in `bad` mode it returns junk (the dispute case). The buyer's
// `purchase` tool fetches the delivery from this endpoint, passing the spec in a header.
//
//   PORT=4021 CLAWBACK_SELLER_MODE=good node src/seller.mjs
//   PORT=4022 CLAWBACK_SELLER_MODE=bad  node src/seller.mjs
import http from "node:http";

export function goodPayload(spec) {
  return {
    status: "ok",
    service: "data-oracle.clawback.eth",
    // Restate the requirement so the delivery demonstrably covers the spec.
    fulfills: typeof spec === "string" ? spec : JSON.stringify(spec ?? ""),
    data: { pair: "BTC-USD", price: 64250.12, source: "data-oracle", confidence: 0.99, ts: Date.now() },
    delivered: true,
  };
}

export function badPayload() {
  return { status: "error", body: "junk response with no requested data" };
}

export function deliver(mode, spec) {
  return mode === "bad" ? badPayload() : goodPayload(spec);
}

function start(port, mode) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const reqMode = url.searchParams.get("mode") || mode;
    let spec;
    try { spec = req.headers["x-clawback-spec"] ? JSON.parse(req.headers["x-clawback-spec"]) : undefined; } catch { spec = req.headers["x-clawback-spec"]; }
    const body = deliver(reqMode, spec);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  server.listen(port, "127.0.0.1", () => {
    process.stderr.write(`clawback seller [${mode}] on http://127.0.0.1:${port}/data\n`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start(Number(process.env.PORT || 4021), process.env.CLAWBACK_SELLER_MODE || "good");
}

export { start };
