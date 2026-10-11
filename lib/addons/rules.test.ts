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

test("add-on-only lines need a buyable main in the same cart or an owned main", async () => {
  const { applyAddonOnlyRule } = await import("./rules");
  const ctx = (owned: string[] = []) => ({ mainsByAddon: new Map([["x", ["a", "b"]]]), ownedMainIds: new Set(owned) });
  const line = (productId: string, problem: "UNAVAILABLE" | null = null) => ({ productId, problem });
  const problems = (lines: ReturnType<typeof line>[], owned?: string[]) => applyAddonOnlyRule(lines, ctx(owned)).map((l) => l.problem);

  assert.deepEqual(problems([line("x")]), ["NEEDS_MAIN"]);
  assert.deepEqual(problems([line("a"), line("x")]), [null, null]);
  // Either main is enough (one add-on line serves both).
  assert.deepEqual(problems([line("b"), line("x")]), [null, null]);
  // A main that cannot be bought does not count.
  assert.deepEqual(problems([line("a", "UNAVAILABLE"), line("x")]), ["UNAVAILABLE", "NEEDS_MAIN"]);
  // Owning a main lets the add-on be bought on its own.
  assert.deepEqual(problems([line("x")], ["b"]), [null]);
  // Unrelated lines and existing problems are left alone.
  assert.deepEqual(problems([line("z"), line("x", "UNAVAILABLE")]), [null, "UNAVAILABLE"]);
});

test("an order line records the main product it was bought with", async () => {
  const { pickAddonMain } = await import("./rules");
  const ctx = { mainsByAddon: new Map([["x", ["a", "b"]]]), ownedMainIds: new Set(["b"]) };
  const inOrder = new Set(["a", "x", "y"]);
  assert.equal(pickAddonMain({ productId: "y", addedWithProductId: "a" }, inOrder, ctx), "a");
  // A cart link to a main that is not in the order is not kept.
  assert.equal(pickAddonMain({ productId: "y", addedWithProductId: "z" }, inOrder, ctx), null);
  assert.equal(pickAddonMain({ productId: "x", addedWithProductId: null }, inOrder, ctx), "a");
  assert.equal(pickAddonMain({ productId: "x", addedWithProductId: null }, new Set(["x"]), ctx), "b");
  assert.equal(pickAddonMain({ productId: "y", addedWithProductId: null }, inOrder, ctx), null);
});
