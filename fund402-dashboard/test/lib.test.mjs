// Unit tests for the LP dashboard's pure logic (no network). Node strips TS types.
import { test } from "node:test";
import assert from "node:assert/strict";

// Config is read from env at import time → set it before importing the modules.
process.env.CSPR_CLOUD_API_KEY = "test-key";
process.env.X402_ASSET_PACKAGE = "ee".repeat(32);
process.env.VAULT_ACCOUNT_HASH = "ab".repeat(32);
process.env.NEXT_PUBLIC_NETWORK = "casper-test";

const { notConfiguredReason, explorerTx } = await import("../lib/casper.ts");
const { toBaseUnits } = await import("../lib/units.ts");

test("toBaseUnits parses a decimal string into CEP-18 base units (9 dp)", () => {
  assert.equal(toBaseUnits("1", 9), 1_000_000_000n);
  assert.equal(toBaseUnits("12.5", 9), 12_500_000_000n);
  assert.equal(toBaseUnits("0", 9), 0n);
  assert.equal(toBaseUnits("0.000000001", 9), 1n);
  assert.equal(toBaseUnits("1,000.5", 9), 1_000_500_000_000n); // strips commas
  assert.equal(toBaseUnits("0.0000000019", 9), 1n); // truncates beyond 9 dp
});

test("notConfiguredReason → null once the CSPR key + asset + vault are set", () => {
  assert.equal(notConfiguredReason(), null);
});

test("explorerTx builds the cspr.live deploy url for the network", () => {
  assert.match(
    explorerTx("ab".repeat(32)),
    /^https:\/\/cspr\.live\/deploy\/[a-f0-9]{64}\?network=casper-test$/
  );
});
