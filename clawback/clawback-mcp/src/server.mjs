#!/usr/bin/env node
// Clawback MCP server (stdio) — exposes the clawback-agent tools (escrow purchase,
// AI-adjudicated disputes, release/refund) to any MCP client (Claude Desktop, etc.).
// stdout is the JSON-RPC channel; all tool logs go to stderr.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, TOOL_MAP } from "clawback-agent";

const server = new Server(
  { name: "clawback-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOL_MAP[req.params.name];
  if (!tool) return { content: [{ type: "text", text: `unknown tool: ${req.params.name}` }], isError: true };
  try {
    const result = await tool.handler(req.params.arguments ?? {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e?.message || e}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`clawback-mcp: stdio server up with ${TOOLS.length} tools\n`);
