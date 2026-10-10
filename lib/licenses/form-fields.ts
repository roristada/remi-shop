import { z } from "zod";
import type { LicenseFieldType } from "@/lib/generated/prisma/enums";

// Pure rules for the admin-defined license request form (no DB): option parsing, answer
// validation, the legacy-column copy and the before/after diff kept in the request history.

export type FieldOption = { id: string; th: string; en: string };

export const CHOICE_FIELD_TYPES: readonly LicenseFieldType[] = ["RADIO", "CHECKBOX", "DROPDOWN"];
export const isChoiceType = (type: LicenseFieldType) => CHOICE_FIELD_TYPES.includes(type);

export const FIELD_LIMITS = {
  TEXT: 200,
  EMAIL: 254,
  TEXTAREA: 1000,
  label: 120,
  description: 300,
  option: 100,
  options: 30,
  fields: 40,
} as const;

/** "artwork" can be flagged in a request for changes like any form field. */
export const ARTWORK_FIELD_ID = "artwork";

/** Built-in fields whose answers are also copied to the legacy LicenseRequest columns. */
export const LEGACY_FIELD_KEYS = ["buyerName", "buyerEmail", "buyerContact", "artistName", "artistContact", "platform", "note"] as const;
export type LegacyFieldKey = (typeof LEGACY_FIELD_KEYS)[number];

export const fieldOptionsSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(40),
      th: z.string().trim().min(1, "กรอกตัวเลือก").max(FIELD_LIMITS.option, `ไม่เกิน ${FIELD_LIMITS.option} ตัวอักษร`),
      en: z.string().trim().max(FIELD_LIMITS.option, `ไม่เกิน ${FIELD_LIMITS.option} ตัวอักษร`),
    }),
  )
  .max(FIELD_LIMITS.options, `ไม่เกิน ${FIELD_LIMITS.options} ตัวเลือก`);

/** Reads stored options defensively; anything malformed is dropped. */
export function parseFieldOptions(value: unknown): FieldOption[] {
  const parsed = fieldOptionsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export type FormFieldDef = {
  id: string;
  key: string | null;
  labelTH: string;
  labelEN: string;
  type: LicenseFieldType;
  isRequired: boolean;
  options: FieldOption[];
};

export type ResolvedAnswer = {
  fieldId: string;
  key: string | null;
  labelTH: string;
  labelEN: string;
  type: LicenseFieldType;
  values: string[];
  valuesEN: string[];
  sortOrder: number;
};

/** Error codes map to `shop.license.errors.*`. Keys are `answers.<fieldId>`. */
export type AnswerErrors = Record<string, "required" | "too_long" | "invalid_email" | "invalid_choice">;

export const answerErrorKey = (fieldId: string) => `answers.${fieldId}`;

const emailSchema = z.email();

function readRaw(input: unknown, fieldId: string): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  return (input as Record<string, unknown>)[fieldId];
}

/**
 * Validates the customer's answers against the form as it is now (fields in display order).
 * Text is trimmed; choices must be options of that field. Unknown keys in `input` are ignored.
 */
export function resolveAnswers(
  fields: FormFieldDef[],
  input: unknown,
): { ok: true; answers: ResolvedAnswer[] } | { ok: false; errors: AnswerErrors } {
  const errors: AnswerErrors = {};
  const answers: ResolvedAnswer[] = [];

  fields.forEach((field, index) => {
    const raw = readRaw(input, field.id);
    const errKey = answerErrorKey(field.id);
    const base = { fieldId: field.id, key: field.key, labelTH: field.labelTH, labelEN: field.labelEN, type: field.type, sortOrder: index };

    if (isChoiceType(field.type)) {
      const picked = (Array.isArray(raw) ? raw : typeof raw === "string" && raw !== "" ? [raw] : []).filter(
        (v): v is string => typeof v === "string",
      );
      const unique = [...new Set(picked)];
      if (field.type !== "CHECKBOX" && unique.length > 1) return void (errors[errKey] = "invalid_choice");
      const byId = new Map(field.options.map((o) => [o.id, o]));
      const chosen = unique.map((id) => byId.get(id));
      if (chosen.some((o) => !o)) return void (errors[errKey] = "invalid_choice");
      if (chosen.length === 0) {
        if (field.isRequired) errors[errKey] = "required";
        return;
      }
      // Keep the admin's option order.
      const ordered = field.options.filter((o) => unique.includes(o.id));
      answers.push({ ...base, values: ordered.map((o) => o.th), valuesEN: ordered.map((o) => o.en || o.th) });
      return;
    }

    const text = typeof raw === "string" ? raw.trim() : "";
    if (text === "") {
      if (field.isRequired) errors[errKey] = "required";
      return;
    }
    const max = FIELD_LIMITS[field.type as "TEXT" | "EMAIL" | "TEXTAREA"];
    if (text.length > max) return void (errors[errKey] = "too_long");
    if (field.type === "EMAIL" && !emailSchema.safeParse(text).success) return void (errors[errKey] = "invalid_email");
    answers.push({ ...base, values: [text], valuesEN: [] });
  });

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, answers };
}

/** Answers of built-in fields, for the legacy columns other screens still read (null = not answered). */
export function legacyColumns(answers: Pick<ResolvedAnswer, "key" | "values">[]): Record<LegacyFieldKey, string | null> {
  const out = Object.fromEntries(LEGACY_FIELD_KEYS.map((k) => [k, null])) as Record<LegacyFieldKey, string | null>;
  for (const a of answers) {
    if (a.key && (LEGACY_FIELD_KEYS as readonly string[]).includes(a.key) && a.values.length > 0) {
      out[a.key as LegacyFieldKey] = a.values.join(", ");
    }
  }
  return out;
}

export type AnswerChange = { labelTH: string; labelEN: string; before: string; after: string };

type Comparable = { fieldId: string | null; labelTH: string; labelEN: string; values: string[] };

/** What a customer edit changed, by field, for the request history. */
export function diffAnswers(before: Comparable[], after: Comparable[]): AnswerChange[] {
  const show = (a: Comparable | undefined) => (a ? a.values.join(", ") : "");
  const prev = new Map(before.filter((a) => a.fieldId).map((a) => [a.fieldId!, a]));
  const next = new Map(after.filter((a) => a.fieldId).map((a) => [a.fieldId!, a]));
  const changes: AnswerChange[] = [];
  for (const id of new Set([...prev.keys(), ...next.keys()])) {
    const b = prev.get(id);
    const a = next.get(id);
    if (show(b) === show(a)) continue;
    const label = a ?? b!;
    changes.push({ labelTH: label.labelTH, labelEN: label.labelEN, before: show(b), after: show(a) });
  }
  return changes;
}

const changeSchema = z.array(z.object({ labelTH: z.string(), labelEN: z.string(), before: z.string(), after: z.string() }));

export function parseAnswerChanges(value: unknown): AnswerChange[] {
  const parsed = changeSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/**
 * Stored answers back into form values (fieldId → text or option ids) for editing. Choices are
 * matched by their saved label, so an option renamed since then simply starts unticked.
 */
export function answerValuesFor(
  fields: FormFieldDef[],
  answers: { fieldId: string | null; values: string[] }[],
): Record<string, string | string[]> {
  const byField = new Map(answers.filter((a) => a.fieldId).map((a) => [a.fieldId!, a.values]));
  const out: Record<string, string | string[]> = {};
  for (const f of fields) {
    const values = byField.get(f.id);
    if (!values || values.length === 0) continue;
    if (!isChoiceType(f.type)) {
      out[f.id] = values[0];
      continue;
    }
    const ids = f.options.filter((o) => values.includes(o.th)).map((o) => o.id);
    if (ids.length > 0) out[f.id] = f.type === "CHECKBOX" ? ids : ids[0];
  }
  return out;
}
