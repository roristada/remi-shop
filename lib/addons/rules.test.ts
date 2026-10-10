import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanAddonIds, MAX_ADDONS } from "./rules";

const id = (n: number) => `0199d1a0-0000-7000-8000-${String(n).padStart(12, "0")}`;

test("add-on ids: dedupe, drop self, keep order", () => {
  assert.deepEqual(cleanAddonIds(id(1), [id(3), id(1), id(2), id(3)]), [id(3), id(2)]);
  assert.deepEqual(cleanAddonIds(id(1), []), []);
});

test("add-on ids: malformed input or too many is refused", () => {
  assert.equal(cleanAddonIds(id(1), "x"), null);
  assert.equal(cleanAddonIds(id(1), ["not-a-uuid"]), null);
  assert.equal(cleanAddonIds(id(0), Array.from({ length: MAX_ADDONS + 1 }, (_, i) => id(i + 1))), null);
});
