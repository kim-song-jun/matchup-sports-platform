'use client';

import Link from 'next/link';
import { Film } from 'lucide-react';
import { Card, EmptyState } from '@/components/v1-ui/primitives';
import {
  TournamentStandingsTable,
  type TournamentStandingsRow,
} from '@/components/tournaments/tournament-standings-table';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import type { V1MyTournamentFixtures } from '@/hooks/use-v1-api';
import type { GameLineupState } from '@/types/game-operations';
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
type ScheduleEventItem = {
  key: string;
  side: 'home' | 'away';
  icon: string;
  label: string;
  /** 눈에 보이는 표식(자책골 등). `eventPresentation` 이 필요한 이벤트에만 채운다. */
  badge?: string;
  participantName: string | null;
  period: number | null;
  clockMs: number | null;
};

function toScheduleEventItems(entry: PublicScheduleEntry): ScheduleEventItem[] {
  const goals = entry.scorers.map((scorer, index) => ({
    key: `goal-${index}`,
    side: scorer.side,
    ...eventPresentation({ type: scorer.ownGoal ? 'OWN_GOAL' : 'GOAL', cardColor: null }),
    participantName: scorer.participantName,
    period: scorer.period,
    clockMs: scorer.clockMs,
  }));
  // `?? []` -- 서버는 항상 이 키를 채우지만, 배포 과도기나 React Query 캐시에 남은
  // 구 응답에는 `cards` 키가 아예 없을 수 있다(`formatPenaltyScoreline`이 `penalties`를
  // 같은 이유로 방어한다). 시스템 경계에서 들어오는 값이라 키 부재를 정상 입력으로 다룬다.
  const cards = (entry.cards ?? []).map((card, index) => ({
    key: `card-${index}`,
    side: card.side,
    ...eventPresentation({ type: 'CARD', cardColor: card.cardColor }),
    participantName: card.participantName,
    period: card.period,
    clockMs: card.clockMs,
  }));
  return [...goals, ...cards];
}

function MatchEventSummary({ entry }: { entry: PublicScheduleEntry }) {
  const items = toScheduleEventItems(entry);
  if (items.length === 0) return null;

  const byClock = (a: ScheduleEventItem, b: ScheduleEventItem) =>
    (a.clockMs ?? Number.MAX_SAFE_INTEGER) - (b.clockMs ?? Number.MAX_SAFE_INTEGER);
  const firstHalf = scorers.filter((scorer) => scorer.period === 1).sort(byClock);
  const secondHalf = scorers.filter((scorer) => scorer.period !== 1).sort(byClock);
  const goalLine = (scorer: PublicScheduleEntry['scorers'][number], index: number) => (
    <div key={index}>
      {formatGoalMinute(scorer.clockMs)}
      {scorer.participantName ? ` ${scorer.participantName}` : ''}
      {isClockAbnormal(scorer.clockMs) ? <AbnormalClockBadge /> : null}
    </div>
  );
  const halfRow = (label: string, halfScorers: PublicScheduleEntry['scorers']) => {
    const home = halfScorers.filter((scorer) => scorer.side === 'home');
    const away = halfScorers.filter((scorer) => scorer.side === 'away');
    if (halfScorers.length === 0) return null;
    return (
      <div
        role="group"
        aria-label={label}
        style={{
          display: 'grid',
          gridColumn: '1 / -1',
          gridTemplateColumns: SCORE_AXIS_COLUMNS,
          columnGap: SCORE_AXIS_COLUMN_GAP,
        }}
      >
        <div style={{ textAlign: 'right' }}>{home.map(goalLine)}</div>
        <div aria-hidden="true" style={{ textAlign: 'center' }}>⚽</div>
        <div style={{ textAlign: 'left' }}>{away.map(goalLine)}</div>
      </div>
    );
  };
  return (
    <div
      role="list"
      aria-label="득점자"
      style={{
        display: 'grid',
        gridTemplateColumns: SCORE_AXIS_COLUMNS,
        columnGap: SCORE_AXIS_COLUMN_GAP,
        marginTop: 4,
        // [R-T2] 좌우 1fr 트랙이라 폭이 늘어도 그리드가 흡수 — 12로 상향.
        fontSize: 12,
        color: 'var(--text-caption)',
      }}
    >
      {sections.map((section) => (
        <div key={section.key} role="group" aria-label={`${section.label} 기록`} style={{ display: 'grid', gap: 3 }}>
          {/* 예전엔 전/후반 사이에 점선 하나만 그어서 그게 무슨 경계인지 알 수 없었다 —
              구간 이름을 직접 적는다(디자인 규칙: 의미 구분은 선·색만으로 하지 않는다). */}
          <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontWeight: 700, color: 'var(--text-caption)', whiteSpace: 'nowrap' }}>
              {section.label}
            </span>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          {section.items.map((item) => (
            <ScheduleEventRow key={item.key} item={item} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ScheduleEventRow({ item }: { item: ScheduleEventItem }) {
  const content = (
    <span>
      {formatGoalMinute(item.clockMs)}
      {item.participantName ? ` ${item.participantName}` : ''}
      {isClockAbnormal(item.clockMs) ? <AbnormalClockBadge /> : null}
    </span>
  );

  return (
    <div
      role="listitem"
      style={{
        display: 'grid',
        gridTemplateColumns: SCORE_AXIS_COLUMNS,
        columnGap: SCORE_AXIS_COLUMN_GAP,
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'right' }}>{item.side === 'home' ? content : null}</div>
      <div style={{ textAlign: 'center', lineHeight: 1 }}>
        <span aria-hidden="true">{item.icon}</span>
        <span className="sr-only">{item.label}</span>
        {item.badge ? (
          /* 자책골처럼 아이콘만으로 뜻이 갈리지 않는 이벤트에 붙는 **보이는** 표식.
             `sr-only` 라벨만으로는 화면에서 일반 골과 구분되지 않는다(2026-08-19 alpha 실측:
             관전자에게는 원정 열에 홈 선수 이름이 뜬 일반 골로만 보였다). */
          <span
            style={{
              fontSize: 10,
              lineHeight: 1.4,
              padding: '0 4px',
              borderRadius: 4,
              fontWeight: 700,
              // 실제 팔레트 토큰을 쓴다 — `--danger-*` 는 이 코드베이스에 없어서
              // 하드코딩 fallback 이 항상 적용되고 있었다(다크모드도 따라오지 않는다).
              color: 'var(--red700)',
              background: 'var(--tint-red)',
            }}
          >
            {item.badge}
          </span>
        ) : null}
      </div>
      <div style={{ textAlign: 'left' }}>{item.side === 'away' ? content : null}</div>
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

/** 일정 행에 얹을 "내 팀 경기" 정보 — `useV1MyTournamentFixtures` 응답에서 온다. */
type MyFixtureRowInfo = { lineupState: GameLineupState | null };

/**
 * 라인업 상태는 팀장이 이 화면에서 가장 먼저 확인해야 하는 것이다 — 색만으로 구분하지
 * 않고 문구를 함께 둔다(디자인 규칙: 의미 구분은 컬러 + 텍스트 병행).
 */
function LineupStatusBadge({ lineupState }: { lineupState: GameLineupState | null }) {
  const { label, color, background } =
    lineupState === null
      ? { label: '라인업 미작성', color: 'var(--orange700)', background: 'var(--orange50)' }
      : lineupState === 'DRAFT'
        ? { label: '라인업 작성 중', color: 'var(--orange700)', background: 'var(--orange50)' }
        : { label: '라인업 제출 완료', color: 'var(--blue700)', background: 'var(--blue50)' };
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color, background, borderRadius: 6, padding: '2px 6px' }}>
      {label}
    </span>
  );
}

/**
 * 화면 맨 위의 "우리 팀" 요약 — 팀장이 들어오자마자 **무엇이 남았는지**를 보고, 가장
 * 급한 경기로 바로 갈 수 있게 한다. 아래 목록에서 내 경기를 찾아 훑는 일 자체를 없애는 게
 * 목적이라 미제출 건수와 바로가기가 핵심이고, 할 일이 없으면(전부 제출) 그 사실만 알린다.
 */
function MyTeamLineupSummary({
  tournamentId,
  team,
}: {
  tournamentId: string;
  team: V1MyTournamentFixtures['teams'][number];
}) {
  const pending = team.fixtures.filter(
    (fixture) => fixture.lineupState === null || fixture.lineupState === 'DRAFT',
  );
  // 가장 임박한 경기부터 처리하게 한다 — 일정 미정(scheduledAt=null)은 맨 뒤로.
  const next = [...pending].sort((a, b) => {
    if (a.scheduledAt === null) return 1;
    if (b.scheduledAt === null) return -1;
    return a.scheduledAt.localeCompare(b.scheduledAt);
  })[0];
  return (
    <Card pad={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{team.teamName}</span>
        <span style={{ fontSize: 12, color: 'var(--text-caption)' }}>우리 팀 경기 {team.fixtures.length}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-strong)' }}>
        {team.fixtures.length === 0
          ? '아직 배정된 경기가 없어요.'
          : pending.length === 0
            ? '모든 경기의 라인업을 제출했어요.'
            : `라인업이 아직 정해지지 않은 경기가 ${pending.length}경기 있어요.`}
      </div>
      {next !== undefined ? (
        <div style={{ marginTop: 10 }}>
          <Link
            href={`/tournaments/${tournamentId}/matches/${next.fixtureId}/lineup`}
            className="tm-btn tm-btn-sm tm-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}
          >
            {next.opponentTeamName !== null ? `${next.opponentTeamName}전 라인업 준비하기` : '라인업 준비하기'}
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

function ScheduleRow({
  tournamentId,
  entry,
  myFixture,
}: {
  tournamentId: string;
  entry: PublicScheduleEntry;
  /** 이 경기가 로그인한 팀장의 팀 경기라면 그 정보 — 아니면 undefined(공개 방문자 포함). */
  myFixture?: MyFixtureRowInfo;
}) {
  const dateLabel = formatTournamentDateTimeShort(entry.scheduledAt);
  const venue = venueLabel(entry);
  const row = (
    <Link
      href={`/tournaments/${tournamentId}/matches/${entry.fixtureId}`}
      className="tm-pressable"
      style={{
        display: 'block',
        padding: '12px 16px',
        minHeight: 44,
        // 내 팀 경기는 바깥 컨테이너가 테두리를 그린다(액센트 바와 한 겹으로 맞추기 위해).
        ...(myFixture ? {} : { borderTop: '1px solid var(--grey100)' }),
        textDecoration: 'none',
      }}
    >
      {myFixture ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: 'var(--blue700)',
              background: 'var(--card-surface)',
              borderRadius: 6,
              padding: '2px 6px',
            }}
          >
            우리 팀
          </span>
          <LineupStatusBadge lineupState={myFixture.lineupState} />
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)', display: 'flex', gap: 6, alignItems: 'center' }}>
          {entry.groupName ?? entry.round}
          {entry.legNumber > 1 ? ` ${entry.legNumber}차` : ''}
          <VideoBadge hasVideo={entry.hasVideo} />
        </span>
        {/* [R-T2] 고정폭 없는 flex 텍스트 — 12로 상향. */}
        <span style={{ fontSize: 12, color: 'var(--text-caption)', display: 'flex', gap: 6, alignItems: 'center' }}>
          {dateLabel ?? '일정 미정'}
          {entry.status === 'live' ? (
            <LiveBadge clock={entry.clock} periodBreak={entry.periodBreak} />
          ) : (
            ` · ${fixtureStatusLabel(entry.status)}`
          )}
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
  );

  if (myFixture === undefined) return row;

  // 내 팀 경기는 왼쪽 액센트 바 + 옅은 배경으로 목록에서 즉시 떠오르게 하고, 라인업으로
  // 가는 길을 행 안에 둔다 — 예전에는 경기 상세로 한 번 더 들어가야 라인업 진입점을 만날
  // 수 있었고, 그마저 경기가 공개된 뒤에만 나타났다. 라인업 링크는 행 링크(경기 상세)와
  // 형제로 둔다: 링크 안에 링크를 넣으면 유효하지 않은 마크업이 되고 클릭 대상도 모호해진다.
  return (
    <div
      style={{
        borderTop: '1px solid var(--grey100)',
        borderLeft: '3px solid var(--blue500)',
        background: 'var(--blue50)',
      }}
    >
      {row}
      <div style={{ padding: '0 16px 12px' }}>
        <Link
          href={`/tournaments/${tournamentId}/matches/${entry.fixtureId}/lineup`}
          className="tm-btn tm-btn-sm tm-btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}
        >
          {myFixture.lineupState === null ? '라인업 짜기' : '라인업 보기'}
        </Link>
      </div>
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
  myFixtures,
}: {
  tournamentId: string;
  data: PublicTournamentScheduleResponse;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  showStandings?: boolean;
  /**
   * 로그인한 팀장이 이 대회에서 이끄는 팀의 경기 — 공개 일정 위에 겹쳐 "우리 팀 경기"를
   * 짚어준다. 비로그인 방문자·참가하지 않은 사용자에게는 undefined라 화면이 종전 그대로다.
   */
  myFixtures?: V1MyTournamentFixtures;
}) {
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

  // fixtureId로 바로 찾을 수 있게 펼쳐 둔다 — 한 사용자가 이 대회에서 두 팀을 이끄는
  // 경우도 있어(팀별로 따로 등록) 팀을 가로질러 모은다.
  const myFixtureById = new Map<string, MyFixtureRowInfo>();
  for (const team of myFixtures?.teams ?? []) {
    for (const fixture of team.fixtures) {
      myFixtureById.set(fixture.fixtureId, { lineupState: fixture.lineupState });
    }
  }
  const myTeams = (myFixtures?.teams ?? []).filter((team) => team.fixtures.length > 0);

  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {myTeams.length > 0 ? (
        <section aria-label="우리 팀 라인업" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {myTeams.map((team) => (
            <MyTeamLineupSummary key={team.registrationId} tournamentId={tournamentId} team={team} />
          ))}
        </section>
      ) : null}
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
              <ScheduleRow
                key={entry.fixtureId}
                tournamentId={tournamentId}
                entry={entry}
                myFixture={myFixtureById.get(entry.fixtureId)}
              />
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
              <ScheduleRow
                key={entry.fixtureId}
                tournamentId={tournamentId}
                entry={entry}
                myFixture={myFixtureById.get(entry.fixtureId)}
              />
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
