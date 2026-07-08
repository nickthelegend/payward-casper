import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { choosePath, EVENT_TO_STEP, type StepId } from "@/lib/flow";

// Fund402 Demo Agent API (Casper) — REAL.
// Uses @fund402/agent-sdk to call a 402-gated endpoint on the gateway. The SDK
// borrows from the vault, settles on Casper, and replays the request. Events and
// the settlement deploy hash are captured from the real run. No fake data.
//
// Requires (see .env.local): the gateway URL, the agent key + public key, and the
// deployed vault hash. Without them this returns configured:false (never fakes).

const GATEWAY =
  process.env.DEMO_VAULT_URL ??
  "http://localhost:3005/api/v/a0000000-0000-0000-0000-000000000001/";
const AGENT_PEM_PATH = process.env.FUND402_AGENT_SECRET_KEY_PATH ?? "";
const AGENT_PUBLIC = process.env.FUND402_AGENT_PUBLIC_KEY ?? "";
// The vault is called via its versioned package hash; prefer it, fall back to
// the legacy contract var for older configs.
const VAULT = process.env.FUND402_VAULT_PACKAGE ?? process.env.FUND402_VAULT_CONTRACT ?? "";

// choosePath + EVENT_TO_STEP now live in @/lib/flow (shared + unit-tested).

export async function POST(req: NextRequest) {
  const { query } = await req.json().catch(() => ({ query: "BTC price" }));

  if (!AGENT_PEM_PATH || !AGENT_PUBLIC || !VAULT) {
    return NextResponse.json({
      configured: false,
      reason:
        "Set FUND402_AGENT_SECRET_KEY_PATH, FUND402_AGENT_PUBLIC_KEY and FUND402_VAULT_CONTRACT in .env.local, deploy the vault, and fund the agent. See fund402/SETUP.md.",
    });
  }

  let withPaymentInterceptor: any, testnetConfig: any;
  try {
    ({ withPaymentInterceptor, testnetConfig } = await import("@fund402/agent-sdk"));
  } catch (e: any) {
    return NextResponse.json({
      configured: false,
      reason: `@fund402/agent-sdk not installed/built: ${e?.message}. Run npm install + build it in fund402/packages/agent-sdk.`,
    });
  }

  const events: StepId[] = ["request"];
  let deployHash: string | undefined;

  const agent = withPaymentInterceptor({
    ...testnetConfig(),
    agentSecretKey: readFileSync(AGENT_PEM_PATH, "utf8"),
    agentPublicKey: AGENT_PUBLIC,
    vaultContractHash: VAULT.replace(/^hash-/, ""),
    onEvent: (e: any) => {
      const step = EVENT_TO_STEP[e.type];
      if (step && !events.includes(step)) events.push(step);
      if (e?.data?.deployHash) deployHash = e.data.deployHash;
    },
  });

  try {
    const url = `${GATEWAY.replace(/\/$/, "")}/${choosePath(String(query ?? ""))}`;
    const { data } = await agent.get(url);
    if (!events.includes("data_received")) events.push("data_received");
    return NextResponse.json({
      configured: true,
      deployHash,
      explorerUrl: deployHash
        ? `https://cspr.live/deploy/${deployHash}?network=${process.env.NEXT_PUBLIC_NETWORK ?? "casper-test"}`
        : null,
      data,
      events,
    });
  } catch (err: any) {
    return NextResponse.json(
      { configured: true, error: err?.message ?? "agent run failed", deployHash, events },
      { status: 502 }
    );
  }
}
