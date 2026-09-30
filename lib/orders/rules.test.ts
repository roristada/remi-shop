import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateLine,
  generateOrderNumber,
  isOrderExpired,
  isOrderOpen,
  orderTotals,
  type CheckoutProduct,
  type OwnershipContext,
} from "./rules";

const now = new Date("2026-09-26T10:00:00+07:00");
const product: CheckoutProduct = {
  id: "p1",
  price: "100.00",
  discountPercent: null,
  discountStartAt: null,
  discountEndAt: null,
  publishStatus: "PUBLISHED",
  saleStartAt: null,
  saleEndAt: null,
  categoryActive: true,
  stock: null,
};
const none: OwnershipContext = { owned: new Set(), inOpenOrder: new Set() };

test("evaluateLine: purchasable", () => {
  const line = evaluateLine(product, none, now);
  assert.equal(line.problem, null);
  assert.equal(line.price.finalPrice, 10000);
});

test("evaluateLine: owned and open-order products are blocked", () => {
  assert.equal(evaluateLine(product, { owned: new Set(["p1"]), inOpenOrder: new Set() }, now).problem, "OWNED");
  assert.equal(evaluateLine(product, { owned: new Set(), inOpenOrder: new Set(["p1"]) }, now).problem, "IN_ORDER");
});

test("evaluateLine: sold out only when a limited product has no unit left", () => {
  assert.equal(evaluateLine({ ...product, stock: { limit: 1, left: 0 } }, none, now).problem, "SOLD_OUT");
  assert.equal(evaluateLine({ ...product, stock: { limit: 3, left: 1 } }, none, now).problem, null);
  // A buyer who already owns it sees "owned", not "sold out".
  const owned = { owned: new Set(["p1"]), inOpenOrder: new Set<string>() };
  assert.equal(evaluateLine({ ...product, stock: { limit: 1, left: 0 } }, owned, now).problem, "OWNED");
});

test("evaluateLine: unavailable states", () => {
  const cases: Partial<CheckoutProduct>[] = [
    { publishStatus: "DRAFT" },
    { publishStatus: "DISABLED" },
    { saleStartAt: new Date("2026-09-27T00:00:00+07:00") },
    { saleEndAt: new Date("2026-09-26T09:59:59+07:00") },
    { categoryActive: false },
  ];
  for (const c of cases) assert.equal(evaluateLine({ ...product, ...c }, none, now).problem, "UNAVAILABLE");
});

test("orderTotals skips problem lines and uses the current discount", () => {
  const discounted = {
    ...product,
    id: "p2",
    discountPercent: "25",
    discountStartAt: new Date("2026-09-01T00:00:00+07:00"),
    discountEndAt: new Date("2026-09-30T00:00:00+07:00"),
  };
  const lines = [
    evaluateLine(product, none, now),
    evaluateLine(discounted, none, now),
    evaluateLine({ ...product, id: "p3", publishStatus: "DISABLED" }, none, now),
  ];
  assert.deepEqual(orderTotals(lines), { subtotal: 20000, discount: 2500, total: 17500 });
});

test("order expiry and open state", () => {
  const expiresAt = new Date("2026-09-26T10:30:00+07:00");
  const pending = { status: "PENDING_PAYMENT" as const, expiresAt, paymentStatus: null };
  assert.equal(isOrderExpired(pending, now), false);
  assert.equal(isOrderOpen(pending, now), true);
  const later = new Date("2026-09-26T10:30:00+07:00");
  assert.equal(isOrderExpired(pending, later), true);
  assert.equal(isOrderOpen(pending, later), false);
  // A slip was uploaded: never auto-expires.
  assert.equal(isOrderExpired({ ...pending, paymentStatus: "WAITING" }, later), false);
  assert.equal(isOrderOpen({ ...pending, status: "WAITING_REVIEW" }, later), true);
  // A rejected product order is over (customer orders again); a rejected license order stays open.
  assert.equal(isOrderOpen({ ...pending, status: "PAYMENT_REJECTED", kind: "PRODUCT" }, later), false);
  assert.equal(isOrderOpen({ ...pending, status: "PAYMENT_REJECTED", kind: "LICENSE" }, later), true);
  assert.equal(isOrderOpen({ ...pending, status: "COMPLETED" }, now), false);
  assert.equal(isOrderOpen({ ...pending, status: "CANCELLED" }, now), false);
});

test("generateOrderNumber uses the Bangkok date and a readable alphabet", () => {
  const bytes = new Uint8Array([0, 1, 31, 32, 200, 255]);
  // 23:30 UTC on the 25th is already the 26th in Bangkok.
  const n = generateOrderNumber(new Date("2026-09-25T23:30:00Z"), bytes);
  assert.match(n, /^RS260926-[0-9A-HJKMNP-TV-Z]{6}$/);
  assert.equal(n, "RS260926-01Z08Z");
});
