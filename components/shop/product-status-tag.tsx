import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { ProductStatus } from "@/lib/products/status";
import { cn } from "@/lib/utils";

type Props = { status: ProductStatus; soldOut?: boolean; className?: string };

/** Customer-facing tag for non-purchasable states. Renders nothing while on sale and in stock. */
export function ProductStatusTag({ status, soldOut = false, className }: Props) {
  const t = useTranslations("shop.badge");
  if (status === "ACTIVE" && !soldOut) return null;
  const label =
    status === "ACTIVE"
      ? t("soldOut")
      : status === "SCHEDULED"
        ? t("comingSoon")
        : status === "ENDED"
          ? t("saleEnded")
          : t("unavailable");
  return (
    <Badge className={cn(status === "SCHEDULED" ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground", className)}>
      {label}
    </Badge>
  );
}
