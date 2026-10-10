import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { FIELD_LIMITS, parseFieldOptions, type FieldOption, type FormFieldDef } from "@/lib/licenses/form-fields";

type Db = Prisma.TransactionClient | typeof prisma;

export type LicenseFormFieldView = FormFieldDef & {
  descriptionTH: string | null;
  descriptionEN: string | null;
  isActive: boolean;
  sortOrder: number;
  answerCount: number;
};

const FIELD_ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

/** The questions the request form asks right now, in order. */
export async function listActiveFormFields(db: Db = prisma): Promise<(FormFieldDef & { descriptionTH: string | null; descriptionEN: string | null })[]> {
  const rows = await db.licenseFormField.findMany({
    where: { isActive: true },
    orderBy: FIELD_ORDER,
    take: FIELD_LIMITS.fields,
    select: {
      id: true,
      key: true,
      labelTH: true,
      labelEN: true,
      descriptionTH: true,
      descriptionEN: true,
      type: true,
      isRequired: true,
      options: true,
    },
  });
  return rows.map((r) => ({ ...r, options: parseFieldOptions(r.options) as FieldOption[] }));
}

/** Every field, for the admin form builder. */
export async function listAllFormFields(): Promise<LicenseFormFieldView[]> {
  const rows = await prisma.licenseFormField.findMany({
    orderBy: FIELD_ORDER,
    take: FIELD_LIMITS.fields * 2,
    include: { _count: { select: { answers: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    labelTH: r.labelTH,
    labelEN: r.labelEN,
    descriptionTH: r.descriptionTH,
    descriptionEN: r.descriptionEN,
    type: r.type,
    isRequired: r.isRequired,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    options: parseFieldOptions(r.options),
    answerCount: r._count.answers,
  }));
}
