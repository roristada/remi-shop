"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "@/i18n/navigation";
import { submitReview } from "@/lib/reviews/actions";
import { REVIEW_BODY_MAX } from "@/lib/reviews/rules";
import { cn } from "@/lib/utils";

type Props = {
  productId: string;
  productName: string;
  trigger?: ReactNode;
  /** Edit mode pre-fills the form. */
  initial?: { rating: number; body: string; isAnonymous: boolean };
  /** Controlled open state, for the post-purchase popup. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved?: () => void;
};

/** Star picker, optional text and anonymous switch. The server re-checks that the customer bought the product and the 30-day window. */
export function ReviewDialog({ productId, productName, trigger, initial, open: controlledOpen, onOpenChange, onSaved }: Props) {
  const t = useTranslations("shop.reviews");
  const router = useRouter();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [body, setBody] = useState(initial?.body ?? "");
  const [anonymous, setAnonymous] = useState(initial?.isAnonymous ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setOpen(next: boolean) {
    if (pending) return;
    setInnerOpen(next);
    onOpenChange?.(next);
    if (!next) setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) return setError(t("errors.rating"));
    setError(null);
    startTransition(async () => {
      const result = await submitReview({ productId, rating, body, isAnonymous: anonymous });
      if (!result.ok) {
        const field = result.fieldErrors?.body ?? result.fieldErrors?.rating;
        return setError(t(`errors.${field ?? result.code}`));
      }
      setInnerOpen(false);
      if (onSaved) onSaved();
      else onOpenChange?.(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? t("editTitle") : t("dialogTitle")}</DialogTitle>
          <DialogDescription>{productName}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("ratingLabel")}</legend>
            <div className="flex gap-1" role="radiogroup" aria-label={t("ratingLabel")}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={t("starsOption", { count: n })}
                  onClick={() => setRating(n)}
                  className="grid size-11 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Star
                    className={cn("size-7 transition-colors", n <= rating ? "text-brand-strong" : "text-input")}
                    fill={n <= rating ? "currentColor" : "none"}
                    strokeWidth={n <= rating ? 0 : 1.5}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <label htmlFor={`review-body-${productId}`} className="text-sm font-medium">
              {t("bodyLabel")}
            </label>
            <Textarea
              id={`review-body-${productId}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={REVIEW_BODY_MAX}
              rows={5}
              placeholder={t("bodyPlaceholder")}
              className="rounded-xl"
            />
            <p className="text-right text-xs text-muted-foreground tabular-nums">
              {body.length}/{REVIEW_BODY_MAX}
            </p>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-muted/60 p-3">
            <Checkbox
              id={`review-anon-${productId}`}
              checked={anonymous}
              onCheckedChange={(v) => setAnonymous(v === true)}
              className="mt-0.5"
            />
            <label htmlFor={`review-anon-${productId}`} className="space-y-0.5 text-sm">
              <span className="block font-medium">{t("anonymousLabel")}</span>
              <span className="block text-xs text-muted-foreground">{t("anonymousHint")}</span>
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending} aria-busy={pending} className="h-11 rounded-full px-6">
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {pending ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
