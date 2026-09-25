import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, Clock3 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { intlLocale, localized } from "@/i18n/localize";
import { requireUser } from "@/lib/auth/guards";
import { formatBangkokDateTime } from "@/lib/datetime";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import { getOrderForUser, getPaymentSettings, type CustomerOrder } from "@/lib/orders/queries";
import { orderNumberSchema } from "@/lib/orders/validation";
import { previewImageUrl } from "@/lib/storage/public-url";
import { BUCKETS } from "@/lib/storage/buckets";
import { createSignedViewUrls } from "@/lib/storage/payment-storage";
import { canUploadSlip } from "@/lib/payments/rules";
import { SlipUpload } from "@/components/cart/slip-upload";
import { OrderStatusBadge } from "@/components/cart/order-status-badge";
import { CancelOrderButton } from "@/components/cart/cancel-order-button";
import { CountdownTimer } from "@/components/shop/countdown-timer";

export async function generateMetadata({ params }: PageProps<"/[locale]/orders/[orderNumber]">): Promise<Metadata> {
  const { locale, orderNumber } = await params;
  const t = await getTranslations({ locale, namespace: "cart.meta" });
  return { title: t("order", { orderNumber: orderNumber.toUpperCase() }), robots: { index: false } };
}

export default async function OrderPage({ params }: PageProps<"/[locale]/orders/[orderNumber]">) {
  const { locale, orderNumber: raw } = await params;
  setRequestLocale(locale);
  const user = await requireUser(`/${locale}/login?next=${encodeURIComponent(`/${locale}/orders/${raw}`)}`);
  const parsed = orderNumberSchema.safeParse(raw);
  if (!parsed.success) notFound();

  const now = new Date();
  // Another customer's order number resolves to 404, exactly like a missing one.
  const order = await getOrderForUser(user.id, parsed.data, now);
  if (!order) notFound();

  const t = await getTranslations("cart");
  const fmt = intlLocale(locale);
  const money = (v: CustomerOrder["total"]) => formatTHB(toHundredths(v), fmt.number);
  const canPay = canUploadSlip(order, now);
  const showPanel = canPay || order.status === "WAITING_REVIEW";
  const discount = toHundredths(order.discount);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:py-12">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> {t("order.back")}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-sans text-2xl font-semibold tabular-nums sm:text-3xl">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {t("order.placedAt", { date: formatBangkokDateTime(order.createdAt, fmt.date) })}
          </p>
        </div>
        <OrderStatusBadge status={order.status} className="h-7 px-3 text-sm" />
      </div>

      <StatusNotice order={order} t={t} />

      <div className={showPanel ? "grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]" : "grid gap-8"}>
        <section aria-labelledby="items-heading" className="space-y-4">
          <h2 id="items-heading" className="text-lg">
            {t("order.items")}
          </h2>
          <ul className="divide-y rounded-3xl border">
            {order.items.map((item) => {
              const itemDiscount = toHundredths(item.discount);
              return (
                <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <Link href={`/product/${item.product.slug}`} className="font-semibold hover:underline">
                      {localized(locale, item.productNameTHSnapshot, item.productNameENSnapshot)}
                    </Link>
                    {item.productVersionSnapshot && (
                      <p className="text-xs text-muted-foreground">
                        {t("order.version", { version: item.productVersionSnapshot })}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-right tabular-nums">
                    <span className="font-semibold">{money(item.finalPrice)}</span>
                    {itemDiscount > 0 && (
                      <s className="block text-xs text-muted-foreground">{money(item.unitPrice)}</s>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          <dl className="space-y-1.5 px-1 text-sm">
            {discount > 0 && (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("cart.subtotal")}</dt>
                  <dd className="tabular-nums">{money(order.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("cart.discount")}</dt>
                  <dd className="text-brand-strong tabular-nums">−{money(order.discount)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between text-base">
              <dt className="font-semibold">{t("cart.total")}</dt>
              <dd className="font-semibold tabular-nums">{money(order.total)}</dd>
            </div>
          </dl>
        </section>

        {canPay && <PaymentPanel order={order} locale={locale} now={now} />}
        {order.status === "WAITING_REVIEW" && <ReviewPanel order={order} locale={locale} />}
      </div>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"cart">>>;

function StatusNotice({ order, t }: { order: CustomerOrder; t: T }) {
  let text: string | null = null;
  if (order.status === "CANCELLED") {
    // Auto-cancelled at the unpaid deadline (never had a slip), as opposed to cancelled by the customer.
    const expired = order.paymentStatus === null && order.cancelledAt && order.cancelledAt >= order.expiresAt;
    text = expired ? t("order.expiredNotice") : t("order.cancelledNotice");
  } else if (order.status === "COMPLETED") {
    text = t("order.completedNotice");
  }
  if (!text) return null;
  return (
    <p role="status" className="rounded-2xl bg-muted px-4 py-3 text-sm">
      {text}
    </p>
  );
}

async function PaymentPanel({ order, locale, now }: { order: CustomerOrder; locale: string; now: Date }) {
  const [t, tSlip, settings] = await Promise.all([
    getTranslations("cart.order"),
    getTranslations("cart.slip"),
    getPaymentSettings(),
  ]);
  const rejected = order.status === "PAYMENT_REJECTED" ? order.payments[0] : undefined;
  const fmt = intlLocale(locale);
  const hasPaymentInfo = Boolean(settings && (settings.qrImagePath || settings.promptPayNumber));
  const instructions = settings ? localized(locale, settings.instructionsTH, settings.instructionsEN) : null;

  return (
    <aside aria-labelledby="pay-heading" className="h-fit space-y-4 rounded-3xl bg-secondary/45 p-5 sm:p-6">
      <h2 id="pay-heading" className="text-lg">
        {t("payTitle")}
      </h2>
      {rejected ? (
        <div role="alert" className="space-y-1 rounded-2xl bg-destructive/10 px-4 py-3 text-sm">
          <p className="font-semibold text-destructive">{tSlip("rejectedTitle")}</p>
          {rejected.rejectReason && <p>{tSlip("rejectedReason", { reason: rejected.rejectReason })}</p>}
          <p className="text-foreground/70">{tSlip("rejectedHint")}</p>
        </div>
      ) : (
        <>
          <CountdownTimer
            endsAt={order.expiresAt.toISOString()}
            serverNow={now.toISOString()}
            label={t("timeLeft")}
            endedLabel={t("expiredNotice")}
          />
          <p className="text-sm text-foreground/70">
            {t("payBefore", { date: formatBangkokDateTime(order.expiresAt, fmt.date) })}
          </p>
        </>
      )}

      {hasPaymentInfo && settings ? (
        <div className="space-y-4">
          {settings.qrImagePath && (
            <div className="relative mx-auto aspect-square w-full max-w-64 overflow-hidden rounded-2xl bg-white p-3">
              <Image
                src={previewImageUrl(settings.qrImagePath)}
                alt={t("qrAlt")}
                fill
                sizes="256px"
                className="object-contain p-3"
              />
            </div>
          )}
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-foreground/70">{t("amount")}</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {formatTHB(toHundredths(order.total), fmt.number)}
              </dd>
            </div>
            {settings.promptPayName && (
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/70">{t("accountName")}</dt>
                <dd className="text-right font-medium">{settings.promptPayName}</dd>
              </div>
            )}
            {settings.promptPayNumber && (
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/70">{t("promptPay")}</dt>
                <dd className="font-medium tabular-nums">{settings.promptPayNumber}</dd>
              </div>
            )}
          </dl>
          {instructions && <p className="text-sm whitespace-pre-line text-foreground/70">{instructions}</p>}
        </div>
      ) : (
        <p role="alert" className="rounded-xl bg-background px-3 py-2 text-sm">
          {t("noPaymentInfo")}
        </p>
      )}

      {hasPaymentInfo && <SlipUpload orderNumber={order.orderNumber} />}
      <div className="flex justify-center">
        <CancelOrderButton orderNumber={order.orderNumber} />
      </div>
    </aside>
  );
}

/** Slip under review: show what was sent; nothing to do until the store decides. */
async function ReviewPanel({ order, locale }: { order: CustomerOrder; locale: string }) {
  const t = await getTranslations("cart.slip");
  const slip = order.payments[0];
  const urls = slip ? await createSignedViewUrls(BUCKETS.paymentSlips, [slip.slipPath]) : new Map<string, string>();
  const url = slip ? urls.get(slip.slipPath) : undefined;

  return (
    <aside aria-labelledby="review-heading" className="h-fit space-y-4 rounded-3xl bg-secondary/45 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
        <div className="space-y-1">
          <h2 id="review-heading" className="text-lg">
            {t("reviewTitle")}
          </h2>
          <p className="text-sm text-foreground/70">{t("reviewBody")}</p>
          {slip && (
            <p className="text-xs text-foreground/70">
              {t("reviewSentAt", { date: formatBangkokDateTime(slip.createdAt, intlLocale(locale).date) })}
            </p>
          )}
        </div>
      </div>
      {url && (
        <figure className="space-y-1.5">
          {/* Short-lived signed URL to this customer's own slip in the private bucket. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={t("yourSlip")} className="max-h-80 w-full rounded-xl border bg-background object-contain" />
          <figcaption className="text-xs text-foreground/70">{t("yourSlip")}</figcaption>
        </figure>
      )}
    </aside>
  );
}
