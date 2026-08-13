'use client';

import Link from 'next/link';
import { ClipboardList, MapPin } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { staffRoleLabel } from '@/components/tournament-ops/badges';
import { extractErrorMessage } from '@/lib/error-message';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import {
  myStaffAssignmentEntryHref,
  useV1MyStaffAssignments,
  type V1MyStaffAssignment,
  type V1MyStaffAssignmentFixture,
} from '@/hooks/use-v1-my-staff-assignments';

/**
 * `/tournament-ops` — 스태프가 자기 운영 화면으로 들어가는 유일한 앱 내 출발점.
 *
 * 역할별로 목적지가 다르다:
 *   - FIELD_OPERATOR: 대회 셸(대회 전역 리소스 읽기)에 들어갈 권한이 아예 없다 —
 *     담당 경기 콘솔로 **직행**하는 링크만 준다.
 *   - TOURNAMENT_DIRECTOR / SUPPORT_READONLY: 종전대로 대회 운영 보드(셸)로 간다.
 * 배정이 없으면 링크가 하나도 없는 빈 상태를 보여준다(진입점을 만들지 않는다).
 */

function fixtureLabel(fixture: V1MyStaffAssignmentFixture): string {
  const teams =
    fixture.homeTeamName !== null || fixture.awayTeamName !== null
      ? `${fixture.homeTeamName ?? '미정'} vs ${fixture.awayTeamName ?? '미정'}`
      : `${fixture.round} ${fixture.fixtureNumber}경기`;
  return teams;
}

function fixtureMeta(fixture: V1MyStaffAssignmentFixture): string {
  return [
    formatTournamentDateTimeShort(fixture.scheduledAt) ?? '시간 미정',
    fixture.fieldName ?? undefined,
    `${fixture.round} ${fixture.fixtureNumber}경기`,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' · ');
}

function FieldOperatorCard({ assignment }: { assignment: V1MyStaffAssignment }) {
  return (
    <Card pad={16} style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ color: 'var(--blue700)', flexShrink: 0 }} aria-hidden="true">
          <MapPin size={16} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="tm-text-body-lg" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {assignment.tournamentTitle}
          </div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
            {staffRoleLabel(assignment.role)}
            {assignment.fieldName !== null ? ` · ${assignment.fieldName}` : ''}
          </div>
        </div>
      </div>

      {assignment.fixtures.length === 0 ? (
        <p className="tm-text-label" style={{ color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.5 }}>
          담당으로 지정된 경기가 아직 없어요. 대회 운영자에게 담당 경기장·경기를 확인해 주세요.
        </p>
      ) : (
        <ul role="list" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assignment.fixtures.map((fixture) => (
            <li key={fixture.fixtureId}>
              <Link
                href={myStaffAssignmentEntryHref(assignment, fixture.fixtureId) ?? '#'}
                className="tm-list-row tm-pressable"
                style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="tm-text-body" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fixtureLabel(fixture)}
                  </span>
                  <span className="tm-text-caption" style={{ display: 'block', color: 'var(--text-muted)', marginTop: 2 }}>
                    {fixtureMeta(fixture)}
                  </span>
                </span>
                {/* 링크의 접근 가능한 이름은 위 경기 정보 + 이 라벨로 만들어진다 —
                    별도 sr-only 문구를 덧붙이면 같은 내용이 두 번 읽힌다. */}
                <span className="tm-btn tm-btn-sm tm-btn-primary" style={{ flexShrink: 0 }}>
                  기록하기
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {assignment.fixturesTruncated ? (
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8 }}>
          담당 경기가 많아 가까운 일정부터 보여주고 있어요.
        </p>
      ) : null}
    </Card>
  );
}

function ShellRoleCard({ assignment }: { assignment: V1MyStaffAssignment }) {
  const href = myStaffAssignmentEntryHref(assignment);
  return (
    <Card pad={16} style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-text-body-lg" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {assignment.tournamentTitle}
          </div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
            {staffRoleLabel(assignment.role)}
            {assignment.expiresAt !== null ? ` · ${formatTournamentDateTimeShort(assignment.expiresAt) ?? ''}까지` : ''}
          </div>
        </div>
        {href !== null ? (
          <Link
            href={href}
            className="tm-btn tm-btn-sm tm-btn-primary"
            style={{ flexShrink: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
          >
            운영 보드 열기
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

export function MyStaffAssignmentsClient() {
  const query = useV1MyStaffAssignments();

  return (
    <AppChrome title="내 대회 운영" backHref="/my" bottomNav={false} desktopHead>
      <h1 className="sr-only">내 대회 운영</h1>
      {query.isPending ? (
        <PageSkeleton />
      ) : query.isError ? (
        <ErrorState
          message={extractErrorMessage(query.error, '배정 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')}
          onRetry={() => void query.refetch()}
        />
      ) : (query.data?.items ?? []).length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={36} strokeWidth={1.5} />}
          title="배정된 대회 운영이 없어요"
          sub="대회 운영자가 스태프로 배정하면 여기에서 담당 화면으로 바로 들어갈 수 있어요."
        />
      ) : (
        <div>
          {(query.data?.items ?? []).map((assignment) =>
            assignment.role === 'FIELD_OPERATOR' ? (
              <FieldOperatorCard key={assignment.assignmentId} assignment={assignment} />
            ) : (
              <ShellRoleCard key={assignment.assignmentId} assignment={assignment} />
            ),
          )}
        </div>
      )}
    </AppChrome>
  );
}
