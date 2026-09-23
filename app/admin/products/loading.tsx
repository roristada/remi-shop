import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true" aria-label="กำลังโหลด">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-16 rounded-2xl" />
      <div className="space-y-2 rounded-2xl border bg-card p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
