import "server-only";
import QRCode from "qrcode";
import { isPromptPayId, promptPayPayload } from "@/lib/payments/promptpay";

/**
 * PNG data URL of a PromptPay QR carrying the order amount, or null when the store has no valid
 * PromptPay id. Rendered on the server from database values, so no QR code ships to the browser.
 */
export async function promptPayQrDataUrl(promptPayId: string, amountSatang: number): Promise<string | null> {
  if (!isPromptPayId(promptPayId) || amountSatang <= 0) return null;
  try {
    return await QRCode.toDataURL(promptPayPayload(promptPayId, amountSatang), {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
    });
  } catch (error) {
    console.error("PromptPay QR render failed", { message: (error as Error).message });
    return null;
  }
}
