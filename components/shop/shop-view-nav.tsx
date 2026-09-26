import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { LayoutGrid, Rows3 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type ShopFolderChip = { slug: string | null; name: string };

type Props = {
  view: "folders" | "all";
  folders: ShopFolderChip[];
  /** In the "All" view: the folder currently filtered by. */
  activeFolder?: string;
};

export const UNFILED_ANCHOR = "folder-other";

export function folderAnchor(slug: string | null) {
  return slug ? `folder-${slug}` : UNFILED_ANCHOR;
}

const chip =
  "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * View toggle plus folder chips. By folder: chips jump to sections on the page.
 * All: chips filter the grid by folder (?folder=slug) and keep the view in the URL.
 */
export function ShopViewNav({ view, folders, activeFolder }: Props) {
  const t = useTranslations("shop.views");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <nav aria-label={t("label")} className="inline-flex shrink-0 self-start rounded-full bg-secondary/60 p-1">
        <ViewLink href="/shop" current={view === "folders"} icon={<Rows3 aria-hidden />}>
          {t("byFolder")}
        </ViewLink>
        <ViewLink href="/shop?view=all" current={view === "all" && !activeFolder} icon={<LayoutGrid aria-hidden />}>
          {t("all")}
        </ViewLink>
      </nav>

      {folders.length > 0 && (
        <nav aria-label={t("jumpTo")} className="-mx-4 min-w-0 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-2 pb-1 sm:flex-wrap sm:pb-0">
            {folders.map((f) => {
              const active = view === "all" && f.slug !== null && f.slug === activeFolder;
              const href =
                view === "folders" ? `#${folderAnchor(f.slug)}` : `/shop?view=all&folder=${encodeURIComponent(f.slug ?? "")}`;
              return (
                <li key={f.slug ?? UNFILED_ANCHOR}>
                  {view === "folders" ? (
                    <a href={href} className={cn(chip, "bg-background hover:border-foreground/30")}>
                      {f.name}
                    </a>
                  ) : (
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        chip,
                        active ? "border-foreground bg-foreground text-background" : "bg-background hover:border-foreground/30",
                      )}
                    >
                      {f.name}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}

function ViewLink({
  href,
  current,
  icon,
  children,
}: {
  href: string;
  current: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4",
        current ? "bg-background text-foreground shadow-sm" : "text-foreground/75 hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
