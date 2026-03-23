'use client';

import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-4 p-6 animate-pulse">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
