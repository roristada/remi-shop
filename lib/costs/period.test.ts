import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPeriod, parsePeriod } from "./period";

// 2026-10-10 15:00 Bangkok
const now = new Date("2026-10-10T08:00:00Z");

test("presets use Bangkok calendar days", () => {
  assert.deepEqual([parsePeriod({}, now).key, parsePeriod({}, now).fromKey, parsePeriod({}, now).toKey], ["month", "2026-10-01", "2026-10-10"]);
  const last = parsePeriod({ period: "last-month" }, now);
  assert.deepEqual([last.fromKey, last.toKey], ["2026-09-01", "2026-09-30"]);
  assert.equal(last.to.toISOString(), "2026-09-30T16:59:59.999Z");
  assert.equal(parsePeriod({ period: "30d" }, now).fromKey, "2026-09-11");
  assert.equal(parsePeriod({ period: "year" }, now).fromKey, "2026-01-01");
  assert.equal(parsePeriod({ period: "bogus" }, now).key, "month");
});

test("custom range: whole days, swapped bounds fixed, one bound allowed", () => {
  const p = parsePeriod({ from: "2026-10-05", to: "2026-10-01" }, now);
  assert.deepEqual([p.key, p.fromKey, p.toKey], ["custom", "2026-10-01", "2026-10-05"]);
  assert.equal(p.to.toISOString(), "2026-10-05T16:59:59.999Z");
  assert.equal(parsePeriod({ from: "2026-09-15" }, now).toKey, "2026-10-10");
  assert.equal(parsePeriod({ from: "15/09/2026" }, now).key, "month");
});

test("period labels stay short", () => {
  assert.equal(formatPeriod(new Date("2026-09-30T17:00:00Z"), now), "1–10 ต.ค. 2026");
  assert.equal(formatPeriod(new Date("2026-09-27T17:00:00Z"), now), "28 ก.ย. – 10 ต.ค. 2026");
  assert.equal(formatPeriod(now, now), "10 ต.ค. 2026");
});
