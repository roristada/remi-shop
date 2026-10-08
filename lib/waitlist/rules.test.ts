import { test } from "node:test";
import assert from "node:assert/strict";
import { canJoinWaitlist, isWaiting } from "./rules";

test("canJoinWaitlist: only before the sale starts", () => {
  assert.equal(canJoinWaitlist("SCHEDULED"), true);
  for (const s of ["DRAFT", "ACTIVE", "DISABLED", "ENDED"] as const) assert.equal(canJoinWaitlist(s), false);
});

test("isWaiting: joined and not notified yet", () => {
  assert.equal(isWaiting(null), false);
  assert.equal(isWaiting({ notifiedAt: null }), true);
  assert.equal(isWaiting({ notifiedAt: new Date() }), false);
});
