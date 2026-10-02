import { test } from "node:test";
import assert from "node:assert/strict";
import { bangkokDay, deadlineDisplay } from "./datetime";

test("bangkokDay uses Bangkok time, not UTC", () => {
  // 2026-10-03 18:30 UTC is already 4 Oct 01:30 in Bangkok.
  assert.equal(bangkokDay(new Date("2026-10-03T18:30:00Z")), "2026-10-04");
  assert.equal(bangkokDay(new Date("2026-10-03T16:59:59Z")), "2026-10-03");
});

test("deadlineDisplay: date before the day, countdown on the day, passed after", () => {
  const at = new Date("2026-10-04T00:00:00+07:00");
  assert.equal(deadlineDisplay(at, new Date("2026-10-03T23:59:00+07:00")), "date");
  const end = new Date("2026-10-10T23:59:00+07:00");
  assert.equal(deadlineDisplay(end, new Date("2026-10-09T23:59:59+07:00")), "date");
  assert.equal(deadlineDisplay(end, new Date("2026-10-10T00:00:00+07:00")), "countdown");
  assert.equal(deadlineDisplay(end, new Date("2026-10-10T23:58:59+07:00")), "countdown");
  assert.equal(deadlineDisplay(end, end), "passed");
});
