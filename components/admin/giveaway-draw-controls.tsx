"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dices, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast } from "@/components/admin/form-controls";
import { drawGiveawayWinners, setEntryDisqualified } from "@/lib/giveaways/admin-actions";

/** "Draw winners" / "redraw" with a confirmation; the server re-checks the phase and open slots. */
export function DrawButton({ id, redraw, slots, candidates }: { id: string; redraw: boolean; slots: number; candidates: number }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title={redraw ? "สุ่มผู้โชคดีแทนคนที่หมดเวลา?" : "สุ่มผู้โชคดี?"}
      description={
        <>
          <p>
            จะสุ่ม {Math.min(slots, candidates)} คนจากผู้ลงทะเบียนที่ยังไม่ได้รางวัลและไม่ถูกตัดสิทธิ์ {candidates} คน
            {slots > candidates && ` (ผู้ลงทะเบียนไม่พอ รางวัลจะเหลือ ${slots - candidates} รางวัล)`}
          </p>
          <p>ผู้ได้รับรางวัลจะได้รับแจ้งเตือนบนเว็บ และต้องกดยืนยันรับภายใน 7 วัน ผลการสุ่มแก้ไขไม่ได้</p>
        </>
      }
      confirmLabel={redraw ? "สุ่มแทน" : "สุ่มเลย"}
      onConfirm={async () => {
        if (!(await runWithToast(() => drawGiveawayWinners(id)))) return false;
        router.refresh();
      }}
      trigger={
        <Button className="h-10 rounded-full px-5" disabled={slots === 0 || candidates === 0}>
          <Dices aria-hidden /> {redraw ? `สุ่มแทน (${slots} รางวัล)` : "สุ่มผู้โชคดี"}
        </Button>
      }
    />
  );
}

export function DisqualifyToggle({ entryId, disqualified, name }: { entryId: string; disqualified: boolean; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={disqualified ? "rounded-full" : "rounded-full text-destructive"}
      disabled={pending}
      aria-label={`${disqualified ? "คืนสิทธิ์" : "ตัดสิทธิ์"} ${name}`}
      onClick={() =>
        startTransition(async () => {
          if (await runWithToast(() => setEntryDisqualified(entryId, !disqualified))) router.refresh();
        })
      }
    >
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {disqualified ? "คืนสิทธิ์" : "ตัดสิทธิ์"}
    </Button>
  );
}
