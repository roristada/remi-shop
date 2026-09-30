"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runWithToast } from "@/components/admin/form-controls";
import { setReviewHidden } from "@/lib/reviews/actions";

export function ReviewVisibilityButton({ reviewId, hidden }: { reviewId: string; hidden: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="rounded-full"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (await runWithToast(() => setReviewHidden(reviewId, !hidden))) router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
      {hidden ? "แสดงรีวิว" : "ซ่อนรีวิว"}
    </Button>
  );
}
