'use client';

import { AdminPageHeader } from '@/components/admin';
import { PushSendForm } from '@/components/admin/push-send-form';

export default function AdminPushSendPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="운영 도구"
        title="웹 푸시 수동 발송"
        description="특정 회원 또는 전체 구독자에게 웹 푸시 알림을 직접 보내요."
      />
      <PushSendForm />
    </>
  );
}
