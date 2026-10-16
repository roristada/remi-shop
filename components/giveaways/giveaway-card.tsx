import { getLocale, getTranslations } from "next-intl/server";
import { Gift, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/localize";
import { PreviewImage } from "@/components/shared/preview-image";
import { formatBangkokDateTime } from "@/lib/datetime";
import type { PublicGiveawayCard } from "@/lib/giveaways/queries";
import type { GiveawayPhase } from "@/lib/giveaways/rules";
import { cn } from "@/lib/utils";

export const PHASE_CHIP: Record<Exclude<GiveawayPhase, "DRAFT">, string> = {
  UPCOMING: "bg-secondary text-secondary-foreground",
  OPEN: "bg-primary text-primary-foreground",
  CLOSED: "bg-muted text-muted-foreground",
  DRAWN: "bg-muted text-foreground",
};

export async function GiveawayCard({ giveaway: g }: { giveaway: PublicGiveawayCard }) {
  const t = await getTranslations("giveaways");
  const locale = await getLocale();
  const date = (d: Date) => formatBangkokDateTime(d, intlLocale(locale).date);
  const phase = g.phase === "DRAFT" ? "UPCOMING" : g.phase;
  const when = phase === "UPCOMING" ? t("opensAt", { date: date(g.startsAt) }) : phase === "OPEN" ? t("closesAt", { date: date(g.endsAt) }) : t("closedAt", { date: date(g.endsAt) });

  return (
    <Link
      href={`/giveaways/${g.slug}`}
      className="group flex w-full flex-col overflow-hidden rounded-3xl border bg-card shadow-soft transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <span className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-secondary/50">
        {g.imageUrl ? (
          <PreviewImage src={g.imageUrl} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <Gift className="size-10 text-brand-strong/60" aria-hidden />
        )}
        <span className={cn("absolute top-3 left-3 rounded-full px-2.5 py-1 text-xs font-medium", PHASE_CHIP[phase])}>{t(`phase.${phase}`)}</span>
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-4">
        <span className="line-clamp-2 font-semibold">{g.title}</span>
        <span className="text-xs text-muted-foreground">{when}</span>
        <span className="mt-auto flex items-center gap-3 pt-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden /> {t("entries", { count: g.entries })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Gift className="size-3.5" aria-hidden /> {t("winnersCount", { count: g.winners })}
          </span>
        </span>
      </span>
    </Link>
  );
}
