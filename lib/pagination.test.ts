import { test } from "node:test";
import assert from "node:assert/strict";
import { pageItems } from "./pagination";

test("shows every page when there are few", () => {
  assert.deepEqual(pageItems(1, 1), [1]);
  assert.deepEqual(pageItems(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("collapses the far side near either end", () => {
  assert.deepEqual(pageItems(1, 10), [1, 2, 3, 4, 5, "gap", 10]);
  assert.deepEqual(pageItems(4, 10), [1, 2, 3, 4, 5, "gap", 10]);
  assert.deepEqual(pageItems(10, 10), [1, "gap", 6, 7, 8, 9, 10]);
  assert.deepEqual(pageItems(7, 10), [1, "gap", 6, 7, 8, 9, 10]);
});

test("keeps a window around the current page in the middle", () => {
  assert.deepEqual(pageItems(5, 10), [1, "gap", 4, 5, 6, "gap", 10]);
  assert.deepEqual(pageItems(50, 100), [1, "gap", 49, 50, 51, "gap", 100]);
});
