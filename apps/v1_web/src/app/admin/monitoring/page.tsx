'use client';

import { Suspense } from 'react';
import { AdminPageHeader } from '@/components/admin';
import { MonitoringClient } from './monitoring-client';

export default function AdminMonitoringPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="운영"
        title="모니터링"
        description="에러·웹 푸시 실패·SMS 인증 실패·감사 기록을 한 화면에서 살펴봐요."
      />
      {/* useSearchParams(?tab= 딥링크)는 Suspense 경계를 요구한다(Next.js App Router). */}
      <Suspense fallback={null}>
        <MonitoringClient />
      </Suspense>
    </>
  );
}
