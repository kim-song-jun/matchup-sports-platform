'use client';

import { FileQuestion } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 px-5">
      <EmptyState
        icon={FileQuestion}
        title="페이지를 찾을 수 없어요"
        description="요청하신 페이지가 존재하지 않거나 이동되었어요"
        action={{ label: '홈으로 돌아가기', href: '/home' }}
      />
    </main>
  );
}
