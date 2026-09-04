'use client';

import Link from 'next/link';
import { staffRoleLabel } from '@/components/tournament-ops/badges';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { useV1MyTournamentStaffAssignments } from '@/hooks/use-v1-api';
import { myStaffEntryHref } from '@/hooks/use-v1-my-staff-assignments';
import { getTournamentStatusConfig } from '@/lib/v1-tournament-status';
import type { V1MyTournamentStaffAssignment, V1MyTournamentStaffGroup } from '@/types/api';

/**
 * "내 담당 대회" — 마이페이지에서 대회 운영 화면(`/tournament-ops/**`)으로 들어가는 진입점.
 * `/my/tournament-staff` 항목은 my.view-model.ts에서 배정이 있을 때만 동적으로 추가되므로
 * (my-page-client.tsx의 toMyHomeModel), 이 화면에 도달했다는 것 자체가 이미 최소 1개의
 * 유효한 배정이 있었다는 뜻이다 — 다만 그 사이 전부 만료/해제됐을 수 있어 빈 상태는
 * 여전히 다뤄야 한다.
 */
export function MyTournamentStaffPageClient() {
  const query = useV1MyTournamentStaffAssignments();
  const groups = query.data?.items ?? [];

  if (query.isError) {
    return (
      <div className="tm-my-shell">
        <ErrorState
          message="담당 대회 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="tm-my-shell tm-content-enter">
      <div className="tm-my-settings-desktop">
        {!query.isLoading && groups.length === 0 ? (
          <EmptyState
            fill
            illustration={{ name: 'journey-done' }}
            title="담당 중인 대회가 없어요"
            sub="배정이 만료되었거나 해제됐어요. 대회 운영진으로 새로 배정되면 다시 여기에 표시돼요."
          />
        ) : (
          <div className="tm-my-list-stack">
            {groups.map((group) => (
              <StaffTournamentRow key={group.tournamentId} group={group} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StaffTournamentRow({ group }: { group: V1MyTournamentStaffGroup }) {
  const status = getTournamentStatusConfig(group.tournamentStatus);
  return (
    <Link
      className="tm-list-row tm-pressable"
      // 역할에 따라 목적지가 다르다 — 필드 담당자를 운영 보드로 보내면 403 이다.
      href={myStaffEntryHref(group)}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-body" style={{ color: 'var(--text-strong)' }}>
          {group.tournamentTitle}
        </div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>
          {describeAssignments(group.assignments)}
        </div>
      </div>
      <span className={`tm-badge ${status.badgeClass}`} style={{ flexShrink: 0 }}>
        {status.label}
      </span>
      <ChevronRightIcon size={18} stroke="var(--text-caption)" strokeWidth={2} />
    </Link>
  );
}

function describeAssignments(assignments: V1MyTournamentStaffAssignment[]): string {
  return assignments
    .map((assignment) => {
      const role = staffRoleLabel(assignment.role);
      return assignment.fieldName ? `${role} · ${assignment.fieldName}` : role;
    })
    .join(' / ');
}
