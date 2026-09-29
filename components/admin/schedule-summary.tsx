import { CalendarClock, Percent } from "lucide-react";
import { formatBangkokDateTime } from "@/lib/datetime";
import type { PriceInput } from "@/lib/pricing/calculate";
import { getDiscountWindowState, getSaleWindowState, type ProductStatusInput, type WindowState } from "@/lib/products/status";
import { cn } from "@/lib/utils";

type Props = Omit<PriceInput, "price"> & Pick<ProductStatusInput, "saleStartAt" | "saleEndAt"> & { now: Date };

const TONE: Record<WindowState, string> = {
  NONE: "text-muted-foreground",
  UPCOMING: "text-foreground",
  ACTIVE: "text-success",
  ENDED: "text-warning",
};

const fmt = (d: Date | null) => formatBangkokDateTime(d);

function saleText(p: Props, state: WindowState): string {
  switch (state) {
    case "NONE":
      return "ช่วงขาย: เปิดขายตลอด";
    case "UPCOMING":
      return `ช่วงขาย: ยังไม่เปิด — เริ่ม ${fmt(p.saleStartAt)}`;
    case "ACTIVE":
      return p.saleEndAt ? `ช่วงขาย: เปิดอยู่ ถึง ${fmt(p.saleEndAt)}` : `ช่วงขาย: เปิดอยู่ตั้งแต่ ${fmt(p.saleStartAt)}`;
    case "ENDED":
      return `ช่วงขาย: สิ้นสุดแล้ว (${fmt(p.saleEndAt)})`;
  }
}

function discountText(p: Props, state: WindowState): string {
  const pct = p.discountPercent === null ? "" : ` ${p.discountPercent.toString()}%`;
  switch (state) {
    case "NONE":
      return "ส่วนลด: ไม่ได้ตั้ง";
    case "UPCOMING":
      return `ส่วนลด${pct}: ยังไม่เริ่ม — เริ่ม ${fmt(p.discountStartAt)}`;
    case "ACTIVE":
      return `ส่วนลด${pct}: ใช้งานอยู่ ถึง ${fmt(p.discountEndAt)}`;
    case "ENDED":
      return `ส่วนลด${pct}: หมดอายุแล้ว (${fmt(p.discountEndAt)})`;
  }
}

/** Server-computed state of the sale and discount windows, so the admin sees why a price or buy button looks the way it does. */
export function ScheduleSummary(props: Props) {
  const sale = getSaleWindowState(props, props.now);
  const discount = getDiscountWindowState(props, props.now);
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      <li className={cn("flex items-center gap-1.5", TONE[sale])}>
        <CalendarClock className="size-4 shrink-0" aria-hidden /> {saleText(props, sale)}
      </li>
      <li className={cn("flex items-center gap-1.5", TONE[discount])}>
        <Percent className="size-4 shrink-0" aria-hidden /> {discountText(props, discount)}
      </li>
    </ul>
  );
}
