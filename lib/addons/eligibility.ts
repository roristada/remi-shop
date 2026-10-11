import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { AddonOnlyContext } from "@/lib/addons/rules";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * For the add-on-only products among `productIds`: which products offer them (add-ons switched on,
 * not add-on-only themselves), and which of those mains the customer owns (a COMPLETED order).
 */
export async function getAddonOnlyContext(userId: string | null, productIds: string[], db: Db = prisma): Promise<AddonOnlyContext> {
  const addons =
    productIds.length === 0
      ? []
      : await db.product.findMany({
          where: { id: { in: productIds }, addonOnly: true },
          select: {
            id: true,
            addonOf: { where: { product: { addonsEnabled: true, addonOnly: false } }, select: { productId: true } },
          },
        });
  const mainsByAddon = new Map(addons.map((a) => [a.id, a.addonOf.map((l) => l.productId)]));
  const mainIds = [...new Set(addons.flatMap((a) => a.addonOf.map((l) => l.productId)))];
  if (!userId || mainIds.length === 0) return { mainsByAddon, ownedMainIds: new Set() };

  const owned = await db.orderItem.findMany({
    where: { productId: { in: mainIds }, order: { userId, status: "COMPLETED" } },
    distinct: ["productId"],
    select: { productId: true },
  });
  return { mainsByAddon, ownedMainIds: new Set(owned.map((o) => o.productId)) };
}
