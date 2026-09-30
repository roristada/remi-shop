import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env.server";
import { toHundredths } from "@/lib/pricing/calculate";
import type { SlipCheckResponse, SlipDetails } from "@/lib/payments/slip-check";

// SlipOK check-slip API: https://slipok.com/api-documentation/check-slip/
const ENDPOINT = "https://api.slipok.com/api/line/apikey";
const TIMEOUT_MS = 15_000;

const slipSchema = z.object({
  transRef: z.string(),
  amount: z.number(),
  transTimestamp: z.string().optional(),
  transDate: z.string().optional(),
  transTime: z.string().optional(),
});
const bodySchema = z.object({
  success: z.boolean().optional(),
  code: z.number().optional(),
  data: z.unknown().optional(),
});

function slipOkConfig() {
  const { SLIPOK_BRANCH_ID, SLIPOK_API_KEY } = serverEnv();
  return SLIPOK_BRANCH_ID && SLIPOK_API_KEY ? { branchId: SLIPOK_BRANCH_ID, apiKey: SLIPOK_API_KEY } : null;
}

export function isSlipOkConfigured(): boolean {
  return slipOkConfig() !== null;
}

/** ISO timestamp when present, else yyyyMMdd + HH:mm:ss (bank time, Asia/Bangkok). */
function transferTime(slip: z.infer<typeof slipSchema>): Date | null {
  const iso = slip.transTimestamp ? new Date(slip.transTimestamp) : null;
  if (iso && !Number.isNaN(iso.getTime())) return iso;
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(slip.transDate ?? "");
  if (!d || !/^\d{2}:\d{2}:\d{2}$/.test(slip.transTime ?? "")) return null;
  const local = new Date(`${d[1]}-${d[2]}-${d[3]}T${slip.transTime}+07:00`);
  return Number.isNaN(local.getTime()) ? null : local;
}

function parseSlip(data: unknown): SlipDetails | null {
  const parsed = slipSchema.safeParse(data);
  if (!parsed.success) return null;
  return {
    transRef: parsed.data.transRef,
    amountSatang: toHundredths(parsed.data.amount),
    transferredAt: transferTime(parsed.data),
  };
}

/**
 * Sends the slip image to SlipOK. `log: true` makes SlipOK check the receiving account of the
 * branch and remember the slip, so the same slip sent again answers 1012 (duplicate).
 * Never throws: a network error or timeout comes back as `{ ok: false, errorCode: null }`.
 */
export async function checkSlipWithSlipOk(
  image: Blob,
  fileName: string,
  amountSatang: number,
): Promise<SlipCheckResponse> {
  const config = slipOkConfig();
  if (!config) return { ok: false, errorCode: null, slip: null };

  const form = new FormData();
  form.append("files", image, fileName);
  form.append("log", "true");
  form.append("amount", (amountSatang / 100).toFixed(2));

  try {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(config.branchId)}`, {
      method: "POST",
      headers: { "x-authorization": config.apiKey },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = bodySchema.safeParse(await res.json().catch(() => null));
    if (!body.success) return { ok: false, errorCode: null, slip: null };

    const slip = parseSlip(body.data.data);
    if (res.ok && body.data.success && slip) return { ok: true, slip };
    return { ok: false, errorCode: body.data.code ?? null, slip };
  } catch (error) {
    console.error("[slipok] request failed", { message: (error as Error).message });
    return { ok: false, errorCode: null, slip: null };
  }
}
