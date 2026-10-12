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
  URL: 500,
  fileName: 255,
  filePath: 300,
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

/** A FILE answer: the private object key we issued plus the customer's original file name. */
export type FileAnswer = { path: string; name: string };

/** fieldId → text, chosen option ids, or an attached file. */
export type AnswerValue = string | string[] | FileAnswer;

export function isFileAnswer(v: unknown): v is FileAnswer {
  return typeof v === "object" && v !== null && !Array.isArray(v) && typeof (v as FileAnswer).path === "string" && typeof (v as FileAnswer).name === "string";
}

/**
 * The questions every new usage type's form starts with (`key` = legacy LicenseRequest column).
 * Each form keeps its own copy, edited, retyped or deleted there like any other question.
 */
export const BUILT_IN_FIELDS: readonly {
  key: LegacyFieldKey;
  labelTH: string;
  labelEN: string;
  descriptionTH: string | null;
  descriptionEN: string | null;
  type: LicenseFieldType;
  isRequired: boolean;
}[] = [
  { key: "buyerName", labelTH: "ชื่อผู้ซื้อ", labelEN: "Buyer name", descriptionTH: null, descriptionEN: null, type: "TEXT", isRequired: true },
  { key: "buyerEmail", labelTH: "อีเมลผู้ซื้อ", labelEN: "Buyer email", descriptionTH: null, descriptionEN: null, type: "EMAIL", isRequired: true },
  {
    key: "buyerContact",
    labelTH: "ช่องทางติดต่อผู้ซื้อ",
    labelEN: "Buyer contact",
    descriptionTH: "เช่น เบอร์โทร, LINE ID หรือลิงก์โซเชียล",
    descriptionEN: "For example a phone number, LINE ID or social link",
    type: "TEXT",
    isRequired: true,
  },
  {
    key: "artistName",
    labelTH: "ชื่อศิลปิน",
    labelEN: "Artist name",
    descriptionTH: "ผู้สร้างผลงานที่ใช้สินค้านี้ ถ้าเป็นคนเดียวกับผู้ซื้อ กรอกซ้ำได้เลย",
    descriptionEN: "Who made the work that uses this product. If it is the buyer, enter the same details.",
    type: "TEXT",
    isRequired: true,
  },
  {
    key: "artistContact",
    labelTH: "ช่องทางติดต่อศิลปิน",
    labelEN: "Artist contact",
    descriptionTH: "เช่น เบอร์โทร, LINE ID หรือลิงก์โซเชียล",
    descriptionEN: "For example a phone number, LINE ID or social link",
    type: "TEXT",
    isRequired: true,
  },
  {
    key: "platform",
    labelTH: "แพลตฟอร์มที่จะใช้งาน",
    labelEN: "Platform",
    descriptionTH: "เช่น Etsy, Shopee, YouTube, สำนักพิมพ์",
    descriptionEN: "For example Etsy, Shopee, YouTube, a publisher",
    type: "TEXT",
    isRequired: true,
  },
  {
    key: "note",
    labelTH: "รายละเอียดเพิ่มเติม",
    labelEN: "More details",
    descriptionTH: "เช่น จำนวนที่จะผลิต หรือระยะเวลาที่ใช้งาน",
    descriptionEN: "For example print run or how long it will be used",
    type: "TEXTAREA",
    isRequired: false,
  },
];

/**
 * Answers typed into one usage type's form, moved onto another type's form when the customer
 * switches type: matched by built-in key, else by the same question (Thai label + kind).
 * Files are not carried over (they belong to the question they were uploaded for).
 */
export function carryAnswers(
  from: Pick<FormFieldDef, "id" | "key" | "labelTH" | "type">[],
  to: Pick<FormFieldDef, "id" | "key" | "labelTH" | "type">[],
  answers: Record<string, AnswerValue>,
): Record<string, AnswerValue> {
  const out = { ...answers };
  for (const target of to) {
    if (out[target.id] !== undefined || target.type === "FILE") continue;
    const source = from.find((f) =>
      f.type === target.type && (target.key ? f.key === target.key : f.key === null && f.labelTH === target.labelTH),
    );
    const value = source ? answers[source.id] : undefined;
    if (value !== undefined && !isFileAnswer(value)) out[target.id] = value;
  }
  return out;
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
  /** FILE answers only. */
  filePath: string | null;
  sortOrder: number;
};

/** Error codes map to `shop.license.errors.*`. Keys are `answers.<fieldId>`. */
export type AnswerErrors = Record<string, "required" | "too_long" | "invalid_email" | "invalid_choice" | "invalid_url" | "invalid_file">;

export const answerErrorKey = (fieldId: string) => `answers.${fieldId}`;

const emailSchema = z.email();
const urlSchema = z.url({ protocol: /^https?$/, hostname: z.regexes.domain });

function readRaw(input: unknown, fieldId: string): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  return (input as Record<string, unknown>)[fieldId];
}

/**
 * Validates the customer's answers against the form as it is now (fields in display order).
 * Text is trimmed; choices must be options of that field. Unknown keys in `input` are ignored.
 * `isOwnFile` (server only) says whether a FILE answer's object key is one issued to this customer.
 */
export function resolveAnswers(
  fields: FormFieldDef[],
  input: unknown,
  isOwnFile?: (path: string) => boolean,
): { ok: true; answers: ResolvedAnswer[] } | { ok: false; errors: AnswerErrors } {
  const errors: AnswerErrors = {};
  const answers: ResolvedAnswer[] = [];

  fields.forEach((field, index) => {
    const raw = readRaw(input, field.id);
    const errKey = answerErrorKey(field.id);
    const base = { fieldId: field.id, key: field.key, labelTH: field.labelTH, labelEN: field.labelEN, type: field.type, filePath: null, sortOrder: index };

    if (field.type === "FILE") {
      if (raw === undefined || raw === null || raw === "") {
        if (field.isRequired) errors[errKey] = "required";
        return;
      }
      if (!isFileAnswer(raw)) return void (errors[errKey] = "invalid_file");
      const name = raw.name.trim();
      if (!name || name.length > FIELD_LIMITS.fileName || !raw.path || raw.path.length > FIELD_LIMITS.filePath) {
        return void (errors[errKey] = "invalid_file");
      }
      if (isOwnFile && !isOwnFile(raw.path)) return void (errors[errKey] = "invalid_file");
      answers.push({ ...base, values: [name], valuesEN: [], filePath: raw.path });
      return;
    }

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
    const max = FIELD_LIMITS[field.type as "TEXT" | "EMAIL" | "TEXTAREA" | "URL"];
    if (text.length > max) return void (errors[errKey] = "too_long");
    if (field.type === "EMAIL" && !emailSchema.safeParse(text).success) return void (errors[errKey] = "invalid_email");
    if (field.type === "URL") {
      // "example.com/page" is fine: assume https when no scheme is typed.
      const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
      if (url.length > max || !urlSchema.safeParse(url).success) return void (errors[errKey] = "invalid_url");
      return void answers.push({ ...base, values: [url], valuesEN: [] });
    }
    answers.push({ ...base, values: [text], valuesEN: [] });
  });

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, answers };
}

/**
 * Answers of built-in fields, for the legacy columns other screens still read (null = not answered,
 * or the field was deleted or turned into a file upload).
 */
export function legacyColumns(answers: Pick<ResolvedAnswer, "key" | "type" | "values">[]): Record<LegacyFieldKey, string | null> {
  const out = Object.fromEntries(LEGACY_FIELD_KEYS.map((k) => [k, null])) as Record<LegacyFieldKey, string | null>;
  for (const a of answers) {
    if (a.key && a.type !== "FILE" && (LEGACY_FIELD_KEYS as readonly string[]).includes(a.key) && a.values.length > 0) {
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
  answers: { fieldId: string | null; values: string[]; filePath?: string | null }[],
): Record<string, AnswerValue> {
  const byField = new Map(answers.filter((a) => a.fieldId).map((a) => [a.fieldId!, a]));
  const out: Record<string, AnswerValue> = {};
  for (const f of fields) {
    const answer = byField.get(f.id);
    const values = answer?.values;
    if (!values || values.length === 0) continue;
    if (f.type === "FILE") {
      if (answer.filePath) out[f.id] = { path: answer.filePath, name: values[0] };
      continue;
    }
    if (!isChoiceType(f.type)) {
      out[f.id] = values[0];
      continue;
    }
    const ids = f.options.filter((o) => values.includes(o.th)).map((o) => o.id);
    if (ids.length > 0) out[f.id] = f.type === "CHECKBOX" ? ids : ids[0];
  }
  return out;
}
