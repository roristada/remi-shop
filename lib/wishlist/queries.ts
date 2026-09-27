import "server-only";
import { prisma } from "@/lib/prisma/client";

export function isWishlisted(userId: string, productId: string) {
  return prisma.wishlist
    .findUnique({ where: { userId_productId: { userId, productId } }, select: { userId: true } })
    .then((row) => row !== null);
}
