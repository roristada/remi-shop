import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateProductPrice, fromHundredths, isDiscountActive, toHundredths } from "./calculate";

const start = new Date("2026-10-01T00:00:00+07:00");
const end = new Date("2026-10-31T23:59:59+07:00");
const base = { price: "199.00", discountPercent: "20", discountStartAt: start, discountEndAt: end };

test("toHundredths / fromHundredths round-trip", () => {
  assert.equal(toHundredths("199"), 19900);
  assert.equal(toHundredths("199.5"), 19950);
  assert.equal(toHundredths("0.05"), 5);
  assert.equal(toHundredths(12.3), 1230);
  assert.equal(fromHundredths(19950), "199.50");
  assert.equal(fromHundredths(5), "0.05");
  assert.throws(() => toHundredths("1.234"));
  assert.throws(() => toHundredths("-1"));
});

test("no discount outside the window", () => {
  const before = calculateProductPrice(base, new Date("2026-09-30T23:59:59+07:00"));
  assert.equal(before.finalPrice, 19900);
  assert.equal(before.isDiscounted, false);

  const after = calculateProductPrice(base, new Date("2026-11-01T00:00:00+07:00"));
  assert.equal(after.finalPrice, 19900);
});

test("discount applies at both inclusive bounds", () => {
  assert.equal(calculateProductPrice(base, start).finalPrice, 15920);
  assert.equal(calculateProductPrice(base, end).finalPrice, 15920);
});

test("discount requires percent and both dates", () => {
  const now = new Date("2026-10-15T12:00:00+07:00");
  assert.equal(isDiscountActive({ ...base, discountPercent: null }, now), false);
  assert.equal(isDiscountActive({ ...base, discountStartAt: null }, now), false);
  assert.equal(isDiscountActive({ ...base, discountEndAt: null }, now), false);
  assert.equal(isDiscountActive(base, now), true);
});

test("fractional percent rounds half-up to the satang", () => {
  const now = new Date("2026-10-15T12:00:00+07:00");
  // 99.99 * 12.5% = 12.49875 → 12.50
  const p = calculateProductPrice({ ...base, price: "99.99", discountPercent: "12.5" }, now);
  assert.equal(p.discount, 1250);
  assert.equal(p.finalPrice, 8749);
  assert.equal(p.unitPrice - p.discount, p.finalPrice);
  assert.equal(p.discountEndsAt, end);
});

test("free product stays free", () => {
  const now = new Date("2026-10-15T12:00:00+07:00");
  const p = calculateProductPrice({ ...base, price: "0" }, now);
  assert.equal(p.finalPrice, 0);
  assert.equal(p.isDiscounted, false);
});
