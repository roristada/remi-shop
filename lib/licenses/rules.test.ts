import { test } from "node:test";
import assert from "node:assert/strict";
import { canCancelLicenseRequest, canEditLicenseRequest, licenseEditDeadline, licensePaymentDeadline, licenseStage, pickLicenseLines } from "./rules";

const offers = [
  { usageTypeId: "a", nameTH: "สินค้า", nameEN: "Merch", price: "500.00" },
  { usageTypeId: "b", nameTH: "ปกหนังสือ", nameEN: "Book cover", price: "1200.50" },
];

test("pickLicenseLines sums the chosen types in satang", () => {
  const r = pickLicenseLines(offers, ["b", "a"]);
  assert.ok(r.ok);
  assert.equal(r.total, 170050);
  assert.deepEqual(
    r.lines.map((l) => l.usageTypeId),
    ["a", "b"],
  );
});

test("pickLicenseLines ignores duplicate ids", () => {
  const r = pickLicenseLines(offers, ["a", "a"]);
  assert.ok(r.ok);
  assert.equal(r.total, 50000);
  assert.equal(r.lines.length, 1);
});

test("pickLicenseLines rejects an empty choice", () => {
  assert.deepEqual(pickLicenseLines(offers, []), { ok: false, code: "EMPTY" });
});

test("pickLicenseLines rejects a type the product no longer offers", () => {
  assert.deepEqual(pickLicenseLines(offers, ["a", "gone"]), { ok: false, code: "OPTION_CHANGED" });
});

test("licenseStage before approval follows the request status", () => {
  assert.equal(licenseStage("PENDING_REVIEW", null), "REVIEW");
  assert.equal(licenseStage("REJECTED", null), "REJECTED");
  assert.equal(licenseStage("CANCELLED", null), "CANCELLED");
});

test("licenseStage after approval follows the order", () => {
  assert.equal(licenseStage("APPROVED", "PENDING_PAYMENT"), "AWAITING_PAYMENT");
  assert.equal(licenseStage("APPROVED", "WAITING_REVIEW"), "PAYMENT_REVIEW");
  assert.equal(licenseStage("APPROVED", "PAYMENT_REJECTED"), "PAYMENT_REJECTED");
  assert.equal(licenseStage("APPROVED", "COMPLETED"), "ACTIVE");
  assert.equal(licenseStage("APPROVED", "CANCELLED"), "PAYMENT_CANCELLED");
});

test("only pending requests can be cancelled by the customer", () => {
  assert.equal(canCancelLicenseRequest("PENDING_REVIEW"), true);
  assert.equal(canCancelLicenseRequest("APPROVED"), false);
  assert.equal(canCancelLicenseRequest("REJECTED"), false);
});

test("licensePaymentDeadline adds whole days", () => {
  const at = new Date("2026-09-26T10:00:00Z");
  assert.equal(licensePaymentDeadline(at, 3).toISOString(), "2026-09-29T10:00:00.000Z");
});

test("canEditLicenseRequest allows live requests for 30 days only", () => {
  const created = new Date("2026-09-01T00:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  assert.equal(canEditLicenseRequest("PENDING_REVIEW", created, new Date(created.getTime() + 29 * day)), true);
  assert.equal(canEditLicenseRequest("APPROVED", created, new Date(created.getTime() + 29 * day)), true);
  assert.equal(canEditLicenseRequest("PENDING_REVIEW", created, licenseEditDeadline(created)), false);
  assert.equal(canEditLicenseRequest("REJECTED", created, created), false);
  assert.equal(canEditLicenseRequest("CANCELLED", created, created), false);
});
