"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getMyReviewState } from "@/lib/reviews/actions";
import { ReviewDialog } from "@/components/reviews/review-dialog";
import type { ReviewEligibility } from "@/lib/reviews/rules";

type State = { state: ReviewEligibility; existing?: { rating: number; body: string } };

/**
 * The product page is cached for everyone, so what this viewer may do (sign in / buy first /
 * write / edit) is fetched after load instead of being rendered on the server.
 */
export function ReviewWriteButton({ productId, productName, productSlug }: { productId: string; productName: string; productSlug: string }) {
  const t = useTranslations("shop.reviews");
  const [me, setMe] = useState<State | null>(null);

  useEffect(() => {
    let live = true;
    getMyReviewState(productId)
      .then((s) => live && setMe(s))
      .catch(() => live && setMe({ state: "NOT_PURCHASED" }));
    return () => {
      live = false;
    };
  }, [productId]);

  if (!me) return <div className="h-11" aria-hidden />;

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
