import { Suspense } from 'react';
import { ChatListPageClient } from '@/components/community/community-api-clients';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

/**
 * 목록 클라이언트가 `?category=` 를 `useSearchParams` 로 읽는다 — App Router 는 프로덕션 빌드에서
 * Suspense 경계를 요구한다(loading.tsx 에 기대지 않고 명시한다, tournaments/page.tsx 와 같은 이유).
 */
export default function ChatPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <ChatListPageClient />
    </Suspense>
  );
}
