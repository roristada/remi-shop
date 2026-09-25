import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ImageOff, ShoppingBag } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/localize";
import { requireUser } from "@/lib/auth/guards";
import { getCartView } from "@/lib/cart/queries";
import { formatTHB } from "@/lib/pricing/calculate";
import { Button } from "@/components/ui/button";
import { ProductPrice } from "@/components/shop/product-price";
import { PageHeading } from "@/components/shop/page-heading";
import { CheckoutButton, RemoveFromCartButton } from "@/components/cart/cart-controls";

export async function generateMetadata({ params }: PageProps<"/[locale]/cart">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cart.meta" });
  return { title: t("cart"), robots: { index: false } };
}

export default async function CartPage({ params }: PageProps<"/[locale]/cart">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(`/${locale}/login?next=${encodeURIComponent(`/${locale}/cart`)}`);
  const [t, { lines, totals }] = await Promise.all([getTranslations("cart"), getCartView(user.id, locale)]);
  const money = (satang: number) => formatTHB(satang, intlLocale(locale).number);
  const hasProblem = lines.some((l) => l.problem);

  if (lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-secondary">
          <ShoppingBag className="size-6" aria-hidden />
        </span>
        <h1 className="text-2xl">{t("cart.empty")}</h1>
        <p className="text-muted-foreground">{t("cart.emptyHint")}</p>
        <Button asChild className="h-11 rounded-full px-6">
          <Link href="/shop">{t("cart.browse")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-12">
      <PageHeading title={t("cart.title")} subtitle={t("cart.itemCount", { count: lines.length })} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ul className="divide-y">
          {lines.map((line) => (
            <li key={line.productId} className="flex gap-4 py-4 first:pt-0">
              <Link
                href={`/product/${line.slug}`}
                className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-secondary/60 sm:size-24"
                tabIndex={-1}
                aria-hidden
              >
                {line.image ? (
                  <Image src={line.image.url} alt="" fill sizes="96px" className="object-cover" />
                ) : (
                  <ImageOff className="absolute inset-0 m-auto size-5 text-muted-foreground" />
                )}
              </Link>
              <div className="min-w-0 flex-1 space-y-1">
                <Link href={`/product/${line.slug}`} className="line-clamp-2 font-semibold hover:underline">
                  {line.name}
                </Link>
                {line.problem ? (
                  <p className="text-sm font-medium text-destructive">{t(`cart.problem.${line.problem}`)}</p>
                ) : (
                  <ProductPrice price={line.price} />
                )}
              </div>
              <RemoveFromCartButton productId={line.productId} name={line.name} />
            </li>
          ))}
        </ul>

        <aside aria-labelledby="summary-heading" className="h-fit space-y-4 rounded-3xl bg-secondary/45 p-5 sm:p-6 lg:sticky lg:top-24">
          <h2 id="summary-heading" className="text-lg">
            {t("cart.summary")}
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-foreground/70">{t("cart.subtotal")}</dt>
              <dd className="tabular-nums">{money(totals.subtotal)}</dd>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/70">{t("cart.discount")}</dt>
                <dd className="text-brand-strong tabular-nums">−{money(totals.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-foreground/10 pt-3 text-base">
              <dt className="font-semibold">{t("cart.total")}</dt>
              <dd className="text-xl font-semibold tabular-nums">{money(totals.total)}</dd>
            </div>
          </dl>
          {hasProblem && (
            <p role="alert" className="rounded-xl bg-background px-3 py-2 text-sm text-destructive">
              {t("cart.problemNotice")}
            </p>
          )}
          <CheckoutButton expectedTotal={totals.total} disabled={hasProblem} />
          <p className="text-center text-xs text-foreground/70">{t("cart.checkoutHint")}</p>
        </aside>
      </div>
    </div>
  );
}
