"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { ImageOff, Mail } from "lucide-react";
import { PreviewImage } from "@/components/shared/preview-image";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableRow } from "@/components/ui/table";
import { OrderNote } from "@/components/admin/order-note";
import { cn } from "@/lib/utils";

/** Display-ready order summary (prices and dates already formatted on the server). */
export type OrderSummary = {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  paidAt: string | null;
  statusLabel: string;
  statusClassName: string;
  isLicense: boolean;
  buyerName: string;
  buyerEmail: string;
  lines: {
    id: string;
    name: string;
    detail: string | null;
    /** No file yet: the store sends this line by email. */
    emailDelivery: boolean;
    price: string;
    originalPrice: string | null;
    imageSrc: string | null;
  }[];
  subtotal: string;
  discount: string | null;
  total: string;
  note: string | null;
};

const OpenSummaryContext = createContext<(() => void) | null>(null);

// Clicks on these act on themselves, not on the row.
const INTERACTIVE = "a, button, input, textarea, select, label, [role='button']";

/**
 * A table row that opens the order's summary popup when clicked anywhere outside its own
 * controls. Keyboard users open it with the order-number button (OrderSummaryTrigger).
 */
export function OrderSummaryRow({ summary, children }: { summary: OrderSummary; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <OpenSummaryContext.Provider value={() => setOpen(true)}>
      <TableRow
        className="cursor-pointer hover:bg-muted/40"
        onClick={(e) => {
          const target = e.target as HTMLElement;
          // React bubbles portal events (the dialog, its overlay) through here; only real row clicks count.
          if (!e.currentTarget.contains(target) || target.closest(INTERACTIVE)) return;
          if (window.getSelection()?.toString()) return;
          setOpen(true);
        }}
      >
        {children}
      </TableRow>
      <Dialog open={open} onOpenChange={setOpen}>
        <SummaryContent summary={summary} />
      </Dialog>
    </OpenSummaryContext.Provider>
  );
}

export function OrderSummaryTrigger({ children }: { children: ReactNode }) {
  const open = useContext(OpenSummaryContext);
  return (
    <button
      type="button"
      onClick={() => open?.()}
      className="rounded font-medium tabular-nums hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

function SummaryContent({ summary: s }: { summary: OrderSummary }) {
  return (
    <DialogContent
      className="flex max-h-[min(90dvh,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      // Escape in the note editor cancels the edit; it shouldn't also close the popup.
      onEscapeKeyDown={(e) => {
        if ((e.target as HTMLElement | null)?.closest("textarea")) e.preventDefault();
      }}
    >
      <DialogHeader className="gap-1 border-b px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <DialogTitle className="text-lg font-semibold tabular-nums">{s.orderNumber}</DialogTitle>
          <Badge className={cn("whitespace-nowrap", s.statusClassName)}>{s.statusLabel}</Badge>
          {s.isLicense && <Badge className="bg-secondary text-secondary-foreground">License</Badge>}
        </div>
        <DialogDescription>
          สั่งซื้อ {s.createdAt}
          {s.paidAt && <> · ชำระเงิน {s.paidAt}</>}
        </DialogDescription>
        <p className="text-sm">
          {s.buyerName} <span className="text-muted-foreground">· {s.buyerEmail}</span>
        </p>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
        <p className="pt-2 pb-1 text-xs text-muted-foreground">สินค้า {s.lines.length} รายการ</p>
        <ul className="divide-y">
          {s.lines.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-3">
              <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary/60">
                {l.imageSrc ? (
                  <PreviewImage src={l.imageSrc} alt="" fill sizes="48px" className="object-cover" />
                ) : (
                  <ImageOff className="size-4 text-muted-foreground" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={l.name}>
                  {l.name}
                </p>
                {l.detail && <p className="truncate text-xs text-muted-foreground">{l.detail}</p>}
                {l.emailDelivery && (
                  <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
                    <Mail className="size-3" aria-hidden /> ส่งทางอีเมล
                  </p>
                )}
              </div>
              <p className="shrink-0 text-right tabular-nums">
                <span className="font-medium">{l.price}</span>
                {l.originalPrice && <s className="block text-xs text-muted-foreground">{l.originalPrice}</s>}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3 border-t bg-muted/30 px-5 py-4">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">ยอดสินค้า</dt>
            <dd className="tabular-nums">{s.subtotal}</dd>
          </div>
          {s.discount && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">ส่วนลด</dt>
              <dd className="tabular-nums">−{s.discount}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <dt>ยอดรวม</dt>
            <dd className="tabular-nums">{s.total}</dd>
          </div>
        </dl>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">หมายเหตุภายใน (ลูกค้าไม่เห็น)</p>
          <OrderNote orderId={s.orderId} note={s.note} />
        </div>
      </div>
    </DialogContent>
  );
}
