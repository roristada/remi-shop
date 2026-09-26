"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { zodFieldErrors } from "@/lib/actions/result";
import type { FieldErrors } from "@/lib/validation/auth";
import { fromHundredths } from "@/lib/pricing/calculate";
import { getProductStatus } from "@/lib/products/status";
import { idSchema, uploadRequestSchema } from "@/lib/validation/product";
import { licenseSubmitSchema } from "@/lib/licenses/validation";
import { MAX_OPEN_LICENSE_REQUESTS, pickLicenseLines } from "@/lib/licenses/rules";
import { BUCKETS } from "@/lib/storage/buckets";
import { checkFileMeta, getExtension, IMAGE_FILE_TYPES, type FileTypeError } from "@/lib/storage/file-types";
import { createSignedUpload, removeObjects, verifyUploadedObject, type SignedUpload } from "@/lib/storage/product-storage";
import { isArtworkPath, newArtworkPath } from "@/lib/storage/payment-storage";

/** Codes map to `shop.license.errors.*` translation keys. */
export type LicenseErrorCode =
  | "LOGIN_REQUIRED"
  | "INVALID"
  | "UNAVAILABLE"
  | "OPTION_CHANGED"
  | "PRICE_CHANGED"
  | "TOO_MANY"
  | "NOT_ALLOWED"
  | "ERROR"
  | "not_found"
  | FileTypeError;

export type LicenseResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: LicenseErrorCode; fieldErrors?: FieldErrors };

class RequestError extends Error {
  constructor(readonly code: LicenseErrorCode) {
    super(code);
  }
}

/** One-time token for the artwork image, under a key scoped to the caller. */
export async function requestArtworkUpload(input: { fileName: string; size: number }): Promise<LicenseResult<SignedUpload>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "unsupported_type" };
  const typeError = checkFileMeta(IMAGE_FILE_TYPES, parsed.data.fileName, parsed.data.size);
  if (typeError) return { ok: false, code: typeError };

  const upload = await createSignedUpload(BUCKETS.licenseArtworks, newArtworkPath(user.id, parsed.data.fileName));
  return upload ? { ok: true, data: upload } : { ok: false, code: "ERROR" };
}

/**
 * Creates a license request. The product, the offered usage types and their prices are loaded
 * inside the transaction; `expectedTotal` is only compared, so the locked price is always one the
 * customer saw. The uploaded artwork is deleted whenever the request is not created.
 */
export async function submitLicenseRequest(input: unknown): Promise<LicenseResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };

  const rawPath = typeof input === "object" && input !== null && "artworkPath" in input ? input.artworkPath : null;
  // Only a key we issued to this customer may ever be deleted or attached.
  const ownPath = typeof rawPath === "string" && isArtworkPath(rawPath, user.id) ? rawPath : null;
  const discard = async () => {
    if (ownPath) await removeObjects(BUCKETS.licenseArtworks, [ownPath]);
  };

  const parsed = licenseSubmitSchema.safeParse(input);
  if (!parsed.success) {
    await discard();
    return { ok: false, code: "INVALID", fieldErrors: zodFieldErrors(parsed.error) };
  }
  const data = parsed.data;
  if (!ownPath || getExtension(ownPath) !== getExtension(data.artworkFileName)) {
    await discard();
    return { ok: false, code: "NOT_ALLOWED" };
  }

  const verified = await verifyUploadedObject(BUCKETS.licenseArtworks, ownPath, data.artworkFileName);
  if (!verified.ok) return { ok: false, code: verified.error };

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      // One submission at a time per customer, so the open-request limit cannot be raced past.
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`license:${user.id}`}, 0))`;
      const open = await tx.licenseRequest.count({ where: { userId: user.id, status: "PENDING_REVIEW" } });
      if (open >= MAX_OPEN_LICENSE_REQUESTS) throw new RequestError("TOO_MANY");

      const product = await tx.product.findUnique({
        where: { id: data.productId },
        select: {
          id: true,
          nameTH: true,
          nameEN: true,
          publishStatus: true,
          saleStartAt: true,
          saleEndAt: true,
          category: { select: { status: true } },
          licensePrices: {
            where: { usageType: { isActive: true } },
            orderBy: [{ usageType: { sortOrder: "asc" } }, { usageType: { nameTH: "asc" } }],
            select: { usageTypeId: true, price: true, usageType: { select: { nameTH: true, nameEN: true } } },
          },
        },
      });
      if (!product || product.category.status !== "ACTIVE" || getProductStatus(product, now) !== "ACTIVE") {
        throw new RequestError("UNAVAILABLE");
      }

      const offers = product.licensePrices.map((p) => ({
        usageTypeId: p.usageTypeId,
        price: p.price,
        nameTH: p.usageType.nameTH,
        nameEN: p.usageType.nameEN,
      }));
      const pick = pickLicenseLines(offers, data.usageTypeIds);
      if (!pick.ok) throw new RequestError(pick.code === "EMPTY" ? "INVALID" : "OPTION_CHANGED");
      if (pick.total !== data.expectedTotal) throw new RequestError("PRICE_CHANGED");

      const request = await tx.licenseRequest.create({
        data: {
          userId: user.id,
          productId: product.id,
          productNameTHSnapshot: product.nameTH,
          productNameENSnapshot: product.nameEN,
          buyerName: data.buyerName,
          buyerEmail: data.buyerEmail,
          buyerContact: data.buyerContact,
          artistName: data.artistName,
          artistContact: data.artistContact,
          platform: data.platform,
          note: data.note,
          artworkPath: ownPath,
          total: fromHundredths(pick.total),
          items: {
            create: pick.lines.map((l) => ({
              usageTypeId: l.usageTypeId,
              nameTHSnapshot: l.nameTH,
              nameENSnapshot: l.nameEN,
              price: fromHundredths(l.price),
            })),
          },
        },
        select: { id: true },
      });
      console.info("License request created", { requestId: request.id, userId: user.id, productId: product.id });
    });
  } catch (error) {
    await discard();
    if (error instanceof RequestError) return { ok: false, code: error.code };
    console.error("License request failed", { userId: user.id, error });
    return { ok: false, code: "ERROR" };
  }

  revalidatePath("/[locale]/account/licenses", "page");
  revalidatePath("/admin/licenses");
  return { ok: true, data: undefined };
}

/** Customer withdraws their own request before the store has decided on it. */
export async function cancelLicenseRequest(requestId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || !idSchema.safeParse(requestId).success) return { ok: false };

  const { count } = await prisma.licenseRequest.updateMany({
    // Same state as canCancelLicenseRequest(); a decided request cannot be withdrawn.
    where: { id: requestId, userId: user.id, status: "PENDING_REVIEW" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (count === 0) return { ok: false };
  console.info("License request cancelled by customer", { requestId, userId: user.id });
  revalidatePath("/[locale]/account/licenses", "page");
  revalidatePath("/admin/licenses");
  return { ok: true };
}
