import { z } from "zod";

/** Matches generateOrderNumber(): "RS" + yymmdd + "-" + 6 Crockford base32 characters. */
export const orderNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^RS\d{6}-[0-9A-HJKMNP-TV-Z]{6}$/);
