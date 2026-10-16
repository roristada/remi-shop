// Pure giveaway rules (no DB): phases, the draw, claim deadlines and substitute prizes.

/** Days a winner has to claim before the admin may redraw the slot. */
export const CLAIM_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * DRAFT: admin only. UPCOMING/OPEN: registration not started / open [startsAt, endsAt).
 * CLOSED: registration over, waiting for the admin's draw. DRAWN: winners announced.
 */
export type GiveawayPhase = "DRAFT" | "UPCOMING" | "OPEN" | "CLOSED" | "DRAWN";

export type GiveawayPhaseInput = { isPublished: boolean; startsAt: Date; endsAt: Date; drawnAt: Date | null };

export function giveawayPhase(g: GiveawayPhaseInput, now: Date): GiveawayPhase {
  if (g.drawnAt) return "DRAWN";
  if (!g.isPublished) return "DRAFT";
  if (now < g.startsAt) return "UPCOMING";
  if (now < g.endsAt) return "OPEN";
  return "CLOSED";
}

/** Customers see published giveaways (a drawn one stays visible for its results). */
export function isGiveawayVisible(g: GiveawayPhaseInput): boolean {
  return g.isPublished;
}

/** Prizes, dates and entries can still be changed until the first draw. */
export function canEditPrizes(g: GiveawayPhaseInput): boolean {
  return g.drawnAt === null;
}

export function claimDeadline(drawnAt: Date): Date {
  return new Date(drawnAt.getTime() + CLAIM_DAYS * DAY_MS);
}

/** CLAIMED: prize delivered. FORFEITED: deadline missed and the slot was redrawn. EXPIRED: deadline missed, not yet redrawn. */
export type WinnerState = "PENDING" | "CLAIMED" | "EXPIRED" | "FORFEITED";

export type WinnerStateInput = { claimedAt: Date | null; forfeitedAt: Date | null; claimDeadline: Date };

export function winnerState(w: WinnerStateInput, now: Date): WinnerState {
  if (w.claimedAt) return "CLAIMED";
  if (w.forfeitedAt) return "FORFEITED";
  if (now >= w.claimDeadline) return "EXPIRED";
  return "PENDING";
}

/** Whether this winner row still holds its prize slot (expired rows hold it until redrawn). */
export function holdsSlot(w: WinnerStateInput): boolean {
  return w.forfeitedAt === null;
}

/** Slots of a prize the next draw should fill: winners wanted minus winners still holding one. */
export function openSlots(winnerCount: number, winners: readonly WinnerStateInput[], now: Date): number {
  const holding = winners.filter((w) => holdsSlot(w) && winnerState(w, now) !== "EXPIRED").length;
  return Math.max(0, winnerCount - holding);
}

/**
 * Picks `count` distinct candidates uniformly at random (partial Fisher–Yates). `randomInt(n)`
 * must return an integer in [0, n); the server passes crypto.randomInt.
 */
export function pickRandom<T>(candidates: readonly T[], count: number, randomInt: (n: number) => number): T[] {
  const pool = [...candidates];
  const take = Math.min(Math.max(0, count), pool.length);
  for (let i = 0; i < take; i++) {
    const j = i + randomInt(pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}

/** A substitute may cost (current price, after any active discount) at most the prize's value. Satang. */
export function isSubstituteAllowed(finalPrice: number, prizeValue: number): boolean {
  return finalPrice <= prizeValue;
}

/** Public winner name: the first two characters of the first name, the rest hidden. */
export function maskWinnerName(name: string | null | undefined, fallback: string): string {
  const first = name?.trim().split(/\s+/)[0] ?? "";
  if (!first) return fallback;
  const chars = Array.from(first);
  return `${chars.slice(0, Math.min(2, chars.length - 1) || 1).join("")}***`;
}

/** Display name for an entry: profile name, else the part of the email before "@". */
export function entrantName(displayName: string | null, email: string): string {
  return displayName?.trim() || email.split("@")[0];
}
