import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type RatingData = { average: number; count: number };

/**
 * Honest by construction: always takes `{ average, count }`, never a hardcoded number.
 * `count === 0` renders an outline-only row and "no reviews yet". See DESIGN.md § Rating.
 */
export function StarRating({ average, count, className }: RatingData & { className?: string }) {
  const t = useTranslations("shop.rating");
  const rounded = Math.max(0, Math.min(5, Math.round(average)));

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="flex" aria-hidden>
        {Array.from({ length: 5 }, (_, i) =>
          i < rounded ? (
            <Star key={i} className="size-3.5 text-brand-strong" fill="currentColor" strokeWidth={0} />
          ) : (
            <Star key={i} className="size-3.5 text-input" fill="none" strokeWidth={1.5} />
          ),
        )}
      </span>
      <span className="text-xs text-muted-foreground">{count > 0 ? t("count", { count }) : t("none")}</span>
    </div>
  );
}
