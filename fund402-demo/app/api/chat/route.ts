import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";

// Web chatbox backend — REAL. Spawns the fund402-mcp one-shot chat (Groq decides
// tools; the tools run LIVE on Casper via the fund402-agent toolbox) and returns
// the assistant reply + the tool calls it made. No mock data.
export const runtime = "nodejs";
export const maxDuration = 300; // on-chain turns can take a couple minutes

const MCP_DIR = process.env.FUND402_MCP_DIR ?? path.resolve(process.cwd(), "../fund402-mcp");

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const { messages } = (await req.json().catch(() => ({ messages: [] }))) as {
    messages?: ChatMessage[];
  };
  // Only send text turns to the model; keep the last 12 for context.
  const history = (messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-12);
  const payload = JSON.stringify({ messages: history });

  const result = await new Promise<Record<string, unknown>>((resolve) => {
    const child = spawn("node", ["src/chat-once.mjs"], { cwd: MCP_DIR });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) =>
      resolve({ reply: "", steps: [], error: `could not start the agent (${MCP_DIR}): ${e.message}` })
    );
    child.on("close", () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        resolve({ reply: "", steps: [], error: err.trim().slice(-400) || "agent produced no output" });
      }
    });
    child.stdin.write(payload);
    child.stdin.end();
  });

  return NextResponse.json(result);
}
