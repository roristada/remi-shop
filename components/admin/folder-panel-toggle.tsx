"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { FOLDER_PANEL_COOKIE } from "@/lib/admin/ui-prefs";
import { cn } from "@/lib/utils";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Hides the folder sidebar (folders move to a chip row) to give the product list the full width. */
export function FolderPanelToggle({ collapsed, className }: { collapsed: boolean; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const label = collapsed ? "แสดงแถบโฟลเดอร์ด้านข้าง" : "ย่อแถบโฟลเดอร์";

  function toggle() {
    // UI preference only — not security-relevant, so a plain cookie is fine.
    document.cookie = `${FOLDER_PANEL_COOKIE}=${collapsed ? "open" : "collapsed"}; path=/admin; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={label}
      aria-label={label}
      aria-expanded={!collapsed}
      className={cn(
        "hidden size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 lg:grid",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
