"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runWithToast } from "@/components/admin/form-controls";
import { recheckPayment } from "@/lib/payments/admin-actions";

/** Re-runs the automatic slip check for a slip the first check could not judge. */
export function RecheckSlipButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="rounded-full"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          if (await runWithToast(() => recheckPayment(paymentId))) router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
      {pending ? "กำลังตรวจ…" : "ตรวจอีกครั้ง"}
    </Button>
  );
}
