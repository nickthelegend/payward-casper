#!/usr/bin/env node
// Direct tool runner for testing: `node src/cli.mjs <tool> '<json-args>'`
import { TOOLS, TOOL_MAP } from "./index.mjs";

const [, , name, jsonArgs] = process.argv;

if (!name || name === "list" || name === "--help" || name === "-h") {
  process.stderr.write("Fund402 agent tools:\n");
  for (const t of TOOLS) process.stderr.write(`  ${t.name.padEnd(20)} ${t.description}\n`);
  process.stderr.write('\nUsage: node src/cli.mjs <tool> \'{"json":"args"}\'\n');
  process.exit(0);
}

const tool = TOOL_MAP[name];
if (!tool) {
  process.stderr.write(`unknown tool: ${name}\n`);
  process.exit(1);
}

let args = {};
try {
  args = jsonArgs ? JSON.parse(jsonArgs) : {};
} catch (e) {
  process.stderr.write(`bad JSON args: ${e.message}\n`);
  process.exit(1);
}

try {
  const result = await tool.handler(args);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n"); // result on stdout, logs on stderr
} catch (e) {
  process.stderr.write(`\n✗ ${name} failed: ${e?.message || e}\n`);
  process.exit(1);
}
