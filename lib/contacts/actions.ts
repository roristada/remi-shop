"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { invalid, ok, type ActionResult } from "@/lib/actions/result";
import { contactChannelsSchema } from "@/lib/contacts/rules";
import { CONTACT_CACHE_TAG } from "@/lib/contacts/queries";

/** Replaces the whole contact list; the array order becomes the display order. */
export async function saveContactChannels(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = contactChannelsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  await prisma.$transaction([
    prisma.contactChannel.deleteMany(),
    prisma.contactChannel.createMany({ data: parsed.data.map((c, i) => ({ ...c, sortOrder: i })) }),
  ]);

  console.info("Contact channels saved", { adminId: admin.id, count: parsed.data.length });
  revalidateTag(CONTACT_CACHE_TAG, { expire: 0 });
  revalidatePath("/admin/settings");
  revalidatePath("/[locale]", "layout");
  return ok(undefined, "บันทึกช่องทางติดต่อแล้ว");
}
