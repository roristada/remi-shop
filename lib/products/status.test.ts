import { test } from "node:test";
import assert from "node:assert/strict";
import { getProductStatus, isPurchasable } from "./status";

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
