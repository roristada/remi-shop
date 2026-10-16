"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { toLocale } from "@/lib/auth/redirect";
import { prisma } from "@/lib/prisma/client";
import { isUniqueViolation } from "@/lib/prisma/errors";
import { idSchema } from "@/lib/validation/product";
import { lineHasFiles } from "@/lib/downloads/rules";
import { giveawayPhase } from "@/lib/giveaways/rules";
import { claimPrizeTx, ClaimError } from "@/lib/giveaways/service";

export type EnterErrorCode = "LOGIN_REQUIRED" | "EMAIL_UNVERIFIED" | "NOT_OPEN" | "ERROR";
export type EnterResult = { ok: true } | { ok: false; code: EnterErrorCode };

/** Registers the signed-in customer (once; a repeat is a no-op success). Only while registration is open. */
export async function enterGiveaway(giveawayId: string): Promise<EnterResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  if (!user.email_confirmed_at) return { ok: false, code: "EMAIL_UNVERIFIED" };
  if (!idSchema.safeParse(giveawayId).success) return { ok: false, code: "NOT_OPEN" };

  const now = new Date();
  const g = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    select: { isPublished: true, startsAt: true, endsAt: true, drawnAt: true },
  });
  if (!g || giveawayPhase(g, now) !== "OPEN") return { ok: false, code: "NOT_OPEN" };

  try {
    await prisma.giveawayEntry.create({ data: { giveawayId, userId: user.id }, select: { id: true } });
    console.info("Giveaway entry", { giveawayId, userId: user.id });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      console.error("Giveaway entry failed", { giveawayId, userId: user.id, error });
      return { ok: false, code: "ERROR" };
    }
  }
  revalidatePath("/[locale]/giveaways/[slug]", "page");
  return { ok: true };
}

export type ClaimErrorCode = "LOGIN_REQUIRED" | ClaimError["code"] | "ERROR";

/**
 * Claims the viewer's prize (or, when the prize cannot be delivered, a substitute) as a 0-baht
 * completed order, then opens the downloads page (or the order, for emailed files).
 */
export async function claimPrize(
  winnerId: string,
  substitute: { productId: string; variantId: string | null } | null,
  localeInput: string,
): Promise<{ ok: false; code: ClaimErrorCode }> {
  const locale = toLocale(localeInput);
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  const validSubstitute =
    substitute === null ||
    (idSchema.safeParse(substitute?.productId).success && (substitute.variantId === null || idSchema.safeParse(substitute.variantId).success));
  if (!idSchema.safeParse(winnerId).success || !validSubstitute) return { ok: false, code: "NOT_FOUND" };

  let orderNumber: string;
  try {
    orderNumber = await prisma.$transaction((tx) => claimPrizeTx(tx, winnerId, user.id, substitute, new Date()));
  } catch (error) {
    if (error instanceof ClaimError) return { ok: false, code: error.code };
    console.error("Giveaway claim failed", { winnerId, userId: user.id, error });
    return { ok: false, code: "ERROR" };
  }
  console.info("Giveaway prize claimed", { winnerId, userId: user.id, orderNumber, substitute: substitute !== null });
  revalidatePath("/[locale]/giveaways/[slug]", "page");
  revalidatePath("/admin/giveaways", "layout");

  const items = await prisma.orderItem.findMany({
    where: { order: { orderNumber } },
    select: { variantId: true, product: { select: { versions: { where: { isLatest: true }, select: { files: { select: { variantId: true } } }, take: 1 } } } },
  });
  const hasFiles = items.some((i) => lineHasFiles(i.product.versions[0]?.files ?? [], i.variantId));
  redirect(hasFiles ? `/${locale}/downloads` : `/${locale}/orders/${orderNumber}`);
}
