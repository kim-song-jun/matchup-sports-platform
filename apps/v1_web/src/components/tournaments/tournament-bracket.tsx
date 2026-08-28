'use client';

/**
 * TournamentBracket — World Cup 스타일 결선 대진표.
 *
 * 모바일 수평 스크롤: [4강 col] → [connector] → [결승 col] → [connector] → [🏆 champion]
 * 각 매치 카드: 팀 아바타 + 이름 + 점수 (승자 파란색 강조)
 * 3·4위전: 본 브래킷 아래 별도 섹션
 * 드래그 스크롤: 마우스/터치 모두 지원
 */

import { Fragment, useRef, useState, useCallback, useEffect } from 'react';
import { Trophy } from 'lucide-react';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import type { V1TournamentFixture, V1TournamentGroup } from '@/types/api';

/* ── 라운드 그룹핑 (기존 pure logic 유지) ── */

interface RoundGroup {
  key: string;
  label: string;
  sortIndex: number;
  fixtures: V1TournamentFixture[];
}

const PHASE_ORDER: Record<string, number> = {
  semi: 0,
  final: 1,
  third_place: 2,
};

const PHASE_LABEL: Record<string, string> = {
  semi: '4강',
  final: '결승',
  third_place: '3·4위전',
};

function getRoundLabel(key: string): string {
  return PHASE_LABEL[key] ?? key;
}

export function groupFixturesByRound(
  fixtures: V1TournamentFixture[],
  groups: V1TournamentGroup[],
): RoundGroup[] {
  const groupById = new Map<string, V1TournamentGroup>(groups.map((g) => [g.id, g]));
  const roundMap = new Map<string, RoundGroup>();

  for (const fixture of fixtures) {
    let key: string;
    let sortIndex: number;

    if (fixture.groupId !== null) {
      const group = groupById.get(fixture.groupId);
      if (group) {
        key = group.phase;
        sortIndex = PHASE_ORDER[group.phase] ?? 99;
      } else {
        key = fixture.round;
        sortIndex = PHASE_ORDER[fixture.round] ?? 100;
      }
    } else {
      key = fixture.round;
      sortIndex = PHASE_ORDER[fixture.round] ?? 100;
    }

    const existing = roundMap.get(key);
    if (existing) {
      existing.fixtures.push(fixture);
      // sortIndex는 가장 낮은 값(우선순위 높은 값)으로 갱신한다.
      if (sortIndex < existing.sortIndex) existing.sortIndex = sortIndex;
    } else {
      roundMap.set(key, { key, label: getRoundLabel(key), sortIndex, fixtures: [fixture] });
    }
  }

  for (const round of roundMap.values()) {
    round.fixtures.sort((a, b) => a.fixtureNumber - b.fixtureNumber);
  }

  return Array.from(roundMap.values()).sort((a, b) => {
    if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
    return a.key.localeCompare(b.key);
  });
}

/* ── 승자 계산 ── */

type WinnerSide = 'home' | 'away' | null;

function getWinner(fixture: V1TournamentFixture): WinnerSide {
  if (!fixture.result) return null;
  const { homeScore, awayScore, hasPenalty, homePenaltyScore, awayPenaltyScore } = fixture.result;
  if (hasPenalty && homePenaltyScore !== null && awayPenaltyScore !== null) {
    if (homePenaltyScore === awayPenaltyScore) return null;
    return homePenaltyScore > awayPenaltyScore ? 'home' : 'away';
  }
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return null;
}

/**
 * 참가팀 공개 정책 통일(fix/v1-publish) — homeTeamName/awayTeamName은 세 상태를
 * 가진다: 아직 배정 안 됨('TBD', tournament-detail.presenter.ts의 관용 표기),
 * 배정은 됐지만 모집 중이라 가려짐(null), 실명(그 외 문자열). "미정"과 "비공개"를
 * 반드시 구분해서 보여준다 — 관전자가 "아직 대진이 안 정해졌다"와 "정해졌는데
 * 안 알려준다"를 구분해야 어느 게 왜 없는지 헷갈리지 않는다.
 */
function teamDisplayName(name: string | null): { label: string; isPlaceholder: boolean } {
  if (name === null) return { label: '비공개', isPlaceholder: true };
  if (name === 'TBD') return { label: '미정', isPlaceholder: true };
  return { label: name, isPlaceholder: false };
}

function getChampion(rounds: RoundGroup[]): string | null {
  const finalRound = rounds.find((r) => r.key === 'final');
  const finalFixture = finalRound?.fixtures[0];
  if (!finalFixture || finalFixture.status !== 'completed') return null;
  const w = getWinner(finalFixture);
  const name = w === 'home' ? finalFixture.homeTeamName : w === 'away' ? finalFixture.awayTeamName : null;
  // 우승팀 이름이 비공개(null)면 "우승"이라는 사실 자체는 최종 결과이므로 숨기지
  // 않되, 팀명을 지어내지 않는다 — ChampionSlot이 champion===null이면 "미정"으로
  // 보이므로, null을 그대로 넘기면 우승 사실 자체가 없던 일처럼 보인다. 모집
  // 중(open) 상태에서 대회가 이미 완료(final fixture completed)되는 것은 실무상
  // 있을 수 없는 조합이지만(모집도 안 끝났는데 결승이 끝남), 방어적으로 대회
  // 이름 자체가 아니라 "비공개"임을 알 수 있게 별도 라벨을 쓴다.
  if (name === null) return '비공개 우승팀';
  return name || null;
}

function penaltyText(fixture: V1TournamentFixture): string {
  const r = fixture.result;
  if (r?.hasPenalty && r.homePenaltyScore !== null && r.awayPenaltyScore !== null) {
    return `PK ${r.homePenaltyScore}:${r.awayPenaltyScore}`;
  }
  return '';
}

/* ── 2차전 합산 매치업 ── */

interface AggregateMatchup {
  id: string;
  homeTeamName: string | null;
  homeTeamId: string | null;
  homeTeamLogoUrl: string | null;
  awayTeamName: string | null;
  awayTeamId: string | null;
  awayTeamLogoUrl: string | null;
  homeAggScore: number;
  awayAggScore: number;
  hasPK: boolean;
  pkInfo: string | null;
  winner: WinnerSide;
  status: string;
  legs: V1TournamentFixture[];
  fixtureNumber: number;
}

/**
 * 2차전(legNumber > 1)이 존재하는 라운드의 픽스처를 fixtureNumber 기준으로 묶어
 * 합산 매치업 배열로 반환한다. 단일 레그라면 그대로 1:1 변환한다.
 */
function aggregateByMatchup(fixtures: V1TournamentFixture[]): AggregateMatchup[] {
  const map = new Map<number, V1TournamentFixture[]>();
  for (const f of fixtures) {
    const list = map.get(f.fixtureNumber) ?? [];
    list.push(f);
    map.set(f.fixtureNumber, list);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([fixtureNumber, legs]) => {
      legs.sort((a, b) => a.legNumber - b.legNumber);
      const leg1 = legs[0];

      if (legs.length === 1) {
        const w = getWinner(leg1);
        return {
          id: leg1.id,
          homeTeamName: leg1.homeTeamName,
          homeTeamId: leg1.homeTeamId,
          homeTeamLogoUrl: leg1.homeTeamLogoUrl,
          awayTeamName: leg1.awayTeamName,
          awayTeamId: leg1.awayTeamId,
          awayTeamLogoUrl: leg1.awayTeamLogoUrl,
          homeAggScore: leg1.result?.homeScore ?? 0,
          awayAggScore: leg1.result?.awayScore ?? 0,
          hasPK: leg1.result?.hasPenalty ?? false,
          pkInfo: penaltyText(leg1) || null,
          winner: w,
          // `AggregateMatchup.status` 는 이 뷰모델 내부 어휘(scheduled/in_progress/
          // completed)다. 진행 중 여부만 `liveStatus` 에서 끌어오고 나머지는 원본
          // 컬럼을 유지한다 — 2차전 합산 분기(아래 anyLive)와 같은 규칙이다.
          status: leg1.liveStatus === 'live' ? 'in_progress' : leg1.status,
          legs,
          fixtureNumber,
        };
      }

      // 2-legged: 1차전 홈팀 기준으로 합산.
      // "어느 레그가 뒤집혔는지"는 registrationId로 판정한다(homeTeamName이 아니다) —
      // 참가팀 공개 정책 통일(fix/v1-publish) 이후 모집 중엔 팀명이 전부 null이라,
      // 이름으로 비교하면 서로 다른(둘 다 비공개인) 팀의 레그가 `null === null`로
      // 잘못 같다고 판정된다. registrationId는 비공개 상태에도 항상 채워지는 안정
      // 식별자라 이 문제가 없다.
      const leg1Home = leg1.homeTeamName;
      const leg1Away = leg1.awayTeamName;
      const leg1AwayRegistrationId = leg1.awayRegistrationId;

      let homeAgg = leg1.result?.homeScore ?? 0;
      let awayAgg = leg1.result?.awayScore ?? 0;

      for (let i = 1; i < legs.length; i++) {
        const leg = legs[i];
        const isReversed = leg.homeRegistrationId === leg1AwayRegistrationId;
        if (isReversed) {
          homeAgg += leg.result?.awayScore ?? 0;
          awayAgg += leg.result?.homeScore ?? 0;
        } else {
          homeAgg += leg.result?.homeScore ?? 0;
          awayAgg += leg.result?.awayScore ?? 0;
        }
      }

      // 승자 판정 (합산 점수 기준, 동점이면 PK)
      let winner: WinnerSide = null;
      if (homeAgg > awayAgg) winner = 'home';
      else if (awayAgg > homeAgg) winner = 'away';
      else {
        const pkLeg = legs.find((l) => l.result?.hasPenalty);
        if (pkLeg?.result?.hasPenalty) {
          const isRevLeg = pkLeg.homeRegistrationId === leg1AwayRegistrationId;
          const homePK = isRevLeg ? pkLeg.result.awayPenaltyScore : pkLeg.result.homePenaltyScore;
          const awayPK = isRevLeg ? pkLeg.result.homePenaltyScore : pkLeg.result.awayPenaltyScore;
          if (homePK !== null && awayPK !== null) {
            winner = homePK > awayPK ? 'home' : 'away';
          }
        }
      }

      // PK 배지용 정보 (정규화)
      const pkLeg = legs.find((l) => l.result?.hasPenalty);
      let pkInfo: string | null = null;
      if (pkLeg?.result?.hasPenalty && pkLeg.result.homePenaltyScore !== null && pkLeg.result.awayPenaltyScore !== null) {
        const isRevLeg = pkLeg.homeRegistrationId === leg1AwayRegistrationId;
        const hPK = isRevLeg ? pkLeg.result.awayPenaltyScore : pkLeg.result.homePenaltyScore;
        const aPK = isRevLeg ? pkLeg.result.homePenaltyScore : pkLeg.result.awayPenaltyScore;
        pkInfo = `PK ${hPK}:${aPK}`;
      }

      const allDone = legs.every((l) => l.status === 'completed');
      // MatchCard 와 같은 이유로 `liveStatus` 기준이다 — 원본 `status` 는 `in_progress`
      // 로 전이되지 않으므로 여기서 보면 2차전 합산 카드도 LIVE 가 되지 않는다.
      const anyLive = legs.some((l) => l.liveStatus === 'live');

      return {
        id: leg1.id,
        homeTeamName: leg1Home,
        homeTeamId: leg1.homeTeamId,
        homeTeamLogoUrl: leg1.homeTeamLogoUrl,
        awayTeamName: leg1Away,
        awayTeamId: leg1.awayTeamId,
        awayTeamLogoUrl: leg1.awayTeamLogoUrl,
        homeAggScore: homeAgg,
        awayAggScore: awayAgg,
        hasPK: !!pkLeg,
        pkInfo,
        winner,
        status: anyLive ? 'in_progress' : allDone ? 'completed' : 'scheduled',
        legs,
        fixtureNumber,
      };
    });
}

/** 라운드 픽스처에 2차전이 있는지 여부 */
function isMultiLeg(fixtures: V1TournamentFixture[]): boolean {
  return fixtures.some((f) => f.legNumber > 1);
}

/* ── 합산 매치 카드 ── */
function AggregateMatchCard({ matchup }: { matchup: AggregateMatchup }) {
  const { homeTeamId, homeTeamName, homeTeamLogoUrl, awayTeamId, awayTeamName, awayTeamLogoUrl, homeAggScore, awayAggScore, winner, status, pkInfo, legs } = matchup;
  const isLive = status === 'in_progress';
  const isDone = status === 'completed';
  const isMulti = legs.length > 1;
  const home = teamDisplayName(homeTeamName);
  const away = teamDisplayName(awayTeamName);

  return (
    <div
      className={`tm-bk2-card${isLive ? ' tm-bk2-card-live' : ''}`}
      role="group"
      aria-label={`${home.label} 대 ${away.label}${isMulti ? ' 합산' : ''}`}
    >
      <div
        className="tm-bk2-row"
        data-winner={winner === 'home' ? 'true' : undefined}
        data-loser={isDone && winner === 'away' ? 'true' : undefined}
      >
        <TeamAvatar seed={homeTeamId ?? home.label} name={home.label} logoUrl={homeTeamLogoUrl} size="sm" />
        <span className="tm-bk2-name" style={home.isPlaceholder ? { color: 'var(--text-caption)' } : undefined}>{home.label}</span>
        <span className="tm-bk2-score tab-num">{homeAggScore}</span>
      </div>
      <div className="tm-bk2-divider" aria-hidden="true" />
      <div
        className="tm-bk2-row"
        data-winner={winner === 'away' ? 'true' : undefined}
        data-loser={isDone && winner === 'home' ? 'true' : undefined}
      >
        <TeamAvatar seed={awayTeamId ?? away.label} name={away.label} logoUrl={awayTeamLogoUrl} size="sm" />
        <span className="tm-bk2-name" style={away.isPlaceholder ? { color: 'var(--text-caption)' } : undefined}>{away.label}</span>
        <span className="tm-bk2-score tab-num">{awayAggScore}</span>
      </div>
      {isLive && <div className="tm-bk2-badge tm-bk2-badge-live">● LIVE</div>}
      {isDone && pkInfo && <div className="tm-bk2-badge">{pkInfo}</div>}
      {isDone && isMulti && !pkInfo && (
        <div className="tm-bk2-badge" style={{ color: 'var(--text-caption)', background: 'var(--grey50)' }}>합산</div>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'scheduled': return '예정';
    case 'in_progress': return '진행 중';
    case 'completed': return '종료';
    default: return '';
  }
}

/* ────────────────────────────────────────────
   BRACKET UI — SVG 커넥터 + 고정 높이 그리드
   ──────────────────────────────────────────── */

/**
 * 매치 슬롯 고정 높이 상수 (px).
 * 카드(팀2행 + 배지) + 상하 여백 = ~92px.
 * SVG 커넥터 계산에 이 값을 직접 사용한다.
 */
const SLOT_H  = 92;  /** 매치 슬롯 높이 (px) */
const SLOT_GAP = 28; /** 슬롯 사이 간격 (px) */
const CONN_W  = 36;  /** 커넥터 열 너비 (px) */
const COL_W   = 180; /** 매치 카드 열 너비 (px) */
const CHAMP_W = 120; /** 챔피언 열 너비 (px) */
const HEAD_H  = 40;  /** 라운드 라벨 행 높이 (px) */

/** N개 슬롯 열의 총 높이 (px) */
function colH(n: number) {
  return n * SLOT_H + Math.max(0, n - 1) * SLOT_GAP;
}
/** n번째 슬롯의 수직 중심 y (px, 열 상단 기준) */
function slotCY(i: number) {
  return i * (SLOT_H + SLOT_GAP) + SLOT_H / 2;
}

/* ── 팀 행 ── */
function MatchTeamRow({
  teamId, name, logoUrl, score, isWinner, isLoser,
}: {
  teamId: string | null; name: string | null; logoUrl: string | null; score: number | null; isWinner: boolean; isLoser: boolean;
}) {
  const { label, isPlaceholder } = teamDisplayName(name);
  const decided = !isPlaceholder;
  return (
    <div
      className="tm-bk2-row"
      data-winner={isWinner ? 'true' : undefined}
      data-loser={isLoser ? 'true' : undefined}
    >
      <TeamAvatar seed={teamId ?? label} name={label} logoUrl={logoUrl} size="sm" />
      <span className="tm-bk2-name" style={!decided ? { color: 'var(--text-caption)' } : undefined}>{label}</span>
      {score !== null && <span className="tm-bk2-score tab-num">{score}</span>}
      {score === null && decided && <span className="tm-bk2-score" style={{ opacity: 0.25 }}>-</span>}
    </div>
  );
}

/* ── 매치 카드 ── */
function MatchCard({ fixture }: { fixture: V1TournamentFixture }) {
  const winner = getWinner(fixture);
  const hasResult = fixture.result !== null;
  const pk = penaltyText(fixture);
  // LIVE 판정은 `liveStatus`(V1Game.state 파생)로만 한다. 원본 `status` 컬럼은 서버
  // 어디에서도 `in_progress`로 전이되지 않아서, 여기서 그 값을 보면 경기가 뛰는 중에도
  // LIVE 배지가 영영 뜨지 않는다. 반면 `completed`는 결과 확정 시 실제로 기록되므로
  // 종료 판정은 원본 컬럼을 그대로 쓴다.
  const isLive = fixture.liveStatus === 'live';
  const isDone = fixture.status === 'completed';
  const timeLabel = formatTournamentDateTimeShort(fixture.scheduledAt);

  // 배지가 1개뿐이면(가장 흔한 케이스 — 시각만 있는 "예정" 카드, 혹은 예전부터 있던
  // LIVE-only·PK-only 단독 케이스) D-12 이전과 동일하게 카드 폭을 꽉 채우는 block 배지를
  // 그대로 유지한다. 2개 이상 동시에 있을 때만(D-12 가 새로 허용한 조합) flex pill row로
  // 감싼다 — 리뷰에서 단일 배지 케이스의 폭 축소가 의도치 않은 회귀로 지적되어 조건부 처리.
  const badges: { key: string; className: string; label: string }[] = [];
  if (timeLabel) badges.push({ key: 'time', className: 'tm-bk2-badge tm-bk2-badge-time', label: timeLabel });
  if (isLive) badges.push({ key: 'live', className: 'tm-bk2-badge tm-bk2-badge-live', label: '● LIVE' });
  if (isDone && pk) badges.push({ key: 'pk', className: 'tm-bk2-badge', label: pk });
  const homeLabel = teamDisplayName(fixture.homeTeamName).label;
  const awayLabel = teamDisplayName(fixture.awayTeamName).label;

  return (
    <div
      className={`tm-bk2-card${isLive ? ' tm-bk2-card-live' : ''}`}
      role="group"
      aria-label={`${homeLabel} 대 ${awayLabel}`}
    >
      <MatchTeamRow
        teamId={fixture.homeTeamId} logoUrl={fixture.homeTeamLogoUrl}
        name={fixture.homeTeamName} score={hasResult ? fixture.result!.homeScore : null}
        isWinner={winner === 'home'} isLoser={isDone && winner === 'away'}
      />
      <div className="tm-bk2-divider" aria-hidden="true" />
      <MatchTeamRow
        teamId={fixture.awayTeamId} logoUrl={fixture.awayTeamLogoUrl}
        name={fixture.awayTeamName} score={hasResult ? fixture.result!.awayScore : null}
        isWinner={winner === 'away'} isLoser={isDone && winner === 'home'}
      />
      {badges.length === 1 && <div className={badges[0].className}>{badges[0].label}</div>}
      {badges.length > 1 && (
        <div className="tm-bk2-badge-row">
          {badges.map((b) => (
            <div key={b.key} className={b.className}>{b.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 챔피언 슬롯 ── */
function ChampionSlot({ champion }: { champion: string | null }) {
  if (champion) {
    return (
      <div className="tm-bk2-champ tm-bk2-champ-won" aria-label={`우승 ${champion}`}>
        <div className="tm-bk2-champ-trophy" aria-hidden="true"><Trophy size={26} className="tm-medal-gold" strokeWidth={1.8} /></div>
        <div className="tm-bk2-champ-label">우승</div>
        <div className="tm-bk2-champ-name">{champion}</div>
      </div>
    );
  }
  return (
    <div className="tm-bk2-champ" aria-label="우승 미정">
      <Trophy size={22} strokeWidth={1.6} style={{ color: 'var(--grey400)' }} aria-hidden="true" />
      <div className="tm-bk2-champ-label" style={{ color: 'var(--text-caption)' }}>우승</div>
      <div className="tm-bk2-champ-name" style={{ color: 'var(--text-caption)', fontWeight: 500 }}>미정</div>
    </div>
  );
}

/**
 * 커넥터의 스파인→출구선이 만나는 접합점 y좌표.
 * BracketSvgConnector(고정폭 CONN_W 내부 드로잉)와 ConnectorSegment(늘어나는
 * 연장선)가 동일한 y를 써야 접합점에서 선이 어긋나지 않는다 — 단일 소스로 공유.
 */
function connectorJunctionY(topCount: number, totalH: number, nextN: number): number {
  if (topCount === 1) return totalH / 2;
  const exitY = nextN === 1 ? totalH / 2 : undefined; // 단일 출구: 열 중앙
  const spineTop = slotCY(0);
  const spineBot = slotCY(topCount - 1);
  return exitY ?? (spineTop + spineBot) / 2;
}

/* ── SVG 커넥터 ──
 * topCount: 상위 라운드 경기 수 (보통 2)
 * totalH:   상위 라운드 열 높이
 * nextN:    다음 라운드 경기 수 (보통 1)
 */
function BracketSvgConnector({
  topCount, totalH, nextN = 1,
}: {
  topCount: number; totalH: number; nextN?: number;
}) {
  const midX = CONN_W / 2;

  if (topCount === 1) {
    /* 단순 수평선: 결승 → 챔피언 — totalH 전체를 쓰고 중앙에 선을 그린다 */
    return (
      <svg width={CONN_W} height={totalH} aria-hidden="true" style={{ flexShrink: 0 }}>
        <line x1={0} y1={totalH / 2} x2={CONN_W} y2={totalH / 2}
          stroke="var(--grey300)" strokeWidth={2} />
      </svg>
    );
  }

  /* 2개 이상: 중앙 스파인 + 각 입력선 + 출구선 */
  const paths: React.ReactNode[] = [];
  const junctionY = connectorJunctionY(topCount, totalH, nextN);
  const spineTop = slotCY(0);
  const spineBot = slotCY(topCount - 1);

  /* 세로 스파인 (왼쪽 절반에 위치) */
  paths.push(
    <line key="spine" x1={midX} y1={spineTop} x2={midX} y2={spineBot}
      stroke="var(--grey300)" strokeWidth={2} />,
  );

  /* 각 슬롯 → 스파인 수평선 */
  for (let i = 0; i < topCount; i++) {
    const cy = slotCY(i);
    paths.push(
      <line key={`h-in-${i}`} x1={0} y1={cy} x2={midX} y2={cy}
        stroke="var(--grey300)" strokeWidth={2} />,
    );
  }

  /* 스파인 → 출구 수평선 */
  paths.push(
    <line key="h-out" x1={midX} y1={junctionY} x2={CONN_W} y2={junctionY}
      stroke="var(--grey300)" strokeWidth={2} />,
  );

  /* 접합점 강조 dot */
  paths.push(
    <circle key="dot" cx={midX} cy={junctionY} r={3}
      fill="var(--grey400)" />,
  );

  return (
    <svg width={CONN_W} height={totalH} aria-hidden="true"
      style={{ flexShrink: 0, overflow: 'visible' }}>
      {paths}
    </svg>
  );
}

/**
 * ── 커넥터 세그먼트 (고정폭 SVG + 늘어나는 연장선) ──
 * 트리가 컬럼 폭보다 좁을 때 남는 폭을 연결선 구간으로 흡수해 트리 왼쪽 끝이
 * 섹션 제목과 정렬되게 한다(fix/v1-bracket-fill-width). SVG 자체는 원래 고정
 * 픽셀 지오메트리(CONN_W)를 그대로 유지해 스파인·점 등이 비율 왜곡 없이 그려지고,
 * 그 오른쪽에 flex-grow 되는 빈 div를 붙여 접합점(junctionY)과 같은 높이에
 * 수평선을 하나 더 그린다 — 이 연장선만 늘어나므로 커넥터 구조 자체는 항상
 * 또렷하게 유지된다. 남는 폭이 없으면(트리가 컬럼보다 넓음) 연장선 폭은 0으로
 * 수렴하고 기존과 동일하게 가로 스크롤된다(모바일 등 좁은 뷰포트 포함).
 */
function ConnectorSegment({
  topCount, totalH, nextN = 1,
}: {
  topCount: number; totalH: number; nextN?: number;
}) {
  const junctionY = connectorJunctionY(topCount, totalH, nextN);
  return (
    <div style={{ display: 'flex', flex: '1 0 auto', minWidth: CONN_W, paddingTop: HEAD_H }}>
      <div style={{ flexShrink: 0 }}>
        <BracketSvgConnector topCount={topCount} totalH={totalH} nextN={nextN} />
      </div>
      <div style={{ flexGrow: 1, minWidth: 0, position: 'relative' }} aria-hidden="true">
        <div style={{
          position: 'absolute', top: junctionY - 1, left: 0, right: 0, height: 2,
          background: 'var(--grey300)',
        }} />
      </div>
    </div>
  );
}

/* ── 라운드 열 ── */
function BracketRoundCol({
  round, headLabel, h, centered = false,
}: {
  round: RoundGroup; headLabel: string; h: number; centered?: boolean;
}) {
  // multi-leg 라운드는 합산 카드로 렌더링
  const multi = isMultiLeg(round.fixtures);
  const matchups = multi ? aggregateByMatchup(round.fixtures) : null;
  const slotCount = matchups ? matchups.length : round.fixtures.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: COL_W, flexShrink: 0 }}>
      {/* 라운드 라벨 */}
      <div style={{ height: HEAD_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="tm-bk2-pill">{headLabel}</span>
      </div>
      {/* 카드 슬롯들 */}
      <div style={{
        height: h, position: 'relative',
        display: 'flex', flexDirection: 'column',
        justifyContent: centered ? 'center' : 'flex-start',
      }}>
        {centered && !matchups ? (
          /* 결승: 세로 정중앙 — single-leg only */
          round.fixtures.map((fix) => (
            <MatchCard key={fix.id} fixture={fix} />
          ))
        ) : matchups ? (
          /* multi-leg: 합산 카드 */
          matchups.map((mu, i) => (
            <div
              key={mu.id}
              style={{ height: SLOT_H, marginTop: i > 0 ? SLOT_GAP : 0, display: 'flex', alignItems: 'center' }}
            >
              <AggregateMatchCard matchup={mu} />
            </div>
          ))
        ) : (
          /* single-leg: 기존 방식 */
          round.fixtures.map((fix, i) => (
            <div
              key={fix.id}
              style={{ height: SLOT_H, marginTop: i > 0 ? SLOT_GAP : 0, display: 'flex', alignItems: 'center' }}
            >
              <MatchCard fixture={fix} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ── 챔피언 열 ── */
function ChampionCol({ champion, h }: { champion: string | null; h: number }) {
  return (
    <div style={{ width: CHAMP_W, flexShrink: 0 }}>
      <div style={{ height: HEAD_H }} /> {/* 라벨 공간 */}
      <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ChampionSlot champion={champion} />
      </div>
    </div>
  );
}

/* ── 빈 브래킷 ── */
function BracketEmpty() {
  return (
    <div style={{
      padding: '28px 16px', textAlign: 'center',
      background: 'var(--grey50)', borderRadius: 'var(--radius-field)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }} aria-hidden="true"><Trophy size={30} style={{ color: 'var(--grey400)' }} strokeWidth={1.6} /></div>
      {/* [R-T1 타입 위계 정리] 13px → 12px(보조 정보 tier) — weight 700은 유지.
          [대진표 12px 인라인 정리] 인라인 스타일 → tm-text-caption-strong/tm-text-caption 토큰. */}
      <div className="tm-text-caption-strong" style={{ marginBottom: 2 }}>대진표 준비 중</div>
      <div className="tm-text-caption">조별 리그가 끝나면 결선 대진표가 공개돼요.</div>
    </div>
  );
}

/* ── Public Component ── */

export interface TournamentBracketProps {
  fixtures: V1TournamentFixture[];
  groups: V1TournamentGroup[];
}

export function TournamentBracket({ fixtures, groups }: TournamentBracketProps) {
  const rounds = groupFixturesByRound(fixtures, groups);
  if (fixtures.length === 0 || rounds.length === 0) return <BracketEmpty />;

  const mainRounds = rounds.filter((r) => r.key !== 'third_place');
  const thirdPlace = rounds.find((r) => r.key === 'third_place') ?? null;
  const champion = getChampion(rounds);

  const roundHeights = mainRounds.map((r) => {
    const slotCount = isMultiLeg(r.fixtures)
      ? aggregateByMatchup(r.fixtures).length
      : r.fixtures.length;
    return colH(slotCount);
  });
  const treeH = Math.max(...roundHeights, SLOT_H);

  /* ── 드래그 스크롤 ── */
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);
  const [dragging, setDragging] = useState(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - scrollRef.current.getBoundingClientRect().left;
    scrollLeftStart.current = scrollRef.current.scrollLeft;
    setDragging(true);
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.getBoundingClientRect().left;
    scrollRef.current.scrollLeft = scrollLeftStart.current - (x - startX.current);
  }, []);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    setDragging(false);
  }, []);

  /* 2026-08-13 (fix/v1-bracket-fill-width): 4강만 있는 등 라운드 수가 적은 대진은
     트리 실폭이 넓은 데스크톱 컬럼(.tm-bracket-page-grid의 1.28fr)보다 좁을 수
     있다. 예전엔 가운데 정렬로 빈 공간을 옮기기만 했는데, 그러면 왼쪽 정렬된
     섹션 제목과 트리 시작점이 어긋나 오히려 더 어색했다. 지금은 라운드 사이
     연결선 구간(ConnectorSegment의 flex-grow 연장선)이 남는 폭을 흡수해 트리가
     컬럼을 꽉 채우도록 CSS만으로 처리한다 — 트리 폭 계산에 JS 측정이 필요 없다.
     fitsWithoutScroll은 오직 스크롤 힌트/페이드 표시 여부에만 남아있다(실제로
     스크롤할 게 없는데 "옆으로 밀어보세요" 안내를 보여주는 게 거짓 안내이므로). */
  const [fitsWithoutScroll, setFitsWithoutScroll] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el) return;
    const check = () => setFitsWithoutScroll(el.scrollWidth <= el.clientWidth + 1);
    check();
    // jsdom(vitest) 등 ResizeObserver 미구현 환경 방어 — 초기 check()는 이미 실행됐으니
    // 리사이즈 재계산만 건너뛴다(테스트는 리사이즈를 시뮬레이션하지 않으므로 영향 없음).
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    // 래퍼(el)뿐 아니라 내용 요소(content)도 관찰한다 — 래퍼 자체 크기는 상위
    // 그리드 컬럼폭에 매여 안 변할 수 있어도, 내용(팀 로고 지연 로드 등)의 실폭이
    // 바뀌면 scrollWidth가 바뀌므로 내용 쪽 리사이즈도 재계산 트리거가 필요하다.
    observer.observe(el);
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [mainRounds.length]);

  return (
    <div>
      {/* 실제로 스크롤할 내용이 없으면(트리가 컬럼 폭 안에 다 들어옴) 힌트 자체가
          거짓 안내가 되므로 숨긴다 — 데스크톱 전용 CSS(.tm-bracket-page-grid
          .tm-bk2-scroll-hint)와 별개로 모바일 폭에서도 동일하게 적용. */}
      {!fitsWithoutScroll && <p className="tm-bk2-scroll-hint">단계별 대진은 옆으로 밀어 확인할 수 있어요.</p>}
      {/* ── 수평 스크롤 브래킷 트리 (드래그 가능) ── */}
      <div style={{ position: 'relative' }}>
        <div
          ref={scrollRef}
          style={{
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 8,
            cursor: dragging ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
          role="region"
          aria-label="결선 대진표"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {/* width:100%로 래퍼 폭을 채우려 하되, 라운드 컬럼·커넥터 최소폭(flexShrink:0
              / minWidth)의 합이 그보다 크면 자연스럽게 오버플로해 상위 overflowX:auto가
              스크롤을 켠다. 남는 폭은 각 ConnectorSegment의 연장선(flex-grow)이 흡수한다. */}
          <div ref={contentRef} style={{ display: 'flex', width: '100%', alignItems: 'flex-start', paddingRight: 8 }}>

            {mainRounds.map((round, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === mainRounds.length - 1;
              // multi-leg 라운드는 matchup 수 기준으로 높이/커넥터 계산
              const slotCount = isMultiLeg(round.fixtures)
                ? aggregateByMatchup(round.fixtures).length
                : round.fixtures.length;
              const rH = colH(slotCount);
              const nextSlotCount = (() => {
                const next = mainRounds[idx + 1];
                if (!next) return 1;
                return isMultiLeg(next.fixtures) ? aggregateByMatchup(next.fixtures).length : next.fixtures.length;
              })();

              return (
                <Fragment key={round.key}>
                  <BracketRoundCol
                    round={round}
                    headLabel={round.label}
                    h={treeH}
                    centered={!isFirst}
                  />
                  {!isLast && (
                    <ConnectorSegment topCount={slotCount} totalH={rH} nextN={nextSlotCount} />
                  )}
                  {isLast && (
                    <ConnectorSegment topCount={1} totalH={treeH} nextN={1} />
                  )}
                </Fragment>
              );
            })}

            <ChampionCol champion={champion} h={treeH} />
          </div>
        </div>

        {/* 오른쪽 페이드 — 더 내용 있음 힌트. 스크롤이 필요 없을 땐 표시 안 함(위 힌트와 동일 근거) */}
        {!fitsWithoutScroll && <div className="tm-bk2-scroll-fade" aria-hidden="true" />}
      </div>

      {/* ── 3·4위전 ── */}
      {thirdPlace && (
        <div className="tm-bk2-third">
          <div className="tm-bk2-third-header">
            <span className="tm-bk2-pill tm-bk2-pill-sm">3 · 4위전</span>
            {/* [R-T2] 고정폭 없는 안내문 — 캡션 토큰과 맞춰 12로 상향. */}
            <span className="tm-text-caption">4강에서 진 두 팀이 3위를 가려요</span>
          </div>
          {thirdPlace.fixtures.map((f) => (
            <div key={f.id} className="tm-bk2-third-match">
              <MatchCard fixture={f} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
