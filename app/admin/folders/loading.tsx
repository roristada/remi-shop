import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true" aria-label="กำลังโหลด">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-44 rounded-full" />
      {Array.from({ length: 2 }, (_, i) => (
        <Skeleton key={i} className="h-72 rounded-3xl" />
      ))}
    </div>
  );
}
