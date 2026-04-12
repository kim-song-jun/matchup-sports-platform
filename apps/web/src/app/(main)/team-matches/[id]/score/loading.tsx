import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-28" />
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-center space-y-2">
            <Skeleton className="h-10 w-10 rounded-full mx-auto" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-10 w-20" />
          <div className="text-center space-y-2">
            <Skeleton className="h-10 w-10 rounded-full mx-auto" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-xl mt-4" />
    </div>
  );
}
