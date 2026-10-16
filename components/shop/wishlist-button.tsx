"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { toggleWishlist } from "@/lib/wishlist/actions";
import { cn } from "@/lib/utils";

type Props = {
  productId: string;
  productSlug: string;
  initialWishlisted: boolean;
  size?: "icon-lg" | "icon-xl";
  className?: string;
};

/** Heart toggle. The server re-checks the session on every click, same as add-to-cart. */
export function WishlistButton({ productId, productSlug, initialWishlisted, size = "icon-xl", className }: Props) {
  const t = useTranslations("shop.wishlist");
  const locale = useLocale();
  const router = useRouter();
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [pending, startTransition] = useTransition();
  // Bumped when the heart turns on, so its pop animation runs again (remount via key).
  const [popKey, setPopKey] = useState(0);

  function onToggle() {
    startTransition(async () => {
      const result = await toggleWishlist(productId);
      if (!result.ok) {
        if (result.code === "LOGIN_REQUIRED") {
          router.push(`/login?next=${encodeURIComponent(`/${locale}/product/${productSlug}`)}`);
          return;
        }
        toast.error(t("error"));
        return;
      }
      setWishlisted(result.wishlisted);
      if (result.wishlisted) setPopKey((k) => k + 1);
      toast.success(result.wishlisted ? t("added") : t("removed"));
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={onToggle}
      disabled={pending}
      aria-pressed={wishlisted}
      aria-label={wishlisted ? t("remove") : t("add")}
      className={cn("relative shrink-0 rounded-full", className)}
    >
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <Heart
          key={popKey}
          className={cn(wishlisted && "fill-brand-strong text-brand-strong", popKey > 0 && wishlisted && "motion-pop")}
          aria-hidden
        />
      )}
      {popKey > 0 && wishlisted && !pending && (
        <span key={`burst-${popKey}`} aria-hidden className="motion-burst pointer-events-none absolute inset-0 rounded-full ring-2 ring-brand-strong/60" />
      )}
    </Button>
  );
}
