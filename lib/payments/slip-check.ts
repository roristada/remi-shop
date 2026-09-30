import type { SlipCheckResult } from "@/lib/generated/prisma/enums";

/** What the slip itself says, as read by the checking service. */
export type SlipDetails = { transRef: string; amountSatang: number; transferredAt: Date | null };

/** Normalized answer of the checking service (see `lib/payments/slipok.ts`). */
export type SlipCheckResponse =
  | { ok: true; slip: SlipDetails }
  | { ok: false; errorCode: number | null; slip: SlipDetails | null };

/** A transfer made this long before the order existed still counts (clock drift between bank and server). */
export const SLIP_CLOCK_SKEW_MS = 5 * 60 * 1000;

// SlipOK error codes → why the slip goes to the admin. Anything unlisted (bank down, quota, config) is UNAVAILABLE.
const ERROR_RESULTS: Record<number, SlipCheckResult> = {
  1000: "UNREADABLE",
  1005: "UNREADABLE",
  1006: "UNREADABLE",
  1007: "UNREADABLE",
  1008: "UNREADABLE",
  1011: "NOT_FOUND",
  1012: "DUPLICATE",
  1013: "AMOUNT_MISMATCH",
  1014: "RECEIVER_MISMATCH",
};

/**
 * Decides whether a slip pays the order. The service already checks the receiving account and
 * duplicates on its side; the amount and the transfer time are checked again here against the
 * database, so a wrong or stale answer can never approve an order on its own.
 */
export function evaluateSlipCheck(
  response: SlipCheckResponse,
  order: { totalSatang: number; createdAt: Date },
): { result: SlipCheckResult; transRef: string | null } {
  const transRef = response.slip?.transRef || null;
  if (!response.ok) {
    const result = (response.errorCode !== null && ERROR_RESULTS[response.errorCode]) || "UNAVAILABLE";
    return { result, transRef };
  }

  const { slip } = response;
  if (!slip.transRef || !slip.transferredAt) return { result: "UNAVAILABLE", transRef };
  if (slip.amountSatang !== order.totalSatang) return { result: "AMOUNT_MISMATCH", transRef };
  if (slip.transferredAt.getTime() < order.createdAt.getTime() - SLIP_CLOCK_SKEW_MS) {
    return { result: "BEFORE_ORDER", transRef };
  }
  return { result: "PASSED", transRef };
}
