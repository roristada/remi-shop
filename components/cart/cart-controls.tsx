"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { removeFromCart } from "@/lib/cart/actions";
import { checkout } from "@/lib/orders/actions";

export function RemoveFromCartButton({ productId, name }: { productId: string; name: string }) {
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
          const result = await removeFromCart(productId);
          if (!result.ok) toast.error(t(`errors.${result.code}`));
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />}
    </Button>
  );
}

/** Sends the total the customer saw; the server re-prices and refuses if it no longer matches. */
export function CheckoutButton({ expectedTotal, disabled }: { expectedTotal: number; disabled: boolean }) {
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
          // Redirects to the order page on success; only failures return here.
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
      {t("cart.checkout")}
    </Button>
  );
}
