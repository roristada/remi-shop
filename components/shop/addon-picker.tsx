"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PreviewImage } from "@/components/shared/preview-image";
import { Link, useRouter } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/localize";
import { formatTHB } from "@/lib/pricing/calculate";
import { addAddonsToCart } from "@/lib/cart/actions";
import type { StorefrontAddon } from "@/lib/addons/queries";
import { emitCartChanged } from "@/components/cart/cart-events";
import { cn } from "@/lib/utils";

type Selection = { ids: string[]; toggle: (id: string, on: boolean) => void; clear: () => void };

const AddonSelectionContext = createContext<Selection | null>(null);

/** Add-ons ticked on a product page; the main buy button adds them together with the product. */
export function useAddonSelection(): Selection | null {
  return useContext(AddonSelectionContext);
}

export function AddonSelectionProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  return (
    <AddonSelectionContext.Provider
      value={{
        ids,
        toggle: (id, on) => setIds((s) => (on ? (s.includes(id) ? s : [...s, id]) : s.filter((x) => x !== id))),
        clear: () => setIds([]),
      }}
    >
      {children}
    </AddonSelectionContext.Provider>
  );
}

type Props = {
  productId: string;
  productSlug: string;
  addons: StorefrontAddon[];
  /** Main product's price (satang) when it has no options; null otherwise (the picker shows it). */
  mainPrice: number | null;
  /** The main buy button can still add the product; otherwise the picker adds the add-ons itself. */
  mainAddable: boolean;
};

/**
 * Optional extras to buy together with the product (client request, UAT round 3). Each is sold at
 * its own normal price — buying together never makes anything cheaper. Prices and states come
 * from the server; it re-checks everything when adding.
 */
export function AddonPicker({ productId, productSlug, addons, mainPrice, mainAddable }: Props) {
  const t = useTranslations("shop.addons");
  const locale = useLocale();
  const router = useRouter();
  const selection = useAddonSelection();
  const [pending, startTransition] = useTransition();
  if (!selection || addons.length === 0) return null;

  const money = (satang: number) => formatTHB(satang, intlLocale(locale).number);
  const picked = addons.filter((a) => selection.ids.includes(a.productId));
  const extra = picked.reduce((sum, a) => sum + a.price.finalPrice, 0);

  function addOnly() {
    startTransition(async () => {
      const result = await addAddonsToCart(productId, selection!.ids);
      if (!result.ok) {
        if (result.code === "LOGIN_REQUIRED") router.push(`/login?next=${encodeURIComponent(`/${locale}/product/${productSlug}`)}`);
        else toast.error(t("addFailed"));
        return;
      }
      toast.success(t("added", { count: result.added }));
      selection!.clear();
      emitCartChanged();
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="addons-heading" className="space-y-3 rounded-3xl bg-background/80 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <PackagePlus className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
        <div className="space-y-0.5">
          <h2 id="addons-heading" className="text-lg">
            {t("title")}
          </h2>
          <p className="text-sm text-foreground/70">{t("hint")}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {addons.map((a) => {
          const selectable = a.state === "available" || a.state === "guest";
          const on = selection.ids.includes(a.productId);
          const id = `addon-${a.productId}`;
          return (
            <li key={a.productId}>
              <label
                htmlFor={selectable ? id : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-2.5 pr-3 transition-colors",
                  selectable ? "cursor-pointer hover:bg-muted/50" : "bg-muted/40",
                  on && "border-brand-strong/50 bg-accent/50",
                )}
              >
                {selectable ? (
                  <input
                    id={id}
                    type="checkbox"
                    checked={on}
                    onChange={(e) => selection.toggle(a.productId, e.target.checked)}
                    className="size-4 shrink-0 accent-brand-strong"
                  />
                ) : (
                  <Check className="size-4 shrink-0 text-success" aria-hidden />
                )}
                <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {a.imageUrl && <PreviewImage src={a.imageUrl} alt="" fill sizes="48px" className="object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/product/${a.slug}`}
                    className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {a.name}
                  </Link>
                  {!selectable && <span className="block text-xs text-muted-foreground">{t(`state.${a.state}`)}</span>}
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  {a.price.isDiscounted && (
                    <span className="block text-xs text-muted-foreground line-through">{money(a.price.unitPrice)}</span>
                  )}
                  <span className="font-medium">+{money(a.price.finalPrice)}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {picked.length > 0 && (
        <div className="space-y-2 border-t border-foreground/10 pt-3 text-sm" aria-live="polite">
          <p className="flex justify-between gap-3">
            <span>{t("extra", { count: picked.length })}</span>
            <span className="font-medium tabular-nums">+{money(extra)}</span>
          </p>
          {mainPrice !== null && mainAddable && (
            <p className="flex justify-between gap-3 text-base font-semibold">
              <span>{t("total")}</span>
              <span className="tabular-nums">{money(mainPrice + extra)}</span>
            </p>
          )}
          {mainAddable ? (
            <p className="text-xs text-foreground/70">{t("addedWithMain")}</p>
          ) : (
            <Button className="h-11 w-full rounded-full" onClick={addOnly} disabled={pending} aria-busy={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} {t("addSelected")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
