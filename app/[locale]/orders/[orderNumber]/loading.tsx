import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:py-12" aria-busy="true">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-10 rounded-xl" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-[28rem] rounded-3xl" />
      </div>
    </div>
  );
}
