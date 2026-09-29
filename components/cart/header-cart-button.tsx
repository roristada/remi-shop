"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Link, usePathname } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/localize";
import { getCartCount } from "@/lib/cart/actions";
import { formatTHB } from "@/lib/pricing/calculate";
import { onCartAdded, onCartChanged, type CartAddedDetail } from "./cart-events";

/** How long the "added" popover stays up unless the pointer or focus is inside it. */
const AUTO_CLOSE_MS = 6000;

/**
 * Header cart link with an item-count badge, plus a popover confirming an add. The count is
 * read from the server (on mount, on navigation and after cart changes), never kept client-side.
 */
export function HeaderCartButton() {
  const t = useTranslations("cart.add");
  const tHeader = useTranslations("common.header");
  const fmt = intlLocale(useLocale());
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [added, setAdded] = useState<CartAddedDetail | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const stopTimer = () => window.clearTimeout(timer.current);
  const startTimer = () => {
    stopTimer();
    timer.current = window.setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
  };

  useEffect(() => {
    let active = true;
    const refresh = () => {
      getCartCount()
        .then((n) => active && setCount(n))
        .catch(() => {});
    };
    refresh();
    const offChanged = onCartChanged(refresh);
    return () => {
      active = false;
      offChanged();
    };
  }, [pathname]);

  useEffect(
    () =>
      onCartAdded((detail) => {
        setAdded(detail);
        setCount(detail.count);
        setOpen(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
      }),
    [],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const label = count > 0 ? tHeader("cartCount", { count }) : tHeader("cart");
  const item = added?.item;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Button asChild variant="ghost" size="icon-xl" className="relative rounded-full">
          <Link href="/cart" aria-label={label}>
            <ShoppingBag />
            {count > 0 && (
              <span
                aria-hidden
                className="absolute top-1 right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-brand-strong px-1 text-[0.6875rem] leading-none font-semibold text-white tabular-nums"
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
        </Button>
      </PopoverAnchor>
      {item && (
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-80 gap-4 rounded-2xl p-4"
          // Keep focus on the buy button the customer just pressed.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerEnter={stopTimer}
          onPointerLeave={startTimer}
          onFocus={stopTimer}
        >
          <p role="status" className="flex items-center gap-1.5 font-semibold">
            <Check className="size-4 text-success" aria-hidden /> {t("popoverTitle")}
          </p>
          <div className="flex items-center gap-3">
            <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-secondary/60">
              {item.imageUrl && <Image src={item.imageUrl} alt="" fill sizes="56px" className="object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-medium">{item.name}</p>
              <p className="tabular-nums">
                <span className="font-semibold">{formatTHB(item.finalPrice, fmt.number)}</span>
                {item.finalPrice < item.unitPrice && (
                  <s className="ml-1.5 text-xs text-muted-foreground">{formatTHB(item.unitPrice, fmt.number)}</s>
                )}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("popoverCount", { count })}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-10 rounded-full" onClick={() => setOpen(false)}>
              {t("continue")}
            </Button>
            <Button asChild className="h-10 rounded-full">
              <Link href="/cart" onClick={() => setOpen(false)}>
                {t("viewCart")}
              </Link>
            </Button>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
