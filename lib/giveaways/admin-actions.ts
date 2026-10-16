"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { fail, formString, invalid, ok, okNotice, type ActionResult } from "@/lib/actions/result";
import { isUniqueViolation } from "@/lib/prisma/errors";
import { giveawaySchema, parsePrizesJson, type GiveawayPrizeInput } from "@/lib/validation/giveaway";
import { idSchema, uploadRequestSchema } from "@/lib/validation/product";
import { BUCKETS } from "@/lib/storage/buckets";
import { checkFileMeta, FILE_TYPE_ERROR_TH, getExtension, IMAGE_FILE_TYPES } from "@/lib/storage/file-types";
import { createSignedUpload, removeObjects, verifyUploadedObject, type SignedUpload } from "@/lib/storage/product-storage";
import { isGiveawayImagePath, newGiveawayImagePath } from "@/lib/giveaways/paths";
import { drawWinnersTx, GiveawayError, type DrawResult } from "@/lib/giveaways/service";

/** Prizes changed under a giveaway that was drawn meanwhile. */
class PrizesLocked extends Error {}
/** A prize line points at a product or variant that is missing or does not match. */
class BadPrize extends Error {}

function revalidateGiveaways(id?: string) {
  revalidatePath("/admin/giveaways");
  if (id) revalidatePath(`/admin/giveaways/${id}`);
  revalidatePath("/[locale]/giveaways", "page");
  revalidatePath("/[locale]/giveaways/[slug]", "page");
}

function parseGiveaway(formData: FormData) {
  return {
    details: giveawaySchema.safeParse({
      slug: formString(formData, "slug"),
      titleTH: formString(formData, "titleTH"),
      titleEN: formString(formData, "titleEN"),
      descriptionTH: formString(formData, "descriptionTH"),
      descriptionEN: formString(formData, "descriptionEN"),
      startsAt: formString(formData, "startsAt"),
      endsAt: formString(formData, "endsAt"),
      isPublished: formData.get("isPublished") === "on",
    }),
    prizes: parsePrizesJson(formString(formData, "prizes")),
  };
}

/** Each line must name an existing product, and a variant of it exactly when the product has variants. */
async function checkPrizes(tx: Prisma.TransactionClient, prizes: GiveawayPrizeInput[]) {
  const products = await tx.product.findMany({
    where: { id: { in: prizes.map((p) => p.productId) } },
    select: { id: true, variants: { select: { id: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const prize of prizes) {
    const product = byId.get(prize.productId);
    if (!product) throw new BadPrize();
    const variantIds = product.variants.map((v) => v.id);
    if (variantIds.length === 0 ? prize.variantId !== null : !prize.variantId || !variantIds.includes(prize.variantId)) {
      throw new BadPrize();
    }
  }
}

function prizeRows(prizes: GiveawayPrizeInput[]) {
  return prizes.map((p, i) => ({ productId: p.productId, variantId: p.variantId, winnerCount: p.winnerCount, sortOrder: i }));
}

function saveError(error: unknown, action: string, id?: string): ActionResult<never> {
  if (isUniqueViolation(error)) return fail("กรุณาตรวจสอบข้อมูลที่กรอก", { slug: "slug นี้ถูกใช้แล้ว" });
  if (error instanceof PrizesLocked) return fail("กิจกรรมนี้สุ่มผู้โชคดีไปแล้ว แก้รางวัลไม่ได้ กรุณารีเฟรชหน้า");
  if (error instanceof BadPrize) return fail("รางวัลบางรายการไม่ถูกต้อง (สินค้าถูกลบหรือต้องเลือกตัวเลือก) กรุณาเลือกใหม่");
  console.error(`[giveaways] ${action} failed`, { giveawayId: id, error });
  return fail("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

/** Creates a giveaway with its prizes; returns its id so the picture can be added next. */
export async function createGiveaway(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const { details, prizes } = parseGiveaway(formData);
  if (!details.success) return invalid(details.error);
  if (!prizes.success) return fail(prizes.error.issues[0]?.message ?? "รางวัลไม่ถูกต้อง", { prizes: prizes.error.issues[0]?.message ?? "" });

  try {
    const giveaway = await prisma.$transaction(async (tx) => {
      await checkPrizes(tx, prizes.data);
      return tx.giveaway.create({
        data: { ...details.data, prizes: { create: prizeRows(prizes.data) } },
        select: { id: true },
      });
    });
    console.info("[giveaways] created", { giveawayId: giveaway.id });
    revalidateGiveaways(giveaway.id);
    return ok({ id: giveaway.id }, "สร้างกิจกรรมแล้ว");
  } catch (error) {
    return saveError(error, "create");
  }
}

/** Saves details; prizes are replaced only before the first draw (afterwards they are locked). */
export async function updateGiveaway(id: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return fail("คำขอไม่ถูกต้อง");
  const { details, prizes } = parseGiveaway(formData);
  if (!details.success) return invalid(details.error);

  try {
    const found = await prisma.$transaction(async (tx) => {
      const current = await tx.giveaway.findUnique({ where: { id }, select: { drawnAt: true } });
      if (!current) return false;
      if (current.drawnAt) {
        // Drawn: the window and publish state are history now; only the texts and slug may change.
        const { slug, titleTH, titleEN, descriptionTH, descriptionEN } = details.data;
        await tx.giveaway.update({ where: { id }, data: { slug, titleTH, titleEN, descriptionTH, descriptionEN } });
        return true;
      }
      if (!prizes.success) throw new BadPrize();
      await checkPrizes(tx, prizes.data);
      // Conditional on "not drawn", so a draw that commits first cannot have its prizes swapped.
      const { count } = await tx.giveaway.updateMany({ where: { id, drawnAt: null }, data: details.data });
      if (count !== 1) throw new PrizesLocked();
      await tx.giveawayPrize.deleteMany({ where: { giveawayId: id } });
      await tx.giveawayPrize.createMany({ data: prizeRows(prizes.data).map((r) => ({ ...r, giveawayId: id })) });
      return true;
    });
    if (!found) return fail("ไม่พบกิจกรรมนี้ อาจถูกลบไปแล้ว");
  } catch (error) {
    if (error instanceof BadPrize && !prizes.success) {
      return fail(prizes.error.issues[0]?.message ?? "รางวัลไม่ถูกต้อง", { prizes: prizes.error.issues[0]?.message ?? "" });
    }
    return saveError(error, "update", id);
  }
  revalidateGiveaways(id);
  return ok(undefined, "บันทึกกิจกรรมแล้ว");
}

/** Deletes a giveaway that has not been drawn (its entries go with it). Drawn ones are the winners' record. */
export async function deleteGiveaway(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return fail("คำขอไม่ถูกต้อง");
  const giveaway = await prisma.giveaway.findUnique({ where: { id }, select: { imagePath: true, drawnAt: true } });
  if (!giveaway) return ok(undefined);
  if (giveaway.drawnAt) return fail("กิจกรรมที่สุ่มผู้โชคดีแล้วลบไม่ได้ (เก็บไว้เป็นหลักฐานของผู้ได้รับรางวัล)");
  const { count } = await prisma.giveaway.deleteMany({ where: { id, drawnAt: null } });
  if (count === 0) return fail("กิจกรรมนี้เพิ่งถูกสุ่มผู้โชคดี ลบไม่ได้แล้ว");
  if (giveaway.imagePath) await removeObjects(BUCKETS.productPreviews, [giveaway.imagePath]);
  console.info("[giveaways] deleted", { giveawayId: id });
  revalidateGiveaways();
  return ok(undefined, "ลบกิจกรรมแล้ว");
}

export async function requestGiveawayImageUpload(id: string, input: { fileName: string; size: number }): Promise<ActionResult<SignedUpload>> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return fail("คำขอไม่ถูกต้อง");
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) return fail("คำขอไม่ถูกต้อง");
  const typeError = checkFileMeta(IMAGE_FILE_TYPES, parsed.data.fileName, parsed.data.size);
  if (typeError) return fail(FILE_TYPE_ERROR_TH[typeError]);

  const upload = await createSignedUpload(BUCKETS.productPreviews, newGiveawayImagePath(id, parsed.data.fileName));
  return upload ? ok(upload) : fail("เริ่มอัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

/** Sets the giveaway's picture after checking the stored object; the previous picture is deleted. */
export async function confirmGiveawayImageUpload(id: string, input: { path: string; fileName: string }): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || typeof input?.path !== "string" || !isGiveawayImagePath(id, input.path)) {
    return fail("คำขอไม่ถูกต้อง");
  }
  if (getExtension(input.path) !== getExtension(input.fileName)) {
    await removeObjects(BUCKETS.productPreviews, [input.path]);
    return fail("คำขอไม่ถูกต้อง");
  }
  const verified = await verifyUploadedObject(BUCKETS.productPreviews, input.path, input.fileName);
  if (!verified.ok) return fail(verified.error === "not_found" ? "ไม่พบไฟล์ที่อัปโหลด" : FILE_TYPE_ERROR_TH[verified.error]);

  const previous = await prisma.giveaway.findUnique({ where: { id }, select: { imagePath: true } });
  if (!previous) {
    await removeObjects(BUCKETS.productPreviews, [input.path]);
    return fail("ไม่พบกิจกรรมนี้ อาจถูกลบไปแล้ว");
  }
  await prisma.giveaway.update({ where: { id }, data: { imagePath: input.path } });
  if (previous.imagePath && previous.imagePath !== input.path) await removeObjects(BUCKETS.productPreviews, [previous.imagePath]);
  revalidateGiveaways(id);
  return ok(undefined);
}

export async function removeGiveawayImage(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return fail("คำขอไม่ถูกต้อง");
  const giveaway = await prisma.giveaway.findUnique({ where: { id }, select: { imagePath: true } });
  if (!giveaway?.imagePath) return ok(undefined);
  await prisma.giveaway.update({ where: { id }, data: { imagePath: null } });
  await removeObjects(BUCKETS.productPreviews, [giveaway.imagePath]);
  revalidateGiveaways(id);
  return ok(undefined, "ลบรูปแล้ว");
}

/** Draws winners for every open slot (first draw, or redraw of expired ones). See drawWinnersTx. */
export async function drawGiveawayWinners(id: string): Promise<ActionResult<DrawResult>> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(id).success) return fail("คำขอไม่ถูกต้อง");
  let result: DrawResult;
  try {
    result = await prisma.$transaction((tx) => drawWinnersTx(tx, id, new Date()), { timeout: 30_000 });
  } catch (error) {
    if (error instanceof GiveawayError) {
      const message = {
        NOT_FOUND: "ไม่พบกิจกรรมนี้ อาจถูกลบไปแล้ว",
        NOT_CLOSED: "ยังสุ่มไม่ได้ ต้องเผยแพร่กิจกรรมและรอให้ปิดลงทะเบียนก่อน",
        NOTHING_TO_DRAW: "ไม่มีรางวัลที่ต้องสุ่มเพิ่ม (หรือไม่มีผู้ลงทะเบียนเหลือให้สุ่ม)",
      }[error.code];
      return fail(message);
    }
    console.error("[giveaways] draw failed", { giveawayId: id, error });
    return fail("สุ่มไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  console.info("[giveaways] drawn", { giveawayId: id, adminId: admin.id, ...result });
  revalidateGiveaways(id);
  const message = `สุ่มผู้โชคดีแล้ว ${result.drawn} คน${result.unfilled > 0 ? ` · ผู้ลงทะเบียนไม่พอ ขาดอีก ${result.unfilled} รางวัล` : ""}`;
  return okNotice(result, message);
}

/** Takes an entrant out of (or back into) future draws. A drawn winner cannot be changed here. */
export async function setEntryDisqualified(entryId: string, disqualified: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(entryId).success || typeof disqualified !== "boolean") return fail("คำขอไม่ถูกต้อง");
  const { count } = await prisma.giveawayEntry.updateMany({
    where: { id: entryId, winner: null },
    data: { disqualifiedAt: disqualified ? new Date() : null },
  });
  if (count === 0) return fail("เปลี่ยนไม่ได้ (ผู้ลงทะเบียนนี้ถูกสุ่มเป็นผู้ชนะแล้ว หรือถูกลบไป)");
  revalidatePath("/admin/giveaways", "layout");
  return ok(undefined, disqualified ? "ตัดสิทธิ์แล้ว" : "คืนสิทธิ์แล้ว");
}
