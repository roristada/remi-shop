"use client";

import { PreviewImage } from "@/components/shared/preview-image";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ImageOff, Loader2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/localize";
import { getMiniCart, type MiniCart } from "@/lib/cart/actions";
import { formatTHB } from "@/lib/pricing/calculate";
import { onCartAdded, type CartAddedDetail } from "./cart-events";
import { patchHeaderState, useHeaderState } from "@/components/layout/header-state";

/** How long the "added" popover stays up unless the pointer or focus is inside it. */
const AUTO_CLOSE_MS = 6000;
/** Lines listed in the mini-cart; the rest are summarised as "and N more". */
const MINI_CART_MAX_LINES = 4;

type Mode = "added" | "cart";

/**
 * Header cart button with an item-count badge. Clicking it opens a mini-cart popover (lines,
 * total, a button to the cart page); adding a product opens the same popover as a short-lived
 * "added" confirmation. Everything shown is read from the server, never kept client-side.
 */
export function HeaderCartButton({ hasSession }: { hasSession: boolean }) {
  const t = useTranslations("cart.add");
  const tCart = useTranslations("cart.cart");
  const tHeader = useTranslations("common.header");
  const locale = useLocale();
  const fmt = intlLocale(locale);
  const count = useHeaderState(hasSession)?.cartCount ?? 0;
  const [added, setAdded] = useState<CartAddedDetail | null>(null);
  const [mode, setMode] = useState<Mode>("cart");
  const [open, setOpen] = useState(false);
  const [mini, setMini] = useState<MiniCart | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const stopTimer = () => window.clearTimeout(timer.current);
  const startTimer = () => {
    stopTimer();
    timer.current = window.setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
  };

  useEffect(
    () =>
      onCartAdded((detail) => {
        setAdded(detail);
        patchHeaderState({ cartCount: detail.count });
        setMode("added");
        setOpen(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
      }),
    [],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function loadMiniCart() {
    setMini(undefined);
    setFailed(false);
    getMiniCart(locale)
      .then((m) => {
        setMini(m);
        patchHeaderState({ cartCount: m?.lines.length ?? 0 });
      })
      .catch(() => setFailed(true));
  }

  function onOpenChange(next: boolean) {
    stopTimer();
    if (next) {
      // A click on the button always shows the cart itself.
      setMode("cart");
      loadMiniCart();
    }
    setOpen(next);
  }

  const label = count > 0 ? tHeader("cartCount", { count }) : tHeader("cart");
  const item = added?.item;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xl" className="relative rounded-full" aria-label={label}>
          <ShoppingBag />
          {count > 0 && (
            <span
              aria-hidden
              className="absolute top-1 right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-brand-strong px-1 text-[0.6875rem] leading-none font-semibold text-brand-strong-foreground tabular-nums"
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      {mode === "added" && item ? (
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
            <Thumb url={item.imageUrl} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-medium">{item.name}</p>
              <Price final={item.finalPrice} unit={item.unitPrice} locale={fmt.number} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("popoverCount", { count })}</p>
          <Actions onContinue={() => setOpen(false)} continueLabel={t("continue")} cartLabel={t("viewCart")} />
        </PopoverContent>
      ) : (
        <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] gap-0 rounded-2xl p-0">
          <p className="border-b px-4 py-3 font-semibold">
            {tCart("title")}
            {mini && mini.lines.length > 0 && (
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                ({tCart("itemCount", { count: mini.lines.length })})
              </span>
            )}
          </p>

          {failed ? (
            <div className="space-y-2 px-4 py-8 text-center text-sm" role="alert">
              <p>{tHeader("cartError")}</p>
              <Button variant="outline" size="sm" className="rounded-full" onClick={loadMiniCart}>
                {tHeader("retry")}
              </Button>
            </div>
          ) : mini === undefined ? (
            <div className="grid place-items-center py-10" role="status">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
              <span className="sr-only">{tCart("title")}</span>
            </div>
          ) : !mini || mini.lines.length === 0 ? (
            <div className="space-y-3 px-4 py-8 text-center">
              <p className="font-medium">{tCart("empty")}</p>
              <Button asChild variant="outline" className="h-10 rounded-full">
                <Link href="/shop" onClick={() => setOpen(false)}>
                  {tCart("browse")}
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <ul className="max-h-[min(20rem,55vh)] divide-y overflow-y-auto">
                {mini.lines.slice(0, MINI_CART_MAX_LINES).map((l) => (
                  <li key={l.key} className="flex items-center gap-3 px-4 py-3">
                    <Thumb url={l.imageUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{l.name}</p>
                      {l.variantName && <p className="truncate text-xs text-muted-foreground">{l.variantName}</p>}
                      {l.problem ? (
                        <p className="text-xs font-medium text-destructive">{tCart(`problem.${l.problem}`)}</p>
                      ) : (
                        <Price final={l.finalPrice} unit={l.unitPrice} locale={fmt.number} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {mini.lines.length > MINI_CART_MAX_LINES && (
                <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                  {tHeader("cartMore", { count: mini.lines.length - MINI_CART_MAX_LINES })}
                </p>
              )}
              <div className="space-y-3 border-t px-4 py-3">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted-foreground">{tCart("total")}</span>
                  <span className="font-semibold tabular-nums">{formatTHB(mini.total, fmt.number)}</span>
                </p>
                {mini.hasProblems && <p className="text-xs text-destructive">{tCart("problemNotice")}</p>}
                <Actions onContinue={() => setOpen(false)} continueLabel={t("continue")} cartLabel={tHeader("goToCart")} />
              </div>
            </>
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-secondary/60">
      {url ? (
        <PreviewImage src={url} alt="" fill sizes="56px" className="object-cover" />
      ) : (
        <ImageOff className="absolute inset-0 m-auto size-4 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}

function Price({ final, unit, locale }: { final: number; unit: number; locale: string }) {
  return (
    <p className="text-sm tabular-nums">
      <span className="font-semibold">{formatTHB(final, locale)}</span>
      {final < unit && <s className="ml-1.5 text-xs text-muted-foreground">{formatTHB(unit, locale)}</s>}
    </p>
  );
}

function Actions({ onContinue, continueLabel, cartLabel }: { onContinue: () => void; continueLabel: string; cartLabel: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" className="h-10 rounded-full" onClick={onContinue}>
        {continueLabel}
      </Button>
      <Button asChild className="h-10 rounded-full">
        <Link href="/cart" onClick={onContinue}>
          {cartLabel}
        </Link>
      </Button>
    </div>
  );
}
