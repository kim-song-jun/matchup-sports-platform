import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0 animate-pulse space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-3/4 rounded-xl" />
    </div>
  );
}
