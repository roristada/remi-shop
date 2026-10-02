import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Upper bound for the admin arrange view; the catalog of a single seller stays well below it. */
const ADMIN_FOLDER_PRODUCT_LIMIT = 1000;

const ADMIN_FOLDER_PRODUCT_SELECT = {
  id: true,
  slug: true,
  nameTH: true,
  price: true,
  publishStatus: true,
  saleStartAt: true,
  saleEndAt: true,
  folderId: true,
  images: {
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    take: 1,
    select: { imagePath: true, cardPath: true },
  },
} satisfies Prisma.ProductSelect;

export type AdminFolderProduct = Prisma.ProductGetPayload<{ select: typeof ADMIN_FOLDER_PRODUCT_SELECT }>;

/** Folders in display order plus every product (filed and unfiled) for the arrange view. */
export async function listAdminFolders() {
  const [folders, products] = await prisma.$transaction([
    prisma.folder.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, slug: true, nameTH: true, nameEN: true, status: true },
    }),
    prisma.product.findMany({
      orderBy: [{ folderSortOrder: "asc" }, { createdAt: "desc" }],
      take: ADMIN_FOLDER_PRODUCT_LIMIT,
      select: ADMIN_FOLDER_PRODUCT_SELECT,
    }),
  ]);
  return { folders, products };
}
