import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";

/** "‹ Parent page" link above a page heading. Points at a fixed parent, not browser history. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:min-h-0"
    >
      <ChevronLeft className="size-4" aria-hidden /> {children}
    </Link>
  );
}
