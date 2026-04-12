'use client';

import { useEffect } from 'react';
import { AppErrorScreen } from '@/components/ui/app-error-screen';

export default function AdminError({
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
      title="관리자 페이지 오류"
      message="관리자 페이지에서 오류가 발생했어요. 다시 시도해주세요."
      onAction={reset}
    />
  );
}
