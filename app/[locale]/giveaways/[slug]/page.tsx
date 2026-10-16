import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, Gift, ImageOff, Trophy, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/localize";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/guards";
import { getPublicGiveaway, listSubstitutes } from "@/lib/giveaways/queries";
import { formatBangkokDateTime } from "@/lib/datetime";
import { PreviewImage } from "@/components/shared/preview-image";
import { CountdownTimer } from "@/components/shop/countdown-timer";
import { EnterGiveawayButton } from "@/components/giveaways/enter-button";
import { ClaimPanel } from "@/components/giveaways/claim-panel";
import { PHASE_CHIP } from "@/components/giveaways/giveaway-card";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/giveaways/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const g = await getPublicGiveaway(slug, locale, null, new Date());
  if (!g) return {};
  return {
    title: g.title,
    description: g.description.slice(0, 160) || undefined,
    alternates: { canonical: `/${locale}/giveaways/${g.slug}` },
    openGraph: g.imageUrl ? { images: [g.imageUrl] } : undefined,
  };
}

export default async function GiveawayPage({ params }: PageProps<"/[locale]/giveaways/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const now = new Date();
  const user = await getCurrentUser();
  // Admins can preview a draft before publishing it; customers never see one.
  const isAdmin = user !== null && (await getCurrentProfile())?.role === "ADMIN";
  const g = await getPublicGiveaway(slug, locale, user?.id ?? null, now, isAdmin);
  if (!g) notFound();

  const t = await getTranslations("giveaways");
  const date = (d: Date) => formatBangkokDateTime(d, intlLocale(locale).date);
  const mine = g.mine;
  const substitutes = user && mine?.state === "PENDING" && mine.block ? await listSubstitutes(user.id, mine.prizeValue, locale, now) : [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:py-10">
      {g.phase === "DRAFT" && (
        <p role="status" className="rounded-2xl bg-muted px-4 py-3 text-sm font-medium text-muted-foreground">
          ตัวอย่างสำหรับแอดมิน · กิจกรรมนี้ยังเป็นฉบับร่าง ลูกค้ายังไม่เห็น
        </p>
      )}
      <Link href="/giveaways" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> {t("back")}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
        <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-3xl bg-secondary/50">
          {g.imageUrl ? (
            <PreviewImage src={g.imageUrl} alt="" fill priority sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />
          ) : (
            <Gift className="size-16 text-brand-strong/50" aria-hidden />
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            {g.phase !== "DRAFT" && (
              <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", PHASE_CHIP[g.phase])}>{t(`phase.${g.phase}`)}</span>
            )}
            <h1 className="text-2xl sm:text-3xl">{g.title}</h1>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4" aria-hidden /> {t("entries", { count: g.entries })}
              </span>
              <span>
                {g.phase === "UPCOMING" || g.phase === "DRAFT" ? t("opensAt", { date: date(g.startsAt) }) : g.phase === "OPEN" ? t("closesAt", { date: date(g.endsAt) }) : t("closedAt", { date: date(g.endsAt) })}
              </span>
            </p>
          </div>

          {(g.phase === "OPEN" || g.phase === "UPCOMING") && (
            <CountdownTimer
              endsAt={(g.phase === "OPEN" ? g.endsAt : g.startsAt).toISOString()}
              serverNow={now.toISOString()}
              label={g.phase === "OPEN" ? t("countdownOpen") : t("countdownUpcoming")}
              endedLabel={t("countdownEnded")}
            />
          )}

          {mine && (
            <ClaimPanel
              winnerId={mine.winnerId}
              state={mine.state}
              block={mine.block}
              prizeValue={mine.prizeValue}
              claimDeadline={mine.claimDeadline.toISOString()}
              serverNow={now.toISOString()}
              orderNumber={mine.orderNumber}
              prize={mine.prize && { name: mine.prize.name, variantName: mine.prize.variantName, imageUrl: mine.prize.imageUrl }}
              substitutes={substitutes}
            />
          )}

          {!mine &&
            (g.disqualified ? (
              <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">{t("disqualified")}</p>
            ) : g.phase === "OPEN" ? (
              <EnterGiveawayButton giveawayId={g.id} slug={g.slug} signedIn={user !== null} initialEntered={g.entered} />
            ) : g.entered && g.phase === "CLOSED" ? (
              <EnterGiveawayButton giveawayId={g.id} slug={g.slug} signedIn initialEntered />
            ) : g.phase !== "DRAWN" ? (
              <p className="rounded-2xl bg-muted p-4 text-center text-sm font-medium text-muted-foreground">
                {g.phase === "UPCOMING" || g.phase === "DRAFT" ? t("notOpenYet") : t("closed")}
              </p>
            ) : null)}

          <p className="text-xs text-muted-foreground">{t("rules")}</p>
        </div>
      </div>

      <section aria-labelledby="prizes" className="space-y-4">
        <h2 id="prizes" className="text-lg font-semibold">
          {t("prizes")}
        </h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {g.prizes.map((p) => (
            <li key={p.id} className="space-y-2">
              <span className="relative grid aspect-square place-items-center overflow-hidden rounded-2xl bg-muted">
                {p.imageUrl ? (
                  <PreviewImage src={p.imageUrl} alt="" fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" className="object-cover" />
                ) : (
                  <ImageOff className="size-6 text-muted-foreground" aria-hidden />
                )}
                <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium">
                  {t("prizeWinners", { count: p.winnerCount })}
                </span>
              </span>
              <p className="text-sm font-medium">
                {p.productSlug ? (
                  <Link href={`/product/${p.productSlug}`} className="hover:underline">
                    {p.name}
                  </Link>
                ) : (
                  p.name
                )}
                {p.variantName && <span className="text-muted-foreground"> · {p.variantName}</span>}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {g.phase === "DRAWN" && (
        <section aria-labelledby="results" className="space-y-4">
          <h2 id="results" className="flex items-center gap-2 text-lg font-semibold">
            <Trophy className="size-5 text-brand-strong" aria-hidden /> {t("results")}
          </h2>
          {g.winners.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("resultsEmpty")}</p>
          ) : (
            <ul className="divide-y rounded-2xl border bg-card">
              {g.winners.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="font-medium">{w.name}</span>
                  <span className="text-muted-foreground">{w.prizeName}</span>
                  <span className="text-xs text-muted-foreground">{t(`winnerState.${w.state}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {g.description && (
        <section aria-labelledby="details" className="space-y-3">
          <h2 id="details" className="text-lg font-semibold">
            {t("details")}
          </h2>
          <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line text-foreground/80">{g.description}</p>
        </section>
      )}
    </div>
  );
}
