import { z } from "zod";

// Shared by the request form (instant feedback) and the server action (authoritative).
// Messages are error codes that map to `shop.license.errors.*` translation keys.

const text = (max: number) => z.string().trim().min(1, "required").max(max, "too_long");

export const LICENSE_LIMITS = {
  name: 100,
  email: 254,
  contact: 200,
  platform: 200,
  note: 1000,
  usageTypes: 20,
} as const;

export const licenseRequestFieldsSchema = z.object({
  buyerName: text(LICENSE_LIMITS.name),
  buyerEmail: z.string().trim().max(LICENSE_LIMITS.email, "too_long").pipe(z.email("invalid_email")),
  buyerContact: text(LICENSE_LIMITS.contact),
  artistName: text(LICENSE_LIMITS.name),
  artistContact: text(LICENSE_LIMITS.contact),
  platform: text(LICENSE_LIMITS.platform),
  note: z
    .string()
    .trim()
    .max(LICENSE_LIMITS.note, "too_long")
    .transform((v) => (v === "" ? null : v)),
  usageTypeIds: z.array(z.uuid("pick_usage")).min(1, "pick_usage").max(LICENSE_LIMITS.usageTypes, "pick_usage"),
});

export type LicenseRequestFields = z.input<typeof licenseRequestFieldsSchema>;

export const licenseSubmitSchema = licenseRequestFieldsSchema.extend({
  productId: z.uuid(),
  /** Total the customer saw (satang); only compared, never charged. */
  expectedTotal: z.number().int().nonnegative(),
  artworkPath: z.string().min(1).max(300),
  artworkFileName: z.string().trim().min(1).max(255),
});
