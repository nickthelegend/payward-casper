// Smoke test: connect an MCP client to the clawback-mcp server, list tools, and call
// a read-only one (clawback_get_reputation).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const transport = new StdioClientTransport({ command: "node", args: [join(HERE, "..", "src", "server.mjs")] });
const client = new Client({ name: "clawback-smoke", version: "1.0.0" }, { capabilities: {} });

await client.connect(transport);
const { tools } = await client.listTools();
console.log(`✓ MCP server up — ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);
const clawbackTools = tools.filter((t) => t.name.startsWith("clawback_"));
if (clawbackTools.length < 6) throw new Error(`expected the clawback tools, got ${clawbackTools.length}`);

const r = await client.callTool({ name: "clawback_get_reputation", arguments: { subject: "treasury" } });
console.log("✓ clawback_get_reputation →", r.content[0].text.replace(/\s+/g, " ").slice(0, 120));

await client.close();
console.log("\nCLAWBACK MCP SMOKE TEST PASSED ✅");
process.exit(0);
