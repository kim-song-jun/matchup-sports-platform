'use client';

import { useEffect } from 'react';
import { AppErrorScreen } from '@/components/ui/app-error-screen';

export default function GlobalError({
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
    <html lang="ko">
      <body className="min-h-dvh bg-gray-50 dark:bg-gray-900">
        <AppErrorScreen
          title="앱을 불러오는 중 문제가 발생했어요"
          message="루트 화면을 다시 불러오지 못했어요. 잠시 후 다시 시도해주세요."
          onAction={reset}
        />
      </body>
    </html>
  );
}
