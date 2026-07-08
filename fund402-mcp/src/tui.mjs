#!/usr/bin/env node
// Fund402 TUI — a terminal agent console. You chat in natural language; Groq (the
// LLM) decides which fund402 tools to call; the tools run LIVE on Casper testnet
// and stream their logs (deploy hashes, cspr.live links, balances) right here.
import readline from "node:readline";
import { TOOLS, TOOL_MAP, CFG } from "fund402-agent";
import { groqChat } from "./groq.mjs";

const c = {
  reset: "\x1b[0m", dim: "\x1b[2m", b: "\x1b[1m",
  grn: "\x1b[32m", cyn: "\x1b[36m", yel: "\x1b[33m", mag: "\x1b[35m", red: "\x1b[31m", gray: "\x1b[90m",
};

const groqTools = TOOLS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.inputSchema },
}));

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

const messages = [{ role: "system", content: SYSTEM }];

function banner() {
  console.log(`${c.b}${c.mag}
  ███████╗██╗   ██╗███╗   ██╗██████╗ ██╗  ██╗ ██████╗ ██████╗
  ██╔════╝██║   ██║████╗  ██║██╔══██╗██║  ██║██╔═████╗╚════██╗
  █████╗  ██║   ██║██╔██╗ ██║██║  ██║███████║██║██╔██║ █████╔╝
  ██╔══╝  ██║   ██║██║╚██╗██║██║  ██║╚════██║████╔╝██║██╔═══╝
  ██║     ╚██████╔╝██║ ╚████║██████╔╝     ██║╚██████╔╝███████╗
  ╚═╝      ╚═════╝ ╚═╝  ╚═══╝╚═════╝      ╚═╝ ╚═════╝ ╚══════╝${c.reset}
  ${c.dim}JIT credit agent · Casper testnet · Groq ${CFG.groqModel}${c.reset}
  ${c.gray}${TOOLS.length} tools loaded. Try: "create a wallet called bob, fund it, make it Tier 3, and borrow 0.001 to pay for a price feed".${c.reset}
  ${c.gray}Type 'exit' to quit.${c.reset}
`);
}

async function run() {
  if (!CFG.groqKey) {
    console.error(`${c.red}GROQ_API_KEY not set (fund402-agent/.env). Can't start the TUI.${c.reset}`);
    process.exit(1);
  }
  banner();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));
  let busy = false, closed = false;
  rl.on("close", () => { closed = true; if (!busy) process.exit(0); }); // EOF/Ctrl-D — wait if mid-task

  for (;;) {
    const input = (await ask(`${c.b}${c.grn}you ▸${c.reset} `)).trim();
    if (!input) continue;
    if (["exit", "quit", ":q"].includes(input.toLowerCase())) break;
    messages.push({ role: "user", content: input });

    busy = true;
    for (let step = 0; step < 10; step++) {
      let msg;
      try {
        process.stdout.write(`${c.gray}  …thinking…${c.reset}\r`);
        msg = await groqChat(messages, groqTools);
      } catch (e) {
        console.log(`${c.red}groq error: ${e.message}${c.reset}`);
        break;
      }
      messages.push(msg);

      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          const name = tc.function.name;
          let args = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
          console.log(`${c.yel}🔧 ${name}${c.reset} ${c.dim}${JSON.stringify(args)}${c.reset}`);
          let result;
          try {
            const tool = TOOL_MAP[name];
            if (!tool) throw new Error(`unknown tool ${name}`);
            result = await tool.handler(args); // logs stream to stderr live
          } catch (e) {
            result = { error: e?.message || String(e) };
            console.log(`${c.red}   ✗ ${result.error}${c.reset}`);
          }
          messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify(result) });
        }
        continue; // let the model react to the tool results
      }

      if (msg.content) console.log(`\n${c.cyn}🤖 ${msg.content}${c.reset}`);
      break;
    }
    busy = false;
    if (closed) process.exit(0);
  }
  rl.close();
}

run();
