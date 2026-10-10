import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationTarget, parseNotificationParams } from "./rules";

test("parseNotificationParams keeps only known string fields", () => {
  assert.deepEqual(parseNotificationParams({ orderNumber: "RS1", reason: 5, href: "https://evil.example" }), {
    orderNumber: "RS1",
  });
  assert.deepEqual(parseNotificationParams(null), {});
  assert.deepEqual(parseNotificationParams(["x"]), {});
});

test("notificationTarget: customer paths are localized, admin paths are not", () => {
  assert.deepEqual(notificationTarget("PAYMENT_APPROVED", { orderNumber: "RS260928-JJ58M7" }), {
    path: "/orders/RS260928-JJ58M7",
    localized: true,
  });
  assert.deepEqual(notificationTarget("PAYMENT_REJECTED", {}), { path: "/orders", localized: true });
  assert.equal(notificationTarget("PRODUCT_UPDATED", {}).path, "/downloads");
  assert.deepEqual(notificationTarget("ADMIN_SLIP_SUBMITTED", {}), { path: "/admin/payments", localized: false });
});

test("notificationTarget escapes an order number instead of trusting it as a path", () => {
  assert.equal(notificationTarget("PAYMENT_APPROVED", { orderNumber: "../x?y" }).path, "/orders/..%2Fx%3Fy");
});

test("notificationTarget: PRODUCT_AVAILABLE leads to the product page, escaped", () => {
  assert.deepEqual(notificationTarget("PRODUCT_AVAILABLE", { productSlug: "chibi-head-1" }), {
    path: "/product/chibi-head-1",
    localized: true,
  });
  assert.equal(notificationTarget("PRODUCT_AVAILABLE", { productSlug: "../admin" }).path, "/product/..%2Fadmin");
  assert.equal(notificationTarget("PRODUCT_AVAILABLE", {}).path, "/shop");
});

test("license notifications open the request itself, and only for a real id", () => {
  const id = "0199d1a0-0000-7000-8000-000000000001";
  assert.deepEqual(notificationTarget("LICENSE_CHANGES_REQUESTED", { requestId: id }), { path: `/account/licenses/${id}`, localized: true });
  assert.deepEqual(notificationTarget("ADMIN_LICENSE_RESPONDED", { requestId: id }), { path: `/admin/licenses/${id}`, localized: false });
  assert.deepEqual(notificationTarget("LICENSE_APPROVED", { requestId: "../x" }), { path: "/account/licenses", localized: true });
});
