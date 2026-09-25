import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, ReceiptText } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/localize";
import { requireUser } from "@/lib/auth/guards";
import { formatBangkokDateTime } from "@/lib/datetime";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import { listOrdersForUser } from "@/lib/orders/queries";
import { PageHeading } from "@/components/shop/page-heading";
import { ShopPagination } from "@/components/shop/shop-pagination";
import { OrderStatusBadge } from "@/components/cart/order-status-badge";

export async function generateMetadata({ params }: PageProps<"/[locale]/orders">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cart.meta" });
  return { title: t("orders"), robots: { index: false } };
}

export default async function OrdersPage({ params, searchParams }: PageProps<"/[locale]/orders">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(`/${locale}/login?next=${encodeURIComponent(`/${locale}/orders`)}`);
  const pageParam = (await searchParams).page;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(typeof pageParam === "string" ? pageParam : "1", 10) || 1));

  const [t, { items, pageCount }] = await Promise.all([getTranslations("cart.orders"), listOrdersForUser(user.id, page)]);
  const fmt = intlLocale(locale);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-12">
      <PageHeading title={t("title")} />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-secondary/45 px-4 py-16 text-center">
          <ReceiptText className="size-6 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t("empty")}</p>
        </div>
      ) : (
        <ul className="divide-y rounded-3xl border">
          {items.map((o) => (
            <li key={o.id}>
              <Link
                href={`/orders/${o.orderNumber}`}
                className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-secondary/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-5"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold tabular-nums">{o.orderNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatBangkokDateTime(o.createdAt, fmt.date)}, {t("items", { count: o._count.items })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="font-semibold tabular-nums">{formatTHB(toHundredths(o.total), fmt.number)}</span>
                  <OrderStatusBadge status={o.status} />
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ShopPagination page={page} pageCount={pageCount} params={{}} path="/orders" />
    </div>
  );
}
