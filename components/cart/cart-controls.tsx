"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { removeFromCart } from "@/lib/cart/actions";
import { checkout } from "@/lib/orders/actions";
import { emitCartChanged } from "./cart-events";

export function RemoveFromCartButton({
  productId,
  variantId,
  name,
}: {
  productId: string;
  variantId: string | null;
  name: string;
}) {
  const t = useTranslations("cart");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className="rounded-full text-muted-foreground hover:text-foreground"
      aria-label={t("cart.remove", { name })}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await removeFromCart(productId, variantId);
          if (!result.ok) toast.error(t(`errors.${result.code}`));
          emitCartChanged();
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />}
    </Button>
  );
}

/**
 * Sends the total the customer saw; the server re-prices and refuses if it no longer matches.
 * `free` only changes the label — the server decides on its own whether the order needs payment.
 */
export function CheckoutButton({ expectedTotal, disabled, free = false }: { expectedTotal: number; disabled: boolean; free?: boolean }) {
  const t = useTranslations("cart");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      className="h-12 w-full rounded-full text-base"
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          // Redirects (order page, or downloads for a free order) on success; only failures return here.
          const result = await checkout(locale, expectedTotal);
          if (!result) return;
          if (result.code === "LOGIN_REQUIRED") {
            router.push(`/login?next=${encodeURIComponent(`/${locale}/cart`)}`);
            return;
          }
          toast.error(t(`errors.${result.code}`));
          router.refresh();
        })
      }
    >
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {free ? t("cart.checkoutFree") : t("cart.checkout")}
    </Button>
  );
}
