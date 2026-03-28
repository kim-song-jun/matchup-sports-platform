'use client';

import { RefreshCw, AlertCircle } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = '앗, 잠시 문제가 생겼어요', onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 py-10 text-center">
      <div className="flex justify-center mb-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
          <AlertCircle size={24} className="text-red-400 dark:text-red-300" />
        </div>
      </div>
      <p className="text-base font-medium text-gray-600 dark:text-gray-300">{message}</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">잠시 후 다시 시도해주세요</p>
      {onRetry && (
        <button onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 min-h-[44px] rounded-lg bg-gray-100 dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
          <RefreshCw size={12} />
          다시 불러오기
        </button>
      )}
    </div>
  );
}
