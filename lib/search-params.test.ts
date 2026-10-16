import { test } from "node:test";
import assert from "node:assert/strict";
import { isUuid, manyParam, toQueryString, toSearchParams } from "./search-params";

const isAB = (v: string): v is "A" | "B" => v === "A" || v === "B";

test("manyParam keeps allowed values from one or many, deduplicated", () => {
  assert.deepEqual(manyParam(undefined, isAB), []);
  assert.deepEqual(manyParam("A", isAB), ["A"]);
  assert.deepEqual(manyParam(["B", "x", "A", "B"], isAB), ["B", "A"]);
  assert.deepEqual(manyParam(["A", "B"], isAB, 1), ["A"]);
});

test("toSearchParams keeps repeated keys as arrays", () => {
  assert.deepEqual(toSearchParams(new URLSearchParams("status=A&status=B&q=x")), { status: ["A", "B"], q: "x" });
});

test("toQueryString repeats array keys and drops empty values", () => {
  assert.equal(toQueryString({ status: ["A", "B"], q: "x", from: undefined, folder: [] }), "status=A&status=B&q=x");
});

test("isUuid accepts ids only", () => {
  assert.equal(isUuid("0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"), true);
  assert.equal(isUuid("none"), false);
});
