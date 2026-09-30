import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Decorative star row (the rating is always also given as text next to it). */
export function Stars({ value, className, size = "size-4" }: { value: number; className?: string; size?: string }) {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className={cn("flex", className)} aria-hidden>
      {Array.from({ length: 5 }, (_, i) =>
        i < rounded ? (
          <Star key={i} className={cn(size, "text-brand-strong")} fill="currentColor" strokeWidth={0} />
        ) : (
          <Star key={i} className={cn(size, "text-input")} fill="none" strokeWidth={1.5} />
        ),
      )}
    </span>
  );
}
