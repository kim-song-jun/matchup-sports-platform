'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Film, MapPin } from 'lucide-react';
import { Card, EmptyState } from '@/components/v1-ui/primitives';
import {
  TournamentStandingsTable,
  type TournamentStandingsRow,
} from '@/components/tournaments/tournament-standings-table';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import { matchOutcomeReasonLabel, toDisplayableOutcomeReason } from '@/lib/match-outcome';
import type { V1MyTournamentFixtures } from '@/hooks/use-v1-api';
import type { GameLineupState } from '@/types/game-operations';
import { AbnormalClockBadge } from './abnormal-clock-badge';
import { LiveBadge } from './live-badge';
import {
  eventPresentation,
  fixtureStatusLabel,
  formatGoalMinute,
  formatScoreline,
  isClockAbnormal,
  isCorrectedOrVoid,
  presentGameEventParticipantName,
  resultStateLabel,
} from './format';
import { PenaltyScoreline } from './penalty-scoreline';
import {
  buildScheduleFilters,
  groupScheduleEntries,
  groupUnscheduledEntries,
  LEAGUE_PHASE_LABELS,
  phaseKeyOf,
  TOURNAMENT_PHASE_LABELS,
  type ScheduleFilter,
  type SchedulePhaseLabels,
} from './schedule-grouping';
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

/**
 * 대진이 아직 안 잡힌 자리인가. **양쪽 다** 미정이고 보여줄 스코어도 없을 때만 참이다 —
 * 한쪽이라도 팀이 정해졌거나 결과가 나온 경기는 그대로 스코어 행으로 그린다(이상한
 * 데이터라도 실제 기록을 숨기지 않는다).
 */
function matchupUndecided(entry: PublicScheduleEntry): boolean {
  return entry.home === null && entry.away === null && entry.score === null;
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
        padding: '2px 8px',
      }}
    >
      {resultStateLabel(entry.resultState)}
    </span>
  );
}

/**
 * 몰수·중단 배지. 이게 없으면 목록에서 몰수 0:0 과 실제 0:0 무승부가 같아 보이고,
 * 순위표에 무승부로 집계된 이유를 관전자가 목록에서 추적할 수 없다(alpha 실측).
 *
 * 사유 본문은 넣지 않는다 — 일정 카드는 한 줄 요약이 계약이고, 사유는 길이 제한이 없어
 * 카드 높이를 예측할 수 없게 만든다. 사유는 경기 상세에서 읽는다.
 * 컬러만으로 구분하지 않는다(WCAG) — 라벨 텍스트가 항상 함께 나온다.
 */
function ScheduleOutcomeBadge({ outcome }: { outcome: PublicScheduleEntry['outcome'] }) {
  const reason = toDisplayableOutcomeReason(outcome?.reason);
  if (reason === null) return null;
  return (
    // role="status" 를 쓰지 않는다 — live region 은 값이 실시간으로 바뀌는 곳(LiveBadge 의
    // 경기 시계)에 쓰는 것이고, 이렇게 렌더 후 변하지 않는 배지에 붙이면 스크린리더가
    // 상태 변경으로 오인해 불필요하게 공지한다. 문맥 안 정적 텍스트로 충분하다.
    <p
      style={{
        margin: '4px 0 0',
        textAlign: 'center',
        fontSize: 'var(--font-size-micro)',
        fontWeight: 700,
        // --orange500 은 텍스트로 쓰면 흰 카드 위 2.16:1 로 WCAG AA 에 한참 못 미친다
        // (큰 글씨 기준 3:1 도 못 넘긴다). --orange700 은 정확히 그 결함 때문에 도입된
        // 토큰이고 흰 배경 5.94:1 · 틴트 배경 5.42:1 을 보장하며, 다크모드에서는
        // 밝은 값으로 재정의돼 양쪽이 함께 해결된다(globals.css 주석 참조).
        color: 'var(--orange700)',
      }}
    >
      {matchOutcomeReasonLabel(reason)}
    </p>
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
 * 경기 이벤트 요약 -- 골과 카드(경고/퇴장)를 **한 축 위에 시간순으로** 쌓는다.
 * 이벤트가 하나도 없으면 이 함수 자체가 `null`을 반환해 빈 줄을 아예 렌더하지 않는다.
 *
 * 한때 이 요약은 골만 실었다 -- 그래서 같은 경기의 같은 경고/퇴장이 경기 상세
 * 타임라인에는 나오는데 대회 일정 카드에서는 통째로 사라졌다(오너 지적). 이제
 * 아이콘 표현은 상세와 같은 `eventPresentation`을 공유한다.
 *
 * 홈/원정 분리: 스코어 행이 이미 "홈은 오른쪽 정렬, 원정은 왼쪽 정렬"로 좌우를
 * 확립해 뒀으므로, 이벤트도 **그 행과 같은 3열 축**(`SCORE_AXIS_COLUMNS`)을
 * 문자 그대로 공유한다 -- 비슷한 패턴을 다시 적는 게 아니라 같은 상수를 쓴다.
 * 한 줄로 시간순 나열만 하면 390px 폭에서 "어느 팀 기록인지"를 알 수 없다.
 *
 * **한 이벤트 = 한 행**이고 아이콘은 그 행 가운데에 놓인다. 예전에는 한 구간의
 * 모든 골이 좌우 칸에 여러 줄로 쌓이는데 가운데 ⚽는 하나뿐이어서, 홈 2골 :
 * 원정 1골 같은 경우 어느 줄이 어느 아이콘에 걸리는지 읽을 수 없었다 -- 카드가
 * 섞이면(골·경고·퇴장 아이콘이 서로 다르다) 그 모호함이 곧장 오독이 된다.
 *
 * 이름이 null(동의 없음)인 이벤트는 이름을 지어내지 않고 시간만 남긴다.
 * jerseyNumber는 DTO에는 있지만 좁은 카드에 다 욱여넣으면 오히려 안 읽히므로 이
 * 컴포넌트는 의도적으로 쓰지 않는다(상세 페이지 타임라인에서는 등번호까지 보여준다).
 */
type ScheduleEventItem = {
  key: string;
  eventType: string;
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
    eventType: scorer.ownGoal ? 'OWN_GOAL' : 'GOAL',
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
    eventType: 'CARD',
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
  // `period === null` = "전/후반을 모른다". 레거시 대회 결과에서 복원된 기록이 그렇다
  // (`goal-event-backfill.ts` -- 원본에 전/후반이 없었고, 서버가 `isPeriodUnknown`으로
  // null을 내려준다). `period !== 1`로 뭉뚱그리면 이 기록들이 전부 "후반"으로 렌더돼,
  // 모른다고 내려온 값이 화면에서는 단정으로 바뀐다.
  const sections = [
    { key: 'first', label: '전반', items: items.filter((item) => item.period === 1).sort(byClock) },
    {
      key: 'second',
      label: '후반',
      items: items.filter((item) => item.period !== null && item.period !== 1).sort(byClock),
    },
    { key: 'unknown', label: '기타', items: items.filter((item) => item.period === null).sort(byClock) },
  ].filter((section) => section.items.length > 0);

  return (
    <div
      role="list"
      aria-label="경기 기록"
      style={{
        display: 'grid',
        gap: 8,
        marginTop: 8,
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
      {` ${presentGameEventParticipantName(item.eventType, item.participantName)}`}
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
              fontSize: 'var(--font-size-micro)',
              lineHeight: 1.4,
              padding: '0 4px',
              borderRadius: 'var(--radius-tight)',
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
    <span style={{ fontSize: 12, fontWeight: 700, color, background, borderRadius: 6, padding: '2px 8px' }}>
      {label}
    </span>
  );
}

function ScheduleRow({
  tournamentId,
  entry,
  myFixture,
  showGroupLabel = true,
}: {
  tournamentId: string;
  entry: PublicScheduleEntry;
  /** 이 경기가 로그인한 팀장의 팀 경기라면 그 정보 — 아니면 undefined(공개 방문자 포함). */
  myFixture?: MyFixtureRowInfo;
  /** 그룹 제목("A조")이 바로 위에 있으면 카드 안에서 같은 말을 되풀이하지 않는다. */
  showGroupLabel?: boolean;
}) {
  const dateLabel = formatTournamentDateTimeShort(entry.scheduledAt);
  const venue = venueLabel(entry);
  const row = (
    <Link
      href={`/tournaments/${tournamentId}/matches/${entry.fixtureId}`}
      // 구분선을 인라인이 아니라 클래스로 그린다 — 인라인 style 은 미디어쿼리가 이길 수
      // 없어서, 데스크톱에서 목록을 2열로 펼 때 격자선을 다시 그릴 방법이 없어진다.
      // 내 팀 경기는 바깥 컨테이너가 테두리를 그린다(액센트 바와 한 겹으로 맞추기 위해).
      className={`tm-pressable${myFixture ? '' : ' tm-schedule-card'}`}
      style={{
        display: 'block',
        padding: '12px 16px',
        minHeight: 44,
        textDecoration: 'none',
      }}
    >
      {myFixture ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: 'var(--blue700)',
              // 행 배경이 중립(grey50)으로 바뀌면서 파란색이 남은 자리는 이 배지와
              // 왼쪽 액센트 바 둘뿐이다 — 배지가 파랗게 떠야 "우리 팀"이 눈에 걸린다.
              // 예전처럼 카드 표면색(흰색)으로 두면 중립 배경 위에서 배지 윤곽이 사라진다.
              background: 'var(--blue50)',
              borderRadius: 6,
              padding: '2px 8px',
            }}
          >
            우리 팀
          </span>
          <LineupStatusBadge lineupState={myFixture.lineupState} />
        </div>
      ) : null}
      {/* 카드 머리줄 — 왼쪽에 "어디서"(조·장소), 오른쪽에 "언제"(날짜·상태).
          장소는 원래 카드 맨 아래에 있었는데, 조로 묶은 뒤로는 카드 안에서 조 이름을
          되풀이하지 않게 되면서 이 왼쪽 자리가 통째로 비었다(오너 지적: "여기서 장소를
          좌상단으로 올려도 될것같아 카드에서"). 빈 자리를 채우면서 스코어 아래 줄도
          한 줄 짧아진다. 긴 구장명은 말줄임으로 접고 날짜 쪽은 줄이지 않는다 —
          경기 시각은 목록에서 가장 자주 찾는 값이라 잘리면 안 된다. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)', display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
          {showGroupLabel ? entry.groupName ?? entry.round : ''}
          {entry.legNumber > 1 ? ` ${entry.legNumber}차` : ''}
          <VideoBadge hasVideo={entry.hasVideo} />
          {venue ? (
            // 아이콘을 함께 둔다 — 경기장 이름이 "1 (1)" 처럼 짧으면 맨 텍스트만으로는
            // 그게 장소인지 번호인지 알 수 없다(오너 지적: "1(1)은 뭔지 모르겠고").
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, fontWeight: 400 }}>
              <MapPin size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{venue}</span>
            </span>
          ) : null}
        </span>
        {/* [R-T2] 고정폭 없는 flex 텍스트 — 12로 상향. */}
        <span style={{ fontSize: 12, color: 'var(--text-caption)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {dateLabel ?? '일정 미정'}
          {entry.status === 'live' ? (
            <LiveBadge clock={entry.clock} periodBreak={entry.periodBreak} />
          ) : (
            ` · ${fixtureStatusLabel(entry.status)}`
          )}
          <ScheduleResultBadge entry={entry} />
        </span>
      </div>
      {matchupUndecided(entry) ? (
        // 양쪽이 다 미정인 자리에 `미정  - : -  미정` 을 그리면, 같은 말이 세 번 반복되면서
        // 스코어 pill 까지 빈 채로 남아 "고장난 카드"로 읽힌다(오너 지적: "미정 vs 미정").
        // 대진이 아직 안 나온 것은 결함이 아니라 정상 상태이므로, 그 사실만 한 줄로 적는다.
        // 한쪽만 미정인 경우(4강 한 자리가 먼저 확정된 상태)는 그대로 둔다 — 그때는
        // "우리 팀 vs 미정" 이 실제로 알려주는 정보다.
        <div
          style={{
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-caption)',
            padding: '4px 0',
          }}
        >
          대진 확정 전
        </div>
      ) : (
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
            borderRadius: 'var(--radius-chip)',
            padding: '4px 0',
          }}
        >
          {formatScoreline(entry.score, entry.scoreStatus)}
        </span>
        <span style={{ textAlign: 'left', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
          {sideLabel(entry.away)}
        </span>
      </div>
      )}
      {/* 스코어 아래 보조 표기 — 스코어 칸(가운데 64px)이 행 정중앙이라 행 전체를
          가운데 정렬하면 그대로 스코어 밑에 놓인다. 승부차기가 없으면 렌더 없음. */}
      <PenaltyScoreline score={entry.score} scoreStatus={entry.scoreStatus} />
      {/* 몰수·중단 배지. 스코어 바로 아래 — 목록만 훑는 관전자에게 이 점수가 정상 경기
          결과가 아니라는 것을 알리는 유일한 자리다. 사유 본문은 길어서 카드에 넣지 않고
          경기 상세에 둔다(카드는 한 줄 요약이 계약이다). */}
      <ScheduleOutcomeBadge outcome={entry.outcome} />
      <MatchEventSummary entry={entry} />
    </Link>
  );

  if (myFixture === undefined) return row;

  // 내 팀 경기는 왼쪽 액센트 바 + 옅은 배경으로 목록에서 즉시 떠오르게 하고, 라인업으로
  // 가는 길을 행 안에 둔다 — 예전에는 경기 상세로 한 번 더 들어가야 라인업 진입점을 만날
  // 수 있었고, 그마저 경기가 공개된 뒤에만 나타났다. 라인업 링크는 행 링크(경기 상세)와
  // 형제로 둔다: 링크 안에 링크를 넣으면 유효하지 않은 마크업이 되고 클릭 대상도 모호해진다.
  return (
    <div
      className="tm-schedule-card tm-schedule-card-mine"
      style={{
        borderLeft: '3px solid var(--blue500)',
        // 예전에는 행 전체를 `--blue50`(#e8f3ff)로 칠했다 — 내 팀 경기가 연달아 있으면
        // 목록의 절반이 통째로 파랗게 덮여, 강조가 아니라 배경 자체가 바뀐 것처럼 보였다
        // (오너 지적: "하이라이트 색상도 그렇고"). 파랑은 왼쪽 액센트 바와 "우리 팀"
        // 배지에만 남기고 면(面)은 중립 톤으로 되돌린다 — 이 저장소의 절제 원칙대로
        // 강조는 넓은 색면이 아니라 좁은 액센트로 준다.
        //
        // `--grey50`이 아니라 `--grey100`인 이유: 스코어 칸이 `--grey50` pill이라,
        // 행 배경까지 `--grey50`으로 두면 **두 색이 정확히 같아져 스코어 pill이 배경에
        // 통째로 녹는다**(alpha 실측: rowBg === pillBg === rgb(249,250,251)). 한 단계
        // 진한 톤을 써서 pill이 그 위로 떠오르게 한다 — 라이트/다크 양쪽 모두에서
        // 두 토큰이 서로 다른 값이라 대비가 유지된다.
        background: 'var(--grey100)',
      }}
    >
      {row}
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
    // 대회는 registrationId(비공개 상태에도 유일), 리그는 teamId(가리지 않으므로 항상 있고
    // 팀당 한 행이라 유일하다). 유니온이 둘 중 하나를 보장한다 — `types.ts` 참조.
    key: row.registrationId ?? row.teamId,
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

/** 한 그룹(A조·4강 …)의 경기 묶음. 그룹 제목을 실제로 그렸으면 카드 안의 같은 라벨은 지운다. */
function ScheduleGroupBlock({
  tournamentId,
  group,
  showGroupHeading,
  myFixtureById,
}: {
  tournamentId: string;
  group: { key: string; label: string; entries: PublicScheduleEntry[] };
  showGroupHeading: boolean;
  myFixtureById: Map<string, MyFixtureRowInfo>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {showGroupHeading ? (
        <div className="tm-text-caption" style={{ color: 'var(--text-caption)', fontWeight: 700 }}>
          {group.label}
        </div>
      ) : null}
      {/* 예전엔 `Card` 하나를 grid 로 쪼갰다 — 화면에는 한 장을 반으로 자른 것처럼 보이고
          경기마다 테두리가 없어 카드로 읽히지 않았다(오너 지적). 이제 경기 하나가 카드 하나다. */}
      <div className="tm-schedule-list">
        {group.entries.map((entry) => (
          <ScheduleRow
            key={entry.fixtureId}
            tournamentId={tournamentId}
            entry={entry}
            myFixture={myFixtureById.get(entry.fixtureId)}
            showGroupLabel={!showGroupHeading}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 단계(조별리그/결선) → 조·라운드 두 겹으로 묶어 보여준다. 예전에는 서버 순서대로 한
 * 목록에 쏟아부었고, 데스크톱 2열에서 A조·B조·결승·4강이 좌우로 뒤섞였다(오너 지적).
 *
 * 필터는 **지금 일정에 실제로 있는 것만** 칩으로 만든다 — 고를 게 없는 칩은 눌러도 빈
 * 화면이라, 있는 척하는 버튼이 된다.
 *
 * F4 fix: 필터 state(`activeFilter`)와 칩 목록(`filters`)은 더 이상 이 컴포넌트가
 * 스스로 갖지 않는다 — `ScheduleContent`가 소유하고 "시간 미정 경기" 섹션과 공유한다.
 * 예전엔 이 컴포넌트 안에만 있어서, 칩을 눌러도 시간 미정 섹션은 필터 state에 접근할
 * 경로 자체가 없어 항상 전체를 그렸다.
 */
function ScheduleSections({
  tournamentId,
  entries,
  myFixtureById,
  filters,
  activeFilter,
  onSelectFilter,
  phaseLabels,
}: {
  tournamentId: string;
  entries: readonly PublicScheduleEntry[];
  myFixtureById: Map<string, MyFixtureRowInfo>;
  filters: ScheduleFilter[];
  activeFilter: string;
  onSelectFilter: (key: string) => void;
  phaseLabels: SchedulePhaseLabels;
}) {
  const phases = groupScheduleEntries(entries, phaseLabels);

  const visiblePhases = phases
    .filter((phase) => activeFilter === 'all' || activeFilter === 'mine' || activeFilter === phase.key)
    .map((phase) => ({
      ...phase,
      groups: phase.groups
        .map((group) => ({
          ...group,
          entries:
            activeFilter === 'mine'
              ? group.entries.filter((entry) => myFixtureById.has(entry.fixtureId))
              : group.entries,
        }))
        .filter((group) => group.entries.length > 0),
    }))
    .filter((phase) => phase.groups.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {filters.length > 1 ? (
        <div role="tablist" aria-label="경기 일정 보기" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filters.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={activeFilter === option.key}
              className={`tm-chip${activeFilter === option.key ? ' tm-chip-active' : ''}`}
              onClick={() => onSelectFilter(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {visiblePhases.length === 0 ? (
        <EmptyState title="해당하는 경기가 없어요" sub="다른 보기를 선택해 주세요." />
      ) : (
        visiblePhases.map((phase) => (
          <section key={phase.key} aria-label={phase.label} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 단계가 하나뿐이면(순수 토너먼트 등) 제목이 목록 전체를 되풀이할 뿐이라 숨긴다. */}
            {phases.length > 1 ? (
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{phase.label}</div>
            ) : null}
            {phase.groups.map((group) => (
              <ScheduleGroupBlock
                key={group.key}
                tournamentId={tournamentId}
                group={group}
                // 그룹 제목이 단계 제목과 같은 말이면(4강 안의 "4강") 한 번만 적는다.
                showGroupHeading={group.label !== phase.label || phase.groups.length > 1}
                myFixtureById={myFixtureById}
              />
            ))}
          </section>
        ))
      )}
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
  isLeague = false,
}: {
  tournamentId: string;
  data: PublicTournamentScheduleResponse;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  showStandings?: boolean;
  /**
   * 정규 리그 시즌인가. **단계 이름만 바꾼다**(칩·`section aria-label`) — 리그 대진은
   * `round` 가 'N주차' 라 전부 `knockout` 으로 분류되는데 그 자리에 대회 말인 '결선' 이
   * 그대로 보였다. 분류 규칙과 나머지 화면은 그대로다.
   *
   * `kind === 'regular_league'` 로만 켠다 — `isLeagueCompetition` 은 `format === 'league'`
   * 인 **리그 방식 대회**도 true 라(alpha 62건 중 7건) 그 대회들의 '결선' 까지 바꿔 버린다.
   */
  isLeague?: boolean;
  /**
   * 로그인한 팀장이 이 대회에서 이끄는 팀의 경기 — 공개 일정 위에 겹쳐 "우리 팀 경기"를
   * 짚어준다. 비로그인 방문자·참가하지 않은 사용자에게는 undefined라 화면이 종전 그대로다.
   */
  myFixtures?: V1MyTournamentFixtures;
}) {
  // F4 fix: 필터는 "경기 일정"과 "시간 미정 경기" 두 섹션이 공유해야 한다 — 컴포넌트
  // 최상단(이른 return보다 앞)에서 훅을 선언해 두 섹션 모두 같은 값을 본다. early
  // return(!data.bracketPublished) 뒤에 두면 훅 순서가 렌더마다 달라질 수 있어 여기에 둔다.
  const [filter, setFilter] = useState('all');

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

  // F4 fix: 칩(전체/내 팀/조별리그/결선)은 "경기 일정" 섹션(data.items)만 보고 만들던 걸
  // 그대로 두되(단계 칩은 일정이 잡힌 경기 기준이 자연스럽다), "내 팀" 칩은 내 경기가
  // 전부 시간 미정이어도 뜨도록 unscheduled까지 함께 본다 — 예전엔 data.items만 봐서
  // 그 경우 칩 자체가 안 떴다.
  const phaseLabels = isLeague ? LEAGUE_PHASE_LABELS : TOURNAMENT_PHASE_LABELS;
  const phases = groupScheduleEntries(data.items, phaseLabels);
  const hasMyFixtures =
    data.items.some((entry) => myFixtureById.has(entry.fixtureId)) ||
    data.unscheduled.some((entry) => myFixtureById.has(entry.fixtureId));
  const filters = buildScheduleFilters(phases, hasMyFixtures);
  // 고른 칩이 사라진 경우(내 경기가 없어졌다거나) 전체로 되돌린다 — 빈 화면에 갇히지 않게.
  const activeFilter = filters.some((option) => option.key === filter) ? filter : 'all';

  // "시간 미정 경기" 섹션도 위 칩과 같은 기준으로 거른다 — 예전엔 필터 state에 접근할
  // 경로 자체가 없어 어떤 칩을 눌러도 이 섹션은 항상 전체를 그렸다.
  const filteredUnscheduled = data.unscheduled.filter((entry) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'mine') return myFixtureById.has(entry.fixtureId);
    return phaseKeyOf(entry) === activeFilter;
  });

  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {hasHiddenIdentity ? (
        <div
          style={{
            padding: '12px 16px',
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
          <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>
            조별 순위
          </h3>
          <StandingsTable rows={data.standings} />
        </section>
      ) : null}

      <section>
        <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>
          경기 일정
        </h3>
        {data.items.length === 0 ? (
          <EmptyState title="아직 확정된 일정이 없어요" sub="경기 시간이 정해지면 여기에 표시돼요." />
        ) : (
          <ScheduleSections
            tournamentId={tournamentId}
            entries={data.items}
            myFixtureById={myFixtureById}
            filters={filters}
            activeFilter={activeFilter}
            onSelectFilter={setFilter}
            phaseLabels={phaseLabels}
          />
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
          <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>
            시간 미정 경기
          </h3>
          {/* 일정이 잡힌 목록과 같은 모양으로 묶는다 — 예전엔 한 줄로 흘려보내서 같은 조의
              경기가 여러 개면 카드마다 `A조`·`4강` 이 반복됐다(오너 지적: "조도 중복되고").
              컨테이너도 `Card` 가 아니라 그룹 목록과 같은 `tm-schedule-list` 다: 행 자체가
              이미 `tm-schedule-card` 라 바깥 카드는 이중 크롬이고, 경기가 1건일 때는 테두리
              안 우측이 "액자 속 빈 공간"으로 남았다. */}
          {filteredUnscheduled.length === 0 ? (
            // 필터가 걸려 시간 미정 경기 전부가 걸러진 경우 — 섹션 제목만 남고 내용이
            // 사라지면 "칩이 먹통인가" 오해를 산다. ScheduleSections의 빈 상태와 같은 문구.
            <EmptyState title="해당하는 경기가 없어요" sub="다른 보기를 선택해 주세요." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {groupUnscheduledEntries(filteredUnscheduled).map((group) => (
                <ScheduleGroupBlock
                  key={group.key}
                  tournamentId={tournamentId}
                  group={group}
                  showGroupHeading
                  myFixtureById={myFixtureById}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
