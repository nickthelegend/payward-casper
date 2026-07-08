// Fund402 one-shot chat — the non-interactive twin of the TUI. Reads a JSON
// { messages: [{role,content}, …] } from stdin, runs ONE assistant turn (Groq
// decides tools, the tools run LIVE on Casper), and writes a JSON result to
// stdout: { reply, steps: [{ tool, args, result }] }. Tool logs go to stderr,
// so stdout stays clean JSON. Used by the web cockpit's /api/chat route.
import { TOOLS, TOOL_MAP } from "fund402-agent";
import { groqChat } from "./groq.mjs";

const SYSTEM = `You are Fund402, an autonomous AI credit agent operating LIVE on the Casper blockchain testnet.
You run a just-in-time (JIT) credit protocol for AI agents and can take real on-chain actions through your tools.

What you can do (tools): create agent wallets, fund them with CSPR (gas) and F402 tokens, seed the vault's
liquidity pool, award on-chain reputation, BORROW just-in-time credit (the vault fronts a CEP-18 payment to a
merchant — this IS an x402 payment, settled on Casper), repay loans, sign + verify x402 payment authorizations
against the live facilitator, and read balances / pool stats.

Key facts you must respect:
- "treasury" is the funded account; it funds agents, provides liquidity, and is the admin + default merchant.
- An agent wallet MUST be funded with CSPR (fund_wallet_cspr) BEFORE it can sign any deploy (borrow/repay).
- award_reputation with delta>=200 makes an agent Tier 3 → it borrows with ZERO collateral. Do this for new agents.
- Amounts are base units; F402 has 9 decimals (1000000 = 0.001 F402). Default a borrow to 1000000 unless asked.
- To make a fresh agent pay for something, the sequence is: create_wallet → fund_wallet_cspr → award_reputation → borrow_and_pay.
- Every on-chain action returns a cspr.live deploy link. Always surface it.

Be concise and action-oriented. Call tools in the right order, then summarize what actually happened on-chain.`;

const groqTools = TOOLS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.inputSchema },
}));

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const { messages: history = [] } = JSON.parse(raw || "{}");
  const messages = [{ role: "system", content: SYSTEM }, ...history];

  const steps = [];
  let reply = "";
  for (let step = 0; step < 12; step++) {
    const msg = await groqChat(messages, groqTools);
    messages.push(msg);

    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        const name = tc.function.name;
        let args = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
        let result;
        try {
          const tool = TOOL_MAP[name];
          if (!tool) throw new Error(`unknown tool ${name}`);
          result = await tool.handler(args);
        } catch (e) {
          result = { error: e?.message || String(e) };
        }
        steps.push({ tool: name, args, result });
        messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify(result) });
      }
      continue; // let the model react to the tool results
    }

    reply = msg.content || "";
    break;
  }

  process.stdout.write(JSON.stringify({ reply, steps }));
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ reply: "", steps: [], error: e?.message || String(e) }));
  process.exit(1);
});
