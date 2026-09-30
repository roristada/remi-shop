import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { NotificationType } from "@/lib/generated/prisma/enums";
import type { NotificationParams } from "@/lib/notifications/rules";

type Db = Prisma.TransactionClient | typeof prisma;

/** Rows per insert when fanning out to many buyers. */
const FAN_OUT_CHUNK = 1000;

/** Pass the surrounding transaction as `db` so the notification commits with the event it reports. */
export function notifyUser(db: Db, userId: string, type: NotificationType, params: NotificationParams) {
  return db.notification.create({ data: { userId, type, params }, select: { id: true } });
}

export async function notifyAdmins(db: Db, type: NotificationType, params: NotificationParams) {
  const admins = await db.profile.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (admins.length === 0) return;
  await db.notification.createMany({ data: admins.map((a) => ({ userId: a.id, type, params })) });
}

/** Tells every customer with a completed order for the product. Returns how many were notified. */
export async function notifyProductBuyers(db: Db, productId: string, params: NotificationParams): Promise<number> {
  const buyers = await db.order.findMany({
    where: { status: "COMPLETED", kind: "PRODUCT", items: { some: { productId } } },
    select: { userId: true },
    distinct: ["userId"],
  });
  for (let i = 0; i < buyers.length; i += FAN_OUT_CHUNK) {
    await db.notification.createMany({
      data: buyers.slice(i, i + FAN_OUT_CHUNK).map((b) => ({ userId: b.userId, type: "PRODUCT_UPDATED" as const, params })),
    });
  }
  return buyers.length;
}
