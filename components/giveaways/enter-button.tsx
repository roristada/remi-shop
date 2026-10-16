"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { enterGiveaway } from "@/lib/giveaways/actions";

const BUTTON = "h-12 w-full rounded-full text-base";

/** Registration button. The server re-checks login, email verification and the window on click. */
export function EnterGiveawayButton({
  giveawayId,
  slug,
  signedIn,
  initialEntered,
}: {
  giveawayId: string;
  slug: string;
  signedIn: boolean;
  initialEntered: boolean;
}) {
  const t = useTranslations("giveaways");
  const router = useRouter();
  const [entered, setEntered] = useState(initialEntered);
  const [pending, startTransition] = useTransition();

  if (entered) {
    return (
      <div className="space-y-1 rounded-2xl bg-secondary/60 p-4 text-sm" role="status">
        <p className="flex items-center gap-2 font-medium">
          <CircleCheck className="size-5 text-success" aria-hidden /> {t("entered")}
        </p>
        <p className="text-foreground/70">{t("enteredHint")}</p>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <Button asChild size="lg" className={BUTTON}>
        <Link href={`/login?next=${encodeURIComponent(`/giveaways/${slug}`)}`}>
          <Gift aria-hidden /> {t("loginToEnter")}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      size="lg"
      className={BUTTON}
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await enterGiveaway(giveawayId);
          if (result.ok) {
            setEntered(true);
            router.refresh();
            return;
          }
          toast.error(t(`enterErrors.${result.code}`));
          if (result.code === "NOT_OPEN") router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Gift aria-hidden />}
      {pending ? t("entering") : t("enter")}
    </Button>
  );
}
