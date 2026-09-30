import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessFile } from "./rules";

test("canAccessFile: shared files go to every buyer of the product", () => {
  assert.equal(canAccessFile(null, new Set([null])), true);
  assert.equal(canAccessFile(null, new Set(["va"])), true);
  assert.equal(canAccessFile(null, new Set()), false);
});

test("canAccessFile: variant files only go to buyers of that variant", () => {
  assert.equal(canAccessFile("va", new Set(["va"])), true);
  assert.equal(canAccessFile("vb", new Set(["va"])), false);
  // Bought before the product had variants: shared files only.
  assert.equal(canAccessFile("va", new Set([null])), false);
});
