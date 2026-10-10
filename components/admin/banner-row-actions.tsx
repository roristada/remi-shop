"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast } from "@/components/admin/form-controls";
import { deleteBanner, moveBanner } from "@/lib/banners/actions";

const iconButton =
  "grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

export function BannerRowActions({ id, title, first, last }: { id: string; title: string; first: boolean; last: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (action: () => ReturnType<typeof moveBanner>) =>
    startTransition(async () => {
      if (await runWithToast(action)) router.refresh();
    });

  return (
    <div className="flex items-center gap-0.5">
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
      <button type="button" className={iconButton} disabled={first || pending} aria-label={`เลื่อน ${title} ขึ้น`} onClick={() => run(() => moveBanner(id, "up"))}>
        <ArrowUp className="size-4" aria-hidden />
      </button>
      <button type="button" className={iconButton} disabled={last || pending} aria-label={`เลื่อน ${title} ลง`} onClick={() => run(() => moveBanner(id, "down"))}>
        <ArrowDown className="size-4" aria-hidden />
      </button>
      <ConfirmDialog
        title="ลบแบนเนอร์นี้?"
        description={`"${title}" และรูปของแบนเนอร์จะถูกลบถาวร`}
        confirmLabel="ลบแบนเนอร์"
        destructive
        onConfirm={async () => {
          if (await runWithToast(() => deleteBanner(id))) router.refresh();
        }}
        trigger={
          <button type="button" className={`${iconButton} hover:text-destructive`} disabled={pending} aria-label={`ลบ ${title}`}>
            <Trash2 className="size-4" aria-hidden />
          </button>
        }
      />
    </div>
  );
}
