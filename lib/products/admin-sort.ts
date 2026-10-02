import type { Prisma } from "@/lib/generated/prisma/client";

/** Sort choices of the admin product list; the first is the default. */
export const ADMIN_PRODUCT_SORTS = [
  { value: "updated", label: "แก้ไขล่าสุด" },
  { value: "name_asc", label: "ชื่อ A–Z" },
  { value: "name_desc", label: "ชื่อ Z–A" },
  { value: "price_asc", label: "ราคา ต่ำ → สูง" },
  { value: "price_desc", label: "ราคา สูง → ต่ำ" },
  { value: "status", label: "สถานะ" },
] as const;

export type AdminProductSort = (typeof ADMIN_PRODUCT_SORTS)[number]["value"];

export function parseAdminProductSort(value: unknown): AdminProductSort {
  return ADMIN_PRODUCT_SORTS.find((s) => s.value === value)?.value ?? "updated";
}

/** Always ends with a unique key so pages never repeat or skip rows. */
export function adminProductOrderBy(sort: AdminProductSort): Prisma.ProductOrderByWithRelationInput[] {
  const tail: Prisma.ProductOrderByWithRelationInput[] = [{ id: "desc" }];
  switch (sort) {
    case "name_asc":
      return [{ nameTH: "asc" }, ...tail];
    case "name_desc":
      return [{ nameTH: "desc" }, ...tail];
    case "price_asc":
      return [{ price: "asc" }, { nameTH: "asc" }, ...tail];
    case "price_desc":
      return [{ price: "desc" }, { nameTH: "asc" }, ...tail];
    case "status":
      // Enum order: draft, published, hidden.
      return [{ publishStatus: "asc" }, { nameTH: "asc" }, ...tail];
    case "updated":
      return [{ updatedAt: "desc" }, ...tail];
  }
}
