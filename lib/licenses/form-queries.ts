import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { FIELD_LIMITS, parseFieldOptions, type FormFieldDef } from "@/lib/licenses/form-fields";

type Db = Prisma.TransactionClient | typeof prisma;

export type ActiveFormField = FormFieldDef & {
  /** The usage type whose form asks this question. */
  usageTypeId: string;
  descriptionTH: string | null;
  descriptionEN: string | null;
};

export type LicenseFormFieldView = ActiveFormField & {
  isActive: boolean;
  sortOrder: number;
  answerCount: number;
};

const FIELD_ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

const FIELD_SELECT = {
  id: true,
  usageTypeId: true,
  key: true,
  labelTH: true,
  labelEN: true,
  descriptionTH: true,
  descriptionEN: true,
  type: true,
  isRequired: true,
  options: true,
} satisfies Prisma.LicenseFormFieldSelect;

type FieldRow = Prisma.LicenseFormFieldGetPayload<{ select: typeof FIELD_SELECT }>;

function toField({ options, ...r }: FieldRow): ActiveFormField {
  return { ...r, options: parseFieldOptions(options) };
}

/**
 * The questions the request forms of these usage types ask right now, each form in its own
 * order. Nothing (undefined / empty) asks for no form at all.
 */
export async function listActiveFormFields(db: Db = prisma, usageTypes?: string | readonly string[]): Promise<ActiveFormField[]> {
  const ids = [...new Set(typeof usageTypes === "string" ? [usageTypes] : (usageTypes ?? []))];
  if (ids.length === 0) return [];
  const rows = await db.licenseFormField.findMany({
    where: { isActive: true, usageTypeId: { in: ids } },
    orderBy: FIELD_ORDER,
    take: FIELD_LIMITS.fields * ids.length,
    select: FIELD_SELECT,
  });
  return rows.map(toField);
}

/** Every question of one usage type's form (switched off ones too), for the admin form editor. */
export async function listUsageTypeFormFields(usageTypeId: string): Promise<LicenseFormFieldView[]> {
  const rows = await prisma.licenseFormField.findMany({
    where: { usageTypeId },
    orderBy: FIELD_ORDER,
    take: FIELD_LIMITS.fields,
    select: { ...FIELD_SELECT, isActive: true, sortOrder: true, _count: { select: { answers: true } } },
  });
  return rows.map(({ isActive, sortOrder, _count, ...r }) => ({ ...toField(r), isActive, sortOrder, answerCount: _count.answers }));
}

/** The usage type whose form the admin is editing. */
export function getUsageTypeForForm(usageTypeId: string) {
  return prisma.licenseUsageType.findUnique({ where: { id: usageTypeId }, select: { id: true, nameTH: true, isActive: true } });
}
