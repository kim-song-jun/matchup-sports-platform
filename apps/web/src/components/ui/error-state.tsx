'use client';

import { RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = '데이터를 불러오지 못했어요', onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 py-10 text-center">
      <p className="text-[14px] text-gray-500 dark:text-gray-500">{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 px-3 py-1.5 text-[12px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
          <RefreshCw size={12} />
          다시 시도
        </button>
      )}
    </div>
  );
}
