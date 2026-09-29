import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

// The label is always shown, so status is never conveyed by color alone.
export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-primary/60 text-foreground",
  WAITING_REVIEW: "bg-secondary text-secondary-foreground",
  PAYMENT_REJECTED: "bg-destructive/10 text-destructive",
  COMPLETED: "bg-success/10 text-success",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const t = useTranslations("cart.status");
  return <Badge className={cn(ORDER_STATUS_STYLES[status], className)}>{t(status)}</Badge>;
}
