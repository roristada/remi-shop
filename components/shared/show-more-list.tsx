"use client";

import { Children, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

/**
 * A `<ul>` that shows its first `initial` items and a toggle for the rest, so long file lists
 * don't stretch the page. Children must be `<li>` elements.
 */
export function ShowMoreList({
  children,
  initial = 3,
  className,
}: {
  children: ReactNode;
  initial?: number;
  className?: string;
}) {
  const t = useTranslations("common.list");
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const hidden = items.length - initial;

  return (
    <div className="space-y-1.5">
      <ul className={className}>{expanded || hidden <= 0 ? items : items.slice(0, initial)}</ul>
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {expanded ? t("showLess") : t("showMore", { count: hidden })}
          <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}
    </div>
  );
}
