import { test } from "node:test";
import assert from "node:assert/strict";
import { pickDeadline } from "./deadline";

const d = (s: string) => new Date(s);

test("scheduled products show only the opening, never a discount", () => {
  const r = pickDeadline({ status: "SCHEDULED", saleStartAt: d("2026-10-04"), saleEndAt: null, discountEndsAt: d("2026-10-05") });
  assert.deepEqual(r, { kind: "opens", at: d("2026-10-04") });
});

test("on sale: whichever ends first", () => {
  assert.equal(
    pickDeadline({ status: "ACTIVE", saleStartAt: null, saleEndAt: d("2026-10-20"), discountEndsAt: d("2026-10-10") })?.kind,
    "discountEnds",
  );
  assert.equal(
    pickDeadline({ status: "ACTIVE", saleStartAt: null, saleEndAt: d("2026-10-08"), discountEndsAt: d("2026-10-10") })?.kind,
    "saleEnds",
  );
  assert.equal(pickDeadline({ status: "ACTIVE", saleStartAt: null, saleEndAt: null, discountEndsAt: null }), null);
});

test("ended, hidden and draft products show no deadline", () => {
  for (const status of ["ENDED", "DISABLED", "DRAFT"] as const) {
    assert.equal(pickDeadline({ status, saleStartAt: d("2026-10-04"), saleEndAt: d("2026-10-05"), discountEndsAt: null }), null);
  }
});
