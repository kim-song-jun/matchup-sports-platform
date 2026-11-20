'use client';

import type { ReactNode } from 'react';
import { useMemberAccessStatus } from '@/hooks/use-member-access';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

export function MemberAccessChatGate({ children }: { children: ReactNode }) {
  const status = useMemberAccessStatus();
  if (status.isPending) return <PageSkeleton variant="list" />;
  if (status.isError) return <ErrorState message="회원 조회 상태를 확인하지 못했어요." onRetry={() => void status.refetch()} />;
  if (status.data.active) return <EmptyState
    title="회원 조회 중에는 채팅을 볼 수 없어요"
    sub="대화와 첨부파일은 열람할 수 없어요. 조회를 마치려면 상단의 관리자 복귀를 눌러 주세요."
    cta="홈으로 이동" ctaHref="/home" />;
  return <>{children}</>;
}
