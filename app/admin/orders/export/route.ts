import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { formatBangkokDateTime } from "@/lib/datetime";
import { listOrdersForExport, orderLines } from "@/lib/orders/admin-queries";
import { ORDER_STATUS_LABEL_TH, parseAdminOrderFilters, toCsv } from "@/lib/orders/export";
import { toHundredths } from "@/lib/pricing/calculate";

const HEADER = ["วันเวลาสั่งซื้อ", "เลขที่คำสั่งซื้อ", "ชื่อผู้ซื้อ", "อีเมล", "สินค้า", "ราคา (บาท)", "ยอดรวมคำสั่งซื้อ (บาท)", "สถานะ", "ชำระเงินเมื่อ"];

const baht = (v: { toString(): string }) => toHundredths(v) / 100;

/** CSV of the orders matching the admin list filters: one row per product in each order. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const orders = await listOrdersForExport(parseAdminOrderFilters(sp));

  const rows = orders.flatMap((o) => {
    const lines = orderLines(o);
    const base = [
      formatBangkokDateTime(o.createdAt),
      o.orderNumber,
      o.user.displayName ?? "",
      o.user.email,
    ];
    const tail = [baht(o.total), ORDER_STATUS_LABEL_TH[o.status], o.paidAt ? formatBangkokDateTime(o.paidAt) : ""];
    return lines.length > 0
      ? lines.map((l) => [...base, l.name, baht(l.price), ...tail])
      : [[...base, "", "", ...tail]];
  });

  console.info("[orders] exported", { adminId: admin.id, orders: orders.length });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return new Response(toCsv(HEADER, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
