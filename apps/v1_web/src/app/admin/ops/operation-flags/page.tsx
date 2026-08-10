'use client';

import { AdminPageHeader, OperationFlagTogglePanel } from '@/components/admin';

export default function AdminOperationFlagsPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="운영 도구"
        title="경기 운영 플래그"
        description="관전자 실시간 점수 공개, 심판 결과 공식화를 켜고 꺼요. 모든 변경은 감사 로그에 남아요."
      />
      <OperationFlagTogglePanel />
    </>
  );
}
