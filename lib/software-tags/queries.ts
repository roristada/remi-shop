import "server-only";
import { prisma } from "@/lib/prisma/client";
import { facetBaseWhere } from "@/lib/products/storefront";

/**
 * Active tags for the storefront filter sidebar, with a product count. `facetFilters` folds in
 * search/on-sale so counts stay honest under those, independent of the other facet groups —
 * see `facetBaseWhere`.
 */
export function listActiveSoftwareTags(now: Date = new Date(), facetFilters: { q?: string; sale: boolean } = { sale: false }) {
  return prisma.softwareTag.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      _count: { select: { products: { where: { product: facetBaseWhere(now, facetFilters) } } } },
    },
  });
}

/** All tags for the admin manager, with how many products currently use each. */
export function listAdminSoftwareTags() {
  return prisma.softwareTag.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
}

/** Every tag for the product-edit checkbox picker (inactive ones stay visible so an admin can un-check them). */
export function listSoftwareTagOptions() {
  return prisma.softwareTag.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, isActive: true },
  });
}
