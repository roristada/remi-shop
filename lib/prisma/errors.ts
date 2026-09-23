import { Prisma } from "@/lib/generated/prisma/client";

/** Prisma known-request error code (e.g. "P2002"), or null for anything else. */
export function prismaErrorCode(error: unknown): string | null {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}

/** Unique constraint violation. */
export const isUniqueViolation = (error: unknown) => prismaErrorCode(error) === "P2002";

/** Record to update/delete was not found. */
export const isNotFound = (error: unknown) => prismaErrorCode(error) === "P2025";

/** Foreign key constraint (e.g. deleting a row that is still referenced). */
export const isForeignKeyViolation = (error: unknown) =>
  prismaErrorCode(error) === "P2003" || prismaErrorCode(error) === "P2014";
