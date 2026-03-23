'use client';

import { Skeleton, ListSkeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-28" />
      <ListSkeleton count={4} />
    </div>
  );
}
