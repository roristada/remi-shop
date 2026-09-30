import { test } from "node:test";
import assert from "node:assert/strict";
import { canCustomerCancel, canUploadSlip, normalizeRejectReason, REJECT_REASON_MAX } from "./rules";

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
