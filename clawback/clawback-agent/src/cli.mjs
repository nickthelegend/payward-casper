#!/usr/bin/env node
// clawback-agent CLI: node src/cli.mjs <tool> '<json>'  (result → stdout, logs → stderr)
import { TOOL_MAP, TOOLS } from "./index.mjs";

const [, , tool, argJson] = process.argv;
if (!tool || tool === "list") {
  process.stderr.write("clawback tools:\n" + TOOLS.map((t) => `  ${t.name}` + " ".repeat(Math.max(1, 26 - t.name.length)) + t.description).join("\n") + "\n");
  process.exit(tool ? 0 : 1);
}
const entry = TOOL_MAP[tool];
if (!entry) { process.stderr.write(`unknown tool: ${tool}\n`); process.exit(1); }
let args = {};
try { args = argJson ? JSON.parse(argJson) : {}; } catch (e) { process.stderr.write(`bad JSON args: ${e.message}\n`); process.exit(1); }
try {
  const result = await entry.handler(args);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} catch (e) {
  process.stderr.write(`### ${tool} ERROR ###\n  ${e?.message || e}\n`);
  process.exit(1);
}
