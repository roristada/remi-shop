import { test } from "node:test";
import assert from "node:assert/strict";
import { canReviewOrder, ratingAverage, ratingDistribution, reviewDeadline, reviewerName } from "./rules";

const paid = new Date("2026-09-10T00:00:00Z");
const day = 24 * 60 * 60 * 1000;
const order = { status: "COMPLETED", kind: "PRODUCT", paidAt: paid, createdAt: new Date("2026-09-05T00:00:00Z") } as const;

test("canReviewOrder: completed product order within 30 days of approval", () => {
  assert.equal(canReviewOrder(order, new Date(paid.getTime() + 29 * day)), true);
  assert.equal(canReviewOrder(order, reviewDeadline(order)), false);
});

test("canReviewOrder: rejects unpaid, cancelled and license orders", () => {
  const now = new Date(paid.getTime() + day);
  assert.equal(canReviewOrder({ ...order, status: "WAITING_REVIEW" }, now), false);
  assert.equal(canReviewOrder({ ...order, status: "CANCELLED" }, now), false);
  assert.equal(canReviewOrder({ ...order, kind: "LICENSE" }, now), false);
});

test("reviewDeadline falls back to the order date when paidAt is missing", () => {
  const created = new Date("2026-09-05T00:00:00Z");
  assert.equal(reviewDeadline({ paidAt: null, createdAt: created }).getTime(), created.getTime() + 30 * day);
});

test("ratingAverage rounds to one decimal and handles no reviews", () => {
  assert.equal(ratingAverage(0, 0), 0);
  assert.equal(ratingAverage(14, 3), 4.7);
  assert.equal(ratingAverage(5, 1), 5);
});

test("ratingDistribution adds up to 100 and lists 5 stars first", () => {
  const d = ratingDistribution({ 5: 1, 4: 1, 3: 1 });
  assert.deepEqual(
    d.map((b) => b.stars),
    [5, 4, 3, 2, 1],
  );
  assert.equal(d.reduce((n, b) => n + b.percent, 0), 100);
  assert.deepEqual(
    ratingDistribution({}).map((b) => b.percent),
    [0, 0, 0, 0, 0],
  );
});

test("reviewerName shows a first name only", () => {
  assert.equal(reviewerName("Somchai Jaidee", "Customer"), "Somchai");
  assert.equal(reviewerName(null, "Customer"), "Customer");
  assert.equal(reviewerName("   ", "Customer"), "Customer");
});
