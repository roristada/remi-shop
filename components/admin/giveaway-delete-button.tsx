"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast } from "@/components/admin/form-controls";
import { deleteGiveaway } from "@/lib/giveaways/admin-actions";

export function GiveawayDeleteButton({ id, title, entries }: { id: string; title: string; entries: number }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title="ลบกิจกรรมนี้?"
      description={`"${title}" รูป และรายชื่อผู้ลงทะเบียน${entries > 0 ? ` ${entries} คน` : ""}จะถูกลบถาวร`}
      confirmLabel="ลบกิจกรรม"
      destructive
      onConfirm={async () => {
        if (!(await runWithToast(() => deleteGiveaway(id)))) return false;
        router.push("/admin/giveaways");
      }}
      trigger={
        <Button variant="ghost" size="sm" className="rounded-full text-destructive">
          <Trash2 aria-hidden /> ลบ
        </Button>
      }
    />
  );
}
