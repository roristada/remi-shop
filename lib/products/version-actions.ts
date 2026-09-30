"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/prisma/errors";
import { fail, formString, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema, uploadRequestSchema, versionSchema } from "@/lib/validation/product";
import { BUCKETS, MAX_PRODUCT_FILE_SIZE } from "@/lib/storage/buckets";
import {
  checkFileMeta,
  DIGITAL_FILE_TYPES,
  FILE_TYPE_ERROR_TH,
  getExtension,
  mimeFor,
} from "@/lib/storage/file-types";
import {
  createSignedUpload,
  isProductFilePath,
  newProductFilePath,
  removeObjects,
  verifyUploadedObject,
  type SignedUpload,
} from "@/lib/storage/product-storage";
import { revalidateCatalog } from "@/lib/products/revalidate";
import { notifyProductBuyers } from "@/lib/notifications/service";

const MAX_FILES_PER_VERSION = 30;

function parseVersionForm(formData: FormData) {
  return versionSchema.safeParse({
    versionNumber: formString(formData, "versionNumber"),
    releaseDate: formString(formData, "releaseDate"),
    releaseNotesTH: formString(formData, "releaseNotesTH"),
    releaseNotesEN: formString(formData, "releaseNotesEN"),
    setLatest: formString(formData, "setLatest") === "on",
  });
}

const DUPLICATE_VERSION = "เลขเวอร์ชันนี้มีอยู่แล้ว";
const CONCURRENT_EDIT = "มีการแก้ไขพร้อมกัน กรุณาลองใหม่อีกครั้ง";

async function findVersion(versionId: string) {
  if (!idSchema.safeParse(versionId).success) return null;
  return prisma.productVersion.findUnique({ where: { id: versionId } });
}

// ───────────────────────────── Versions ─────────────────────────────

export async function createVersion(
  productId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("ไม่พบสินค้า");
  const parsed = parseVersionForm(formData);
  if (!parsed.success) return invalid(parsed.error);
  const { setLatest, releaseDate, ...data } = parsed.data;

  const duplicate = await prisma.productVersion.count({ where: { productId, versionNumber: data.versionNumber } });
  if (duplicate > 0) return fail(DUPLICATE_VERSION, { versionNumber: DUPLICATE_VERSION });

  let deferredLatest = false;
  try {
    await prisma.$transaction(async (tx) => {
      const [existing, product] = await Promise.all([
        tx.productVersion.count({ where: { productId } }),
        tx.product.findUnique({ where: { id: productId }, select: { publishStatus: true } }),
      ]);
      // The first version is always the latest; later ones only when asked.
      // A new version has no files yet, so a published product keeps its current
      // latest until files are uploaded and the admin promotes it (setLatestVersion).
      deferredLatest = existing > 0 && setLatest && product?.publishStatus === "PUBLISHED";
      const makeLatest = existing === 0 || (setLatest && !deferredLatest);
      if (makeLatest) {
        await tx.productVersion.updateMany({ where: { productId, isLatest: true }, data: { isLatest: false } });
      }
      await tx.productVersion.create({
        data: { ...data, productId, isLatest: makeLatest, ...(releaseDate ? { releaseDate } : {}) },
      });
    });
  } catch (error) {
    // Duplicate number or latest flag raced with another request.
    if (isUniqueViolation(error)) return fail(CONCURRENT_EDIT);
    if (isForeignKeyViolation(error)) return fail("ไม่พบสินค้า");
    throw error;
  }

  console.info("[products] version created", { productId, versionNumber: data.versionNumber });
  revalidateCatalog();
  return ok(
    undefined,
    deferredLatest
      ? `เพิ่ม v${data.versionNumber} แล้ว — อัปโหลดไฟล์ แล้วกด “ตั้งเป็นล่าสุด”`
      : "เพิ่มเวอร์ชันแล้ว",
  );
}

export async function updateVersion(
  versionId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const version = await findVersion(versionId);
  if (!version) return fail("ไม่พบเวอร์ชัน");
  const parsed = parseVersionForm(formData);
  if (!parsed.success) return invalid(parsed.error);
  // isLatest is changed only through setLatestVersion.
  const { versionNumber, releaseNotesTH, releaseNotesEN, releaseDate } = parsed.data;
  const data = { versionNumber, releaseNotesTH, releaseNotesEN };

  try {
    await prisma.productVersion.update({
      where: { id: version.id },
      data: { ...data, ...(releaseDate ? { releaseDate } : {}) },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(DUPLICATE_VERSION, { versionNumber: DUPLICATE_VERSION });
    throw error;
  }

  revalidateCatalog();
  return ok(undefined, "บันทึกเวอร์ชันแล้ว");
}

export async function setLatestVersion(versionId: string): Promise<ActionResult> {
  await requireAdmin();
  const version = await findVersion(versionId);
  if (!version) return fail("ไม่พบเวอร์ชัน");
  if (version.isLatest) return ok(undefined);

  const product = await prisma.product.findUnique({
    where: { id: version.productId },
    select: { publishStatus: true },
  });
  const fileCount = await prisma.productVersionFile.count({ where: { versionId: version.id } });
  if (product?.publishStatus === "PUBLISHED" && fileCount === 0) {
    return fail("สินค้าเผยแพร่อยู่ เวอร์ชันล่าสุดต้องมีไฟล์อย่างน้อย 1 ไฟล์");
  }

  try {
    // Partial unique index (one latest per product) guards concurrent switches.
    await prisma.$transaction([
      prisma.productVersion.updateMany({
        where: { productId: version.productId, isLatest: true },
        data: { isLatest: false },
      }),
      prisma.productVersion.update({ where: { id: version.id }, data: { isLatest: true } }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) return fail(CONCURRENT_EDIT);
    throw error;
  }

  console.info("[products] latest version changed", { productId: version.productId, versionId });
  revalidateCatalog();
  return ok(undefined, `ตั้ง v${version.versionNumber} เป็นเวอร์ชันล่าสุดแล้ว`);
}

/**
 * Tells every buyer that this version is out. Only the latest version with files can be announced,
 * and only once: claiming `notifiedAt` conditionally makes a double click send nothing twice.
 */
export async function notifyVersionBuyers(versionId: string): Promise<ActionResult> {
  await requireAdmin();
  const version = await findVersion(versionId);
  if (!version) return fail("ไม่พบเวอร์ชัน");
  if (!version.isLatest) return fail("แจ้งลูกค้าได้เฉพาะเวอร์ชันล่าสุด");
  if (version.notifiedAt) return fail("แจ้งลูกค้าเรื่องเวอร์ชันนี้ไปแล้ว");

  const [product, fileCount] = await Promise.all([
    prisma.product.findUnique({
      where: { id: version.productId },
      select: { nameTH: true, nameEN: true, publishStatus: true },
    }),
    prisma.productVersionFile.count({ where: { versionId: version.id } }),
  ]);
  if (!product || product.publishStatus !== "PUBLISHED") return fail("สินค้ายังไม่เผยแพร่");
  if (fileCount === 0) return fail("อัปโหลดไฟล์ของเวอร์ชันนี้ก่อน แล้วจึงแจ้งลูกค้า");

  let notified: number;
  try {
    notified = await prisma.$transaction(async (tx) => {
      const claimed = await tx.productVersion.updateMany({
        where: { id: version.id, notifiedAt: null },
        data: { notifiedAt: new Date() },
      });
      if (claimed.count !== 1) return -1;
      return notifyProductBuyers(tx, version.productId, {
        productNameTH: product.nameTH,
        productNameEN: product.nameEN,
        versionNumber: version.versionNumber,
      });
    });
  } catch (error) {
    console.error("[products] notify buyers failed", { versionId, error });
    return fail("แจ้งลูกค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  if (notified < 0) return fail("แจ้งลูกค้าเรื่องเวอร์ชันนี้ไปแล้ว");

  console.info("[products] buyers notified of version", { productId: version.productId, versionId, notified });
  revalidateCatalog();
  return ok(undefined, notified > 0 ? `แจ้งลูกค้าที่ซื้อแล้ว ${notified} คน` : "บันทึกแล้ว (ยังไม่มีลูกค้าที่ซื้อสินค้านี้)");
}

/** The latest version cannot be deleted — promote another version first. */
export async function deleteVersion(versionId: string): Promise<ActionResult> {
  await requireAdmin();
  const version = await findVersion(versionId);
  if (!version) return fail("ไม่พบเวอร์ชัน");

  const files = await prisma.productVersionFile.findMany({
    where: { versionId: version.id },
    select: { storagePath: true },
  });
  // Re-check isLatest inside the delete so a concurrent promotion can't slip through.
  const { count } = await prisma.productVersion.deleteMany({ where: { id: version.id, isLatest: false } });
  if (count === 0) return fail("ลบเวอร์ชันล่าสุดไม่ได้ — ตั้งเวอร์ชันอื่นเป็นล่าสุดก่อน");

  await removeObjects(BUCKETS.digitalFiles, files.map((f) => f.storagePath));
  console.info("[products] version deleted", { productId: version.productId, versionId });
  revalidateCatalog();
  return ok(undefined, `ลบ v${version.versionNumber} แล้ว`);
}

// ────────────────────────────── Files ───────────────────────────────

export async function requestFileUpload(
  versionId: string,
  input: { fileName: string; size: number },
): Promise<ActionResult<SignedUpload>> {
  await requireAdmin();
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) return fail("คำขอไม่ถูกต้อง");

  const typeError = checkFileMeta(DIGITAL_FILE_TYPES, parsed.data.fileName, parsed.data.size, MAX_PRODUCT_FILE_SIZE);
  if (typeError) return fail(FILE_TYPE_ERROR_TH[typeError]);

  const version = await findVersion(versionId);
  if (!version) return fail("ไม่พบเวอร์ชัน");
  const fileCount = await prisma.productVersionFile.count({ where: { versionId: version.id } });
  if (fileCount >= MAX_FILES_PER_VERSION) return fail(`ไฟล์ได้สูงสุด ${MAX_FILES_PER_VERSION} ไฟล์ต่อเวอร์ชัน`);

  const path = newProductFilePath(version.productId, version.id, parsed.data.fileName);
  const upload = await createSignedUpload(BUCKETS.digitalFiles, path);
  return upload ? ok(upload) : fail("เริ่มอัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

/** Display name shown to customers; never used as a storage key. */
function displayFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255);
}

/** A variant id is accepted only if it is a variant of this product; null = shared file. */
async function checkFileVariant(productId: string, variantId: unknown): Promise<string | null | undefined> {
  if (variantId === null || variantId === undefined || variantId === "") return null;
  if (typeof variantId !== "string" || !idSchema.safeParse(variantId).success) return undefined;
  const found = await prisma.productVariant.count({ where: { id: variantId, productId } });
  return found === 1 ? variantId : undefined;
}

export async function confirmFileUpload(
  versionId: string,
  input: { path: string; fileName: string; variantId?: string | null },
): Promise<ActionResult> {
  await requireAdmin();
  const version = await findVersion(versionId);
  if (!version) return fail("ไม่พบเวอร์ชัน");
  const variantId = await checkFileVariant(version.productId, input.variantId);
  if (variantId === undefined) {
    await removeObjects(BUCKETS.digitalFiles, [input.path].filter((p) => isProductFilePath(p, version.productId, version.id)));
    return fail("ไม่พบตัวเลือกของสินค้านี้");
  }

  const fileName = displayFileName(input.fileName);
  if (!isProductFilePath(input.path, version.productId, version.id)) return fail("คำขอไม่ถูกต้อง");
  if (!fileName || getExtension(input.path) !== getExtension(fileName)) {
    // The key is one we issued for this version, so the uploaded object is safe to discard.
    await removeObjects(BUCKETS.digitalFiles, [input.path]);
    return fail("คำขอไม่ถูกต้อง");
  }

  const verified = await verifyUploadedObject(BUCKETS.digitalFiles, input.path, fileName);
  if (!verified.ok) {
    return fail(verified.error === "not_found" ? "ไม่พบไฟล์ที่อัปโหลด" : FILE_TYPE_ERROR_TH[verified.error]);
  }

  try {
    const max = await prisma.productVersionFile.aggregate({
      where: { versionId: version.id },
      _max: { sortOrder: true },
    });
    await prisma.productVersionFile.create({
      data: {
        versionId: version.id,
        fileName,
        storagePath: input.path,
        // Size comes from Storage, not from the browser.
        fileSize: verified.object.size,
        fileType: mimeFor(DIGITAL_FILE_TYPES, fileName),
        sortOrder: (max._max.sortOrder ?? -1) + 1,
        variantId,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return ok(undefined); // same upload confirmed twice
    await removeObjects(BUCKETS.digitalFiles, [input.path]);
    console.error("[products] file create failed", { versionId, message: (error as Error).message });
    return fail("บันทึกไฟล์ไม่สำเร็จ");
  }

  console.info("[products] file uploaded", { productId: version.productId, versionId });
  revalidateCatalog();
  return ok(undefined, "อัปโหลดไฟล์แล้ว");
}

/**
 * Moves a file between "every buyer" (null) and one variant. This changes who can download it,
 * so the variant must belong to the file's product.
 */
export async function setFileVariant(fileId: string, variantIdInput: string | null): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(fileId).success) return fail("ไม่พบไฟล์");
  const file = await prisma.productVersionFile.findUnique({
    where: { id: fileId },
    select: { version: { select: { productId: true } } },
  });
  if (!file) return fail("ไม่พบไฟล์");
  const variantId = await checkFileVariant(file.version.productId, variantIdInput);
  if (variantId === undefined) return fail("ไม่พบตัวเลือกของสินค้านี้");

  await prisma.productVersionFile.update({ where: { id: fileId }, data: { variantId } });
  console.info("[products] file variant changed", { productId: file.version.productId, fileId, variantId });
  revalidateCatalog();
  return ok(undefined, variantId ? "ไฟล์นี้จะให้เฉพาะผู้ซื้อตัวเลือกนี้" : "ไฟล์นี้จะให้ผู้ซื้อทุกตัวเลือก");
}

export async function deleteFile(fileId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(fileId).success) return fail("ไม่พบไฟล์");
  const file = await prisma.productVersionFile.findUnique({
    where: { id: fileId },
    include: {
      version: {
        select: { isLatest: true, productId: true, product: { select: { publishStatus: true } }, _count: { select: { files: true } } },
      },
    },
  });
  if (!file) return fail("ไม่พบไฟล์");

  const { version } = file;
  if (version.isLatest && version.product.publishStatus === "PUBLISHED" && version._count.files <= 1) {
    return fail("สินค้าเผยแพร่อยู่ ต้องเหลือไฟล์ในเวอร์ชันล่าสุดอย่างน้อย 1 ไฟล์ (เพิ่มไฟล์ใหม่ก่อน หรือเปลี่ยนเป็นฉบับร่าง)");
  }

  await prisma.productVersionFile.delete({ where: { id: file.id } });
  await removeObjects(BUCKETS.digitalFiles, [file.storagePath]);

  console.info("[products] file deleted", { productId: version.productId, fileId });
  revalidateCatalog();
  return ok(undefined, "ลบไฟล์แล้ว");
}
