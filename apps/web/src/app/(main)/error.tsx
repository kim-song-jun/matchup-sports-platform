'use client';

import { useEffect } from 'react';
import { AppErrorScreen } from '@/components/ui/app-error-screen';

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
    <AppErrorScreen
      title="문제가 발생했어요"
      message="일시적인 오류가 발생했어요. 다시 시도해주세요."
      onAction={reset}
    />
  );
}
