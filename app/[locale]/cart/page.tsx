import type { Metadata } from "next";
import { PreviewImage } from "@/components/shared/preview-image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download, FileArchive, ImageOff, ShoppingBag } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/localize";
import { requireUser } from "@/lib/auth/guards";
import { getCartView, type CartLineView } from "@/lib/cart/queries";
import { getOrderExpiryMinutes } from "@/lib/orders/queries";
import { formatTHB } from "@/lib/pricing/calculate";
import { formatBangkokDateTime } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { ProductPrice } from "@/components/shop/product-price";
import { DiscountBadge } from "@/components/shop/discount-badge";
import { PageHeading } from "@/components/shop/page-heading";
import { CheckoutButton, RemoveFromCartButton } from "@/components/cart/cart-controls";
import { BackLink } from "@/components/shared/back-link";
import { lineKey } from "@/lib/orders/rules";

export async function generateMetadata({ params }: PageProps<"/[locale]/cart">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cart.meta" });
  return { title: t("cart"), robots: { index: false } };
}

function formatSize(bytes: number, locale: string) {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes < 1024 * 1024) return `${nf.format(bytes / 1024)} KB`;
  return `${nf.format(bytes / (1024 * 1024))} MB`;
}

type T = Awaited<ReturnType<typeof getTranslations<"cart">>>;

function CartItem({ line, locale, t }: { line: CartLineView; locale: string; t: T }) {
  const fmt = intlLocale(locale);
  const { price } = line;
  const meta = [line.categoryName, line.softwareTags.join(", ")].filter(Boolean).join(" · ");

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-5 sm:p-5">
      <Link
        href={`/product/${line.slug}`}
        className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-secondary/60 ring-1 ring-foreground/5 ring-inset sm:size-28"
        tabIndex={-1}
        aria-hidden
      >
        {line.image ? (
          <PreviewImage src={line.image.url} alt="" fill sizes="112px" className="object-cover" />
        ) : (
          <ImageOff className="absolute inset-0 m-auto size-5 text-muted-foreground" />
        )}
      </Link>

      <div className="min-w-0 space-y-2">
        <div className="space-y-0.5">
          {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
          <Link href={`/product/${line.slug}`} className="line-clamp-2 font-semibold hover:underline">
            {line.name}
          </Link>
          {line.variantName && (
            <p className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs">{line.variantName}</p>
          )}
        </div>

        {/* What the buyer actually receives: file metadata only, never a download link. */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="inline-flex items-center gap-1.5">
            <FileArchive className="size-3.5" aria-hidden />
            {line.version && line.version.fileCount > 0
              ? t("cart.fileSummary", { count: line.version.fileCount, size: formatSize(line.version.totalBytes, fmt.number) })
              : t("cart.noFiles")}
            {line.fileFormat && <span>· {line.fileFormat}</span>}
          </li>
          {line.version && line.version.fileCount > 0 && (
            <li className="inline-flex items-center gap-1.5">
              <Download className="size-3.5" aria-hidden />
              {line.downloadLimit === null ? t("cart.downloadsUnlimited") : t("cart.downloadsLimited", { count: line.downloadLimit })}
            </li>
          )}
        </ul>

        {!line.problem && price.isDiscounted && (
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <DiscountBadge percent={price.discountPercent} />
            {price.discountEndsAt && (
              <span className="text-muted-foreground">
                {t("cart.discountUntil", { date: formatBangkokDateTime(price.discountEndsAt, fmt.date) })}
              </span>
            )}
          </p>
        )}
        {line.problem && <p className="text-sm font-medium text-destructive">{t(`cart.problem.${line.problem}`)}</p>}
      </div>

      {/* Phones: price and remove sit under the details; from sm they form a right-hand column. */}
      <div className="col-span-2 flex items-center justify-between gap-3 border-t pt-3 sm:col-span-1 sm:flex-col sm:items-end sm:justify-between sm:border-t-0 sm:pt-0">
        {!line.problem ? <ProductPrice price={price} className="sm:justify-end" /> : <span />}
        <RemoveFromCartButton
          productId={line.productId}
          variantId={line.variantId}
          name={line.variantName ? `${line.name} · ${line.variantName}` : line.name}
        />
      </div>
    </li>
  );
}

export default async function CartPage({ params }: PageProps<"/[locale]/cart">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(`/${locale}/login?next=${encodeURIComponent(`/${locale}/cart`)}`);
  const [t, { lines, totals }, expiryMinutes] = await Promise.all([
    getTranslations("cart"),
    getCartView(user.id, locale),
    getOrderExpiryMinutes(),
  ]);
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

  // Lines without a file yet are emailed by the store, so the last step must not promise a download.
  const withFiles = lines.filter((l) => l.version && l.version.fileCount > 0).length;
  const step3 = withFiles === lines.length ? "cart.step3" : withFiles === 0 ? "cart.step3Email" : "cart.step3Mixed";
  const steps = [t("cart.step1", { minutes: expiryMinutes }), t("cart.step2"), t(step3)];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-12">
      <BackLink href="/shop">{(await getTranslations("common.state"))("continueShopping")}</BackLink>
      <PageHeading title={t("cart.title")} subtitle={t("cart.itemCount", { count: lines.length })} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-label={t("cart.itemsHeading")} className="overflow-hidden rounded-3xl bg-card shadow-soft ring-1 ring-foreground/5">
          <ul className="divide-y">
            {lines.map((line) => (
              <CartItem key={lineKey(line.productId, line.variantId)} line={line} locale={locale} t={t} />
            ))}
          </ul>
        </section>

        <aside aria-labelledby="summary-heading" className="space-y-5 rounded-3xl bg-card p-5 shadow-soft ring-1 ring-foreground/5 sm:p-6 lg:sticky lg:top-24">
          <h2 id="summary-heading" className="text-lg">
            {t("cart.summary")}
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-foreground/70">
                {t("cart.subtotal")} <span className="text-xs">({t("cart.itemCount", { count: lines.length })})</span>
              </dt>
              <dd className="tabular-nums">{money(totals.subtotal)}</dd>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/70">{t("cart.discount")}</dt>
                <dd className="text-brand-strong tabular-nums">−{money(totals.discount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-4 border-t border-foreground/10 pt-3 text-base">
              <dt className="font-semibold">{t("cart.total")}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{money(totals.total)}</dd>
            </div>
          </dl>
          {hasProblem && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t("cart.problemNotice")}
            </p>
          )}
          <CheckoutButton expectedTotal={totals.total} disabled={hasProblem} />

          {/* The real flow, in order: nothing here is instant, and the page says so. */}
          <div className="space-y-3 rounded-2xl bg-secondary/45 p-4">
            <p className="text-sm font-medium">{t("cart.next")}</p>
            <ol className="space-y-2.5 text-sm">
              {steps.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-xs font-semibold text-background tabular-nums">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-foreground/80">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
