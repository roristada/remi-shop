import { useLocale, useTranslations } from "next-intl";
import { FileArchive } from "lucide-react";
import { intlLocale } from "@/i18n/localize";

/** `variantName` is set for a file only buyers of that variant get. */
export type FileListItem = { id: string; fileName: string; fileSize: number; variantName?: string | null };

function formatSize(bytes: number, locale: string) {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${nf.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${nf.format(bytes / 1024)} KB`;
  return `${nf.format(bytes / (1024 * 1024))} MB`;
}

/** File names and sizes only. Download links are never rendered on public pages. */
export function FileList({ files }: { files: FileListItem[] }) {
  const t = useTranslations("shop.product");
  const locale = intlLocale(useLocale()).number;
  return (
    <div className="space-y-2">
      <h3 className="text-sm">
        {t("files")} <span className="font-normal text-muted-foreground">({t("fileCount", { count: files.length })})</span>
      </h3>
      <ul className="divide-y rounded-xl border">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <FileArchive className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate" title={f.fileName}>
              {f.fileName}
            </span>
            {f.variantName && (
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">{f.variantName}</span>
            )}
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatSize(f.fileSize, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
