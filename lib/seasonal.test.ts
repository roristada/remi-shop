import { test } from "node:test";
import assert from "node:assert/strict";
import { activeSeason } from "./seasonal";

test("halloween runs from 20 Oct to the end of 31 Oct, Thai time", () => {
  assert.equal(activeSeason(new Date("2026-10-19T23:59:59+07:00")), null);
  assert.equal(activeSeason(new Date("2026-10-20T00:00:00+07:00")), "halloween");
  assert.equal(activeSeason(new Date("2026-10-31T23:59:59+07:00")), "halloween");
  assert.equal(activeSeason(new Date("2026-11-01T00:00:00+07:00")), null);
});

test("a UTC instant is judged by its Thai date", () => {
  // 31 Oct 17:30 UTC is already 1 Nov 00:30 in Bangkok.
  assert.equal(activeSeason(new Date("2026-10-31T17:30:00Z")), null);
});
