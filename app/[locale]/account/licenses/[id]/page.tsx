import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, MessageSquareWarning, Pencil } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { intlLocale, localized } from "@/i18n/localize";
import { requireUser } from "@/lib/auth/guards";
import { formatBangkokDateTime } from "@/lib/datetime";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import { idSchema } from "@/lib/validation/product";
import { getLicenseRequestDetail } from "@/lib/licenses/queries";
import { listActiveFormFields } from "@/lib/licenses/form-queries";
import { ARTWORK_FIELD_ID } from "@/lib/licenses/form-fields";
import { buildHistory } from "@/lib/licenses/history";
import { canCancelLicenseRequest, canEditLicenseRequest, licenseStage, type LicenseStage } from "@/lib/licenses/rules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-fields";
import { BackLink } from "@/components/shared/back-link";
import { LicenseHistory } from "@/components/shared/license-history";
import { PriceChange } from "@/components/shop/license-request-form";
import { CancelLicenseButton } from "@/components/account/cancel-license-button";
import { AcceptLicensePriceButton } from "@/components/account/accept-license-price-button";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/licenses/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.licenses" });
  return { title: t("title"), robots: { index: false } };
}

// The label is always shown, so status is never conveyed by color alone.
const STAGE_STYLES: Record<LicenseStage, string> = {
  REVIEW: "bg-secondary text-secondary-foreground",
  NEEDS_INFO: "bg-warning/15 text-warning",
  AWAITING_PRICE_CONFIRMATION: "bg-warning/15 text-warning",
  AWAITING_PAYMENT: "bg-primary/60 text-foreground",
  PAYMENT_REVIEW: "bg-secondary text-secondary-foreground",
  PAYMENT_REJECTED: "bg-destructive/10 text-destructive",
  ACTIVE: "bg-success/10 text-success",
  REJECTED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
  PAYMENT_CANCELLED: "bg-muted text-muted-foreground",
};

/** One request: what was sent, what the store asked or changed, what to do next, and the full history. */
export default async function LicenseRequestPage({ params, searchParams }: PageProps<"/[locale]/account/licenses/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const path = `/${locale}/account/licenses/${id}`;
  const user = await requireUser(`/${locale}/login?next=${encodeURIComponent(path)}`);
  await connection(); // Stage and edit window depend on the current time.
  if (!idSchema.safeParse(id).success) notFound();

  const [r, fields, t, sp] = await Promise.all([
    getLicenseRequestDetail(user.id, id),
    listActiveFormFields(),
    getTranslations("account.licenses"),
    searchParams,
  ]);
  if (!r) notFound();

  const fmt = intlLocale(locale);
  const money = (v: { toString(): string }) => formatTHB(toHundredths(v), fmt.number);
  const stage = licenseStage(r.status, r.order?.status ?? null);
  const name = localized(locale, r.productNameTHSnapshot, r.productNameENSnapshot);
  const editable = canEditLicenseRequest(r.status, r.createdAt) && r.status !== "NEEDS_INFO";
  const payable = r.order && (stage === "AWAITING_PAYMENT" || stage === "PAYMENT_REJECTED");

  // Flagged ids → readable labels (current form first, then the request's own answers).
  const labelById = new Map<string, string>([[ARTWORK_FIELD_ID, t("artwork")]]);
  for (const a of r.answers) if (a.fieldId) labelById.set(a.fieldId, localized(locale, a.labelTHSnapshot, a.labelENSnapshot));
  for (const f of fields) labelById.set(f.id, localized(locale, f.labelTH, f.labelEN));
  const flagged = r.infoRequestFields.map((f) => labelById.get(f)).filter(Boolean);

  const history = buildHistory(r.events, {
    title: (type) => t(`event.${type}`),
    date: (d) => formatBangkokDateTime(d, fmt.date),
    money,
    fieldLabel: (fid) => labelById.get(fid) ?? null,
    locale,
    priceLine: (o, n) => t("priceChange", { old: o, new: n }),
    changeLine: (label, before, after) => t("changeLine", { label, before, after }),
    flaggedLine: (labels) => t("flaggedList", { fields: labels }),
    empty: t("empty_value"),
  });

  return (
    <div className="space-y-6">
      <BackLink href="/account/licenses">{t("title")}</BackLink>
      {sp.responded === "1" && <FormMessage tone="success">{t("responded")}</FormMessage>}
      {sp.updated === "1" && <FormMessage tone="success">{t("updated")}</FormMessage>}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl">
            <Link href={`/product/${r.product.slug}`} className="hover:underline">
              {name}
            </Link>
          </h1>
          <p className="text-xs text-muted-foreground">{t("requestedAt", { date: formatBangkokDateTime(r.createdAt, fmt.date) })}</p>
        </div>
        <Badge className={cn("h-7 px-3 text-sm", STAGE_STYLES[stage])}>{t(`stage.${stage}`)}</Badge>
      </div>

      {stage === "NEEDS_INFO" && (
        <section className="space-y-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <MessageSquareWarning className="size-4 text-warning" aria-hidden /> {t("storeNoteTitle")}
          </h2>
          {r.infoRequestMessage && <p className="text-sm whitespace-pre-line">{r.infoRequestMessage}</p>}
          {flagged.length > 0 && <p className="text-sm">{t("flaggedList", { fields: flagged.join(", ") })}</p>}
          {r.proposedTotal && (
            <p className="text-sm">
              {t("priceChange", { old: money(r.total), new: money(r.proposedTotal) })}
              {r.priceChangeReason && ` · ${r.priceChangeReason}`}
            </p>
          )}
          <Button asChild className="h-11 rounded-full px-5">
            <Link href={`/account/licenses/${r.id}/edit`}>
              {t("respond")} <ChevronRight aria-hidden />
            </Link>
          </Button>
        </section>
      )}

      {stage === "AWAITING_PRICE_CONFIRMATION" && r.proposedTotal && (
        <PriceChange
          oldTotal={money(r.total)}
          newTotal={money(r.proposedTotal)}
          reason={r.priceChangeReason}
          labels={{ title: t("newPriceTitle"), old: t("oldPrice"), next: t("newPrice"), reason: t("priceReason") }}
        >
          <div className="flex flex-wrap gap-2 pt-1">
            <AcceptLicensePriceButton requestId={r.id} price={money(r.proposedTotal)} />
            <CancelLicenseButton requestId={r.id} />
          </div>
        </PriceChange>
      )}

      {stage === "REJECTED" && r.rejectReason && (
        <p role="note" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm">
          {t("rejectedReason", { reason: r.rejectReason })}
        </p>
      )}

      <section className="space-y-3 rounded-3xl border p-4 sm:p-5">
        <h2 className="text-lg font-semibold">{t("usageTitle")}</h2>
        <ul className="divide-y divide-foreground/10 text-sm">
          {r.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">{localized(locale, i.nameTHSnapshot, i.nameENSnapshot)}</span>
              <span className="shrink-0 tabular-nums">{money(i.price)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 py-2 font-semibold">
            <span>{t("total")}</span>
            <span className="tabular-nums">{money(r.total)}</span>
          </li>
        </ul>
        {r.order && (
          <p className="text-sm">
            {t("orderNumber")}{" "}
            <Link href={`/orders/${r.order.orderNumber}`} className="tabular-nums underline-offset-4 hover:underline">
              {r.order.orderNumber}
            </Link>
            {stage === "AWAITING_PAYMENT" && ` · ${t("payBefore", { date: formatBangkokDateTime(r.order.expiresAt, fmt.date) })}`}
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-3xl border p-4 sm:p-5">
        <h2 className="text-lg font-semibold">{t("detailsTitle")}</h2>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
          {r.answers.map((a) => (
            <div key={a.id} className="contents">
              <dt className="text-muted-foreground">{localized(locale, a.labelTHSnapshot, a.labelENSnapshot)}</dt>
              <dd className="break-words whitespace-pre-line">
                {(locale === "en" && a.valuesEN.length > 0 ? a.valuesEN : a.values).join(", ")}
              </dd>
            </div>
          ))}
          <dt className="text-muted-foreground">{t("artwork")}</dt>
          <dd>{r.artworkPath ? t("artworkAttachedShort") : t("artworkNone")}</dd>
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {payable && r.order && (
          <Button asChild className="h-11 rounded-full px-5">
            <Link href={`/orders/${r.order.orderNumber}`}>
              {t("pay")} <ChevronRight aria-hidden />
            </Link>
          </Button>
        )}
        {editable && (
          <Button asChild variant="outline" className="h-11 rounded-full px-5">
            <Link href={`/account/licenses/${r.id}/edit`}>
              <Pencil aria-hidden /> {r.artworkPath === null ? t("attachArtwork") : t("edit")}
            </Link>
          </Button>
        )}
        {canCancelLicenseRequest(r.status) && stage !== "AWAITING_PRICE_CONFIRMATION" && <CancelLicenseButton requestId={r.id} />}
      </div>

      <LicenseHistory title={t("historyTitle")} entries={history} />
    </div>
  );
}
