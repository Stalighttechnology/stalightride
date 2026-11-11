import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shared shadcn/ui Skeleton compositions so every surface shows the same
 * loading language instead of a blank flash.
 */

export function ListRowsSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="glass flex items-center gap-4 p-4">
          <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-8 w-24 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({
  items = 4,
  className,
  cardClassName,
}: {
  items?: number;
  className?: string;
  cardClassName?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)} aria-busy="true">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className={cn("glass space-y-3 p-6", cardClassName)}>
          <Skeleton className="h-12 w-12 rounded-xl" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton({ items = 3, className }: { items?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)} aria-busy="true">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="glass space-y-2 p-4">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn("glass space-y-5 p-6", className)} aria-busy="true">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}
      <Skeleton className="h-10 w-36 rounded-md" />
    </div>
  );
}

export function SectionHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true">
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}
