// All money math is done in integer satang (1 THB = 100 satang) to avoid float drift.
// Inputs accept Prisma Decimal (anything with toString), strings, or numbers.

type DecimalLike = { toString(): string } | string | number;

const DECIMAL_2 = /^(\d+)(?:\.(\d{1,2}))?$/;

/** Parses a non-negative amount with at most 2 decimals into integer hundredths. */
export function toHundredths(value: DecimalLike): number {
  const s = typeof value === "number" ? value.toFixed(2) : value.toString().trim();
  const m = DECIMAL_2.exec(s);
  if (!m) throw new Error(`Invalid decimal amount: ${s}`);
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** Integer hundredths → "123.45" (for Prisma Decimal writes and snapshots). */
export function fromHundredths(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export type PriceInput = {
  price: DecimalLike;
  discountPercent: DecimalLike | null;
  discountStartAt: Date | null;
  discountEndAt: Date | null;
};

export type ProductPrice = {
  /** All amounts in satang. */
  unitPrice: number;
  discount: number;
  finalPrice: number;
  /** Applied percent in hundredths (e.g. 1550 = 15.5%), 0 when no active discount. */
  discountPercent: number;
  isDiscounted: boolean;
  /** When the active discount ends (for UI countdowns only). */
  discountEndsAt: Date | null;
};

/** Discount applies only when a percent is set AND discountStartAt <= now <= discountEndAt. */
export function isDiscountActive(input: Omit<PriceInput, "price">, now: Date = new Date()): boolean {
  const { discountPercent, discountStartAt, discountEndAt } = input;
  if (discountPercent === null || !discountStartAt || !discountEndAt) return false;
  if (toHundredths(discountPercent) <= 0) return false;
  return now >= discountStartAt && now <= discountEndAt;
}

/** Authoritative server-side price. Never accept a price or discount from the client. */
export function calculateProductPrice(input: PriceInput, now: Date = new Date()): ProductPrice {
  const unitPrice = toHundredths(input.price);
  if (!isDiscountActive(input, now)) {
    return {
      unitPrice,
      discount: 0,
      finalPrice: unitPrice,
      discountPercent: 0,
      isDiscounted: false,
      discountEndsAt: null,
    };
  }

  const percent = toHundredths(input.discountPercent!); // hundredths of a percent
  // Round the discount half-up to the nearest satang; percent is < 100 so final stays > 0.
  const discount = Math.min(unitPrice, Math.floor((unitPrice * percent + 5000) / 10000));
  return {
    unitPrice,
    discount,
    finalPrice: unitPrice - discount,
    discountPercent: percent,
    isDiscounted: discount > 0,
    discountEndsAt: input.discountEndAt,
  };
}

/** Display formatting in THB (satang input). */
export function formatTHB(satang: number, locale = "th-TH"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: satang % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(satang / 100);
}
