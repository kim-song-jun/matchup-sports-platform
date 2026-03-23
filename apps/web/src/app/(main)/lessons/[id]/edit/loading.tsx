'use client';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 animate-pulse space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-3/4 rounded-xl" />
    </div>
  );
}
