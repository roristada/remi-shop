"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewDialog } from "@/components/reviews/review-dialog";

export type OrderReviewItem = {
  productId: string;
  name: string;
  state: "CAN_REVIEW" | "REVIEWED" | "EXPIRED";
  /** Formatted date the review window closes. */
  until: string;
};

/** Per-item review button on the order page; also usable for a reviewed/expired hint. */
export function OrderReviewButton({ item }: { item: OrderReviewItem }) {
  const t = useTranslations("shop.reviews");
  if (item.state === "REVIEWED") {
    return (
      <p className="inline-flex items-center gap-1 text-sm text-success">
        <BadgeCheck className="size-4" aria-hidden /> {t("reviewed")}
      </p>
    );
  }
  if (item.state === "EXPIRED") return <p className="text-xs text-muted-foreground">{t("expired")}</p>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <ReviewDialog
        productId={item.productId}
        productName={item.name}
        trigger={
          <Button variant="outline" size="sm" className="h-9 rounded-full px-4">
            <PenLine aria-hidden /> {t("write")}
          </Button>
        }
      />
      <span className="text-xs text-muted-foreground">{t("reviewUntil", { date: item.until })}</span>
    </div>
  );
}

/**
 * One-time invitation after an order is approved. Dismissal is remembered per order in this
 * browser only (a convenience, never relied on): the review buttons on the order page stay.
 */
const noopSubscribe = () => () => {};

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false; // private mode: the prompt may show again, which is harmless
  }
}

export function ReviewPrompt({ orderNumber, items }: { orderNumber: string; items: OrderReviewItem[] }) {
  const key = `review-prompt:${orderNumber}`;
  // The server snapshot says "already dismissed", so nothing renders until the browser's answer is known.
  const dismissedBefore = useSyncExternalStore(noopSubscribe, () => readDismissed(key), () => true);
  const [closed, setClosed] = useState(false);
  const [index, setIndex] = useState(0);

  const current = items[index];
  if (!current) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    setClosed(true);
  }

  function next() {
    if (index + 1 < items.length) setIndex(index + 1);
    else dismiss();
  }

  return (
    <ReviewDialog
      key={current.productId}
      productId={current.productId}
      productName={current.name}
      open={!dismissedBefore && !closed}
      onOpenChange={(v) => {
        if (!v) dismiss();
      }}
      onSaved={next}
    />
  );
}
