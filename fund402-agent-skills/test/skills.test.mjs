// Unit tests for the Fund402 skills repo: SKILL.md frontmatter, the skills.sh.json
// registry, and the runnable scripts (syntax + the SDK loader + env contract).
// No network. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = join(ROOT, "skills");
const skillDirs = readdirSync(SKILLS_DIR).filter((d) => statSync(join(SKILLS_DIR, d)).isDirectory());

function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const body = m[1];
  const name = body.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = body.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { name, description };
}

test("all skills are present", () => {
  assert.equal(skillDirs.length, 8);
  for (const need of ["fund402-overview", "fund402-pay-x402", "fund402-repay-loan", "fund402-create-paywall", "fund402-manage-wallet", "fund402-provide-liquidity", "clawback-overview", "clawback-escrow-buy"])
    assert.ok(skillDirs.includes(need), `missing skill dir: ${need}`);
});

test("every skill has a valid SKILL.md whose name matches its directory", () => {
  for (const dir of skillDirs) {
    const p = join(SKILLS_DIR, dir, "SKILL.md");
    assert.ok(existsSync(p), `${dir}/SKILL.md missing`);
    const fm = frontmatter(readFileSync(p, "utf8"));
    assert.ok(fm, `${dir}: no frontmatter`);
    assert.equal(fm.name, dir, `${dir}: frontmatter name must equal dir`);
    assert.ok(fm.description && fm.description.length > 40, `${dir}: needs a real description`);
    assert.match(fm.description.toLowerCase(), /use when|use this|read this/, `${dir}: description should say when to use it`);
  }
});

test("skills.sh.json references exactly the skills that exist", () => {
  const reg = JSON.parse(readFileSync(join(ROOT, "skills.sh.json"), "utf8"));
  const listed = reg.groupings.flatMap((g) => g.skills);
  assert.equal(new Set(listed).size, skillDirs.length, "every skill listed once");
  for (const s of listed) assert.ok(skillDirs.includes(s), `registry references unknown skill: ${s}`);
  for (const d of skillDirs) assert.ok(listed.includes(d), `skill not in registry: ${d}`);
});

test("bundled scripts are valid JS and self-resolve the SDK + read the agent key", () => {
  const scripts = [];
  for (const dir of skillDirs)
    for (const f of readdirSync(join(SKILLS_DIR, dir)).filter((f) => f.endsWith(".mjs")))
      scripts.push(join(SKILLS_DIR, dir, f));
  assert.ok(scripts.length >= 3, "expected pay/repay/merchant scripts");
  for (const s of scripts) {
    execFileSync("node", ["--check", s]); // throws on a syntax error
    const src = readFileSync(s, "utf8");
    assert.match(src, /@nickthelegend69\/fund402/, `${s}: should use the published SDK`);
    assert.match(src, /createRequire|fromCwd/, `${s}: should resolve the SDK from the project cwd`);
  }
});

test("pay + repay scripts read FUND402_AGENT_PEM and target the vault", () => {
  for (const f of ["fund402-pay-x402/pay.mjs", "fund402-repay-loan/repay.mjs"]) {
    const src = readFileSync(join(SKILLS_DIR, f), "utf8");
    assert.match(src, /FUND402_AGENT_PEM/, `${f}: must read the agent PEM`);
    assert.match(src, /FUND402_VAULT|vaultContract|664d99de|ca4086d3/, `${f}: must reference the vault`);
  }
});

test("README documents the install command", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.match(readme, /npx skills add nickthelegend\/fund402-agent-skills/);
});
