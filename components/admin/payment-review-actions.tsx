"use client";

import { useState, useTransition } from "react";
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
import { approvePayment, rejectPayment } from "@/lib/payments/admin-actions";
import { REJECT_REASON_MAX } from "@/lib/payments/rules";

// Common reasons, one tap to fill in; the admin can still edit the text.
const QUICK_REASONS = ["ยอดเงินไม่ตรงกับยอดคำสั่งซื้อ", "สลิปไม่ชัดเจน อ่านข้อมูลไม่ได้", "ไม่พบรายการโอนเข้าบัญชี", "สลิปซ้ำกับคำสั่งซื้ออื่น"];

type Props = { paymentId: string; orderNumber: string; amountLabel: string };

export function PaymentReviewActions({ paymentId, orderNumber, amountLabel }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submitReject() {
    startTransition(async () => {
      const result = await rejectPayment(paymentId, reason);
      if (!result.ok) {
        setError(result.fieldErrors?.reason ?? result.error);
        if (!result.fieldErrors) toast.error(result.error);
        return;
      }
      toast.success(result.message);
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
        title={`อนุมัติคำสั่งซื้อ ${orderNumber}?`}
        description={
          <p>
            ยืนยันว่าได้รับเงิน {amountLabel} แล้ว ลูกค้าจะดาวน์โหลดไฟล์ได้ทันทีหลังอนุมัติ
          </p>
        }
        confirmLabel="อนุมัติ"
        onConfirm={async () => {
          const result = await approvePayment(paymentId);
          if (result.ok) toast.success(result.message);
          else toast.error(result.error);
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
            <DialogTitle>ปฏิเสธสลิป {orderNumber}</DialogTitle>
            <DialogDescription>ลูกค้าจะเห็นเหตุผลนี้และแนบสลิปใหม่ได้</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((r) => (
                <Button key={r} type="button" variant="secondary" size="sm" className="rounded-full" onClick={() => setReason(r)}>
                  {r}
                </Button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`reason-${paymentId}`}>เหตุผล</Label>
              <Textarea
                id={`reason-${paymentId}`}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError(undefined);
                }}
                maxLength={REJECT_REASON_MAX}
                rows={3}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `reason-${paymentId}-error` : undefined}
              />
              {error && (
                <p id={`reason-${paymentId}-error`} className="text-xs text-destructive">
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
              {pending && <Loader2 className="animate-spin" aria-hidden />} ปฏิเสธสลิป
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
