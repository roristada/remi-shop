"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runWithToast } from "@/components/admin/form-controls";
import { setFilesEmailed } from "@/lib/costs/actions";

/** Delivery status of an order's emailed lines, separate from its payment status. */
export function FilesEmailedToggle({ orderId, sentAt }: { orderId: string; sentAt: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (sent: boolean) =>
    startTransition(async () => {
      if (await runWithToast(() => setFilesEmailed(orderId, sent))) router.refresh();
    });

  return sentAt ? (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm">
      <MailCheck className="size-4 text-success" aria-hidden />
      <span className="flex-1">ส่งไฟล์ทางอีเมลแล้ว · {sentAt}</span>
      <Button type="button" variant="ghost" size="sm" className="rounded-full" disabled={pending} onClick={() => run(false)}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />} ยกเลิก
      </Button>
    </div>
  ) : (
    <Button type="button" className="h-10 w-full rounded-full" disabled={pending} aria-busy={pending} onClick={() => run(true)}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <MailCheck aria-hidden />} ทำเครื่องหมายว่าส่งไฟล์ทางอีเมลแล้ว
    </Button>
  );
}
