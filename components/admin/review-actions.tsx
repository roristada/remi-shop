"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import type { ActionResult } from "@/lib/actions/result";
import { REJECT_REASON_MAX } from "@/lib/payments/rules";

type Props = {
  /** Server actions already bound to the record under review. */
  approve: () => Promise<ActionResult>;
  reject: (reason: string) => Promise<ActionResult>;
  approveTitle: string;
  approveDescription: ReactNode;
  rejectTitle: string;
  rejectDescription: string;
  rejectLabel: string;
  /** Common reasons, one tap to fill in; the admin can still edit the text. */
  quickReasons: readonly string[];
};

/** Approve (with confirm) / reject (with a required reason) for admin review queues. */
export function ReviewActions({
  approve,
  reject,
  approveTitle,
  approveDescription,
  rejectTitle,
  rejectDescription,
  rejectLabel,
  quickReasons,
}: Props) {
  const router = useRouter();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submitReject() {
    startTransition(async () => {
      const result = await reject(reason);
      if (!result.ok) {
        setError(result.fieldErrors?.reason ?? result.error);
        if (!result.fieldErrors) toast.error(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmDialog
        trigger={
          <Button className="h-10 rounded-full px-5">
            <Check aria-hidden /> อนุมัติ
          </Button>
        }
        title={approveTitle}
        description={approveDescription}
        confirmLabel="อนุมัติ"
        onConfirm={async () => {
          const result = await approve();
          if (!result.ok) toast.error(result.error);
          router.refresh();
        }}
      />

      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogTrigger asChild>
          <Button variant="outline" className="h-10 rounded-full px-5">
            <X aria-hidden /> ปฏิเสธ
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rejectTitle}</DialogTitle>
            <DialogDescription>{rejectDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {quickReasons.map((r) => (
                <Button key={r} type="button" variant="secondary" size="sm" className="rounded-full" onClick={() => setReason(r)}>
                  {r}
                </Button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={reasonId}>เหตุผล</Label>
              <Textarea
                id={reasonId}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError(undefined);
                }}
                maxLength={REJECT_REASON_MAX}
                rows={3}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${reasonId}-error` : undefined}
              />
              {error && (
                <p id={`${reasonId}-error`} className="text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              ยกเลิก
            </Button>
            <Button variant="destructive" onClick={submitReject} disabled={pending} aria-busy={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} {rejectLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
