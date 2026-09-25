import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { ProductStatus } from "@/lib/products/status";
import { cn } from "@/lib/utils";

/** Customer-facing tag for non-purchasable states. Renders nothing while on sale. */
export function ProductStatusTag({ status, className }: { status: ProductStatus; className?: string }) {
  const t = useTranslations("shop.badge");
  if (status === "ACTIVE") return null;
  const label = status === "SCHEDULED" ? t("comingSoon") : status === "ENDED" ? t("saleEnded") : t("unavailable");
  return (
    <Badge className={cn(status === "SCHEDULED" ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground", className)}>
      {label}
    </Badge>
  );
}
