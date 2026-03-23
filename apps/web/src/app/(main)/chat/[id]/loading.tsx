'use client';

import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex-1 p-4 space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-16 w-48 rounded-2xl" />
        </div>
        <div className="flex gap-2 justify-end">
          <Skeleton className="h-10 w-40 rounded-2xl" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-12 w-56 rounded-2xl" />
        </div>
        <div className="flex gap-2 justify-end">
          <Skeleton className="h-16 w-44 rounded-2xl" />
        </div>
      </div>
      <div className="p-4 border-t">
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}
