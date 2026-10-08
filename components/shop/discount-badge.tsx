import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { intlLocale } from "@/i18n/localize";
import { cn } from "@/lib/utils";

/** `percent` is in hundredths (1550 = 15.5%), as returned by calculateProductPrice(). */
export function DiscountBadge({ percent, className }: { percent: number; className?: string }) {
  const t = useTranslations("shop.badge");
  const value = new Intl.NumberFormat(intlLocale(useLocale()).number, { maximumFractionDigits: 2 }).format(percent / 100);
  return <Badge className={cn("bg-brand-strong text-brand-strong-foreground", className)}>{t("discount", { percent: value })}</Badge>;
}
