'use client';

/**
 * TournamentBracket — World Cup 스타일 결선 대진표.
 *
 * 모바일 수평 스크롤: [4강 col] → [connector] → [결승 col] → [connector] → [🏆 champion]
 * 각 매치 카드: 팀 아바타 + 이름 + 점수 (승자 파란색 강조)
 * 3·4위전: 본 브래킷 아래 별도 섹션
 * 드래그 스크롤: 마우스/터치 모두 지원
 */

import { useRef, useState, useCallback } from 'react';
import { Trophy } from 'lucide-react';
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
        sortIndex = 100;
      }
    } else {
      key = fixture.round;
      sortIndex = 100;
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

function getChampion(rounds: RoundGroup[]): string | null {
  const finalRound = rounds.find((r) => r.key === 'final');
  const finalFixture = finalRound?.fixtures[0];
  if (!finalFixture || finalFixture.status !== 'completed') return null;
  const w = getWinner(finalFixture);
  if (w === 'home') return finalFixture.homeTeamName || null;
  if (w === 'away') return finalFixture.awayTeamName || null;
  return null;
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
  homeTeamName: string;
  awayTeamName: string;
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
          awayTeamName: leg1.awayTeamName,
          homeAggScore: leg1.result?.homeScore ?? 0,
          awayAggScore: leg1.result?.awayScore ?? 0,
          hasPK: leg1.result?.hasPenalty ?? false,
          pkInfo: penaltyText(leg1) || null,
          winner: w,
          status: leg1.status,
          legs,
          fixtureNumber,
        };
      }

      // 2-legged: 1차전 홈팀 기준으로 합산
      const leg1Home = leg1.homeTeamName;
      const leg1Away = leg1.awayTeamName;

      let homeAgg = leg1.result?.homeScore ?? 0;
      let awayAgg = leg1.result?.awayScore ?? 0;

      for (let i = 1; i < legs.length; i++) {
        const leg = legs[i];
        const isReversed = leg.homeTeamName === leg1Away;
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
          const isRevLeg = pkLeg.homeTeamName === leg1Away;
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
        const isRevLeg = pkLeg.homeTeamName === leg1Away;
        const hPK = isRevLeg ? pkLeg.result.awayPenaltyScore : pkLeg.result.homePenaltyScore;
        const aPK = isRevLeg ? pkLeg.result.homePenaltyScore : pkLeg.result.awayPenaltyScore;
        pkInfo = `PK ${hPK}:${aPK}`;
      }

      const allDone = legs.every((l) => l.status === 'completed');
      const anyLive = legs.some((l) => l.status === 'in_progress');

      return {
        id: leg1.id,
        homeTeamName: leg1Home,
        awayTeamName: leg1Away,
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
  const { homeTeamName, awayTeamName, homeAggScore, awayAggScore, winner, status, pkInfo, legs } = matchup;
  const isLive = status === 'in_progress';
  const isDone = status === 'completed';
  const isMulti = legs.length > 1;

  const homeInitial = homeTeamName?.trim().charAt(0) || '?';
  const awayInitial = awayTeamName?.trim().charAt(0) || '?';

  return (
    <div
      className={`tm-bk2-card${isLive ? ' tm-bk2-card-live' : ''}`}
      role="group"
      aria-label={`${homeTeamName} 대 ${awayTeamName}${isMulti ? ' 합산' : ''}`}
    >
      <div
        className="tm-bk2-row"
        data-winner={winner === 'home' ? 'true' : undefined}
        data-loser={isDone && winner === 'away' ? 'true' : undefined}
      >
        <span className="tm-bk2-avatar" aria-hidden="true">{homeInitial}</span>
        <span className="tm-bk2-name">{homeTeamName}</span>
        <span className="tm-bk2-score tab-num">{homeAggScore}</span>
      </div>
      <div className="tm-bk2-divider" aria-hidden="true" />
      <div
        className="tm-bk2-row"
        data-winner={winner === 'away' ? 'true' : undefined}
        data-loser={isDone && winner === 'home' ? 'true' : undefined}
      >
        <span className="tm-bk2-avatar" aria-hidden="true">{awayInitial}</span>
        <span className="tm-bk2-name">{awayTeamName}</span>
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
  name, score, isWinner, isLoser,
}: {
  name: string; score: number | null; isWinner: boolean; isLoser: boolean;
}) {
  const initial = name?.trim().charAt(0) || '?';
  const decided = (name?.trim().length ?? 0) > 0;
  return (
    <div
      className="tm-bk2-row"
      data-winner={isWinner ? 'true' : undefined}
      data-loser={isLoser ? 'true' : undefined}
    >
      <span className="tm-bk2-avatar" aria-hidden="true">{decided ? initial : '?'}</span>
      <span className="tm-bk2-name">{decided ? name : '미정'}</span>
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
  const isLive = fixture.status === 'in_progress';
  const isDone = fixture.status === 'completed';

  return (
    <div
      className={`tm-bk2-card${isLive ? ' tm-bk2-card-live' : ''}`}
      role="group"
      aria-label={`${fixture.homeTeamName || '미정'} 대 ${fixture.awayTeamName || '미정'}`}
    >
      <MatchTeamRow
        name={fixture.homeTeamName} score={hasResult ? fixture.result!.homeScore : null}
        isWinner={winner === 'home'} isLoser={isDone && winner === 'away'}
      />
      <div className="tm-bk2-divider" aria-hidden="true" />
      <MatchTeamRow
        name={fixture.awayTeamName} score={hasResult ? fixture.result!.awayScore : null}
        isWinner={winner === 'away'} isLoser={isDone && winner === 'home'}
      />
      {isLive && <div className="tm-bk2-badge tm-bk2-badge-live">● LIVE</div>}
      {isDone && pk && <div className="tm-bk2-badge">{pk}</div>}
      {!isDone && !isLive && fixture.scheduledAt && (
        <div className="tm-bk2-badge tm-bk2-badge-time">
          {new Date(fixture.scheduledAt).toLocaleDateString('ko-KR', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
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
  const exitY = nextN === 1 ? totalH / 2 : undefined; // 단일 출구: 열 중앙

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
  const spineTop = slotCY(0);
  const spineBot = slotCY(topCount - 1);
  const junctionY = exitY ?? (spineTop + spineBot) / 2;

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
      background: 'var(--grey50)', borderRadius: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }} aria-hidden="true"><Trophy size={30} style={{ color: 'var(--grey400)' }} strokeWidth={1.6} /></div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2 }}>대진표 준비 중</div>
      <div style={{ fontSize: 12, color: 'var(--text-caption)' }}>조별 리그가 끝나면 결선 대진표가 공개돼요.</div>
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

  return (
    <div>
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
          <div style={{ display: 'inline-flex', alignItems: 'flex-start', paddingRight: 8 }}>

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
                <div key={round.key} style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <BracketRoundCol
                    round={round}
                    headLabel={round.label}
                    h={treeH}
                    centered={!isFirst}
                  />
                  {!isLast && (
                    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, paddingTop: HEAD_H }}>
                      <BracketSvgConnector
                        topCount={slotCount}
                        totalH={rH}
                        nextN={nextSlotCount}
                      />
                    </div>
                  )}
                  {isLast && (
                    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, paddingTop: HEAD_H }}>
                      <BracketSvgConnector topCount={1} totalH={treeH} nextN={1} />
                    </div>
                  )}
                </div>
              );
            })}

            <ChampionCol champion={champion} h={treeH} />
          </div>
        </div>

        {/* 오른쪽 페이드 — 더 내용 있음 힌트 */}
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 8, width: 32,
          background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.92))',
          pointerEvents: 'none',
          borderRadius: '0 8px 8px 0',
        }} aria-hidden="true" />
      </div>

      {/* ── 3·4위전 ── */}
      {thirdPlace && (
        <div className="tm-bk2-third">
          <div className="tm-bk2-third-header">
            <span className="tm-bk2-pill tm-bk2-pill-sm">3 · 4위전</span>
            <span style={{ fontSize: 11, color: 'var(--text-caption)' }}>4강에서 진 두 팀이 3위를 가려요</span>
          </div>
          {thirdPlace.fixtures.map((f) => (
            <div key={f.id} style={{ maxWidth: 240 }}>
              <MatchCard fixture={f} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
