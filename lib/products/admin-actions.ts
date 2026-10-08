"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from "@/lib/prisma/errors";
import { fail, formString, invalid, ok, okNotice, type ActionResult } from "@/lib/actions/result";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  BULK_EDIT_FIELDS,
  bulkEditSchemas,
  idSchema,
  MAX_BULK_ITEMS,
  productSchema,
  type BulkEditField,
  type ProductInput,
} from "@/lib/validation/product";
import { BUCKETS } from "@/lib/storage/buckets";
import { removeObjects } from "@/lib/storage/product-storage";
import { previewObjectPaths } from "@/lib/storage/image-optimize";
import { sanitizeRichText } from "@/lib/rich-text-sanitize";
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
    // Rich text from the editor: only safe formatting is stored.
    descriptionTH: sanitizeRichText(d.descriptionTH),
    descriptionEN: sanitizeRichText(d.descriptionEN),
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

/** What a product keeps in Storage, so it can be removed after the rows are deleted. */
const productObjectsSelect = {
  images: { select: { imagePath: true, cardPath: true, detailPath: true } },
  variants: { select: { imagePath: true } },
  versions: { select: { files: { select: { storagePath: true } } } },
} as const;

type ProductObjects = {
  images: { imagePath: string; cardPath: string | null; detailPath: string | null }[];
  variants: { imagePath: string | null }[];
  versions: { files: { storagePath: string }[] }[];
};

function removeProductObjects(products: ProductObjects[]) {
  return Promise.all([
    removeObjects(BUCKETS.productPreviews, [
      ...products.flatMap((p) => p.images.flatMap(previewObjectPaths)),
      ...products.flatMap((p) => p.variants.flatMap((v) => (v.imagePath ? [v.imagePath] : []))),
    ]),
    removeObjects(
      BUCKETS.digitalFiles,
      products.flatMap((p) => p.versions.flatMap((v) => v.files.map((f) => f.storagePath))),
    ),
  ]);
}

/** Hard delete only for never-sold products; sold products must be disabled instead. */
export async function deleteProduct(productId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("ไม่พบสินค้า");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { _count: { select: { orderItems: true } }, ...productObjectsSelect },
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

  await removeProductObjects([product]);

  console.info("[products] deleted", { productId });
  revalidateCatalog();
  redirect("/admin/products?deleted=1");
}

/**
 * Deletes the selected products that were never ordered (same rule as deleteProduct); sold ones
 * are skipped. The delete itself re-checks "no order lines", so an order placed meanwhile wins.
 */
export async function bulkDeleteProducts(productIds: string[]): Promise<ActionResult> {
  await requireAdmin();
  const parsed = bulkIdsSchema.safeParse(productIds);
  if (!parsed.success) return fail("คำขอไม่ถูกต้อง");
  const ids = [...new Set(parsed.data)];

  const candidates = await prisma.product.findMany({
    where: { id: { in: ids }, orderItems: { none: {} } },
    select: { id: true, ...productObjectsSelect },
  });
  const candidateIds = candidates.map((p) => p.id);
  if (candidateIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: candidateIds }, orderItems: { none: {} } } });
  }
  // Rows that are gone now are the ones deleted; only their objects are removed.
  const remaining = new Set(
    (await prisma.product.findMany({ where: { id: { in: candidateIds } }, select: { id: true } })).map((p) => p.id),
  );
  const deleted = candidates.filter((p) => !remaining.has(p.id));
  await removeProductObjects(deleted);

  const skipped = ids.length - deleted.length;
  console.info("[products] bulk deleted", { count: deleted.length, skipped });
  if (deleted.length === 0) return fail("ลบไม่ได้ — สินค้าที่เลือกมีคำสั่งซื้อแล้ว ใช้ “ซ่อนสินค้า” แทน");
  revalidateCatalog();
  const message = `ลบ ${deleted.length} รายการแล้ว`;
  return skipped > 0 ? okNotice(undefined, `${message} · ข้าม ${skipped} รายการที่มีคำสั่งซื้อแล้ว`) : ok(undefined, message);
}

/** Bulk-edit form values for one field, read the same way as the product form. */
function readBulkForm(field: BulkEditField, formData: FormData): unknown {
  switch (field) {
    case "description":
      return {
        mode: formString(formData, "mode"),
        descriptionTH: formString(formData, "descriptionTH"),
        descriptionEN: formString(formData, "descriptionEN"),
      };
    case "stock":
      return { stockLimit: formString(formData, "stockLimit") };
    case "price":
      return { price: formString(formData, "price") };
    case "discount":
      return {
        discountPercent: formString(formData, "discountPercent"),
        discountStartAt: formString(formData, "discountStartAt"),
        discountEndAt: formString(formData, "discountEndAt"),
      };
    case "category":
      return { categoryId: formString(formData, "categoryId") };
    case "software":
      return { mode: formString(formData, "mode"), softwareTagIds: formData.getAll("softwareTagIds") };
    case "salePeriod":
      return { saleStartAt: formString(formData, "saleStartAt"), saleEndAt: formString(formData, "saleEndAt") };
  }
}

/** Stock, price and discount are set per option on products with options, so those are skipped. */
const PER_OPTION_FIELDS: readonly BulkEditField[] = ["stock", "price", "discount"];

/** Rich text appended after what a product has (both already sanitized HTML). */
const appendHtml = (current: string | null, added: string) => (current ? `${current}${added}` : added);

/** The writes for one validated field; `eligible` are the products it applies to. */
function bulkWrites(
  field: BulkEditField,
  data: unknown,
  eligible: { id: string; descriptionTH: string | null; descriptionEN: string | null }[],
): Prisma.PrismaPromise<unknown>[] {
  const where = { id: { in: eligible.map((p) => p.id) } };
  switch (field) {
    case "description": {
      const d = bulkEditSchemas.description.parse(data);
      const th = d.descriptionTH ? sanitizeRichText(d.descriptionTH) : null;
      const en = d.descriptionEN ? sanitizeRichText(d.descriptionEN) : null;
      if (d.mode === "replace") {
        return [prisma.product.updateMany({ where, data: { ...(th ? { descriptionTH: th } : {}), ...(en ? { descriptionEN: en } : {}) } })];
      }
      // Each product keeps its own text, so appending is one update per product.
      return eligible.map((p) =>
        prisma.product.update({
          where: { id: p.id },
          data: {
            ...(th ? { descriptionTH: appendHtml(p.descriptionTH, th) } : {}),
            ...(en ? { descriptionEN: appendHtml(p.descriptionEN, en) } : {}),
          },
        }),
      );
    }
    case "stock":
      return [prisma.product.updateMany({ where, data: bulkEditSchemas.stock.parse(data) })];
    case "price":
      return [prisma.product.updateMany({ where, data: bulkEditSchemas.price.parse(data) })];
    case "discount": {
      const d = bulkEditSchemas.discount.parse(data);
      // No percent clears the whole discount, dates included.
      const values = d.discountPercent === null ? { discountPercent: null, discountStartAt: null, discountEndAt: null } : d;
      return [prisma.product.updateMany({ where, data: values })];
    }
    case "category":
      return [prisma.product.updateMany({ where, data: bulkEditSchemas.category.parse(data) })];
    case "software": {
      const { mode, softwareTagIds } = bulkEditSchemas.software.parse(data);
      const add = prisma.productSoftwareTag.createMany({
        data: eligible.flatMap((p) => softwareTagIds.map((softwareTagId) => ({ productId: p.id, softwareTagId }))),
        skipDuplicates: true,
      });
      if (mode === "add") return [add];
      return [prisma.productSoftwareTag.deleteMany({ where: { productId: where.id, softwareTagId: { notIn: softwareTagIds } } }), add];
    }
    case "salePeriod":
      return [prisma.product.updateMany({ where, data: bulkEditSchemas.salePeriod.parse(data) })];
  }
}

/**
 * Sets one field on every selected product in one transaction. Values are validated like the
 * product form; ids that no longer exist (or have options, for per-option fields) are skipped.
 */
export async function bulkEditProducts(productIds: string[], field: BulkEditField, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const ids = bulkIdsSchema.safeParse(productIds);
  if (!ids.success || !BULK_EDIT_FIELDS.includes(field)) return fail("คำขอไม่ถูกต้อง");
  const parsed = bulkEditSchemas[field].safeParse(readBulkForm(field, formData));
  if (!parsed.success) return invalid(parsed.error);
  const uniqueIds = [...new Set(ids.data)];

  const products = await prisma.product.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, descriptionTH: true, descriptionEN: true, _count: { select: { variants: true } } },
  });
  const eligible = PER_OPTION_FIELDS.includes(field) ? products.filter((p) => p._count.variants === 0) : products;
  const withOptions = products.length - eligible.length;
  const missing = uniqueIds.length - products.length;
  if (eligible.length === 0) {
    return fail(withOptions > 0 ? "สินค้าที่เลือกมีตัวเลือกทั้งหมด — ตั้งค่านี้แยกตามตัวเลือกในหน้าแก้ไขสินค้า" : "ไม่พบสินค้า");
  }
  if (field === "category") {
    const { categoryId } = bulkEditSchemas.category.parse(parsed.data);
    if (!(await categoryExists(categoryId))) return fail("ไม่พบหมวดหมู่", { categoryId: "ไม่พบหมวดหมู่" });
  }

  try {
    await prisma.$transaction(bulkWrites(field, parsed.data, eligible));
  } catch (error) {
    // A software tag or category deleted meanwhile, for example.
    if (isForeignKeyViolation(error)) return fail("ข้อมูลที่เลือกถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    return writeError(error, "bulk edit");
  }

  console.info("[products] bulk edited", { field, count: eligible.length, withOptions, missing });
  revalidateCatalog();
  const notes = [
    withOptions > 0 ? `ข้าม ${withOptions} รายการที่มีตัวเลือก (ตั้งแยกตามตัวเลือก)` : null,
    missing > 0 ? `ข้าม ${missing} รายการ (ไม่พบสินค้า)` : null,
  ].filter((n): n is string => n !== null);
  const message = [`แก้ไข ${eligible.length} รายการแล้ว`, ...notes].join(" · ");
  return notes.length > 0 ? okNotice(undefined, message) : ok(undefined, message);
}
