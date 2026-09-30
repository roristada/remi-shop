"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from "@/lib/prisma/errors";
import { fail, formString, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema, MAX_BULK_ITEMS, productSchema, type ProductInput } from "@/lib/validation/product";
import { BUCKETS } from "@/lib/storage/buckets";
import { copyObject, newProductImagePath, removeObjects } from "@/lib/storage/product-storage";
import { revalidateCatalog } from "@/lib/products/revalidate";
import { scheduleWarnings } from "@/lib/products/status";

const PRODUCT_FIELDS = [
  "slug",
  "nameTH",
  "nameEN",
  "descriptionTH",
  "descriptionEN",
  "categoryId",
  "price",
  "discountPercent",
  "discountStartAt",
  "discountEndAt",
  "saleStartAt",
  "saleEndAt",
  "supportedVersion",
  "fileFormat",
  "license",
  "requirementsTH",
  "requirementsEN",
  "stockLimit",
  "seoTitleTH",
  "seoTitleEN",
  "metaDescriptionTH",
  "metaDescriptionEN",
] as const;

function parseProductForm(formData: FormData) {
  const raw: Record<string, unknown> = Object.fromEntries(PRODUCT_FIELDS.map((k) => [k, formString(formData, k)]));
  raw.downloadLimit = {
    mode: formString(formData, "downloadLimitMode") || "unlimited",
    custom: formString(formData, "downloadLimitCustom"),
  };
  raw.softwareTagIds = formData.getAll("softwareTagIds");
  return productSchema.safeParse(raw);
}

/** Maps validated input to columns. Status fields are never taken from the form. */
function toProductData(d: ProductInput) {
  return {
    slug: d.slug,
    nameTH: d.nameTH,
    nameEN: d.nameEN,
    descriptionTH: d.descriptionTH,
    descriptionEN: d.descriptionEN,
    categoryId: d.categoryId,
    price: d.price,
    discountPercent: d.discountPercent,
    discountStartAt: d.discountStartAt,
    discountEndAt: d.discountEndAt,
    saleStartAt: d.saleStartAt,
    saleEndAt: d.saleEndAt,
    supportedVersion: d.supportedVersion,
    fileFormat: d.fileFormat,
    license: d.license,
    requirementsTH: d.requirementsTH,
    requirementsEN: d.requirementsEN,
    downloadLimit: d.downloadLimit,
    stockLimit: d.stockLimit,
    seoTitleTH: d.seoTitleTH,
    seoTitleEN: d.seoTitleEN,
    metaDescriptionTH: d.metaDescriptionTH,
    metaDescriptionEN: d.metaDescriptionEN,
  };
}

async function categoryExists(id: string) {
  return (await prisma.category.count({ where: { id } })) > 0;
}

function writeError(error: unknown, context: string): ActionResult<never> {
  if (isUniqueViolation(error)) return fail("slug นี้ถูกใช้แล้ว", { slug: "slug นี้ถูกใช้แล้ว" });
  if (isNotFound(error)) return fail("ไม่พบสินค้า");
  console.error(`[products] ${context} failed`, { message: (error as Error).message });
  return fail("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

export async function createProduct(_prev: ActionResult<unknown> | null, formData: FormData) {
  await requireAdmin();
  const parsed = parseProductForm(formData);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await categoryExists(parsed.data.categoryId))) {
    return fail("ไม่พบหมวดหมู่", { categoryId: "ไม่พบหมวดหมู่" });
  }

  let id: string;
  try {
    const product = await prisma.product.create({
      data: {
        ...toProductData(parsed.data),
        publishStatus: "DRAFT",
        softwareTags: { createMany: { data: parsed.data.softwareTagIds.map((softwareTagId) => ({ softwareTagId })) } },
      },
      select: { id: true },
    });
    id = product.id;
  } catch (error) {
    return writeError(error, "create");
  }

  console.info("[products] created", { productId: id });
  revalidateCatalog();
  redirect(`/admin/products/${id}?created=1`);
}

export async function updateProduct(productId: string, _prev: ActionResult<unknown> | null, formData: FormData) {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("ไม่พบสินค้า");
  const parsed = parseProductForm(formData);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await categoryExists(parsed.data.categoryId))) {
    return fail("ไม่พบหมวดหมู่", { categoryId: "ไม่พบหมวดหมู่" });
  }

  try {
    await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: toProductData(parsed.data) }),
      prisma.productSoftwareTag.deleteMany({
        where: { productId, softwareTagId: { notIn: parsed.data.softwareTagIds } },
      }),
      prisma.productSoftwareTag.createMany({
        data: parsed.data.softwareTagIds.map((softwareTagId) => ({ productId, softwareTagId })),
        skipDuplicates: true,
      }),
    ]);
  } catch (error) {
    return writeError(error, "update");
  }

  revalidateCatalog();
  const warnings = scheduleWarnings(parsed.data);
  const warned = Object.keys(warnings).length > 0;
  return ok({ warnings }, warned ? "บันทึกแล้ว — โปรดตรวจช่วงเวลาที่ตั้งไว้" : "บันทึกแล้ว");
}

const PUBLISH_TARGETS = ["DRAFT", "PUBLISHED", "DISABLED"] as const;
type PublishTarget = (typeof PUBLISH_TARGETS)[number];

const LATEST_FILE_COUNT = {
  versions: { where: { isLatest: true }, select: { _count: { select: { files: true } } } },
} as const;

/** Why a product can't be published yet, or null when it can. */
function publishBlocker(versions: { _count: { files: number } }[]): string | null {
  const latest = versions[0];
  if (!latest) return "ต้องมีเวอร์ชันล่าสุดก่อนเผยแพร่";
  if (latest._count.files === 0) return "เวอร์ชันล่าสุดต้องมีไฟล์อย่างน้อย 1 ไฟล์ก่อนเผยแพร่";
  return null;
}

export async function setPublishStatus(productId: string, target: PublishTarget): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success || !PUBLISH_TARGETS.includes(target)) {
    return fail("คำขอไม่ถูกต้อง");
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { publishedAt: true, ...LATEST_FILE_COUNT },
  });
  if (!product) return fail("ไม่พบสินค้า");

  if (target === "PUBLISHED") {
    const blocker = publishBlocker(product.versions);
    if (blocker) return fail(blocker);
  }

  await prisma.product.update({
    where: { id: productId },
    data: {
      publishStatus: target,
      // First publication time is kept for "newest" sorting.
      ...(target === "PUBLISHED" && !product.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });

  console.info("[products] publish status changed", { productId, target });
  revalidateCatalog();
  const messages: Record<PublishTarget, string> = {
    PUBLISHED: "เผยแพร่แล้ว",
    DRAFT: "เปลี่ยนเป็นฉบับร่างแล้ว",
    DISABLED: "ปิดการขายแล้ว",
  };
  return ok(undefined, messages[target]);
}

const bulkIdsSchema = z.array(idSchema).min(1).max(MAX_BULK_ITEMS);

/**
 * Same rules as setPublishStatus, applied to many products. Products that can't be
 * published (no latest version / no files) are skipped and counted in the message.
 */
export async function bulkSetPublishStatus(productIds: string[], target: PublishTarget): Promise<ActionResult> {
  await requireAdmin();
  const parsed = bulkIdsSchema.safeParse(productIds);
  if (!parsed.success || !PUBLISH_TARGETS.includes(target)) return fail("คำขอไม่ถูกต้อง");
  const ids = [...new Set(parsed.data)];

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, ...LATEST_FILE_COUNT },
  });
  const eligible =
    target === "PUBLISHED" ? products.filter((p) => publishBlocker(p.versions) === null).map((p) => p.id) : products.map((p) => p.id);
  const skipped = ids.length - eligible.length;
  if (eligible.length === 0) {
    return fail(target === "PUBLISHED" ? "ยังเผยแพร่ไม่ได้ — สินค้าที่เลือกยังไม่มีเวอร์ชันหรือไฟล์" : "ไม่พบสินค้า");
  }

  await prisma.$transaction([
    // First publication time is kept for "newest" sorting.
    ...(target === "PUBLISHED"
      ? [prisma.product.updateMany({ where: { id: { in: eligible }, publishedAt: null }, data: { publishedAt: new Date() } })]
      : []),
    prisma.product.updateMany({ where: { id: { in: eligible } }, data: { publishStatus: target } }),
  ]);

  console.info("[products] bulk publish status changed", { count: eligible.length, skipped, target });
  revalidateCatalog();
  const labels: Record<PublishTarget, string> = { PUBLISHED: "เผยแพร่", DRAFT: "เปลี่ยนเป็นฉบับร่าง", DISABLED: "ปิดการขาย" };
  const skippedNote = skipped > 0 ? ` · ข้าม ${skipped} รายการ (ยังไม่มีเวอร์ชันหรือไฟล์)` : "";
  return ok(undefined, `${labels[target]} ${eligible.length} รายการแล้ว${skippedNote}`);
}

const COPY_SUFFIX = "-copy";

/** `{slug}-copy`, then `-copy-2`, `-copy-3`, … — first one not taken, within the 100-char limit. */
async function nextCopySlug(slug: string): Promise<string> {
  const base = `${slug.slice(0, 100 - COPY_SUFFIX.length - 4)}${COPY_SUFFIX}`;
  const taken = new Set(
    (await prisma.product.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((p) => p.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

/**
 * Copies a product as a new DRAFT: details, pricing, schedule, tags, license prices, folder
 * and preview images. Versions and digital files are not copied — the copy is usually a
 * different item, so its files are uploaded fresh.
 */
export async function duplicateProduct(productId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("ไม่พบสินค้า");

  const source = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      softwareTags: { select: { softwareTagId: true } },
      licensePrices: { select: { usageTypeId: true, price: true } },
    },
  });
  if (!source) return fail("ไม่พบสินค้า");

  const { slug, nameTH, nameEN, images, softwareTags, licensePrices } = source;
  // Explicit list: status, publish time, OG image and timestamps are deliberately not copied.
  const columns = {
    descriptionTH: source.descriptionTH,
    descriptionEN: source.descriptionEN,
    categoryId: source.categoryId,
    folderId: source.folderId,
    price: source.price,
    discountPercent: source.discountPercent,
    saleStartAt: source.saleStartAt,
    saleEndAt: source.saleEndAt,
    discountStartAt: source.discountStartAt,
    discountEndAt: source.discountEndAt,
    supportedVersion: source.supportedVersion,
    fileFormat: source.fileFormat,
    license: source.license,
    requirementsTH: source.requirementsTH,
    requirementsEN: source.requirementsEN,
    downloadLimit: source.downloadLimit,
    stockLimit: source.stockLimit,
    seoTitleTH: source.seoTitleTH,
    seoTitleEN: source.seoTitleEN,
    metaDescriptionTH: source.metaDescriptionTH,
    metaDescriptionEN: source.metaDescriptionEN,
  };

  let id: string;
  try {
    const lastInFolder = columns.folderId
      ? await prisma.product.aggregate({ where: { folderId: columns.folderId }, _max: { folderSortOrder: true } })
      : null;
    const product = await prisma.product.create({
      data: {
        ...columns,
        slug: await nextCopySlug(slug),
        nameTH: `${nameTH} (สำเนา)`.slice(0, 150),
        nameEN: `${nameEN} (Copy)`.slice(0, 150),
        publishStatus: "DRAFT",
        folderSortOrder: (lastInFolder?._max.folderSortOrder ?? -1) + 1,
        softwareTags: { createMany: { data: softwareTags } },
        licensePrices: { createMany: { data: licensePrices } },
      },
      select: { id: true },
    });
    id = product.id;
  } catch (error) {
    // Unique violation here means another copy took the same slug at the same moment.
    if (isUniqueViolation(error)) return fail("ทำสำเนาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    return writeError(error, "duplicate");
  }

  // Each copy owns its own storage objects, so deleting one product never breaks the other.
  const copied = await Promise.all(
    images.map(async (img) => {
      const imagePath = newProductImagePath(id, img.imagePath);
      return (await copyObject(BUCKETS.productPreviews, img.imagePath, imagePath)) ? { ...img, imagePath } : null;
    }),
  );
  const kept = copied.filter((img) => img !== null);
  if (kept.length > 0) {
    const hasPrimary = kept.some((img) => img.isPrimary);
    await prisma.productImage.createMany({
      data: kept.map((img, i) => ({
        productId: id,
        imagePath: img.imagePath,
        altTextTH: img.altTextTH,
        altTextEN: img.altTextEN,
        sortOrder: img.sortOrder,
        isPrimary: hasPrimary ? img.isPrimary : i === 0,
      })),
    });
  }

  console.info("[products] duplicated", { sourceId: productId, productId: id, images: kept.length });
  revalidateCatalog();
  redirect(`/admin/products/${id}?duplicated=1${kept.length < images.length ? "&imageCopyFailed=1" : ""}`);
}

/** Hard delete only for never-sold products; sold products must be disabled instead. */
export async function deleteProduct(productId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("ไม่พบสินค้า");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      _count: { select: { orderItems: true } },
      images: { select: { imagePath: true } },
      versions: { select: { files: { select: { storagePath: true } } } },
    },
  });
  if (!product) return fail("ไม่พบสินค้า");
  if (product._count.orderItems > 0) {
    return fail("สินค้านี้มีคำสั่งซื้อแล้ว ลบไม่ได้ — ใช้ “ปิดการขาย” แทน");
  }

  try {
    await prisma.product.delete({ where: { id: productId } });
  } catch (error) {
    // An order may have been created between the check and the delete (FK Restrict).
    if (isForeignKeyViolation(error)) return fail("สินค้านี้มีคำสั่งซื้อแล้ว ลบไม่ได้ — ใช้ “ปิดการขาย” แทน");
    return writeError(error, "delete");
  }

  await Promise.all([
    removeObjects(BUCKETS.productPreviews, product.images.map((i) => i.imagePath)),
    removeObjects(
      BUCKETS.digitalFiles,
      product.versions.flatMap((v) => v.files.map((f) => f.storagePath)),
    ),
  ]);

  console.info("[products] deleted", { productId });
  revalidateCatalog();
  redirect("/admin/products?deleted=1");
}
