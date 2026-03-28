'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-5 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-500 mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">문제가 발생했어요</h2>
      <p className="text-base text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
        일시적인 오류가 발생했어요. 다시 시도해주세요.
      </p>
      <button
        onClick={reset}
        className="rounded-xl bg-blue-500 px-6 py-3 text-base font-bold text-white hover:bg-blue-600 active:scale-[0.98] transition-all duration-200"
      >
        다시 시도하기
      </button>
    </div>
  );
}
