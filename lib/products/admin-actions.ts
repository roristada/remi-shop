"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from "@/lib/prisma/errors";
import { fail, formString, invalid, ok, okNotice, type ActionResult } from "@/lib/actions/result";
import { idSchema, MAX_BULK_ITEMS, productSchema, type ProductInput } from "@/lib/validation/product";
import { BUCKETS } from "@/lib/storage/buckets";
import { removeObjects } from "@/lib/storage/product-storage";
import { previewObjectPaths } from "@/lib/storage/image-optimize";
import { revalidateCatalog } from "@/lib/products/revalidate";
import { scheduleWarnings } from "@/lib/products/status";

const PRODUCT_FIELDS = [
  "slug",
  "nameTH",
  "nameEN",
  "descriptionTH",
  "descriptionEN",
  "categoryId",
  "folderId",
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

/** Maps validated input to columns. Status and folder placement are never taken from the form. */
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

async function folderExists(id: string | null) {
  return id === null || (await prisma.folder.count({ where: { id } })) > 0;
}

/** Next position at the end of a folder (0 when the product goes to no folder). */
async function endOfFolder(folderId: string | null) {
  if (!folderId) return 0;
  const last = await prisma.product.aggregate({ where: { folderId }, _max: { folderSortOrder: true } });
  return (last._max.folderSortOrder ?? -1) + 1;
}

function writeError(error: unknown, context: string): ActionResult<never> {
  if (isUniqueViolation(error)) return fail("slug นี้ถูกใช้แล้ว", { slug: "slug นี้ถูกใช้แล้ว" });
  if (isNotFound(error)) return fail("ไม่พบสินค้า");
  console.error(`[products] ${context} failed`, { message: (error as Error).message });
  return fail("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

/** Creates the product as a DRAFT and returns its id; the editor then saves the other sections. */
export async function createProduct(
  _prev: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string; warnings: ReturnType<typeof scheduleWarnings> }>> {
  await requireAdmin();
  const parsed = parseProductForm(formData);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await categoryExists(parsed.data.categoryId))) {
    return fail("ไม่พบหมวดหมู่", { categoryId: "ไม่พบหมวดหมู่" });
  }
  if (!(await folderExists(parsed.data.folderId))) return fail("ไม่พบโฟลเดอร์", { folderId: "ไม่พบโฟลเดอร์" });

  let id: string;
  try {
    const product = await prisma.product.create({
      data: {
        ...toProductData(parsed.data),
        folderId: parsed.data.folderId,
        folderSortOrder: await endOfFolder(parsed.data.folderId),
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
  return ok({ id, warnings: scheduleWarnings(parsed.data) }, "สร้างสินค้าแล้ว");
}

export async function updateProduct(productId: string, _prev: ActionResult<unknown> | null, formData: FormData) {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("ไม่พบสินค้า");
  const parsed = parseProductForm(formData);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await categoryExists(parsed.data.categoryId))) {
    return fail("ไม่พบหมวดหมู่", { categoryId: "ไม่พบหมวดหมู่" });
  }
  if (!(await folderExists(parsed.data.folderId))) return fail("ไม่พบโฟลเดอร์", { folderId: "ไม่พบโฟลเดอร์" });
  const current = await prisma.product.findUnique({ where: { id: productId }, select: { folderId: true } });
  if (!current) return fail("ไม่พบสินค้า");
  // Moving to another folder puts the product at its end; staying keeps the arranged position.
  const folder =
    current.folderId === parsed.data.folderId
      ? {}
      : { folderId: parsed.data.folderId, folderSortOrder: await endOfFolder(parsed.data.folderId) };

  try {
    await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: { ...toProductData(parsed.data), ...folder } }),
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
  return warned ? okNotice({ warnings }, "บันทึกแล้ว — โปรดตรวจช่วงเวลาที่ตั้งไว้") : ok({ warnings }, "บันทึกแล้ว");
}

const PUBLISH_TARGETS = ["DRAFT", "PUBLISHED", "DISABLED"] as const;
type PublishTarget = (typeof PUBLISH_TARGETS)[number];


export async function setPublishStatus(productId: string, target: PublishTarget): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success || !PUBLISH_TARGETS.includes(target)) {
    return fail("คำขอไม่ถูกต้อง");
  }

  // No file is required: a product without files is delivered by email after the order.
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { publishedAt: true } });
  if (!product) return fail("ไม่พบสินค้า");

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
    DISABLED: "ซ่อนสินค้าแล้ว",
  };
  return ok(undefined, messages[target]);
}

const bulkIdsSchema = z.array(idSchema).min(1).max(MAX_BULK_ITEMS);

/** Same rules as setPublishStatus, applied to many products; ids that no longer exist are skipped. */
export async function bulkSetPublishStatus(productIds: string[], target: PublishTarget): Promise<ActionResult> {
  await requireAdmin();
  const parsed = bulkIdsSchema.safeParse(productIds);
  if (!parsed.success || !PUBLISH_TARGETS.includes(target)) return fail("คำขอไม่ถูกต้อง");
  const ids = [...new Set(parsed.data)];

  const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const eligible = products.map((p) => p.id);
  const skipped = ids.length - eligible.length;
  if (eligible.length === 0) return fail("ไม่พบสินค้า");

  await prisma.$transaction([
    // First publication time is kept for "newest" sorting.
    ...(target === "PUBLISHED"
      ? [prisma.product.updateMany({ where: { id: { in: eligible }, publishedAt: null }, data: { publishedAt: new Date() } })]
      : []),
    prisma.product.updateMany({ where: { id: { in: eligible } }, data: { publishStatus: target } }),
  ]);

  console.info("[products] bulk publish status changed", { count: eligible.length, skipped, target });
  revalidateCatalog();
  const labels: Record<PublishTarget, string> = { PUBLISHED: "เผยแพร่", DRAFT: "เปลี่ยนเป็นฉบับร่าง", DISABLED: "ซ่อน" };
  const skippedNote = skipped > 0 ? ` · ข้าม ${skipped} รายการ (ไม่พบสินค้า)` : "";
  const message = `${labels[target]} ${eligible.length} รายการแล้ว${skippedNote}`;
  return skipped > 0 ? okNotice(undefined, message) : ok(undefined, message);
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
 * Copies a product as a new DRAFT: text details, pricing, schedule, tags, license prices,
 * folder and options. Pictures, versions and files (also the options' own) are not copied —
 * the copy is usually a different item, so they are uploaded fresh.
 */
export async function duplicateProduct(productId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("ไม่พบสินค้า");

  const source = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      softwareTags: { select: { softwareTagId: true } },
      licensePrices: { select: { usageTypeId: true, price: true } },
      variants: {
        select: {
          nameTH: true,
          nameEN: true,
          price: true,
          discountPercent: true,
          discountStartAt: true,
          discountEndAt: true,
          stockLimit: true,
          isActive: true,
          sortOrder: true,
        },
      },
    },
  });
  if (!source) return fail("ไม่พบสินค้า");

  // Variants are copied as text only: no picture and no files.
  const { slug, nameTH, nameEN, softwareTags, licensePrices, variants } = source;
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
        variants: { createMany: { data: variants } },
      },
      select: { id: true },
    });
    id = product.id;
  } catch (error) {
    // Unique violation here means another copy took the same slug at the same moment.
    if (isUniqueViolation(error)) return fail("ทำสำเนาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    return writeError(error, "duplicate");
  }

  console.info("[products] duplicated", { sourceId: productId, productId: id });
  revalidateCatalog();
  redirect(`/admin/products/${id}?duplicated=1`);
}

/** Hard delete only for never-sold products; sold products must be disabled instead. */
export async function deleteProduct(productId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("ไม่พบสินค้า");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      _count: { select: { orderItems: true } },
      images: { select: { imagePath: true, cardPath: true, detailPath: true } },
      variants: { select: { imagePath: true } },
      versions: { select: { files: { select: { storagePath: true } } } },
    },
  });
  if (!product) return fail("ไม่พบสินค้า");
  if (product._count.orderItems > 0) {
    return fail("สินค้านี้มีคำสั่งซื้อแล้ว ลบไม่ได้ — ใช้ “ซ่อนสินค้า” แทน");
  }

  try {
    await prisma.product.delete({ where: { id: productId } });
  } catch (error) {
    // An order may have been created between the check and the delete (FK Restrict).
    if (isForeignKeyViolation(error)) return fail("สินค้านี้มีคำสั่งซื้อแล้ว ลบไม่ได้ — ใช้ “ซ่อนสินค้า” แทน");
    return writeError(error, "delete");
  }

  await Promise.all([
    removeObjects(BUCKETS.productPreviews, [
      ...product.images.flatMap(previewObjectPaths),
      ...product.variants.flatMap((v) => (v.imagePath ? [v.imagePath] : [])),
    ]),
    removeObjects(
      BUCKETS.digitalFiles,
      product.versions.flatMap((v) => v.files.map((f) => f.storagePath)),
    ),
  ]);

  console.info("[products] deleted", { productId });
  revalidateCatalog();
  redirect("/admin/products?deleted=1");
}
