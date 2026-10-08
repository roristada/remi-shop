"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bell, BellRing, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { toggleWaitlist } from "@/lib/waitlist/actions";

type Props = {
  productId: string;
  productSlug: string;
  initialJoined: boolean;
  /** Customers waiting now, from the server. Adjusted locally when this customer joins or leaves. */
  initialCount: number;
};

/** "Notify me when it goes on sale" for a scheduled product. The server re-checks status and session. */
export function WaitlistButton({ productId, productSlug, initialJoined, initialCount }: Props) {
  const t = useTranslations("shop.waitlist");
  const locale = useLocale();
  const router = useRouter();
  const [joined, setJoined] = useState(initialJoined);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function onToggle() {
    startTransition(async () => {
      const result = await toggleWaitlist(productId);
      if (!result.ok) {
        if (result.code === "LOGIN_REQUIRED") {
          router.push(`/login?next=${encodeURIComponent(`/${locale}/product/${productSlug}`)}`);
          return;
        }
        // Opened (or was taken off sale) since the page loaded: show the current state.
        if (result.code === "NOT_SCHEDULED") router.refresh();
        toast.error(t(result.code === "NOT_SCHEDULED" ? "notScheduled" : "error"));
        return;
      }
      if (result.joined !== joined) setCount((c) => Math.max(0, c + (result.joined ? 1 : -1)));
      setJoined(result.joined);
      toast.success(result.joined ? t("joined") : t("left"));
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="lg"
        variant={joined ? "outline" : "default"}
        className="h-12 w-full rounded-full text-base"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={joined}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : joined ? <BellRing aria-hidden /> : <Bell aria-hidden />}
        {joined ? t("joinedLabel") : t("join")}
      </Button>
      {count > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-sm font-medium" aria-live="polite">
          <Users className="size-4 text-brand-strong" aria-hidden /> {t("count", { count })}
        </p>
      )}
      <p className="text-center text-xs text-muted-foreground">{joined ? t("joinedHint") : t("hint")}</p>
    </div>
  );
}
