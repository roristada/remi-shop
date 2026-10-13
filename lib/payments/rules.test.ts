import { test } from "node:test";
import assert from "node:assert/strict";
import { canCustomerCancel, canUploadSlip, normalizeRejectReason, REJECT_REASON_MAX, slipResubmitDeadline } from "./rules";

const now = new Date("2026-09-26T10:00:00+07:00");
const future = new Date("2026-09-26T11:00:00+07:00");
const past = new Date("2026-09-26T09:00:00+07:00");

test("canUploadSlip", () => {
  assert.equal(canUploadSlip({ status: "PENDING_PAYMENT", paymentStatus: null, expiresAt: future }, now), true);
  // Past the unpaid deadline.
  assert.equal(canUploadSlip({ status: "PENDING_PAYMENT", paymentStatus: null, expiresAt: past }, now), false);
  // A rejected product order takes no new slip (customer orders again); a license order may retry, with no deadline.
  assert.equal(canUploadSlip({ status: "PAYMENT_REJECTED", paymentStatus: "REJECTED", expiresAt: past, kind: "PRODUCT" }, now), false);
  assert.equal(canUploadSlip({ status: "PAYMENT_REJECTED", paymentStatus: "REJECTED", expiresAt: past, kind: "LICENSE" }, now), true);
  for (const status of ["WAITING_REVIEW", "COMPLETED", "CANCELLED"] as const) {
    assert.equal(canUploadSlip({ status, paymentStatus: "WAITING", expiresAt: future }, now), false);
  }
});

test("canCustomerCancel follows the same states", () => {
  assert.equal(canCustomerCancel({ status: "PAYMENT_REJECTED", paymentStatus: "REJECTED", expiresAt: past, kind: "LICENSE" }, now), true);
  assert.equal(canCustomerCancel({ status: "PAYMENT_REJECTED", paymentStatus: "REJECTED", expiresAt: past, kind: "PRODUCT" }, now), false);
  assert.equal(canCustomerCancel({ status: "WAITING_REVIEW", paymentStatus: "WAITING", expiresAt: future }, now), false);
});

test("normalizeRejectReason", () => {
  assert.equal(normalizeRejectReason("  ยอดเงินไม่ตรง  "), "ยอดเงินไม่ตรง");
  assert.equal(normalizeRejectReason("   "), null);
  assert.equal(normalizeRejectReason(undefined), null);
  assert.equal(normalizeRejectReason("x".repeat(REJECT_REASON_MAX + 1)), null);
});

test("a slip asked again reopens the order for 24 hours", () => {
  const deadline = slipResubmitDeadline(now);
  assert.equal(deadline.getTime() - now.getTime(), 24 * 60 * 60 * 1000);
  // The reopened order is a plain unpaid order again: slip upload and cancel work until the deadline.
  const reopened = { status: "PENDING_PAYMENT", paymentStatus: null, expiresAt: deadline, kind: "PRODUCT" } as const;
  assert.equal(canUploadSlip(reopened, now), true);
  assert.equal(canCustomerCancel(reopened, now), true);
  assert.equal(canUploadSlip(reopened, new Date(deadline.getTime() + 1)), false);
});
