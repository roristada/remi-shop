"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from "@/lib/prisma/errors";
import { fail, formString, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema, productSchema, type ProductInput } from "@/lib/validation/product";
import { BUCKETS } from "@/lib/storage/buckets";
import { removeObjects } from "@/lib/storage/product-storage";
import { revalidateCatalog } from "@/lib/products/revalidate";

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
  "software",
  "supportedVersion",
  "fileFormat",
  "license",
  "requirementsTH",
  "requirementsEN",
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
    software: d.software,
    supportedVersion: d.supportedVersion,
    fileFormat: d.fileFormat,
    license: d.license,
    requirementsTH: d.requirementsTH,
    requirementsEN: d.requirementsEN,
    downloadLimit: d.downloadLimit,
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
      data: { ...toProductData(parsed.data), publishStatus: "DRAFT" },
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
    await prisma.product.update({ where: { id: productId }, data: toProductData(parsed.data) });
  } catch (error) {
    return writeError(error, "update");
  }

  revalidateCatalog();
  return ok(undefined, "บันทึกแล้ว");
}

const PUBLISH_TARGETS = ["DRAFT", "PUBLISHED", "DISABLED"] as const;
type PublishTarget = (typeof PUBLISH_TARGETS)[number];

export async function setPublishStatus(productId: string, target: PublishTarget): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success || !PUBLISH_TARGETS.includes(target)) {
    return fail("คำขอไม่ถูกต้อง");
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      publishedAt: true,
      versions: { where: { isLatest: true }, select: { _count: { select: { files: true } } } },
    },
  });
  if (!product) return fail("ไม่พบสินค้า");

  if (target === "PUBLISHED") {
    const latest = product.versions[0];
    if (!latest) return fail("ต้องมีเวอร์ชันล่าสุดก่อนเผยแพร่");
    if (latest._count.files === 0) return fail("เวอร์ชันล่าสุดต้องมีไฟล์อย่างน้อย 1 ไฟล์ก่อนเผยแพร่");
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
