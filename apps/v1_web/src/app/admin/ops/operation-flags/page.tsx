'use client';

import { AdminPageHeader, OperationFlagTogglePanel } from '@/components/admin';

export default function AdminOperationFlagsPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="운영"
        title="경기 운영 플래그"
        description="실시간 점수 공개와 결과 확정 권한을 켜고 꺼요. 각 토글이 무엇을 바꾸는지는 카드 설명에서 확인할 수 있고, 모든 변경은 감사 로그에 남아요."
      />
      <div className="tm-content-enter">
        <OperationFlagTogglePanel />
      </div>
    </>
  );
}
