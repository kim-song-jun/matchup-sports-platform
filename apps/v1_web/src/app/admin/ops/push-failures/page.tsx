'use client';

import { AdminPageHeader } from '@/components/admin';
import { PushFailureTable } from '@/components/admin/push-failure-table';

export default function AdminPushFailuresPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="운영 도구"
        title="Web Push 실패 로그"
        description="최근 웹 푸시 발송 실패 기록을 확인하고 확인 처리해요."
      />
      <PushFailureTable />
    </>
  );
}
