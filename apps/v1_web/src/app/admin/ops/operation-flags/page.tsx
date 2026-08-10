'use client';

import { AdminPageHeader, OperationFlagTogglePanel } from '@/components/admin';

export default function AdminOperationFlagsPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="운영 도구"
        title="경기 운영 플래그"
        description="경기 기록을 새 시스템으로 옮기는 5단계 전환을 순서대로 진행해요. 앞 단계가 끝나야 다음 단계가 열리고, 모든 변경은 감사 로그에 남아요."
      />
      <OperationFlagTogglePanel />
    </>
  );
}
