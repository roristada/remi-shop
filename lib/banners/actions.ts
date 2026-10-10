"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { fail, formString, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { announcementBarSchema, bannerSchema } from "@/lib/validation/banner";
import { idSchema, uploadRequestSchema } from "@/lib/validation/product";
import { BUCKETS } from "@/lib/storage/buckets";
import { checkFileMeta, FILE_TYPE_ERROR_TH, getExtension, IMAGE_FILE_TYPES } from "@/lib/storage/file-types";
import { createSignedUpload, removeObjects, verifyUploadedObject, type SignedUpload } from "@/lib/storage/product-storage";
import { isBannerImagePath, newBannerImagePath } from "@/lib/banners/paths";

function revalidateBanners() {
  revalidatePath("/admin/banners");
  revalidatePath("/[locale]", "page");
}

function parseBanner(formData: FormData) {
  return bannerSchema.safeParse({
    titleTH: formString(formData, "titleTH"),
    titleEN: formString(formData, "titleEN"),
    descriptionTH: formString(formData, "descriptionTH"),
    descriptionEN: formString(formData, "descriptionEN"),
    ctaTH: formString(formData, "ctaTH"),
    ctaEN: formString(formData, "ctaEN"),
    link: formString(formData, "link"),
    theme: formString(formData, "theme"),
    imageFocusX: formString(formData, "imageFocusX") || "50",
    imageFocusY: formString(formData, "imageFocusY") || "50",
    startAt: formString(formData, "startAt"),
    endAt: formString(formData, "endAt"),
    isActive: formData.get("isActive") === "on",
  });
}

/** Creates a banner at the end of the carousel; returns its id so the image can be added next. */
export async function createBanner(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const parsed = parseBanner(formData);
  if (!parsed.success) return invalid(parsed.error);

  const last = await prisma.announcement.aggregate({ _max: { sortOrder: true } });
  const banner = await prisma.announcement.create({
    data: { ...parsed.data, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    select: { id: true },
  });
  console.info("[banners] created", { bannerId: banner.id });
  revalidateBanners();
  return ok({ id: banner.id }, "สร้างแบนเนอร์แล้ว");
}

export async function updateBanner(id: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return fail("คำขอไม่ถูกต้อง");
  const parsed = parseBanner(formData);
  if (!parsed.success) return invalid(parsed.error);

  const { count } = await prisma.announcement.updateMany({ where: { id }, data: parsed.data });
  if (count === 0) return fail("ไม่พบแบนเนอร์นี้ อาจถูกลบไปแล้ว");
  revalidateBanners();
  return ok(undefined, "บันทึกแบนเนอร์แล้ว");
}

export async function deleteBanner(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return fail("คำขอไม่ถูกต้อง");
  const banner = await prisma.announcement.findUnique({ where: { id }, select: { imagePath: true } });
  if (!banner) return ok(undefined);
  await prisma.announcement.delete({ where: { id } });
  if (banner.imagePath) await removeObjects(BUCKETS.productPreviews, [banner.imagePath]);
  console.info("[banners] deleted", { bannerId: id });
  revalidateBanners();
  return ok(undefined, "ลบแบนเนอร์แล้ว");
}

/** Swaps the banner with its neighbour. Renumbers every banner so equal sort orders cannot stall a move. */
export async function moveBanner(id: string, direction: "up" | "down"): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || (direction !== "up" && direction !== "down")) return fail("คำขอไม่ถูกต้อง");

  await prisma.$transaction(async (tx) => {
    const all = await tx.announcement.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    const from = all.findIndex((b) => b.id === id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= all.length) return;
    [all[from], all[to]] = [all[to], all[from]];
    await Promise.all(all.map((b, i) => tx.announcement.update({ where: { id: b.id }, data: { sortOrder: i } })));
  });
  revalidateBanners();
  return ok(undefined);
}

export async function requestBannerImageUpload(
  id: string,
  input: { fileName: string; size: number },
): Promise<ActionResult<SignedUpload>> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return fail("คำขอไม่ถูกต้อง");
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) return fail("คำขอไม่ถูกต้อง");
  const typeError = checkFileMeta(IMAGE_FILE_TYPES, parsed.data.fileName, parsed.data.size);
  if (typeError) return fail(FILE_TYPE_ERROR_TH[typeError]);

  const upload = await createSignedUpload(BUCKETS.productPreviews, newBannerImagePath(id, parsed.data.fileName));
  return upload ? ok(upload) : fail("เริ่มอัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

/** Sets the banner's picture after checking the stored object; the previous picture is deleted. */
export async function confirmBannerImageUpload(id: string, input: { path: string; fileName: string }): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || typeof input?.path !== "string" || !isBannerImagePath(id, input.path)) {
    return fail("คำขอไม่ถูกต้อง");
  }
  if (getExtension(input.path) !== getExtension(input.fileName)) {
    await removeObjects(BUCKETS.productPreviews, [input.path]);
    return fail("คำขอไม่ถูกต้อง");
  }
  const verified = await verifyUploadedObject(BUCKETS.productPreviews, input.path, input.fileName);
  if (!verified.ok) return fail(verified.error === "not_found" ? "ไม่พบไฟล์ที่อัปโหลด" : FILE_TYPE_ERROR_TH[verified.error]);

  const previous = await prisma.announcement.findUnique({ where: { id }, select: { imagePath: true } });
  if (!previous) {
    await removeObjects(BUCKETS.productPreviews, [input.path]);
    return fail("ไม่พบแบนเนอร์นี้ อาจถูกลบไปแล้ว");
  }
  await prisma.announcement.update({ where: { id }, data: { imagePath: input.path } });
  if (previous.imagePath && previous.imagePath !== input.path) await removeObjects(BUCKETS.productPreviews, [previous.imagePath]);
  revalidateBanners();
  return ok(undefined);
}

export async function removeBannerImage(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return fail("คำขอไม่ถูกต้อง");
  const banner = await prisma.announcement.findUnique({ where: { id }, select: { imagePath: true } });
  if (!banner?.imagePath) return ok(undefined);
  await prisma.announcement.update({ where: { id }, data: { imagePath: null } });
  await removeObjects(BUCKETS.productPreviews, [banner.imagePath]);
  revalidateBanners();
  return ok(undefined, "ลบรูปแล้ว");
}

export async function updateAnnouncementBar(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = announcementBarSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    textTH: formString(formData, "textTH"),
    textEN: formString(formData, "textEN"),
    link: formString(formData, "link"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const data = {
    announcementBarEnabled: parsed.data.enabled,
    announcementBarTH: parsed.data.textTH,
    announcementBarEN: parsed.data.textEN,
    announcementBarLink: parsed.data.link,
  };
  await prisma.storeSetting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  revalidateBanners();
  return ok(undefined, parsed.data.enabled ? "แถบประกาศแสดงบนหน้าแรกแล้ว" : "บันทึกแล้ว (ปิดการแสดง)");
}
