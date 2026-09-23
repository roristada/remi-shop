import { Skeleton } from "@/components/ui/skeleton";

/** Grid skeleton for product listing pages (use in route-level loading.tsx). */
export function ProductGridSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12" aria-busy="true">
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
