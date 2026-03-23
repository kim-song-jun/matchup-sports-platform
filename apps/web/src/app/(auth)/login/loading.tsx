'use client';

import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 space-y-8">
      <Skeleton className="h-12 w-32" />
      <Skeleton className="h-4 w-48" />
      <div className="w-full max-w-sm space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
