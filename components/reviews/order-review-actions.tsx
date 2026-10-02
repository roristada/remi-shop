"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, Star } from "lucide-react";
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-accent/60 px-3 py-2.5">
      <span className="rounded-full bg-brand-strong/10 px-2.5 py-0.5 text-xs font-semibold text-brand-strong">
        {t("notReviewed")}
      </span>
      <span className="flex-1 text-xs text-muted-foreground">{t("reviewUntil", { date: item.until })}</span>
      <ReviewDialog
        productId={item.productId}
        productName={item.name}
        trigger={
          <Button size="sm" className="h-9 rounded-full px-4">
            <Star fill="currentColor" aria-hidden /> {t("rateNow")}
          </Button>
        }
      />
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
