'use client';

import { Suspense } from 'react';
import { AdminListSkeleton, AdminPageHeader } from '@/components/admin';
import { TournamentOpsPickerClient } from './tournament-ops-picker-client';
import { TournamentOpsDemoEntry } from '@/components/tournament-ops-demo/demo-entry';

export default function AdminTournamentOpsPickerPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="운영"
        title="대회·리그 현장 운영"
        description="대회나 리그를 골라 운영 보드로 들어가요."
      />
      <Suspense fallback={<AdminListSkeleton rows={5} />}>
        <TournamentOpsPickerClient />
      </Suspense>
      <div className="mt-8">
        <TournamentOpsDemoEntry />
      </div>
    </>
  );
}
