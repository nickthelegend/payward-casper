// Unit tests for the demo's pure flow logic (no network). Node strips the TS types.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FLOW, choosePath, EVENT_TO_STEP } from "../lib/flow.ts";

const IDS = FLOW.map((s) => s.id);

test("FLOW is the canonical 8-step x402 JIT-loan sequence", () => {
  assert.equal(FLOW.length, 8);
  assert.deepEqual(IDS, [
    "request", "intercepted_402", "simulating_borrow", "signing_authorization",
    "borrow_submitted", "facilitator_settle", "request_retried", "data_received",
  ]);
  for (const s of FLOW) {
    assert.ok(s.title && s.detail, `${s.id} has title + detail`);
    assert.ok(["Agent", "Gateway", "Vault", "Facilitator", "Casper"].includes(s.actor), `${s.id} actor`);
  }
});

test("choosePath maps the asset from the query (defaults to BTC)", () => {
  assert.equal(choosePath("what's the BTC price"), "prices/BTC-USD/spot");
  assert.equal(choosePath("ETH spot please"), "prices/ETH-USD/spot");
  assert.equal(choosePath("CSPR/USD"), "prices/CSPR-USD/spot");
  assert.equal(choosePath("something else"), "prices/BTC-USD/spot");
});

test("EVENT_TO_STEP maps every SDK event to a real flow step", () => {
  for (const [event, step] of Object.entries(EVENT_TO_STEP)) {
    assert.ok(IDS.includes(step), `${event} → ${step} is a real step`);
  }
  // the SDK's terminal events land on the right visualized steps
  assert.equal(EVENT_TO_STEP.payment_confirmed, "data_received");
  assert.equal(EVENT_TO_STEP.borrow_submitted, "borrow_submitted");
});
