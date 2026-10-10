import type { LicenseEventType } from "@/lib/generated/prisma/enums";
import { parseAnswerChanges } from "@/lib/licenses/form-fields";

type DecimalLike = { toString(): string } | string | number;

export type HistoryEvent = {
  id: string;
  type: LicenseEventType;
  message: string | null;
  oldTotal: DecimalLike | null;
  newTotal: DecimalLike | null;
  fieldIds: string[];
  changes: unknown;
  createdAt: Date;
  actor?: { email: string; displayName: string | null } | null;
};

export type HistoryText = {
  title: (type: LicenseEventType) => string;
  date: (d: Date) => string;
  money: (v: DecimalLike) => string;
  /** Label of a flagged field id, or null when unknown. */
  fieldLabel: (id: string) => string | null;
  /** Which language of the saved change labels to show. */
  locale: string;
  priceLine: (oldTotal: string, newTotal: string) => string;
  changeLine: (label: string, before: string, after: string) => string;
  flaggedLine: (labels: string) => string;
  empty: string;
  /** Admin view: who acted. */
  showActor?: boolean;
};

const TONE: Record<LicenseEventType, "default" | "store" | "positive" | "negative"> = {
  SUBMITTED: "default",
  CUSTOMER_EDITED: "default",
  CHANGES_REQUESTED: "store",
  CUSTOMER_RESPONDED: "default",
  PRICE_ACCEPTED: "positive",
  APPROVED: "positive",
  REJECTED: "negative",
  CANCELLED: "negative",
};

/** Turns stored events into timeline rows; every earlier value stays readable. */
export function buildHistory(events: HistoryEvent[], text: HistoryText) {
  return events.map((e) => {
    const lines: string[] = [];
    if (e.message) lines.push(e.message);
    // SUBMITTED / APPROVED store the total alone; only a real change shows old → new.
    if (e.oldTotal != null && e.newTotal != null) lines.push(text.priceLine(text.money(e.oldTotal), text.money(e.newTotal)));
    const flagged = e.fieldIds.map(text.fieldLabel).filter((l): l is string => Boolean(l));
    if (flagged.length > 0) lines.push(text.flaggedLine(flagged.join(", ")));
    for (const c of parseAnswerChanges(e.changes)) {
      const label = text.locale === "en" && c.labelEN ? c.labelEN : c.labelTH;
      lines.push(text.changeLine(label, c.before || text.empty, c.after || text.empty));
    }
    return {
      id: e.id,
      title: text.title(e.type),
      when: text.date(e.createdAt),
      actor: text.showActor && e.actor ? (e.actor.displayName ?? e.actor.email) : null,
      lines,
      tone: TONE[e.type],
    };
  });
}
