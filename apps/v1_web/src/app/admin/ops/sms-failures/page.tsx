'use client';

import { AdminPageHeader } from '@/components/admin';
import { SmsFailureTable } from '@/components/admin/sms-failure-table';

export default function AdminSmsFailuresPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="운영 도구"
        title="SMS · 인증 실패 로그"
        description="SMS 발송 실패와 휴대폰·이메일 인증 실패 기록을 확인하고 확인 처리해요."
      />
      <SmsFailureTable />
    </>
  );
}
