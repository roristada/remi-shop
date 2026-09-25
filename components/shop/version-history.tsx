import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { intlLocale, localized } from "@/i18n/localize";
import { BUSINESS_TIMEZONE } from "@/lib/datetime";

export type VersionHistoryItem = {
  id: string;
  versionNumber: string;
  releaseDate: Date;
  releaseNotesTH: string | null;
  releaseNotesEN: string | null;
  isLatest: boolean;
};

export function VersionHistory({ versions }: { versions: VersionHistoryItem[] }) {
  const t = useTranslations("shop.product");
  const locale = useLocale();
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale).date, { timeZone: BUSINESS_TIMEZONE, dateStyle: "medium" });

  return (
    <ol className="space-y-4 border-l-2 border-secondary pl-5">
      {versions.map((v) => {
        const notes = localized(locale, v.releaseNotesTH, v.releaseNotesEN);
        return (
          <li key={v.id} className="relative">
            <span aria-hidden className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-background bg-primary" />
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">v{v.versionNumber}</h3>
              {v.isLatest && <Badge variant="secondary">{t("latest")}</Badge>}
              <time dateTime={v.releaseDate.toISOString()} className="text-xs text-muted-foreground">
                {t("released", { date: dateFormat.format(v.releaseDate) })}
              </time>
            </div>
            <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{notes || t("noNotes")}</p>
          </li>
        );
      })}
    </ol>
  );
}
