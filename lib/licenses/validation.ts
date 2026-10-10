import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/licenses/form-fields";

// Shape checks for the request form's server actions. The answers themselves are checked against
// the admin-defined form with `resolveAnswers` (lib/licenses/form-fields.ts). Messages are error
// codes that map to `shop.license.errors.*` translation keys.

export const LICENSE_LIMITS = {
  usageTypes: 20,
} as const;

/** fieldId → text, or the chosen option ids. Sizes are capped before any per-field check. */
const answersSchema = z
  .record(
    z.string().max(64),
    z.union([z.string().max(FIELD_LIMITS.TEXTAREA * 2), z.array(z.string().max(64)).max(FIELD_LIMITS.options)]),
  )
  .refine((r) => Object.keys(r).length <= FIELD_LIMITS.fields * 2, "too_long");

/** The artwork is optional: it can be attached later while the request is editable. */
const artworkFields = {
  artworkPath: z.string().min(1).max(300).nullish(),
  artworkFileName: z.string().trim().min(1).max(255).nullish(),
};

export const licenseSubmitSchema = z.object({
  productId: z.uuid(),
  usageTypeIds: z.array(z.uuid("pick_usage")).min(1, "pick_usage").max(LICENSE_LIMITS.usageTypes, "pick_usage"),
  answers: answersSchema,
  /** Total the customer saw (satang); only compared, never charged. */
  expectedTotal: z.number().int().nonnegative(),
  ...artworkFields,
});

/** Edit or answer a request for changes. Usage types stay as submitted. */
export const licenseEditSchema = z.object({
  answers: answersSchema,
  /** Required when the store proposed a new price in the same round. */
  acceptPrice: z.boolean().optional(),
  ...artworkFields,
});
