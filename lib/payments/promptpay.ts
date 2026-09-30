// PromptPay "Thai QR" payload (EMVCo merchant-presented mode, as issued by the Bank of Thailand).
// With an amount the QR is "dynamic": banking apps fill the amount in, so the customer never types it.

const GUID_PROMPTPAY = "A000000677010111";

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the ASCII payload, as 4 uppercase hex digits. */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Phone (10 digits), citizen/tax ID (13) or e-wallet ID (15); dashes and spaces are ignored. */
export function isPromptPayId(id: string): boolean {
  return [10, 13, 15].includes(id.replace(/\D/g, "").length);
}

/**
 * Payload for a PromptPay QR that carries the amount (in satang).
 * Throws on an invalid id or a non-positive amount; callers pass values from the database.
 */
export function promptPayPayload(id: string, amountSatang: number): string {
  const digits = id.replace(/\D/g, "");
  if (!isPromptPayId(digits)) throw new Error("Invalid PromptPay id");
  if (!Number.isSafeInteger(amountSatang) || amountSatang <= 0) throw new Error("Invalid amount");

  // 01 = phone as 0066XXXXXXXXX, 02 = citizen/tax ID, 03 = e-wallet ID.
  const target =
    digits.length === 10 ? field("01", `0066${digits.slice(1)}`) : field(digits.length === 13 ? "02" : "03", digits);
  const amount = `${Math.floor(amountSatang / 100)}.${String(amountSatang % 100).padStart(2, "0")}`;

  const body = [
    field("00", "01"),
    field("01", "12"),
    field("29", field("00", GUID_PROMPTPAY) + target),
    field("58", "TH"),
    field("53", "764"),
    field("54", amount),
  ].join("");
  return `${body}6304${crc16(`${body}6304`)}`;
}
