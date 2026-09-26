import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BriefcaseBusiness, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { intlLocale, localized } from "@/i18n/localize";
import { requireUser } from "@/lib/auth/guards";
import { formatBangkokDateTime } from "@/lib/datetime";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import { listLicenseRequestsForUser, type CustomerLicenseRequest } from "@/lib/licenses/queries";
import { canCancelLicenseRequest, licenseStage, type LicenseStage } from "@/lib/licenses/rules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-fields";
import { ShopPagination } from "@/components/shop/shop-pagination";
import { CancelLicenseButton } from "@/components/account/cancel-license-button";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/licenses">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.licenses" });
  return { title: t("title"), robots: { index: false } };
}

// The label is always shown, so status is never conveyed by color alone.
const STAGE_STYLES: Record<LicenseStage, string> = {
  REVIEW: "bg-secondary text-secondary-foreground",
  AWAITING_PAYMENT: "bg-primary/60 text-foreground",
  PAYMENT_REVIEW: "bg-secondary text-secondary-foreground",
  PAYMENT_REJECTED: "bg-destructive/10 text-destructive",
  ACTIVE: "bg-success/10 text-success",
  REJECTED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
  PAYMENT_CANCELLED: "bg-muted text-muted-foreground",
};

export default async function AccountLicensesPage({ params, searchParams }: PageProps<"/[locale]/account/licenses">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(`/${locale}/login?next=${encodeURIComponent(`/${locale}/account/licenses`)}`);
  const sp = await searchParams;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));

  const [t, { items, pageCount }] = await Promise.all([
    getTranslations("account.licenses"),
    listLicenseRequestsForUser(user.id, page),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      {sp.submitted === "1" && <FormMessage tone="success">{t("submitted")}</FormMessage>}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-secondary/45 px-4 py-16 text-center">
          <BriefcaseBusiness className="size-6 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t("empty")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((r) => (
            <LicenseCard key={r.id} request={r} locale={locale} t={t} />
          ))}
        </ul>
      )}
      <ShopPagination page={page} pageCount={pageCount} params={{}} path="/account/licenses" />
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"account.licenses">>>;

function LicenseCard({ request: r, locale, t }: { request: CustomerLicenseRequest; locale: string; t: T }) {
  const fmt = intlLocale(locale);
  const stage = licenseStage(r.status, r.order?.status ?? null);
  const payable = r.order && (stage === "AWAITING_PAYMENT" || stage === "PAYMENT_REJECTED");

  return (
    <li className="space-y-4 rounded-3xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link href={`/product/${r.product.slug}`} className="font-semibold hover:underline">
            {localized(locale, r.productNameTHSnapshot, r.productNameENSnapshot)}
          </Link>
          <p className="text-xs text-muted-foreground">
            {t("requestedAt", { date: formatBangkokDateTime(r.createdAt, fmt.date) })}
          </p>
        </div>
        <Badge className={cn("h-7 px-3 text-sm", STAGE_STYLES[stage])}>{t(`stage.${stage}`)}</Badge>
      </div>

      <ul className="divide-y rounded-2xl bg-secondary/35 text-sm">
        {r.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-3 px-4 py-2">
            <span className="min-w-0">{localized(locale, i.nameTHSnapshot, i.nameENSnapshot)}</span>
            <span className="shrink-0 tabular-nums">{formatTHB(toHundredths(i.price), fmt.number)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 px-4 py-2 font-semibold">
          <span>{t("total")}</span>
          <span className="tabular-nums">{formatTHB(toHundredths(r.total), fmt.number)}</span>
        </li>
      </ul>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("buyer")}</dt>
        <dd className="break-words">{r.buyerName}</dd>
        <dt className="text-muted-foreground">{t("artist")}</dt>
        <dd className="break-words">{r.artistName}</dd>
        <dt className="text-muted-foreground">{t("platform")}</dt>
        <dd className="break-words">{r.platform}</dd>
        {r.order && (
          <>
            <dt className="text-muted-foreground">{t("orderNumber")}</dt>
            <dd className="tabular-nums">
              <Link href={`/orders/${r.order.orderNumber}`} className="underline-offset-4 hover:underline">
                {r.order.orderNumber}
              </Link>
            </dd>
          </>
        )}
        {r.status === "APPROVED" && r.reviewedAt && (
          <>
            <dt className="text-muted-foreground">{t("approvedAt")}</dt>
            <dd>{formatBangkokDateTime(r.reviewedAt, fmt.date)}</dd>
          </>
        )}
        {stage === "ACTIVE" && r.order?.paidAt && (
          <>
            <dt className="text-muted-foreground">{t("paidAt")}</dt>
            <dd>{formatBangkokDateTime(r.order.paidAt, fmt.date)}</dd>
          </>
        )}
      </dl>

      {stage === "REJECTED" && r.rejectReason && (
        <p role="note" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm">
          {t("rejectedReason", { reason: r.rejectReason })}
        </p>
      )}
      {stage === "AWAITING_PAYMENT" && r.order && (
        <p className="text-sm text-foreground/75">
          {t("payBefore", { date: formatBangkokDateTime(r.order.expiresAt, fmt.date) })}
        </p>
      )}

      {(payable || canCancelLicenseRequest(r.status)) && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {payable && r.order && (
            <Button asChild className="h-11 rounded-full px-5">
              <Link href={`/orders/${r.order.orderNumber}`}>
                {t("pay")} <ChevronRight aria-hidden />
              </Link>
            </Button>
          )}
          {canCancelLicenseRequest(r.status) && <CancelLicenseButton requestId={r.id} />}
        </div>
      )}
    </li>
  );
}
