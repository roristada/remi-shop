import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAIM_DAYS,
  claimDeadline,
  entrantName,
  giveawayPhase,
  isSubstituteAllowed,
  maskWinnerName,
  openSlots,
  pickRandom,
  winnerState,
} from "./rules";

const startsAt = new Date("2026-11-01T00:00:00Z");
const endsAt = new Date("2026-11-08T00:00:00Z");
const g = { isPublished: true, startsAt, endsAt, drawnAt: null };

test("giveawayPhase follows publish state, window and draw", () => {
  assert.equal(giveawayPhase({ ...g, isPublished: false }, startsAt), "DRAFT");
  assert.equal(giveawayPhase(g, new Date(startsAt.getTime() - 1)), "UPCOMING");
  assert.equal(giveawayPhase(g, startsAt), "OPEN");
  assert.equal(giveawayPhase(g, endsAt), "CLOSED");
  assert.equal(giveawayPhase({ ...g, drawnAt: endsAt }, endsAt), "DRAWN");
});

test("claimDeadline is CLAIM_DAYS after the draw", () => {
  assert.equal(claimDeadline(endsAt).getTime() - endsAt.getTime(), CLAIM_DAYS * 24 * 60 * 60 * 1000);
});

test("winnerState: claimed, forfeited, expired at the deadline, else pending", () => {
  const w = { claimedAt: null, forfeitedAt: null, claimDeadline: endsAt };
  assert.equal(winnerState(w, new Date(endsAt.getTime() - 1)), "PENDING");
  assert.equal(winnerState(w, endsAt), "EXPIRED");
  assert.equal(winnerState({ ...w, forfeitedAt: endsAt }, endsAt), "FORFEITED");
  assert.equal(winnerState({ ...w, claimedAt: startsAt }, endsAt), "CLAIMED");
});

test("openSlots refills expired and forfeited winners only", () => {
  const now = endsAt;
  const pending = { claimedAt: null, forfeitedAt: null, claimDeadline: new Date(now.getTime() + 1) };
  const claimed = { ...pending, claimedAt: startsAt };
  const expired = { ...pending, claimDeadline: now };
  const forfeited = { ...expired, forfeitedAt: now };
  assert.equal(openSlots(3, [], now), 3);
  assert.equal(openSlots(3, [pending, claimed], now), 1);
  assert.equal(openSlots(3, [pending, claimed, expired, forfeited], now), 1);
  assert.equal(openSlots(1, [claimed, pending], now), 0);
});

test("pickRandom returns distinct candidates, capped at the pool", () => {
  const first = () => 0;
  assert.deepEqual(pickRandom(["a", "b", "c"], 2, first), ["a", "b"]);
  const last = (n: number) => n - 1;
  assert.deepEqual(pickRandom(["a", "b", "c"], 2, last), ["c", "a"]);
  assert.deepEqual(pickRandom(["a"], 5, first), ["a"]);
  assert.deepEqual(pickRandom([], 2, first), []);
  const picked = pickRandom(["a", "b", "c", "d"], 4, (n) => Math.floor(Math.random() * n));
  assert.equal(new Set(picked).size, 4);
});

test("isSubstituteAllowed: up to the prize value", () => {
  assert.equal(isSubstituteAllowed(15000, 15000), true);
  assert.equal(isSubstituteAllowed(15001, 15000), false);
  assert.equal(isSubstituteAllowed(0, 15000), true);
});

test("maskWinnerName hides most of the first name", () => {
  assert.equal(maskWinnerName("Somchai Jaidee", "Customer"), "So***");
  assert.equal(maskWinnerName("สมชาย", "ลูกค้า"), "สม***");
  assert.equal(maskWinnerName("Al", "Customer"), "A***");
  assert.equal(maskWinnerName("  ", "Customer"), "Customer");
  assert.equal(maskWinnerName(null, "Customer"), "Customer");
});

test("entrantName falls back to the email's local part", () => {
  assert.equal(entrantName(null, "mint@example.com"), "mint");
  assert.equal(entrantName(" Mint ", "x@example.com"), "Mint");
});
