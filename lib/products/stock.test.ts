import { test } from "node:test";
import assert from "node:assert/strict";
import { isSoldOut, toStockInfo } from "./stock";

test("toStockInfo: null limit is unlimited", () => {
  assert.equal(toStockInfo(null, 5), null);
  assert.equal(isSoldOut(null), false);
});

test("toStockInfo: units left never go below zero", () => {
  assert.deepEqual(toStockInfo(3, 1), { limit: 3, left: 2 });
  // Admin lowered the limit below what was already sold.
  assert.deepEqual(toStockInfo(1, 2), { limit: 1, left: 0 });
  assert.equal(isSoldOut(toStockInfo(1, 1)), true);
  assert.equal(isSoldOut(toStockInfo(0, 0)), true);
});
