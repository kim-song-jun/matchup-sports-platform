export default function UserProfileLoading() {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 pt-[var(--safe-area-top)]">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
        <div className="h-11 w-11 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
        <div className="h-5 w-32 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />
      </div>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-4 animate-pulse">
        {/* Identity card skeleton */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-700 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-6 w-36 rounded-lg bg-gray-100 dark:bg-gray-700" />
              <div className="h-4 w-24 rounded-lg bg-gray-100 dark:bg-gray-700" />
              <div className="h-3 w-20 rounded-lg bg-gray-100 dark:bg-gray-700" />
            </div>
          </div>
        </div>

        {/* Sport profiles skeleton */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-3">
          <div className="h-5 w-28 rounded-lg bg-gray-100 dark:bg-gray-700" />
          <div className="h-12 rounded-xl bg-gray-100 dark:bg-gray-700" />
          <div className="h-12 rounded-xl bg-gray-100 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  );
}
