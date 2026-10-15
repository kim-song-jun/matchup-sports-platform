'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { useV1TeamGameRoster, type V1GameRosterView } from '@/hooks/use-v1-game-roster';
import { V1ApiError } from '@/lib/api-client';
import { gameRosterErrorMessage } from '@/lib/game-roster-errors';
import { gameRosterReasonLabel } from '@/lib/v1-status-labels';
import { gameRosterScreenPath } from '@/lib/game-roster-routes';
import { withFromPath } from '@/lib/session-storage';
import { useCurrentHref } from '@/components/v1-ui/use-current-href';
import { GAME_ROSTER_TITLE } from '@/lib/roster-presentation';
import { RegistrationRosterEntry } from './registration-roster-entry';
import type { MyMatchRosterTeam } from './use-my-match-roster-team';

/** 칩으로 이름을 보여 줄 인원 — 나머지는 "+N". */
const CHIP_LIMIT = 3;

/** 우리 팀 명단이 없거나(404 — 친선·명단 없음·대진이 바뀜) 볼 수 없는(401·403) 경우는 카드가 없는 게 정상이다. */
function isExpectedAbsence(error: unknown): boolean {
  return error instanceof V1ApiError && [401, 403, 404].includes(error.statusCode);
}

/**
 * 경기 상세의 "우리 팀 출전" 카드(Task 179 ①) — 대회·리그 경기 상세가 같이 쓴다.
 * 출전 인원·빠진 사람 요약은 우리 팀 팀원 모두, "명단 조정"(빠른 선택 시트 ③)은 서버가 편집 가능하다고 한
 * 사람(팀장·매니저·운영자)에게만. 상대팀 명단은 여기서 다루지 않는다 — 공개 기록 본문의 라인업이 그 몫이다.
 */
export function MatchTeamRosterCard({
  team,
  footer,
}: {
  team: MyMatchRosterTeam;
  /** 카드 맨 아래 한 줄 — 화면이 명단과 내 행을 보고 정한다(리그 경기 상세의 "내 기록 연결"). */
  footer?: (context: { view: V1GameRosterView; viewerRow: V1GameRosterView['base'][number] | undefined }) => ReactNode;
}) {
  if (team.status === 'none' || team.status === 'loading') return null;
  if (team.status === 'error') {
    if (isExpectedAbsence(team.error)) return null;
    return (
      <Card pad={16}>
        <h2 className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
          {GAME_ROSTER_TITLE}
        </h2>
        <p className="tm-text-caption" style={{ margin: '4px 0 0' }}>
          {gameRosterErrorMessage(team.error, '우리 팀 경기 정보를 불러오지 못했어요.')}
        </p>
      </Card>
    );
  }
  return <ResolvedRosterCard teamId={team.teamId} gameId={team.gameId} viewerUserId={team.viewerUserId} footer={footer} />;
}

function ResolvedRosterCard({
  teamId,
  gameId,
  viewerUserId,
  footer,
}: {
  teamId: string;
  gameId: string;
  viewerUserId: string;
  footer?: Parameters<typeof MatchTeamRosterCard>[0]['footer'];
}) {
  const roster = useV1TeamGameRoster(teamId, gameId);
  const currentHref = useCurrentHref();

  if (roster.isError) {
    if (isExpectedAbsence(roster.error)) return null;
    return (
      <Card pad={16}>
        <h2 className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
          {GAME_ROSTER_TITLE}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <p className="tm-text-caption" style={{ margin: 0 }}>
            {gameRosterErrorMessage(roster.error, '우리 팀 출전 명단을 불러오지 못했어요.')}
          </p>
          <Button variant="outline" size="sm" onClick={() => void roster.refetch()}>
            다시 불러오기
          </Button>
        </div>
      </Card>
    );
  }
  const data = roster.data;
  if (data === undefined) {
    return <div className="tm-skeleton" style={{ height: 120, borderRadius: 'var(--radius-control)' }} />;
  }

  const shown = data.participants.slice(0, CHIP_LIMIT);
  const rest = data.participants.length - shown.length;
  return (
    <Card pad={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
          {GAME_ROSTER_TITLE}
        </h2>
        <span className="tm-badge tm-badge-sm tm-badge-green">{data.counts.participating}명</span>
      </div>
      {data.participants.length > 0 ? (
        <ul
          aria-label="우리 팀 출전 선수"
          style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}
        >
          {shown.map((row) => (
            <li key={row.userId} className="tm-badge tm-badge-grey">
              {row.jerseyNumber === null ? row.displayName : `${row.jerseyNumber} ${row.displayName}`}
            </li>
          ))}
          {rest > 0 ? (
            <li className="tm-badge tm-badge-grey">
              <span aria-hidden="true">+{rest}</span>
              <span className="sr-only">외 {rest}명</span>
            </li>
          ) : null}
        </ul>
      ) : null}
      <p className="tm-text-caption" style={{ margin: '8px 0 0' }}>
        {rosterSummaryLine(data)}
      </p>
      {data.legacyLineupPending ? (
        <p className="tm-text-caption" style={{ margin: '4px 0 0' }}>
          예전에 저장한 참석명단이 아직 경기 기록에 쓰이고 있어요.
        </p>
      ) : null}
      <RosterFooter view={data} href={withFromPath(gameRosterScreenPath(teamId, gameId), currentHref)} />
      <RegistrationRosterEntry view={data} variant="inline" />
      {footer?.({ view: data, viewerRow: data.base.find((row) => row.userId === viewerUserId) })}
    </Card>
  );
}

function RosterFooter({ view, href }: { view: V1GameRosterView; href: string }) {
  if (view.editable) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
        <span className="tm-text-caption">경기 시작 전까지 바꿀 수 있어요</span>
        <Link className="tm-btn tm-btn-sm tm-btn-outline" href={href}>이번 경기 출전 관리</Link>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      {view.gameState !== 'SCHEDULED' ? <p className="tm-text-caption">경기가 시작돼 명단을 바꿀 수 없어요.</p> : null}
      <Link className="tm-btn tm-btn-sm tm-btn-outline" href={href}>경기 출전 보기</Link>
    </div>
  );
}

/** "참가 명단 기준 · 1명 빠짐(박서준, 부상)" — 결장·출전정지는 따로 센다(계산이 뺀 사람이라 사유가 다르다). */
export function rosterSummaryLine(view: V1GameRosterView): string {
  const basis = view.baseSource === 'TEAM_MEMBERS' ? '팀원 기준' : '참가 명단 기준';
  const parts = [basis];
  if (view.excluded.length === 0) {
    parts.push('빠진 선수 없음');
  } else {
    const names = view.excluded.map((row) => {
      const reason = gameRosterReasonLabel(row.reason);
      return reason === null ? row.displayName : `${row.displayName}, ${reason}`;
    });
    parts.push(`${view.excluded.length}명 빠짐(${names.join(' · ')})`);
  }
  if (view.unavailable.length > 0) parts.push(`결장 ${view.unavailable.length}명`);
  if (view.suspended.length > 0) parts.push(`출전정지 ${view.suspended.length}명`);
  return parts.join(' · ');
}
