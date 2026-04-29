import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton-shimmer rounded-[3px]", className)} />;
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("pixel-card flex min-h-[5.5rem] items-center gap-4 p-4", className)}>
      <Skeleton className="h-4 w-10 shrink-0" />
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="h-5 w-7" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3 w-36 max-w-full" />
        <Skeleton className="h-2.5 w-56 max-w-[82%]" />
      </div>
      <div className="hidden min-w-[8.5rem] shrink-0 space-y-2 text-right sm:block">
        <Skeleton className="ml-auto h-3 w-28" />
        <Skeleton className="ml-auto h-2.5 w-20" />
      </div>
      <Skeleton className="h-4 w-4 shrink-0" />
    </div>
  );
}

export function SkeletonCard({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("pixel-card min-h-[7.75rem] p-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-4" />
      </div>
      <div className="mt-5 space-y-2.5">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className={cn("h-3", index === lines - 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonLeaderboardRows({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 lg:grid-cols-2", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  );
}

export function SkeletonCardGrid({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

export function SkeletonProfile({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-6", className)}>
      <section className="pixel-card grid-bg p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-stretch">
          <Skeleton className="h-40 w-40 shrink-0 md:h-[17.75rem] md:w-48" />
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-6">
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-9 w-72 max-w-full" />
              <Skeleton className="h-5 w-[34rem] max-w-full" />
              <Skeleton className="h-5 w-[24rem] max-w-[82%]" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonCard key={index} className="min-h-[5.25rem]" lines={2} />
              ))}
            </div>
          </div>
        </div>
      </section>
      <SkeletonCardGrid count={4} />
      <SkeletonLeaderboardRows count={4} />
    </div>
  );
}
