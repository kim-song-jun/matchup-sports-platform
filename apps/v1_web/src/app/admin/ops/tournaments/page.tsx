'use client';

import { AdminPageHeader } from '@/components/admin';
import { TournamentOpsPickerClient } from './tournament-ops-picker-client';

export default function AdminTournamentOpsPickerPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="운영"
        title="대회 현장 운영"
        description="진행 중인 대회를 골라 스태프 배정·운영 보드로 바로 들어가요."
      />
      <TournamentOpsPickerClient />
    </>
  );
}
