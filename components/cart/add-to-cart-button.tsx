"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { addToCart } from "@/lib/cart/actions";
import type { PurchaseState } from "@/lib/cart/queries";

type Props = {
  productId: string;
  productSlug: string;
  initialState: PurchaseState;
};

const BUTTON = "h-12 w-full rounded-full text-base";

/** Buy action for a purchasable product. The server re-checks everything on click. */
export function AddToCartButton({ productId, productSlug, initialState }: Props) {
  const t = useTranslations("cart");
  const locale = useLocale();
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [pending, startTransition] = useTransition();

  if (state === "owned" || state === "inOrder") {
    return (
      <div className="space-y-2 rounded-2xl bg-background p-4 text-sm" role="status">
        <p className="font-medium">{state === "owned" ? t("add.owned") : t("add.inOrder")}</p>
        {state === "owned" ? (
          <p className="text-foreground/70">{t("add.ownedHint")}</p>
        ) : (
          <Link href="/orders" className="font-medium text-brand-strong underline-offset-4 hover:underline">
            {t("add.viewOrders")}
          </Link>
        )}
      </div>
    );
  }

  if (state === "inCart") {
    return (
      <div className="space-y-1.5">
        <p className="flex items-center justify-center gap-1.5 text-sm font-medium" role="status">
          <Check className="size-4 text-success" aria-hidden /> {t("add.inCart")}
        </p>
        <Button asChild variant="outline" size="lg" className={`${BUTTON} bg-background`}>
          <Link href="/cart">{t("add.viewCart")}</Link>
        </Button>
      </div>
    );
  }

  function onAdd() {
    startTransition(async () => {
      const result = await addToCart(productId);
      if (result.ok) {
        setState("inCart");
        toast.success(t("add.added"), { action: { label: t("add.viewCart"), onClick: () => router.push("/cart") } });
        return;
      }
      if (result.code === "LOGIN_REQUIRED") {
        router.push(`/login?next=${encodeURIComponent(`/${locale}/product/${productSlug}`)}`);
        return;
      }
      if (result.code === "OWNED") setState("owned");
      else if (result.code === "IN_ORDER") setState("inOrder");
      toast.error(t(`errors.${result.code}`));
      router.refresh();
    });
  }

  return (
    <div className="space-y-1.5">
      <Button size="lg" className={BUTTON} onClick={onAdd} disabled={pending} aria-busy={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ShoppingBag aria-hidden />}
        {t("add.button")}
      </Button>
      {state === "guest" && <p className="text-center text-xs text-foreground/70">{t("add.loginHint")}</p>}
    </div>
  );
}
