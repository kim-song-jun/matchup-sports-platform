'use client';

import Link from 'next/link';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { GameStateBadge, PublicFixtureStateBadge, staffRoleLabel } from '@/components/tournament-ops/badges';
import { useV1MyTournamentStaffAssignments } from '@/hooks/use-v1-api';
import { findMyTournamentGroup } from '@/hooks/use-v1-my-staff-assignments';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import type { V1GameState, V1MyTournamentStaffAssignment, V1MyTournamentStaffFixture } from '@/types/api';

const STAFF_GAME_STATE_BY_STATUS: Readonly<Record<string, V1GameState>> = {
  scheduled: 'SCHEDULED',
  SCHEDULED: 'SCHEDULED',
  in_progress: 'LIVE',
  live: 'LIVE',
  LIVE: 'LIVE',
  paused: 'PAUSED',
  PAUSED: 'PAUSED',
  completed: 'ENDED',
  ended: 'ENDED',
  ENDED: 'ENDED',
  cancelled: 'CANCELLED',
  CANCELLED: 'CANCELLED',
};

function StaffFixtureStateBadge({ status }: { status: string }) {
  const gameState = STAFF_GAME_STATE_BY_STATUS[status];
  return gameState === undefined ? <PublicFixtureStateBadge status={status} /> : <GameStateBadge state={gameState} />;
}

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
 * 데이터: 담당 범위와 경기 요약은 `GET /me/tournament-staff` 한 응답에서 받는다.
 * 서버가 현재 사용자의 활성 스태프 스코프와 canonical TeamMatch를 함께 교차검증하므로,
 * 공개 대진표가 아직 게시되지 않은 대회도 담당 경기 콘솔로 들어갈 수 있다.
 */
export function MyStaffFixturesPageClient({ tournamentId }: { tournamentId: string }) {
  const assignmentsQuery = useV1MyTournamentStaffAssignments();

  const group = findMyTournamentGroup(assignmentsQuery.data, tournamentId);
  const title = group?.tournamentTitle ?? '담당 경기';
  // 대회명은 fetch 의존이라 route-chrome 테이블엔 기본값("담당 경기")만 있다 — 배정을
  // 찾으면 여기서 실제 대회명으로 덮어쓴다(fragments/my-secondary.ts 참조).
  useShellOverride({ title });

  const mine = group === null ? [] : selectMyFixtures(group.fixtures, group.assignments);

  const isLoading = assignmentsQuery.isLoading;
  const isError = assignmentsQuery.isError;

  if (isError) {
    return (
      <Shell>
        <ErrorState
          message="담당 경기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
          onRetry={() => {
            void assignmentsQuery.refetch();
          }}
        />
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="tm-skeleton" style={{ height: 72, borderRadius: 'var(--radius-control)' }} />
          <div className="tm-skeleton" style={{ height: 72, borderRadius: 'var(--radius-control)' }} />
        </div>
      </Shell>
    );
  }

  if (group === null) {
    return (
      <Shell>
        <EmptyState
          illustration={{ name: 'journey-done' }}
          title="이 대회의 담당 배정이 없어요"
          sub="배정이 만료되었거나 해제됐어요. 대회 운영진에게 문의해 주세요."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="tm-text-caption tm-content-enter" style={{ margin: '0 0 12px' }}>
        {describeScope(group.assignments)}
      </p>
      {mine.length === 0 ? (
        <EmptyState
          illustration={{ name: 'journey-done' }}
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="tm-my-shell">
      <div className="tm-my-settings-desktop">{children}</div>
    </div>
  );
}

/**
 * 내 배정이 덮는 경기만 고른다.
 *
 * 경기 스코프(`fixtureIds`)가 있으면 그 목록이 정답이다. 필드 단위 배정은 `fieldId`로
 * 맞춘다 — finding #76 이전엔 `fieldName` 문자열로 매칭했는데, 필드 이름에는 유일성
 * 제약도 수정·삭제 경로도 없어서 같은 이름의 필드가 두 개 생기면(중복 생성을 막는
 * 장치가 없다) 담당자가 아닌 필드의 경기까지 "내 담당"으로 잘못 묶였다. `fieldId`는
 * 필드 레코드의 진짜 기본키라 동명이인 문제가 없다.
 */
export function selectMyFixtures(
  fixtures: readonly V1MyTournamentStaffFixture[],
  assignments: readonly V1MyTournamentStaffAssignment[],
): V1MyTournamentStaffFixture[] {
  const fieldOperators = assignments.filter((a) => a.role === 'FIELD_OPERATOR');
  if (fieldOperators.length === 0) return [];

  const scopedFixtureIds = new Set(fieldOperators.flatMap((a) => a.fixtureIds));
  const scopedFieldIds = new Set(
    fieldOperators
      .filter((a) => a.fixtureIds.length === 0 && a.fieldId !== null)
      .map((a) => a.fieldId as string),
  );

  return fixtures.filter(
    (fixture) =>
      scopedFixtureIds.has(fixture.fixtureId) ||
      (fixture.fieldId !== null && scopedFieldIds.has(fixture.fieldId)),
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
  fixture: V1MyTournamentStaffFixture;
}) {
  const when = formatTournamentDateTimeShort(fixture.scheduledAt);
  const meta = [`${fixture.round} · ${fixture.fixtureNumber}번 경기`, when === '' ? '일정 미정' : when]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      className="tm-list-row tm-pressable"
      href={`/tournament-ops/tournaments/${tournamentId}/fixtures/${fixture.fixtureId}/operate`}
      aria-label={`${fixture.title}, 경기 운영 콘솔 열기`}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-body" style={{ color: 'var(--text-strong)' }}>
          {fixture.title}
        </div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>
          {meta}
        </div>
      </div>
      <StaffFixtureStateBadge status={fixture.gameState ?? fixture.status} />
      <ChevronRightIcon size={18} stroke="var(--text-caption)" strokeWidth={2} />
    </Link>
  );
}
