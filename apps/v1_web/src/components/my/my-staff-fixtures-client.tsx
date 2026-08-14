'use client';

import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { PublicFixtureStateBadge, staffRoleLabel } from '@/components/tournament-ops/badges';
import { usePublicTournamentSchedule } from '@/components/public-game-records/use-public-game-records';
import { useV1MyTournamentStaffAssignments } from '@/hooks/use-v1-api';
import { findMyTournamentGroup } from '@/hooks/use-v1-my-staff-assignments';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import type { PublicScheduleEntry } from '@/components/public-game-records/types';
import type { V1MyTournamentStaffAssignment } from '@/types/api';

/**
 * "담당 경기" — 필드 담당자(FIELD_OPERATOR)가 자기 경기 콘솔로 들어가는 유일한 경로.
 *
 * 왜 이 화면이 필요한가: 필드 담당자는 대회 전역 리소스를 읽을 권한이 없어 운영 보드
 * (`/tournament-ops/tournaments/:id/operations`)에 **구조적으로 못 들어간다** — 그 라우트에는
 * `:tournamentId` 뿐이라 서버 가드의 리소스가 `{tournamentId}` 하나뿐이고, 스코프가 걸린
 * 배정은 `FIXTURE_SCOPE_REQUIRED`/`FIELD_SCOPE_REQUIRED` 로 거부된다. 반면 경기 콘솔
 * (`.../fixtures/:fixtureId/operate`)은 URL 에 경기가 있어 통과한다. 그래서 "어느 경기로
 * 갈지" 고르는 단계가 사이에 필요하다.
 *
 * 데이터: 담당 범위는 `GET /me/tournament-staff`(본인 스코프라 필드 담당자도 읽을 수 있다),
 * 경기의 상세(팀·시각·상태)는 공개 일정(`GET /tournaments/:id/schedule`)에서 가져온다.
 * 둘 다 이 사용자가 이미 읽을 수 있는 것이라 새 권한 표면이 생기지 않는다.
 */
export function MyStaffFixturesPageClient({ tournamentId }: { tournamentId: string }) {
  const assignmentsQuery = useV1MyTournamentStaffAssignments();
  const scheduleQuery = usePublicTournamentSchedule(tournamentId);

  const group = findMyTournamentGroup(assignmentsQuery.data, tournamentId);
  const title = group?.tournamentTitle ?? '담당 경기';

  const entries = (scheduleQuery.data?.pages ?? []).flatMap((page) => [
    ...page.items,
    ...page.unscheduled,
  ]);
  const mine = group === null ? [] : selectMyFixtures(entries, group.assignments);

  const isLoading = assignmentsQuery.isLoading || scheduleQuery.isLoading;
  const isError = assignmentsQuery.isError || scheduleQuery.isError;

  if (isError) {
    return (
      <Shell title={title}>
        <ErrorState
          message="담당 경기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
          onRetry={() => {
            void assignmentsQuery.refetch();
            void scheduleQuery.refetch();
          }}
        />
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell title={title}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="tm-skeleton" style={{ height: 72, borderRadius: 12 }} />
          <div className="tm-skeleton" style={{ height: 72, borderRadius: 12 }} />
        </div>
      </Shell>
    );
  }

  if (group === null) {
    return (
      <Shell title={title}>
        <EmptyState
          title="이 대회의 담당 배정이 없어요"
          sub="배정이 만료되었거나 해제됐어요. 대회 운영진에게 문의해 주세요."
        />
      </Shell>
    );
  }

  return (
    <Shell title={title}>
      <p className="tm-text-caption" style={{ margin: '0 0 12px' }}>
        {describeScope(group.assignments)}
      </p>
      {mine.length === 0 ? (
        <EmptyState
          title="아직 담당 경기가 배정되지 않았어요"
          sub="대회 운영진이 담당 경기를 지정하면 여기에 표시돼요. 지정 전에는 경기 운영 화면에 들어갈 수 없어요."
        />
      ) : (
        <div className="tm-my-list-stack">
          {mine.map((fixture) => (
            <StaffFixtureRow key={fixture.fixtureId} tournamentId={tournamentId} fixture={fixture} />
          ))}
        </div>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <AppChrome title={title} activeTab="my" bottomNav={false} backHref="/my/tournament-staff" desktopHead>
      <div className="tm-my-shell">
        <div className="tm-my-settings-desktop">{children}</div>
      </div>
    </AppChrome>
  );
}

/**
 * 내 배정이 덮는 경기만 고른다.
 *
 * 경기 스코프(`fixtureIds`)가 있으면 그 목록이 정답이다. 필드 단위 배정은 공개 일정이
 * `fieldId` 를 내려주지 않으므로 `fieldName` 으로 맞춘다 — 두 값 모두 같은 필드 레코드에서
 * 나오고, 여기서 잘못 넓혀도 서버가 최종 판정하므로 과다 노출이 아니다.
 */
export function selectMyFixtures(
  entries: readonly PublicScheduleEntry[],
  assignments: readonly V1MyTournamentStaffAssignment[],
): PublicScheduleEntry[] {
  const fieldOperators = assignments.filter((a) => a.role === 'FIELD_OPERATOR');
  if (fieldOperators.length === 0) return [];

  const scopedFixtureIds = new Set(fieldOperators.flatMap((a) => a.fixtureIds));
  const scopedFieldNames = new Set(
    fieldOperators
      .filter((a) => a.fixtureIds.length === 0 && a.fieldName !== null)
      .map((a) => a.fieldName as string),
  );

  return entries.filter(
    (entry) =>
      scopedFixtureIds.has(entry.fixtureId) ||
      (entry.fieldName !== null && scopedFieldNames.has(entry.fieldName)),
  );
}

function describeScope(assignments: readonly V1MyTournamentStaffAssignment[]): string {
  return assignments
    .map((a) => (a.fieldName ? `${staffRoleLabel(a.role)} · ${a.fieldName}` : staffRoleLabel(a.role)))
    .join(' / ');
}

function StaffFixtureRow({
  tournamentId,
  fixture,
}: {
  tournamentId: string;
  fixture: PublicScheduleEntry;
}) {
  const home = fixture.home?.teamName ?? '팀 미정';
  const away = fixture.away?.teamName ?? '팀 미정';
  const when = formatTournamentDateTimeShort(fixture.scheduledAt);
  const meta = [`${fixture.round} · ${fixture.fixtureNumber}번 경기`, when === '' ? '일정 미정' : when]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      className="tm-list-row tm-pressable"
      href={`/tournament-ops/tournaments/${tournamentId}/fixtures/${fixture.fixtureId}/operate`}
      aria-label={`${home} 대 ${away}, 경기 운영 콘솔 열기`}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-body" style={{ color: 'var(--text-strong)' }}>
          {home} vs {away}
        </div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>
          {meta}
        </div>
      </div>
      <PublicFixtureStateBadge status={fixture.status} />
      <ChevronRightIcon size={18} stroke="var(--text-caption)" strokeWidth={2} />
    </Link>
  );
}
