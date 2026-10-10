"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { zodFieldErrors } from "@/lib/actions/result";
import type { FieldErrors } from "@/lib/validation/auth";
import { fromHundredths } from "@/lib/pricing/calculate";
import { getProductStatus } from "@/lib/products/status";
import { idSchema, uploadRequestSchema } from "@/lib/validation/product";
import { licenseEditSchema, licenseSubmitSchema } from "@/lib/licenses/validation";
import {
  canEditLicenseRequest,
  MAX_OPEN_LICENSE_REQUESTS,
  OPEN_LICENSE_STATUSES,
  pickLicenseLines,
} from "@/lib/licenses/rules";
import { ARTWORK_FIELD_ID, diffAnswers, legacyColumns, resolveAnswers, type ResolvedAnswer } from "@/lib/licenses/form-fields";
import { listActiveFormFields } from "@/lib/licenses/form-queries";
import { BUCKETS } from "@/lib/storage/buckets";
import { checkFileMeta, getExtension, IMAGE_FILE_TYPES, type FileTypeError } from "@/lib/storage/file-types";
import { createSignedUpload, removeObjects, verifyUploadedObject, type SignedUpload } from "@/lib/storage/product-storage";
import { isArtworkPath, newArtworkPath } from "@/lib/storage/payment-storage";
import { notifyAdmins } from "@/lib/notifications/service";

/** Codes map to `shop.license.errors.*` translation keys. */
export type LicenseErrorCode =
  | "LOGIN_REQUIRED"
  | "INVALID"
  | "UNAVAILABLE"
  | "OPTION_CHANGED"
  | "PRICE_CHANGED"
  | "PRICE_NOT_ACCEPTED"
  | "TOO_MANY"
  | "NOT_ALLOWED"
  | "EDIT_CLOSED"
  | "ERROR"
  | "not_found"
  | FileTypeError;

export type LicenseResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: LicenseErrorCode; fieldErrors?: FieldErrors };

class RequestError extends Error {
  constructor(
    readonly code: LicenseErrorCode,
    readonly fieldErrors?: FieldErrors,
  ) {
    super(code);
  }
}

function revalidateRequests() {
  revalidatePath("/[locale]/account/licenses", "layout");
  revalidatePath("/admin/licenses", "layout");
}

/** A path in the input only counts when it is a key we issued to this customer. */
function ownArtworkPath(input: unknown, userId: string): string | null {
  const raw = typeof input === "object" && input !== null && "artworkPath" in input ? input.artworkPath : null;
  return typeof raw === "string" && isArtworkPath(raw, userId) ? raw : null;
}

/**
 * Validates an optional artwork: nothing sent is fine; anything sent must be our own key with a
 * matching extension and a real image. Deletes the object on failure (verify does it for bad files).
 */
async function checkArtwork(
  ownPath: string | null,
  sentPath: string | null | undefined,
  fileName: string | null | undefined,
): Promise<LicenseErrorCode | null> {
  if (!sentPath && !fileName) return null;
  if (!ownPath || !fileName || getExtension(ownPath) !== getExtension(fileName)) {
    if (ownPath) await removeObjects(BUCKETS.licenseArtworks, [ownPath]);
    return "NOT_ALLOWED";
  }
  const verified = await verifyUploadedObject(BUCKETS.licenseArtworks, ownPath, fileName);
  return verified.ok ? null : verified.error;
}

function answerRows(answers: ResolvedAnswer[]): Prisma.LicenseRequestAnswerCreateManyRequestInput[] {
  return answers.map((a) => ({
    fieldId: a.fieldId,
    labelTHSnapshot: a.labelTH,
    labelENSnapshot: a.labelEN,
    type: a.type,
    values: a.values,
    valuesEN: a.valuesEN,
    sortOrder: a.sortOrder,
  }));
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
 * Creates a license request. The product, the offered usage types and their prices, and the form's
 * questions are all loaded inside the transaction; `expectedTotal` is only compared, so the locked
 * price is always one the customer saw. The uploaded artwork is deleted whenever the request is not
 * created.
 */
export async function submitLicenseRequest(input: unknown): Promise<LicenseResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };

  const ownPath = ownArtworkPath(input, user.id);
  const discard = async () => {
    if (ownPath) await removeObjects(BUCKETS.licenseArtworks, [ownPath]);
  };

  const parsed = licenseSubmitSchema.safeParse(input);
  if (!parsed.success) {
    await discard();
    return { ok: false, code: "INVALID", fieldErrors: zodFieldErrors(parsed.error) };
  }
  const data = parsed.data;
  // The artwork is optional; when one is sent it must be a verified object we issued.
  const artworkCode = await checkArtwork(ownPath, data.artworkPath, data.artworkFileName);
  if (artworkCode) return { ok: false, code: artworkCode };

  const now = new Date();
  let requestId = "";
  try {
    await prisma.$transaction(async (tx) => {
      // One submission at a time per customer, so the open-request limit cannot be raced past.
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`license:${user.id}`}, 0))`;
      const open = await tx.licenseRequest.count({ where: { userId: user.id, status: { in: [...OPEN_LICENSE_STATUSES] } } });
      if (open >= MAX_OPEN_LICENSE_REQUESTS) throw new RequestError("TOO_MANY");

      const fields = await listActiveFormFields(tx);
      const resolved = resolveAnswers(fields, data.answers);
      if (!resolved.ok) throw new RequestError("INVALID", resolved.errors);

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
          ...legacyColumns(resolved.answers),
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
          answers: { createMany: { data: answerRows(resolved.answers) } },
          events: { create: { type: "SUBMITTED", newTotal: fromHundredths(pick.total) } },
        },
        select: { id: true },
      });
      requestId = request.id;
      await notifyAdmins(tx, "ADMIN_LICENSE_REQUESTED", { productNameTH: product.nameTH, productNameEN: product.nameEN, requestId });
    });
  } catch (error) {
    await discard();
    if (error instanceof RequestError) return { ok: false, code: error.code, fieldErrors: error.fieldErrors };
    console.error("License request failed", { userId: user.id, error });
    return { ok: false, code: "ERROR" };
  }

  console.info("License request created", { requestId, userId: user.id, productId: data.productId });
  revalidateRequests();
  return { ok: true, data: undefined };
}

/** Customer withdraws their own request before the store has decided on it. */
export async function cancelLicenseRequest(requestId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || !idSchema.safeParse(requestId).success) return { ok: false };

  const done = await prisma.$transaction(async (tx) => {
    const { count } = await tx.licenseRequest.updateMany({
      // Same states as canCancelLicenseRequest(); a decided request cannot be withdrawn.
      where: { id: requestId, userId: user.id, status: { in: [...OPEN_LICENSE_STATUSES] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (count === 0) return false;
    await tx.licenseRequestEvent.create({ data: { requestId, type: "CANCELLED" } });
    return true;
  });
  if (!done) return { ok: false };
  console.info("License request cancelled by customer", { requestId, userId: user.id });
  revalidateRequests();
  return { ok: true };
}

/**
 * Customer edits a request's details and/or attaches (or replaces) the artwork: for 30 days after
 * submitting, and always while the store waits for corrections (NEEDS_INFO). Answering a request
 * for changes sends it back for review; a price the store proposed must be accepted in the same
 * step. Usage types never change. Every edit's before/after is kept in the request history.
 */
export async function updateLicenseRequest(requestId: string, input: unknown): Promise<LicenseResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  if (!idSchema.safeParse(requestId).success) return { ok: false, code: "NOT_ALLOWED" };

  const ownPath = ownArtworkPath(input, user.id);
  const discard = async () => {
    if (ownPath) await removeObjects(BUCKETS.licenseArtworks, [ownPath]);
  };

  const parsed = licenseEditSchema.safeParse(input);
  if (!parsed.success) {
    await discard();
    return { ok: false, code: "INVALID", fieldErrors: zodFieldErrors(parsed.error) };
  }
  const data = parsed.data;

  const artworkCode = await checkArtwork(ownPath, data.artworkPath, data.artworkFileName);
  if (artworkCode) return { ok: false, code: artworkCode };

  let previousArtwork: string | null = null;
  let responded = false;
  let productName = { productNameTH: "", productNameEN: "" };
  try {
    await prisma.$transaction(async (tx) => {
      // Row lock: an admin decision and this edit cannot interleave.
      await tx.$queryRaw`select id from license_requests where id = ${requestId}::uuid and user_id = ${user.id}::uuid for update`;
      // Ownership is part of the lookup: another customer's id is indistinguishable from a missing one.
      const existing = await tx.licenseRequest.findFirst({
        where: { id: requestId, userId: user.id },
        select: {
          status: true,
          createdAt: true,
          artworkPath: true,
          total: true,
          proposedTotal: true,
          infoRequestFields: true,
          productNameTHSnapshot: true,
          productNameENSnapshot: true,
          answers: { select: { fieldId: true, labelTHSnapshot: true, labelENSnapshot: true, values: true } },
        },
      });
      if (!existing || !canEditLicenseRequest(existing.status, existing.createdAt)) throw new RequestError("EDIT_CLOSED");
      responded = existing.status === "NEEDS_INFO";
      productName = { productNameTH: existing.productNameTHSnapshot, productNameEN: existing.productNameENSnapshot };

      const fields = await listActiveFormFields(tx);
      const resolved = resolveAnswers(fields, data.answers);
      if (!resolved.ok) throw new RequestError("INVALID", resolved.errors);
      if (responded && existing.infoRequestFields.includes(ARTWORK_FIELD_ID) && !ownPath) {
        throw new RequestError("INVALID", { artwork: "artwork_required" });
      }
      if (responded && existing.proposedTotal && data.acceptPrice !== true) throw new RequestError("PRICE_NOT_ACCEPTED");

      // Answers to questions no longer on the form stay as they were.
      const activeIds = fields.map((f) => f.id);
      const before = existing.answers
        .filter((a) => a.fieldId && activeIds.includes(a.fieldId))
        .map((a) => ({ fieldId: a.fieldId, labelTH: a.labelTHSnapshot, labelEN: a.labelENSnapshot, values: a.values }));
      const after = resolved.answers.map((a) => ({ fieldId: a.fieldId, labelTH: a.labelTH, labelEN: a.labelEN, values: a.values }));
      const changes = diffAnswers(before, after);
      if (ownPath) changes.push({ labelTH: "รูปผลงาน", labelEN: "Artwork", before: existing.artworkPath ? "✓" : "", after: "✓ (ใหม่)" });

      await tx.licenseRequestAnswer.deleteMany({ where: { requestId, fieldId: { in: activeIds } } });
      await tx.licenseRequestAnswer.createMany({ data: answerRows(resolved.answers).map((r) => ({ ...r, requestId })) });

      const accepted = responded && existing.proposedTotal !== null;
      await tx.licenseRequest.update({
        where: { id: requestId },
        data: {
          ...legacyColumns(resolved.answers),
          ...(ownPath ? { artworkPath: ownPath } : {}),
          ...(responded
            ? {
                status: "PENDING_REVIEW",
                ...(accepted ? { total: existing.proposedTotal! } : {}),
                proposedTotal: null,
                priceChangeReason: null,
                infoRequestMessage: null,
                infoRequestFields: [],
              }
            : {}),
        },
      });
      if (accepted) {
        await tx.licenseRequestEvent.create({
          data: { requestId, type: "PRICE_ACCEPTED", oldTotal: existing.total, newTotal: existing.proposedTotal },
        });
      }
      await tx.licenseRequestEvent.create({
        data: {
          requestId,
          type: responded ? "CUSTOMER_RESPONDED" : "CUSTOMER_EDITED",
          changes: changes.length > 0 ? changes : undefined,
        },
      });
      if (responded) await notifyAdmins(tx, "ADMIN_LICENSE_RESPONDED", { ...productName, requestId });
      previousArtwork = existing.artworkPath;
    });
  } catch (error) {
    await discard();
    if (error instanceof RequestError) return { ok: false, code: error.code, fieldErrors: error.fieldErrors };
    console.error("License request update failed", { requestId, userId: user.id, error });
    return { ok: false, code: "ERROR" };
  }

  // The replaced artwork is no longer referenced.
  if (ownPath && previousArtwork && previousArtwork !== ownPath) {
    await removeObjects(BUCKETS.licenseArtworks, [previousArtwork]);
  }

  console.info(responded ? "License request answered by customer" : "License request edited by customer", {
    requestId,
    userId: user.id,
    artwork: Boolean(ownPath),
  });
  revalidateRequests();
  return { ok: true, data: undefined };
}

/** Customer accepts the price the store proposed; the request goes back to the store for the final decision. */
export async function acceptLicensePrice(requestId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || !idSchema.safeParse(requestId).success) return { ok: false };

  const done = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`select id from license_requests where id = ${requestId}::uuid and user_id = ${user.id}::uuid for update`;
    const r = await tx.licenseRequest.findFirst({
      where: { id: requestId, userId: user.id, status: "AWAITING_PRICE_CONFIRMATION", proposedTotal: { not: null } },
      select: { total: true, proposedTotal: true, productNameTHSnapshot: true, productNameENSnapshot: true },
    });
    if (!r) return false;
    await tx.licenseRequest.update({
      where: { id: requestId },
      data: { status: "PENDING_REVIEW", total: r.proposedTotal!, proposedTotal: null, priceChangeReason: null },
    });
    await tx.licenseRequestEvent.create({ data: { requestId, type: "PRICE_ACCEPTED", oldTotal: r.total, newTotal: r.proposedTotal } });
    await notifyAdmins(tx, "ADMIN_LICENSE_RESPONDED", {
      productNameTH: r.productNameTHSnapshot,
      productNameEN: r.productNameENSnapshot,
      requestId,
    });
    return true;
  });
  if (!done) return { ok: false };
  console.info("License price accepted by customer", { requestId, userId: user.id });
  revalidateRequests();
  return { ok: true };
}

