import { getTranslations } from "next-intl/server";
import { Download as DownloadIcon, FileArchive } from "lucide-react";
import { intlLocale } from "@/i18n/localize";
import type { DownloadVersion } from "@/lib/downloads/queries";
import { Badge } from "@/components/ui/badge";

function formatSize(bytes: number, locale: string) {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${nf.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${nf.format(bytes / 1024)} KB`;
  return `${nf.format(bytes / (1024 * 1024))} MB`;
}

/**
 * Owned files grouped by version, each with its remaining quota and a download link. The link
 * points at /api/download, which re-authorizes every click and hands back a short-lived URL.
 */
export async function DownloadVersions({
  versions,
  downloadLimit,
  locale,
}: {
  versions: DownloadVersion[];
  downloadLimit: number | null;
  locale: string;
}) {
  const t = await getTranslations("downloads");
  const fmt = intlLocale(locale).number;

  return (
    <div className="space-y-3">
      {versions.map((v) => (
        <div key={v.id} className="space-y-1.5">
          <p className="flex items-center gap-2 text-sm font-medium">
            {t("version", { version: v.versionNumber })}
            {v.isLatest && <Badge variant="secondary">{t("latest")}</Badge>}
          </p>
          <ul className="divide-y divide-foreground/10">
            {v.files.map((f) => {
              const remaining = downloadLimit === null ? null : Math.max(0, downloadLimit - f.downloadCount);
              const blocked = remaining === 0;
              return (
                <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <FileArchive className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate" title={f.fileName}>
                    {f.fileName}
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                    {formatSize(f.fileSize, fmt)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {downloadLimit === null ? t("unlimitedRemaining") : t("remaining", { count: remaining ?? 0 })}
                  </span>
                  {blocked ? (
                    <span className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                      {t("download")}
                    </span>
                  ) : (
                    <a
                      href={`/api/download/${f.id}?locale=${locale}`}
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                    >
                      <DownloadIcon className="size-3.5" aria-hidden /> {t("download")}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
