"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/prisma/errors";
import { fail, formString, invalid, ok, okNotice, type ActionResult } from "@/lib/actions/result";
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

/** Adds a version and returns its id. The first version is always the latest; later ones when `setLatest`. */
export async function createVersion(
  productId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("ไม่พบสินค้า");
  const parsed = parseVersionForm(formData);
  if (!parsed.success) return invalid(parsed.error);
  const { setLatest, releaseDate, ...data } = parsed.data;

  const duplicate = await prisma.productVersion.count({ where: { productId, versionNumber: data.versionNumber } });
  if (duplicate > 0) return fail(DUPLICATE_VERSION, { versionNumber: DUPLICATE_VERSION });

  let id: string;
  try {
    id = await prisma.$transaction(async (tx) => {
      const existing = await tx.productVersion.count({ where: { productId } });
      const makeLatest = existing === 0 || setLatest;
      if (makeLatest) {
        await tx.productVersion.updateMany({ where: { productId, isLatest: true }, data: { isLatest: false } });
      }
      const version = await tx.productVersion.create({
        data: { ...data, productId, isLatest: makeLatest, ...(releaseDate ? { releaseDate } : {}) },
        select: { id: true },
      });
      return version.id;
    });
  } catch (error) {
    // Duplicate number or latest flag raced with another request.
    if (isUniqueViolation(error)) return fail(CONCURRENT_EDIT);
    if (isForeignKeyViolation(error)) return fail("ไม่พบสินค้า");
    throw error;
  }

  console.info("[products] version created", { productId, versionNumber: data.versionNumber });
  revalidateCatalog();
  return ok({ id }, "เพิ่มเวอร์ชันแล้ว");
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
  // The per-version file limit is checked by saveVersionFiles, after pending deletes are counted.

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

export type VersionFileChanges = {
  /** Objects already uploaded with keys from requestFileUpload; rows are created only here. */
  uploads: { path: string; fileName: string; variantId: string | null }[];
  moves: { fileId: string; variantId: string | null }[];
  deletes: string[];
};

/**
 * Applies every staged file change of one version at once: new files, moves between
 * "every buyer" (null) and one variant, and deletes. These change who can download what,
 * so every file must belong to the version and every variant to its product. Nothing is
 * applied unless everything is valid; uploaded objects are discarded when the save fails.
 */
export async function saveVersionFiles(versionId: string, changes: VersionFileChanges): Promise<ActionResult> {
  await requireAdmin();
  const version = await prisma.productVersion.findUnique({
    where: { id: idSchema.safeParse(versionId).success ? versionId : "" },
    select: {
      id: true,
      productId: true,
      versionNumber: true,
      product: { select: { publishStatus: true, nameTH: true, nameEN: true } },
    },
  });
  if (!version) return fail("ไม่พบเวอร์ชัน");

  const uploads = Array.isArray(changes?.uploads) ? changes.uploads : [];
  const moves = Array.isArray(changes?.moves) ? changes.moves : [];
  const deletes = Array.isArray(changes?.deletes) ? changes.deletes : [];
  // Only keys issued for this version may ever be removed from Storage here.
  const uploadedPaths = uploads
    .map((u) => u?.path)
    .filter((p): p is string => typeof p === "string" && isProductFilePath(p, version.productId, version.id));
  const reject = async (message: string) => {
    await removeUnsavedUploads(uploadedPaths);
    return fail(message);
  };

  if (uploads.length + moves.length + deletes.length === 0) return ok(undefined, "ไม่มีการเปลี่ยนแปลง");
  if (uploads.length > MAX_FILES_PER_VERSION || moves.length > MAX_FILES_PER_VERSION || deletes.length > MAX_FILES_PER_VERSION) {
    return reject("คำขอไม่ถูกต้อง");
  }

  const variantCache = new Map<unknown, string | null | undefined>();
  const variantFor = async (input: unknown) => {
    if (!variantCache.has(input)) variantCache.set(input, await checkFileVariant(version.productId, input));
    return variantCache.get(input);
  };

  // Existing files: every id must belong to this version.
  const deleteIds = [...new Set(deletes)];
  const moveList: { fileId: string; variantId: string | null }[] = [];
  for (const move of moves) {
    if (!idSchema.safeParse(move?.fileId).success) return reject("ไม่พบไฟล์");
    const variantId = await variantFor(move.variantId);
    if (variantId === undefined) return reject("ไม่พบตัวเลือกของสินค้านี้");
    if (!deleteIds.includes(move.fileId)) moveList.push({ fileId: move.fileId, variantId });
  }
  if (!deleteIds.every((id) => typeof id === "string" && idSchema.safeParse(id).success)) return reject("ไม่พบไฟล์");
  const touchedIds = [...new Set([...deleteIds, ...moveList.map((m) => m.fileId)])];
  const existing = await prisma.productVersionFile.findMany({
    where: { versionId: version.id },
    select: { id: true, storagePath: true, sortOrder: true },
  });
  const existingIds = new Set(existing.map((f) => f.id));
  if (!touchedIds.every((id) => existingIds.has(id))) return reject("ไม่พบไฟล์");

  // Files may change at any time, published or not (an empty version is delivered by email).
  const finalCount = existing.length - deleteIds.length + uploads.length;
  if (finalCount > MAX_FILES_PER_VERSION) return reject(`ไฟล์ได้สูงสุด ${MAX_FILES_PER_VERSION} ไฟล์ต่อเวอร์ชัน`);

  // New files: key issued for this version, extension unchanged, stored bytes verified.
  const checked: { path: string; fileName: string; variantId: string | null }[] = [];
  for (const upload of uploads) {
    const fileName = displayFileName(typeof upload?.fileName === "string" ? upload.fileName : "");
    const path = upload?.path;
    if (typeof path !== "string" || !isProductFilePath(path, version.productId, version.id)) return reject("คำขอไม่ถูกต้อง");
    if (!fileName || getExtension(path) !== getExtension(fileName)) return reject("คำขอไม่ถูกต้อง");
    const variantId = await variantFor(upload.variantId);
    if (variantId === undefined) return reject("ไม่พบตัวเลือกของสินค้านี้");
    checked.push({ path, fileName, variantId });
  }
  // In parallel: one by one, a big batch outlasts the hosting function's time limit.
  const verified = await Promise.all(checked.map((c) => verifyUploadedObject(BUCKETS.digitalFiles, c.path, c.fileName)));
  let sortOrder = existing.reduce((max, f) => Math.max(max, f.sortOrder), -1);
  const creates: Prisma.ProductVersionFileCreateManyInput[] = [];
  for (const [i, { path, fileName, variantId }] of checked.entries()) {
    const result = verified[i];
    if (!result.ok) {
      return reject(`${fileName}: ${result.error === "not_found" ? "ไม่พบไฟล์ที่อัปโหลด" : FILE_TYPE_ERROR_TH[result.error]}`);
    }
    creates.push({
      versionId: version.id,
      fileName,
      storagePath: path,
      // Size comes from Storage, not from the browser.
      fileSize: result.object.size,
      fileType: mimeFor(DIGITAL_FILE_TYPES, fileName),
      sortOrder: ++sortOrder,
      variantId,
    });
  }

  try {
    await prisma.$transaction([
      prisma.productVersionFile.deleteMany({ where: { id: { in: deleteIds }, versionId: version.id } }),
      ...moveList.map((m) =>
        prisma.productVersionFile.update({ where: { id: m.fileId, versionId: version.id }, data: { variantId: m.variantId } }),
      ),
      prisma.productVersionFile.createMany({ data: creates }),
    ]);
  } catch (error) {
    console.error("[products] version files save failed", { versionId, message: (error as Error).message });
    return reject(isUniqueViolation(error) ? CONCURRENT_EDIT : "บันทึกไฟล์ไม่สำเร็จ");
  }

  // Storage objects of deleted rows go only after the rows are gone.
  const deletedPaths = existing.filter((f) => deleteIds.includes(f.id)).map((f) => f.storagePath);
  await removeObjects(BUCKETS.digitalFiles, deletedPaths);

  // Buyers of a published product hear about new or removed files in any version.
  let notified = 0;
  if (version.product.publishStatus === "PUBLISHED" && (creates.length > 0 || deleteIds.length > 0)) {
    try {
      notified = await notifyProductBuyers(prisma, version.productId, {
        productNameTH: version.product.nameTH,
        productNameEN: version.product.nameEN,
        versionNumber: version.versionNumber,
        update: "files",
      });
    } catch (error) {
      console.error("[products] notify buyers of file change failed", { versionId, message: (error as Error).message });
    }
  }

  console.info("[products] version files saved", {
    productId: version.productId,
    versionId,
    uploaded: creates.length,
    moved: moveList.length,
    deleted: deleteIds.length,
    notified,
  });
  revalidateCatalog();
  return notified > 0 ? okNotice(undefined, `บันทึกไฟล์แล้ว · แจ้งลูกค้าที่ซื้อแล้ว ${notified} คน`) : ok(undefined, "บันทึกไฟล์แล้ว");
}

/** Removes objects uploaded for a save that never reached saveVersionFiles (e.g. a later upload failed). */
export async function discardFileUploads(versionId: string, paths: string[]): Promise<ActionResult> {
  await requireAdmin();
  const version = await findVersion(versionId);
  if (!version) return fail("ไม่พบเวอร์ชัน");
  if (!Array.isArray(paths) || paths.length > MAX_FILES_PER_VERSION) return fail("คำขอไม่ถูกต้อง");
  await removeUnsavedUploads(
    paths.filter((p) => typeof p === "string" && isProductFilePath(p, version.productId, version.id)),
  );
  return ok(undefined);
}

/** Removes uploaded objects that have no file row. A key with a row is a saved file, never an orphan. */
async function removeUnsavedUploads(paths: string[]) {
  if (paths.length === 0) return;
  const saved = await prisma.productVersionFile.findMany({ where: { storagePath: { in: paths } }, select: { storagePath: true } });
  const savedPaths = new Set(saved.map((f) => f.storagePath));
  await removeObjects(BUCKETS.digitalFiles, paths.filter((p) => !savedPaths.has(p)));
}
