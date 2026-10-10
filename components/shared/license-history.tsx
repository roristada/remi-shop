import { cn } from "@/lib/utils";

export type LicenseHistoryEntry = {
  id: string;
  title: string;
  when: string;
  /** Who acted, when it should be shown (admin view only). */
  actor?: string | null;
  lines: string[];
  tone?: "default" | "store" | "positive" | "negative";
};

const DOT: Record<NonNullable<LicenseHistoryEntry["tone"]>, string> = {
  default: "bg-muted-foreground/40",
  store: "bg-warning",
  positive: "bg-success",
  negative: "bg-destructive",
};

/** A license request's history, oldest first. Text is pre-rendered by the page (customer or admin wording). */
export function LicenseHistory({ title, entries }: { title: string; entries: LicenseHistoryEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="license-history" className="space-y-3">
      <h2 id="license-history" className="text-lg font-semibold">
        {title}
      </h2>
      <ol className="space-y-0">
        {entries.map((e, i) => (
          <li key={e.id} className="relative grid grid-cols-[1rem_1fr] gap-3 pb-4 last:pb-0">
            {i < entries.length - 1 && <span aria-hidden className="absolute top-3 bottom-0 left-[0.4375rem] w-px bg-border" />}
            <span aria-hidden className={cn("relative mt-1.5 size-2.5 justify-self-center rounded-full", DOT[e.tone ?? "default"])} />
            <div className="min-w-0 space-y-1">
              <p className="text-sm">
                <span className="font-medium">{e.title}</span>
                <span className="text-muted-foreground"> · {e.when}</span>
                {e.actor && <span className="text-muted-foreground"> · {e.actor}</span>}
              </p>
              {e.lines.length > 0 && (
                <ul className="space-y-0.5 text-sm break-words whitespace-pre-line text-foreground/80">
                  {e.lines.map((line, j) => (
                    <li key={j}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
