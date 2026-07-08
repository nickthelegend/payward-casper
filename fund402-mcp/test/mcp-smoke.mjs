// Smoke test: connect an MCP client to the fund402-mcp server over stdio,
// list the tools, and call a read-only one (get_pool_stats).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const transport = new StdioClientTransport({ command: "node", args: [join(HERE, "..", "src", "server.mjs")] });
const client = new Client({ name: "fund402-smoke", version: "1.0.0" }, { capabilities: {} });

await client.connect(transport);
const { tools } = await client.listTools();
console.log(`✓ MCP server up — ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);

const r = await client.callTool({ name: "get_pool_stats", arguments: {} });
console.log("✓ get_pool_stats →", r.content[0].text.replace(/\s+/g, " ").slice(0, 120));

const b = await client.callTool({ name: "get_balances", arguments: { account: "treasury" } });
console.log("✓ get_balances(treasury) →", b.content[0].text.replace(/\s+/g, " ").slice(0, 120));

await client.close();
console.log("\nMCP SMOKE TEST PASSED ✅");
process.exit(0);
