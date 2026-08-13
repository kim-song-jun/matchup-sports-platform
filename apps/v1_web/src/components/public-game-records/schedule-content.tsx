'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Film } from 'lucide-react';
import { Card, EmptyState } from '@/components/v1-ui/primitives';
import {
  TournamentStandingsTable,
  type TournamentStandingsRow,
} from '@/components/tournaments/tournament-standings-table';
import { useV1MyTeams } from '@/hooks/use-v1-api';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import { AbnormalClockBadge } from './abnormal-clock-badge';
import { LiveBadge } from './live-badge';
import {
  fixtureStatusLabel,
  formatGoalMinute,
  formatScoreline,
  isClockAbnormal,
  isCorrectedOrVoid,
  resultStateLabel,
} from './format';
import { PenaltyScoreline } from './penalty-scoreline';
import type { PublicScheduleEntry, PublicStandingRow, PublicTournamentScheduleResponse } from './types';

/**
 * 참가팀 공개 정책 통일(fix/v1-publish) — side 자체가 null이면 슬롯 미배정("미정"),
 * side는 있는데 teamName이 null이면 모집 중이라 가려진 것("비공개")이다. 이전엔
 * 이 함수가 둘 다 "미정"으로 뭉뚱그렸다 — 사용자가 "대진이 아직 안 정해졌다"와
 * "정해졌는데 안 보여준다"를 구분 못 하게 된다.
 */
function sideLabel(side: PublicScheduleEntry['home']): string {
  if (side === null) return '미정';
  return side.teamName ?? '비공개';
}

function ScheduleResultBadge({ entry }: { entry: PublicScheduleEntry }) {
  if (!isCorrectedOrVoid(entry.resultState)) return null;
  const tone = entry.resultState === 'void' ? 'var(--red500)' : 'var(--blue500)';
  const bg = entry.resultState === 'void' ? 'var(--red50)' : 'var(--blue50)';
  return (
    <span
      style={{
        // [R-T2] 고정 크기 없는 인라인 배지 텍스트 — 12로 상향.
        fontSize: 12,
        fontWeight: 700,
        color: tone,
        background: bg,
        borderRadius: 6,
        padding: '2px 6px',
      }}
    >
      {resultStateLabel(entry.resultState)}
    </span>
  );
}

function venueLabel(entry: PublicScheduleEntry): string | null {
  if (!entry.venue && !entry.fieldName) return null;
  if (entry.venue && entry.fieldName) return `${entry.venue} (${entry.fieldName})`;
  return entry.venue ?? entry.fieldName;
}

/**
 * 일정 카드 안에서 "홈 | 스코어 | 원정"으로 쌓이는 모든 행이 **공유하는 단 하나의
 * 3열 축**. 스코어 행과 득점자 행이 각자 열 폭을 들고 있던 것이 alpha에서 관측된
 * 정렬 틀어짐의 원인이었다 — 스코어 행은 가운데 칸이 64px(`flex 0 0 64px`), 득점자
 * 행은 20px + 좁은 gap 이어서 득점자 텍스트가 팀명 축보다 26px 더 안쪽까지, 즉
 * 스코어 칸 밑으로 파고들었다(390px 실측: 팀명 우단 153px vs 득점자 우단 179px).
 * 두 행이 이 상수를 함께 쓰는 한 축은 다시 어긋날 수 없다.
 *
 * `minmax(0, 1fr)`(기본 `1fr` = `minmax(auto, 1fr)` 아님)은 긴 팀명·긴 득점자
 * 이름이 좌우 트랙을 밀어 가운데 칸을 행 정중앙에서 이탈시키는 것을 막는다 —
 * 넘치면 줄바꿈으로 흡수한다. `PenaltyScoreline`이 "가운데 칸 = 행 정중앙"을
 * 전제로 `textAlign: center` 하나로 스코어 밑에 놓이는 것도 이 고정에 의존한다.
 */
const SCORE_AXIS_COLUMNS = 'minmax(0, 1fr) 64px minmax(0, 1fr)';
const SCORE_AXIS_COLUMN_GAP = 10;

/**
 * 득점자 요약 -- 골이 하나도 없으면 이 함수 자체가 `null`을 반환해 빈 줄을
 * 아예 렌더하지 않는다(요구사항: "골이 없으면 그 줄 자체를 렌더하지 마라").
 *
 * 홈/원정 분리: 스코어 행이 이미 "홈은 오른쪽 정렬, 원정은 왼쪽 정렬"로 좌우를
 * 확립해 뒀으므로, 득점자도 **그 행과 같은 3열 축**(`SCORE_AXIS_COLUMNS`)을
 * 문자 그대로 공유한다 — 비슷한 패턴을 다시 적는 게 아니라 같은 상수를 쓴다.
 * 예시 문구("⚽ 10' 김골키 · 45' 김골키")처럼 한 줄로 이어붙이는 방식은
 * 390px 폭에서 "어느 팀 골인지"를 시간순 나열만으로는 알 수 없다는 문제가 있다
 * (2:0 같은 스코어에서 이게 실제 정보 손실이다) -- 이미 검증된 좌우분리 패턴을
 * 그대로 재사용해 폭 문제와 팀 귀속 모호성을 동시에 해결한다. 이름이 null(동의
 * 없음)인 골은 이름을 지어내지 않고 시간만 남긴다. jerseyNumber는 DTO에는 있지만
 * 좁은 카드에 다 욱여넣으면 오히려 안 읽히므로 이 컴포넌트는 의도적으로 쓰지
 * 않는다(상세 페이지 타임라인에서는 등번호까지 보여준다).
 */
function ScorerSummary({ scorers }: { scorers: PublicScheduleEntry['scorers'] }) {
  if (scorers.length === 0) return null;
  const home = scorers.filter((scorer) => scorer.side === 'home');
  const away = scorers.filter((scorer) => scorer.side === 'away');
  const goalLine = (scorer: PublicScheduleEntry['scorers'][number], index: number) => (
    <div key={index}>
      {formatGoalMinute(scorer.clockMs)}
      {scorer.participantName ? ` ${scorer.participantName}` : ''}
      {isClockAbnormal(scorer.clockMs) ? <AbnormalClockBadge /> : null}
    </div>
  );
  return (
    <div
      role="list"
      aria-label="득점자"
      style={{
        display: 'grid',
        // 스코어 행과 **같은** 축(`SCORE_AXIS_COLUMNS`) — 홈 득점자는 홈 팀명
        // 아래, 원정 득점자는 원정 팀명 아래, ⚽는 스코어 칸 아래에 놓인다.
        gridTemplateColumns: SCORE_AXIS_COLUMNS,
        columnGap: SCORE_AXIS_COLUMN_GAP,
        marginTop: 4,
        // [R-T2] 좌우 1fr 트랙이라 폭이 늘어도 그리드가 흡수 — 12로 상향.
        fontSize: 12,
        color: 'var(--text-caption)',
      }}
    >
      <div style={{ textAlign: 'right' }}>{home.map(goalLine)}</div>
      <div aria-hidden="true" style={{ textAlign: 'center' }}>⚽</div>
      <div style={{ textAlign: 'left' }}>{away.map(goalLine)}</div>
    </div>
  );
}

function VideoBadge({ hasVideo }: { hasVideo: boolean }) {
  if (!hasVideo) return null;
  return (
    <span
      aria-label="경기 영상 있음"
      style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--blue700)' }}
    >
      <Film size={12} aria-hidden="true" />
    </span>
  );
}

/**
 * 내가 owner·manager로 속한 팀 id 집합. `useV1MyTeams()`는 `{ items: [...] }`로
 * 감싼 페이지네이션 응답을 돌려주므로 언랩이 필요하다(team-matches 라인업
 * view-model의 `resolveOwnTeamId`와 동일한 관례 — `.find is not a function`으로
 * 화면 전체가 죽는 걸 막는다). 비로그인 방문자는 `/me/teams` 가 401로 실패해
 * `data`가 `undefined`로 남고, 그 결과 빈 Set이 되어 CTA는 애초에 렌더되지
 * 않는다. **이 Set은 순전히 UI 힌트**다 — 실제 인가는 라인업 화면이
 * `useV1FixtureLineupAccess`로 다시 검증하므로 여기서 최종 판정하지 않는다.
 */
type MyTeamRow = { teamId: string; role: 'owner' | 'manager' | 'member' };

function toManagedTeamIds(
  myTeams: MyTeamRow[] | { items: MyTeamRow[] } | undefined,
): ReadonlySet<string> {
  const rows = Array.isArray(myTeams) ? myTeams : myTeams?.items;
  if (!rows) return new Set();
  return new Set(
    rows.filter((team) => team.role === 'owner' || team.role === 'manager').map((team) => team.teamId),
  );
}

function ScheduleRow({
  tournamentId,
  entry,
  managedTeamIds,
}: {
  tournamentId: string;
  entry: PublicScheduleEntry;
  managedTeamIds: ReadonlySet<string>;
}) {
  const dateLabel = formatTournamentDateTimeShort(entry.scheduledAt);
  const venue = venueLabel(entry);
  // 참가팀(홈 또는 원정) 중 내가 owner·manager로 속한 팀이 있으면 라인업
  // CTA를 보여준다 — 대회 "내 경기" 목록에서 라인업으로 바로 진입하는 경로가
  // 없어 URL을 직접 아는 운영진만 사전 준비할 수 있던 문제(match-page-client.tsx
  // LineupManagementCta 주석 참고)를 일정 화면 쪽에서 메운다.
  const canManageLineup =
    (Boolean(entry.home?.teamId) && managedTeamIds.has(entry.home!.teamId as string)) ||
    (Boolean(entry.away?.teamId) && managedTeamIds.has(entry.away!.teamId as string));
  return (
    <div style={{ borderTop: '1px solid var(--grey100)' }}>
      <Link
        href={`/tournaments/${tournamentId}/matches/${entry.fixtureId}`}
        className="tm-pressable"
        style={{
          display: 'block',
          padding: '12px 16px',
          minHeight: 44,
          textDecoration: 'none',
        }}
      >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)', display: 'flex', gap: 6, alignItems: 'center' }}>
          {entry.groupName ?? entry.round}
          {entry.legNumber > 1 ? ` ${entry.legNumber}차` : ''}
          <VideoBadge hasVideo={entry.hasVideo} />
        </span>
        {/* [R-T2] 고정폭 없는 flex 텍스트 — 12로 상향. */}
        <span style={{ fontSize: 12, color: 'var(--text-caption)', display: 'flex', gap: 6, alignItems: 'center' }}>
          {dateLabel ?? '일정 미정'}
          {entry.status === 'live' ? <LiveBadge clock={entry.clock} /> : ` · ${fixtureStatusLabel(entry.status)}`}
          <ScheduleResultBadge entry={entry} />
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: SCORE_AXIS_COLUMNS,
          columnGap: SCORE_AXIS_COLUMN_GAP,
          alignItems: 'center',
        }}
      >
        <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
          {sideLabel(entry.home)}
        </span>
        <span
          className="tab-num"
          style={{
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 800,
            color: 'var(--text-strong)',
            background: 'var(--grey50)',
            borderRadius: 8,
            padding: '4px 0',
          }}
        >
          {formatScoreline(entry.score, entry.scoreStatus)}
        </span>
        <span style={{ textAlign: 'left', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
          {sideLabel(entry.away)}
        </span>
      </div>
      {/* 스코어 아래 보조 표기 — 스코어 칸(가운데 64px)이 행 정중앙이라 행 전체를
          가운데 정렬하면 그대로 스코어 밑에 놓인다. 승부차기가 없으면 렌더 없음. */}
      <PenaltyScoreline score={entry.score} scoreStatus={entry.scoreStatus} />
      <ScorerSummary scorers={entry.scorers} />
      {venue ? (
        // [R-T2] 고정폭 없는 인라인 텍스트 — 12로 상향.
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-caption)' }}>{venue}</div>
      ) : null}
      </Link>
      {canManageLineup ? (
        // 라인업 CTA는 상세로 가는 행 전체 Link 바깥의 형제 요소다 — <a> 안에
        // <a>를 중첩하면 무효 HTML이라 브라우저가 바깥 링크를 조기 종료시킨다.
        <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'flex-end' }}>
          <Link
            href={`/tournaments/${tournamentId}/matches/${entry.fixtureId}/lineup`}
            className="tm-btn tm-btn-sm tm-btn-primary"
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
          >
            라인업
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/**
 * PublicStandingRow(공개 일정 API) → 공용 순위표 행. registrationId를 key로 쓴다 —
 * 참가팀 공개 정책 통일(fix/v1-publish) 이후 모집 중엔 teamId가 전부 null이라
 * teamId를 key로 쓰면 React key가 전부 충돌한다(registrationId는 비공개 상태에도
 * 항상 채워지는 안정 식별자).
 */
function toStandingsRows(rows: readonly PublicStandingRow[]): TournamentStandingsRow[] {
  return rows.map((row) => ({
    key: row.registrationId,
    teamId: row.teamId,
    teamName: row.teamName,
    teamLogoUrl: row.teamLogoUrl,
    position: row.position,
    points: row.points,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
  }));
}

/**
 * §순위표 지표 통일 — 이전엔 이 표만 승/무/패+승점 컬럼으로, 순위·대진표 탭
 * (bracket-page-client.tsx)의 표는 승점+득실 컬럼으로 따로 그려서 같은 대회의
 * 같은 팀 성적이 탭에 따라 다르게 보였다. 이제 표시 로직은
 * `TournamentStandingsTable` 한 벌뿐이고(컬럼 근거는 그 파일 주석 참고), 이
 * 함수는 그룹 나누기 + 어댑터 변환만 담당한다. 이 API 응답엔 진출(advance)
 * 정보가 없으므로 진출선 하이라이트는 항상 없음(advance=null) — 원래도 이
 * 탭엔 진출 배지가 없었으니 동작 변화 없음.
 */
function StandingsTable({ rows }: { rows: readonly PublicStandingRow[] }) {
  const groups = new Map<string, { groupName: string; rows: PublicStandingRow[] }>();
  for (const row of rows) {
    const bucket = groups.get(row.groupId) ?? { groupName: row.groupName, rows: [] };
    bucket.rows.push(row);
    groups.set(row.groupId, bucket);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from(groups.entries()).map(([groupId, group]) => (
        <section key={groupId} aria-label={`${group.groupName} 순위`}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text-muted)',
              marginBottom: 8,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {group.groupName}
          </div>
          <TournamentStandingsTable
            rows={toStandingsRows(group.rows)}
            advance={null}
            ariaLabel={`${group.groupName} 순위표`}
          />
        </section>
      ))}
    </div>
  );
}

/**
 * `showStandings=false` 는 이 콘텐츠가 **순위표를 이미 보여주는 화면 안에** 들어갈 때
 * 쓴다. `/bracket` 은 "순위 · 대진표" 탭에서 조별 순위를 그리는데, "경기 일정" 탭이
 * 같은 순위표를 한 번 더 그려서 탭만 바꾸면 같은 표가 두 번 나왔다(오너 지적:
 * "중복되는 정보도 많고"). 독립 일정 페이지(`/tournaments/[id]/schedule`)에는 순위표가
 * 달리 없으므로 기본값은 `true` 로 둔다.
 */
export function ScheduleContent({
  tournamentId,
  data,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  showStandings = true,
}: {
  tournamentId: string;
  data: PublicTournamentScheduleResponse;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  showStandings?: boolean;
}) {
  // Rules of Hooks — 아래 `!data.bracketPublished` 조기 return보다 먼저 호출해야 한다.
  //
  // 공개 화면이라 비로그인 방문자에게는 이 요청이 401로 끝난다(retry: 1 이므로 2회).
  // 그 잡음을 없애려고 localStorage 세션 힌트로 요청을 끄는 방법을 검토했으나 쓰지
  // 않는다 — 힌트가 유실된(쿠키 세션은 살아 있는) 로그인 운영진에게 라인업 CTA가
  // 통째로 사라져, 이 CTA를 추가한 목적 자체가 무너진다. RequireAuth 가 production
  // 에서 힌트를 신뢰하지 않고 항상 확인하는 것과 같은 이유다.
  const myTeams = useV1MyTeams();
  const managedTeamIds = useMemo(() => toManagedTeamIds(myTeams.data), [myTeams.data]);

  if (!data.bracketPublished) {
    return (
      <div style={{ padding: '40px 20px' }}>
        <EmptyState title="대진표가 아직 공개되지 않았어요" sub="대회 운영진이 대진을 확정하면 일정이 공개돼요." />
      </div>
    );
  }

  // 참가팀 공개 정책 통일(fix/v1-publish) — 대진표(구조)는 공개됐어도 모집
  // 중(open)이면 그 안의 팀명은 가려진다(사용자가 지적한 "조별일정은 왜 그대로
  // 보이나"의 실제 발단). 백엔드가 status를 직접 내려주지 않으므로(이 응답은
  // status를 애초에 갖고 있지 않다), 응답 데이터 자체에서 "배정은 됐는데 이름이
  // null"인 항목이 있는지로 판정한다 — 운영자·스태프에게는 이 조건이 false가
  // 되므로(실명이 그대로 옴) 배너도 자동으로 안 뜬다.
  const hasHiddenIdentity =
    data.items.some((e) => (e.home && e.home.teamName === null) || (e.away && e.away.teamName === null)) ||
    data.unscheduled.some((e) => (e.home && e.home.teamName === null) || (e.away && e.away.teamName === null)) ||
    data.standings.some((s) => s.teamName === null);

  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {hasHiddenIdentity ? (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--grey50)',
            fontSize: 12,
            color: 'var(--text-caption)',
            lineHeight: 1.5,
          }}
        >
          참가팀 명단은 모집이 마감된 후 공개돼요. 일정과 경기 수는 미리 확인할 수 있어요.
        </div>
      ) : null}
      {showStandings && data.standings.length > 0 ? (
        <section>
          <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>
            조별 순위
          </h3>
          <StandingsTable rows={data.standings} />
        </section>
      ) : null}

      <section>
        <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>
          경기 일정
        </h3>
        {data.items.length === 0 ? (
          <EmptyState title="아직 확정된 일정이 없어요" sub="경기 시간이 정해지면 여기에 표시돼요." />
        ) : (
          <Card pad={0}>
            {data.items.map((entry) => (
              <ScheduleRow key={entry.fixtureId} tournamentId={tournamentId} entry={entry} managedTeamIds={managedTeamIds} />
            ))}
          </Card>
        )}
        {hasNextPage ? (
          <button
            type="button"
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
            style={{ marginTop: 12 }}
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
          >
            {isFetchingNextPage ? '불러오는 중…' : '더 보기'}
          </button>
        ) : null}
      </section>

      {data.unscheduled.length > 0 ? (
        <section>
          <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>
            시간 미정 경기
          </h3>
          <Card pad={0}>
            {data.unscheduled.map((entry) => (
              <ScheduleRow key={entry.fixtureId} tournamentId={tournamentId} entry={entry} managedTeamIds={managedTeamIds} />
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
