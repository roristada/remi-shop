import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bangkokDayKey,
  bangkokDayKeys,
  bangkokMonthRange,
  monthDayKeys,
  parseMonthParam,
  startOfBangkokDay,
  startOfBangkokMonth,
  startOfPreviousBangkokMonth,
} from "./dashboard";

test("bangkokDayKey uses the Bangkok date, not UTC", () => {
  // 18:30 UTC on the 30th is already 01:30 on 1 October in Bangkok.
  assert.equal(bangkokDayKey(new Date("2026-09-30T18:30:00Z")), "2026-10-01");
  assert.equal(bangkokDayKey(new Date("2026-09-30T16:59:59Z")), "2026-09-30");
});

test("start of the Bangkok day and month", () => {
  const now = new Date("2026-10-01T03:00:00Z"); // 10:00 Bangkok
  assert.equal(startOfBangkokDay(now).toISOString(), "2026-09-30T17:00:00.000Z");
  assert.equal(startOfBangkokMonth(now).toISOString(), "2026-09-30T17:00:00.000Z");
  assert.equal(startOfBangkokMonth(new Date("2026-10-15T03:00:00Z")).toISOString(), "2026-09-30T17:00:00.000Z");
});

test("startOfPreviousBangkokMonth wraps the year", () => {
  assert.equal(startOfPreviousBangkokMonth(new Date("2026-10-01T03:00:00Z")).toISOString(), "2026-08-31T17:00:00.000Z");
  assert.equal(startOfPreviousBangkokMonth(new Date("2027-01-10T03:00:00Z")).toISOString(), "2026-11-30T17:00:00.000Z");
});

test("bangkokDayKeys lists days oldest first, ending today", () => {
  assert.deepEqual(bangkokDayKeys(new Date("2026-10-01T03:00:00Z"), 3), ["2026-09-29", "2026-09-30", "2026-10-01"]);
});

test("parseMonthParam: valid past months, else the current Bangkok month", () => {
  const now = new Date("2026-10-31T18:00:00Z"); // already 1 Nov in Bangkok
  assert.deepEqual(parseMonthParam(undefined, now), { year: 2026, month: 11 });
  assert.deepEqual(parseMonthParam("2026-02", now), { year: 2026, month: 2 });
  assert.deepEqual(parseMonthParam("2026-12", now), { year: 2026, month: 11 }); // future
  assert.deepEqual(parseMonthParam("2026-13", now), { year: 2026, month: 11 });
  assert.deepEqual(parseMonthParam("garbage", now), { year: 2026, month: 11 });
});

test("bangkokMonthRange and monthDayKeys cover the whole Bangkok month", () => {
  const { since, until } = bangkokMonthRange({ year: 2026, month: 12 });
  assert.equal(since.toISOString(), "2026-11-30T17:00:00.000Z");
  assert.equal(until.toISOString(), "2026-12-31T17:00:00.000Z");
  assert.equal(monthDayKeys({ year: 2028, month: 2 }).length, 29);
  assert.equal(monthDayKeys({ year: 2026, month: 10 }).at(-1), "2026-10-31");
});
