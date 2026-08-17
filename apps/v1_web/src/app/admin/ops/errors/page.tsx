'use client';

import { AdminPageHeader } from '@/components/admin';
import { ErrorLogsClient } from './error-logs-client';

export default function AdminErrorLogsPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="운영"
        title="에러 로그"
        description="서버·클라이언트 에러를 모아 원인 파악에 필요한 정보를 한 화면에서 확인해요."
      />
      <ErrorLogsClient />
    </>
  );
}
