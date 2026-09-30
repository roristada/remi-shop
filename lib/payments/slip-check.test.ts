import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSlipCheck, SLIP_CLOCK_SKEW_MS, type SlipDetails } from "./slip-check";

const order = { totalSatang: 25_000, createdAt: new Date("2026-10-01T10:00:00+07:00") };
const slip = (over: Partial<SlipDetails> = {}): SlipDetails => ({
  transRef: "010092101507665143",
  amountSatang: 25_000,
  transferredAt: new Date("2026-10-01T10:03:00+07:00"),
  ...over,
});

test("a matching slip passes", () => {
  assert.deepEqual(evaluateSlipCheck({ ok: true, slip: slip() }, order), {
    result: "PASSED",
    transRef: "010092101507665143",
  });
});

test("amount is re-checked against the order, to the satang", () => {
  assert.equal(evaluateSlipCheck({ ok: true, slip: slip({ amountSatang: 24_999 }) }, order).result, "AMOUNT_MISMATCH");
  assert.equal(evaluateSlipCheck({ ok: true, slip: slip({ amountSatang: 25_001 }) }, order).result, "AMOUNT_MISMATCH");
});

test("a transfer made before the order is not accepted (beyond clock skew)", () => {
  const justInside = new Date(order.createdAt.getTime() - SLIP_CLOCK_SKEW_MS);
  const tooEarly = new Date(order.createdAt.getTime() - SLIP_CLOCK_SKEW_MS - 1);
  assert.equal(evaluateSlipCheck({ ok: true, slip: slip({ transferredAt: justInside }) }, order).result, "PASSED");
  assert.equal(evaluateSlipCheck({ ok: true, slip: slip({ transferredAt: tooEarly }) }, order).result, "BEFORE_ORDER");
});

test("missing reference or time cannot pass", () => {
  assert.equal(evaluateSlipCheck({ ok: true, slip: slip({ transRef: "" }) }, order).result, "UNAVAILABLE");
  assert.equal(evaluateSlipCheck({ ok: true, slip: slip({ transferredAt: null }) }, order).result, "UNAVAILABLE");
});

test("service errors map to a reason for the admin", () => {
  const cases: [number | null, string][] = [
    [1007, "UNREADABLE"],
    [1011, "NOT_FOUND"],
    [1012, "DUPLICATE"],
    [1013, "AMOUNT_MISMATCH"],
    [1014, "RECEIVER_MISMATCH"],
    [1009, "UNAVAILABLE"],
    [1003, "UNAVAILABLE"],
    [null, "UNAVAILABLE"],
  ];
  for (const [errorCode, result] of cases) {
    assert.equal(evaluateSlipCheck({ ok: false, errorCode, slip: null }, order).result, result);
  }
  // The slip's reference is kept when the service returns it with the error.
  assert.equal(evaluateSlipCheck({ ok: false, errorCode: 1013, slip: slip() }, order).transRef, "010092101507665143");
});
