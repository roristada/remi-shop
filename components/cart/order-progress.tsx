import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import type { OrderStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

const STEP_KEYS = ["progressPay", "progressReview", "progressDownload"] as const;

/** Index of the step the customer is on; COMPLETED means every step is done. */
function currentStep(status: OrderStatus): number | null {
  switch (status) {
    case "PENDING_PAYMENT":
    case "PAYMENT_REJECTED":
      return 0;
    case "WAITING_REVIEW":
      return 1;
    case "COMPLETED":
      return STEP_KEYS.length;
    case "CANCELLED":
      return null;
  }
}

/** Pay → store checks slip → download (or license active). Shows where the order is in the manual review flow. */
export async function OrderProgress({ status, isLicense = false }: { status: OrderStatus; isLicense?: boolean }) {
  const current = currentStep(status);
  if (current === null) return null;
  const t = await getTranslations("cart.order");

  return (
    <nav aria-label={t("progressLabel")}>
      <ol className="grid grid-cols-3 gap-2">
        {STEP_KEYS.map((key, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={key}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex flex-col gap-2 border-t-2 pt-2.5 text-xs sm:flex-row sm:items-center sm:text-sm",
                done ? "border-foreground" : active ? "border-brand-strong" : "border-border",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                  done && "bg-foreground text-background",
                  active && "bg-brand-strong text-white",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn(active ? "font-semibold" : "text-muted-foreground")}>
                {t(isLicense && key === "progressDownload" ? "progressLicense" : key)}
                <span className="sr-only"> {done ? t("progressDone") : active ? t("progressCurrent") : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
