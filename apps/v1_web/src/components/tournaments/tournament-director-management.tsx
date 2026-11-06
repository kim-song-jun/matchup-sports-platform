'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useV1MyTournamentStaffAssignments } from '@/hooks/use-v1-api';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { AdminPageSkeleton } from '@/components/admin/admin-skeleton';
import { TournamentManagementContent } from '@/app/admin/tournaments/[id]/tournament-admin-shell';
import { findMyTournamentGroup } from '@/hooks/use-v1-my-staff-assignments';

export function TournamentDirectorManagement({ id, children }: { id: string; children: ReactNode }) {
  const assignments = useV1MyTournamentStaffAssignments();
  if (assignments.isPending) return <AdminPageSkeleton />;
  if (assignments.isError) return <ErrorState message="담당 대회 권한을 확인하지 못했어요." onRetry={() => void assignments.refetch()} />;
  const group = findMyTournamentGroup(assignments.data, id);
  const isDirector = group?.tournamentKind !== 'regular_league' && group?.assignments.some((a) =>
    a.role === 'TOURNAMENT_DIRECTOR' && (a.expiresAt === null || new Date(a.expiresAt).getTime() > Date.now()),
  );
  if (!isDirector) return <>
    <EmptyState title="담당 대회 디렉터 권한이 필요해요" sub="이 대회의 배정이 해제되었거나 관리 권한이 없어요." />
    <Link className="tm-btn-secondary inline-flex min-h-[44px] items-center px-4" href="/tournament-management">담당 대회로 돌아가기</Link>
  </>;
  // The shared content also requires the scoped admin detail API to succeed before rendering actions.
  return <TournamentManagementContent id={id} role="TOURNAMENT_DIRECTOR" staffSurface>{children}</TournamentManagementContent>;
}
