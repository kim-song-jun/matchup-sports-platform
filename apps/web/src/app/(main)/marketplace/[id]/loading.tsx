'use client';

import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-6 w-28" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}
