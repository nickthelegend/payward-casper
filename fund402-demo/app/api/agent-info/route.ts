import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";

// Returns the REAL demo agent's identity + live balances (read from Casper via
// the fund402-agent toolbox). No placeholder — this is the actual on-chain agent
// the cockpit dispatches.
export const runtime = "nodejs";

const AGENT_DIR = process.env.FUND402_AGENT_DIR ?? path.resolve(process.cwd(), "../fund402-agent");
const AGENT_PUBLIC_KEY = process.env.FUND402_AGENT_PUBLIC_KEY ?? "";

export async function GET() {
  if (!AGENT_PUBLIC_KEY) {
    return NextResponse.json({ configured: false, reason: "FUND402_AGENT_PUBLIC_KEY not set" });
  }

  const balances = await new Promise<Record<string, unknown> | null>((resolve) => {
    const child = spawn(
      "node",
      ["src/cli.mjs", "get_balances", JSON.stringify({ account: AGENT_PUBLIC_KEY })],
      { cwd: AGENT_DIR }
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", () => resolve(null));
    child.on("close", () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        resolve(null);
      }
    });
  });

  return NextResponse.json({
    configured: true,
    publicKey: AGENT_PUBLIC_KEY,
    accountHash: (balances?.accountHash as string) ?? null,
    cspr: (balances?.cspr as number) ?? null,
    f402: (balances?.f402 as number) ?? null,
  });
}
