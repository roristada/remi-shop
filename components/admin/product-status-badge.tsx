import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PRODUCT_STATUS_LABEL_TH, type ProductStatus } from "@/lib/products/status";

// Text label is always shown, so status is not conveyed by color alone.
const STYLES: Record<ProductStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SCHEDULED: "bg-secondary text-secondary-foreground",
  ACTIVE: "bg-success/10 text-success",
  DISABLED: "bg-destructive/10 text-destructive",
  ENDED: "bg-warning/10 text-warning",
};

export function ProductStatusBadge({ status, className }: { status: ProductStatus; className?: string }) {
  return <Badge className={cn(STYLES[status], className)}>{PRODUCT_STATUS_LABEL_TH[status]}</Badge>;
}
