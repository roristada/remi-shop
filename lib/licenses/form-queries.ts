import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { FIELD_LIMITS, parseFieldOptions, type FieldUsageScope, type FormFieldDef } from "@/lib/licenses/form-fields";

type Db = Prisma.TransactionClient | typeof prisma;

export type ActiveFormField = FormFieldDef &
  FieldUsageScope & {
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
  key: true,
  labelTH: true,
  labelEN: true,
  descriptionTH: true,
  descriptionEN: true,
  type: true,
  isRequired: true,
  options: true,
  appliesToAllTypes: true,
  usageTypes: { select: { usageTypeId: true } },
} satisfies Prisma.LicenseFormFieldSelect;

type FieldRow = Prisma.LicenseFormFieldGetPayload<{ select: typeof FIELD_SELECT }>;

function toField({ appliesToAllTypes, usageTypes, options, ...r }: FieldRow): ActiveFormField {
  return { ...r, options: parseFieldOptions(options), usageTypeIds: appliesToAllTypes ? null : usageTypes.map((u) => u.usageTypeId) };
}

/**
 * The questions the request form asks right now, in order. With `usageTypeId`, only the questions
 * shown for that usage type; without it, every active question (each says which types it is for).
 */
export async function listActiveFormFields(db: Db = prisma, usageTypeId?: string): Promise<ActiveFormField[]> {
  const rows = await db.licenseFormField.findMany({
    where: {
      isActive: true,
      ...(usageTypeId ? { OR: [{ appliesToAllTypes: true }, { usageTypes: { some: { usageTypeId } } }] } : {}),
    },
    orderBy: FIELD_ORDER,
    take: FIELD_LIMITS.fields,
    select: FIELD_SELECT,
  });
  return rows.map(toField);
}

/** Every field, for the admin form builder. */
export async function listAllFormFields(): Promise<LicenseFormFieldView[]> {
  const rows = await prisma.licenseFormField.findMany({
    orderBy: FIELD_ORDER,
    take: FIELD_LIMITS.fields * 2,
    select: { ...FIELD_SELECT, isActive: true, sortOrder: true, _count: { select: { answers: true } } },
  });
  return rows.map(({ isActive, sortOrder, _count, ...r }) => ({ ...toField(r), isActive, sortOrder, answerCount: _count.answers }));
}

/** Usage types the admin can limit a question to. */
export function listUsageTypeChoices() {
  return prisma.licenseUsageType.findMany({
    orderBy: [{ sortOrder: "asc" }, { nameTH: "asc" }],
    select: { id: true, nameTH: true, isActive: true },
  });
}
