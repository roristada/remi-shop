import { test } from "node:test";
import assert from "node:assert/strict";
import { getDiscountWindowState, getProductStatus, getSaleWindowState, isPurchasable, scheduleWarnings } from "./status";

const start = new Date("2026-10-01T00:00:00Z");
const end = new Date("2026-10-31T00:00:00Z");
const published = { publishStatus: "PUBLISHED" as const, saleStartAt: start, saleEndAt: end };

test("admin state wins over the sale window", () => {
  const now = new Date("2026-10-15T00:00:00Z");
  assert.equal(getProductStatus({ ...published, publishStatus: "DRAFT" }, now), "DRAFT");
  assert.equal(getProductStatus({ ...published, publishStatus: "DISABLED" }, now), "DISABLED");
});

test("sale window: scheduled → active → ended", () => {
  assert.equal(getProductStatus(published, new Date("2026-09-30T23:59:59Z")), "SCHEDULED");
  assert.equal(getProductStatus(published, start), "ACTIVE");
  assert.equal(getProductStatus(published, new Date("2026-10-30T23:59:59Z")), "ACTIVE");
  assert.equal(getProductStatus(published, end), "ENDED");
});

test("open-ended windows", () => {
  const now = new Date("2030-01-01T00:00:00Z");
  assert.equal(getProductStatus({ ...published, saleStartAt: null, saleEndAt: null }, now), "ACTIVE");
  assert.equal(getProductStatus({ ...published, saleEndAt: null }, now), "ACTIVE");
});

test("only ACTIVE is purchasable", () => {
  assert.equal(isPurchasable(published, new Date("2026-10-15T00:00:00Z")), true);
  assert.equal(isPurchasable(published, end), false);
  assert.equal(isPurchasable({ ...published, publishStatus: "DRAFT" }, start), false);
});

test("sale window state", () => {
  const w = { saleStartAt: start, saleEndAt: end };
  assert.equal(getSaleWindowState({ saleStartAt: null, saleEndAt: null }, start), "NONE");
  assert.equal(getSaleWindowState(w, new Date("2026-09-30T23:59:59Z")), "UPCOMING");
  assert.equal(getSaleWindowState(w, start), "ACTIVE");
  assert.equal(getSaleWindowState(w, end), "ENDED");
  assert.equal(getSaleWindowState({ saleStartAt: start, saleEndAt: null }, end), "ACTIVE");
});

test("discount window state matches the inclusive discount bounds", () => {
  const d = { discountPercent: "20", discountStartAt: start, discountEndAt: end };
  assert.equal(getDiscountWindowState({ ...d, discountPercent: null }, start), "NONE");
  assert.equal(getDiscountWindowState(d, new Date("2026-09-30T23:59:59Z")), "UPCOMING");
  assert.equal(getDiscountWindowState(d, start), "ACTIVE");
  assert.equal(getDiscountWindowState(d, end), "ACTIVE");
  assert.equal(getDiscountWindowState(d, new Date("2026-10-31T00:00:01Z")), "ENDED");
});

test("schedule warnings flag windows that are already over", () => {
  const now = new Date("2026-11-15T00:00:00Z");
  const past = { discountPercent: "20", discountStartAt: start, discountEndAt: end, saleStartAt: start, saleEndAt: end };
  assert.deepEqual(Object.keys(scheduleWarnings(past, now)).sort(), ["discountEndAt", "saleEndAt"]);
  const open = { discountPercent: null, discountStartAt: null, discountEndAt: null, saleStartAt: start, saleEndAt: null };
  assert.deepEqual(scheduleWarnings(open, now), {});
});
