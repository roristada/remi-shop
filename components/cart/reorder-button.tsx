"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reorderRejectedOrder } from "@/lib/orders/actions";

/** On success the action redirects to the cart; it only returns when something went wrong. */
export function ReorderButton({ orderNumber }: { orderNumber: string }) {
  const t = useTranslations("cart.order");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      className="h-12 w-full rounded-full text-base"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await reorderRejectedOrder(orderNumber, locale);
          if (result) toast.error(t(`reorderErrors.${result.code}`));
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ShoppingBag aria-hidden />}
      {t("reorder")}
    </Button>
  );
}
