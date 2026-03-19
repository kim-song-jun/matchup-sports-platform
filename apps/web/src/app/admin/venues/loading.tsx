'use client';

import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-36" />
      <TableSkeleton rows={6} />
    </div>
  );
}
