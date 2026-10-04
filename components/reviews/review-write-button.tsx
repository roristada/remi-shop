"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getMyReviewState } from "@/lib/reviews/actions";
import { ReviewDialog } from "@/components/reviews/review-dialog";
import type { ReviewEligibility } from "@/lib/reviews/rules";

type State = { state: ReviewEligibility; existing?: { rating: number; body: string; isAnonymous: boolean } };

/**
 * What this viewer may do (sign in / buy first / write / edit) is fetched after load, and only
 * once the section scrolls near view: each fetch is a function call, and most visitors never
 * reach the reviews. Guests (no auth cookie) skip the fetch and see the sign-in button.
 */
export function ReviewWriteButton({
  productId,
  productName,
  productSlug,
  hasSession,
}: {
  productId: string;
  productName: string;
  productSlug: string;
  hasSession: boolean;
}) {
  const t = useTranslations("shop.reviews");
  const [me, setMe] = useState<State | null>(hasSession ? null : { state: "LOGIN" });
  const placeholder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (me || !placeholder.current) return;
    let live = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        getMyReviewState(productId)
          .then((s) => live && setMe(s))
          .catch(() => live && setMe({ state: "NOT_PURCHASED" }));
      },
      { rootMargin: "300px" },
    );
    observer.observe(placeholder.current);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [me, productId]);

  if (!me) return <div ref={placeholder} className="h-11" aria-hidden />;

  if (me.state === "CAN_REVIEW" || me.state === "REVIEWED") {
    const editing = me.state === "REVIEWED" && me.existing;
    return (
      <ReviewDialog
        productId={productId}
        productName={productName}
        initial={editing ? me.existing : undefined}
        onSaved={() => setMe(null)}
        trigger={
          <Button variant="outline" className="h-11 rounded-full px-5">
            <PenLine aria-hidden /> {editing ? t("edit") : t("write")}
          </Button>
        }
      />
    );
  }

  if (me.state === "LOGIN") {
    return (
      <Button asChild variant="outline" className="h-11 rounded-full px-5">
        <Link href={`/login?next=${encodeURIComponent(`/product/${productSlug}`)}`}>{t("loginToReview")}</Link>
      </Button>
    );
  }

  return <p className="text-sm text-muted-foreground">{me.state === "EXPIRED" ? t("expired") : t("onlyBuyers")}</p>;
}
