import { test } from "node:test";
import assert from "node:assert/strict";
import { pickRandom } from "./random";

test("picks n distinct items and never more than exist", () => {
  const items = [1, 2, 3, 4, 5, 6];
  const picked = pickRandom(items, 3);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
  assert.ok(picked.every((p) => items.includes(p)));
  assert.equal(pickRandom(items, 10).length, 6);
  assert.deepEqual(pickRandom([], 3), []);
  assert.deepEqual(items, [1, 2, 3, 4, 5, 6]); // input untouched
});

test("deterministic with a fixed random source", () => {
  assert.deepEqual(pickRandom(["a", "b", "c", "d"], 2, () => 0.99), ["d", "a"]);
  assert.deepEqual(pickRandom(["a", "b", "c", "d"], 2, () => 0), ["a", "b"]);
});
