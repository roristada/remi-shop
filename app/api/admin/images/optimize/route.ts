import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { optimizeProductImage, optimizeVariantImage } from "@/lib/products/image-jobs";

// A route, not a server action: the client fires one per new picture without waiting, and
// server actions run one at a time, so a slow animation would hold up the rest of the save.
export const maxDuration = 60;

const bodySchema = z.object({ kind: z.enum(["product", "variant"]), id: z.uuid() });

export async function POST(request: Request) {
  await requireAdmin();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: "INVALID", message: "Invalid request." } }, { status: 400 });
  }
  const { kind, id } = parsed.data;
  if (kind === "product") await optimizeProductImage(id);
  else await optimizeVariantImage(id);
  return NextResponse.json({ success: true });
}
