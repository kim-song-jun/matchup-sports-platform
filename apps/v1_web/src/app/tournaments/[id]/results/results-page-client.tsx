'use client';

import { useState, useEffect, useId, useRef } from 'react';
import Link from 'next/link';
import { ChevronRight, Trophy } from 'lucide-react';
import { MatchVideos } from '@/components/tournaments/match-videos';
import { Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { useV1Tournament } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { v1Get } from '@/lib/api-client';
import { TournamentFlowNav } from '@/components/tournaments/tournament-flow-nav';
import { formatTournamentDateRangeShort, formatTournamentDateTimeShort } from '@/lib/date-utils';
import { isLeagueCompetition } from '@/lib/competition-kind';
import type {
  V1LeagueOverallStandingsResponse,
  V1TournamentDetail,
  V1TournamentFixture,
  V1TournamentFixtureResult,
} from '@/types/api';

function getWinnerSide(result: V1TournamentFixtureResult): 'home' | 'away' | null {
  const { homeScore, awayScore, hasPenalty, homePenaltyScore, awayPenaltyScore } = result;
  if (hasPenalty && homePenaltyScore !== null && awayPenaltyScore !== null) {
    if (homePenaltyScore === awayPenaltyScore) return null;
    return homePenaltyScore > awayPenaltyScore ? 'home' : 'away';
  }
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return null;
}

function computeTeamRecord(teamName: string, fixtures: V1TournamentFixture[]) {
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const f of fixtures) {
    if (f.status !== 'completed' || !f.result) continue;
    const isHome = f.homeTeamName === teamName;
    const isAway = f.awayTeamName === teamName;
    if (!isHome && !isAway) continue;
    gf += isHome ? f.result.homeScore : f.result.awayScore;
    ga += isHome ? f.result.awayScore : f.result.homeScore;
    const win = getWinnerSide(f.result);
    if ((win === 'home' && isHome) || (win === 'away' && isAway)) w++;
    else if ((win === 'home' && isAway) || (win === 'away' && isHome)) l++;
    else d++;
  }
  return { w, d, l, gf, ga, games: w + d + l };
}

interface FinalRankRow { pos: number; name: string; }

function buildKnockoutFinalRanking(fixtures: V1TournamentFixture[]): FinalRankRow[] {
  const finalFix = fixtures.find((f) => f.round === 'final' || f.round === '결승');
  const thirdFix = fixtures.find((f) => f.round === 'third_place' || f.round === '3·4위전');
  const rows: FinalRankRow[] = [];
  if (finalFix?.result) {
    const w = getWinnerSide(finalFix.result);
    const champion = w === 'home' ? finalFix.homeTeamName : w === 'away' ? finalFix.awayTeamName : null;
    const runner   = w === 'home' ? finalFix.awayTeamName : w === 'away' ? finalFix.homeTeamName : null;
    if (champion) rows.push({ pos: 1, name: champion });
    if (runner)   rows.push({ pos: 2, name: runner });
  }
  if (thirdFix?.result) {
    const w = getWinnerSide(thirdFix.result);
    const third  = w === 'home' ? thirdFix.homeTeamName : w === 'away' ? thirdFix.awayTeamName : null;
    const fourth = w === 'home' ? thirdFix.awayTeamName : w === 'away' ? thirdFix.homeTeamName : null;
    if (third)  rows.push({ pos: 3, name: third });
    if (fourth) rows.push({ pos: 4, name: fourth });
  }
  return rows;
}

/**
 * 리그(format==='league') 대회 최종 순위 — 단일 조 전용. 리그 대진의 round는 백엔드가
 * `league_r{N}`으로 생성해 'final'/'결승' 라운드가 존재하지 않으므로
 * `buildKnockoutFinalRanking`은 항상 빈 배열을 반환한다(감사 대상 결함: results-page
 * 리그 미지원). 순위 정본은 `groups[].standings`(조별 순위 재계산 서비스가 이미 채워 둔다)
 * — tournament-detail-client.tsx:131-137의 챔피언 계산과 같은 소스를 쓴다.
 *
 * 조가 2개 이상인 리그는 조별 position이 조 단위로 1부터 다시 매겨지므로 여기서 단순
 * 병합하면 순위가 뒤섞인다(awards-page-client.tsx의 getTopThree와 동일 제약) — 그 경우는
 * 이 함수가 아니라 `useLeagueOverallFinalRanking`(통합 순위 API)이 답을 낸다.
 */
function buildSingleGroupLeagueRanking(tournament: V1TournamentDetail): FinalRankRow[] {
  const leagueGroups = tournament.groups.filter((g) => g.phase === 'group');
  if (leagueGroups.length !== 1) return [];
  return [...leagueGroups[0].standings]
    .filter((s): s is typeof s & { teamName: string } => Boolean(s.teamName))
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ pos: s.position, name: s.teamName }));
}

/**
 * 다조(2개 이상) 리그 전용 최종 순위 override. 통합 순위 정본
 * (`GET /tournaments/:id/standings/overall` — 대진표 탭 `LeagueStandingsSection`,
 * awards-page-client.tsx의 `useMultiGroupLeagueTopThree`와 동일 엔드포인트)을 별도
 * 조회한다. 이 파일은 도메인 훅 배정 파일(`hooks/use-v1-api.ts`)이 아니라서 두 참조
 * 구현과 같은 이유로 `v1Get`을 인라인 `useEffect`로 호출한다(react-query가 아니다 —
 * 이 화면도 QueryClientProvider 없이 단독 렌더되는 테스트가 있어 동일 제약을 따른다).
 *
 * `enabled=false`(단일 조·미완료·리그 아님)면 요청하지 않고 `null`을 유지한다 — 호출부가
 * `null`이면 단일 조 계산 결과를 그대로 쓰고, `[]`(로딩 실패 포함)이면 빈 상태를 보여준다
 * (틀린 순위를 보여주는 것보다 안전).
 */
function useLeagueOverallFinalRanking(
  tournamentId: string,
  enabled: boolean,
): FinalRankRow[] | null {
  const [rows, setRows] = useState<FinalRankRow[] | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRows(null);
      return;
    }
    let cancelled = false;
    v1Get<V1LeagueOverallStandingsResponse>(`/tournaments/${tournamentId}/standings/overall`)
      .then((data) => {
        if (cancelled) return;
        const ranked = data.standings
          .filter((s): s is typeof s & { position: number } => s.position !== null)
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ pos: s.position, name: s.teamName }));
        setRows(ranked);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId, enabled]);

  return rows;
}

/* ── 트로피 마크 — 골드 그라디언트 필드 SVG (lucide 스트로크 대체, 토스풍 솔리드 아이콘) ── */
function TrophyMark({ size = 56 }: { size?: number }) {
  const uid = useId();
  const cupId = `tm-trophy-cup-${uid}`;
  const baseId = `tm-trophy-base-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={cupId} x1="32" y1="10" x2="32" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFE28A" />
          <stop offset="0.55" stopColor="#F6B93B" />
          <stop offset="1" stopColor="#E8960C" />
        </linearGradient>
        <linearGradient id={baseId} x1="32" y1="46" x2="32" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#E8A20D" />
          <stop offset="1" stopColor="#C77E06" />
        </linearGradient>
      </defs>
      {/* 손잡이 */}
      <path d="M16 15 H8 c0 10 5 15 10 16" stroke={`url(#${cupId})`} strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <path d="M48 15 H56 c0 10 -5 15 -10 16" stroke={`url(#${cupId})`} strokeWidth="4.5" strokeLinecap="round" fill="none" />
      {/* 컵 */}
      <path d="M16 10 h32 v12 c0 12 -7 19 -16 19 s-16 -7 -16 -19 z" fill={`url(#${cupId})`} />
      {/* 하이라이트 */}
      <ellipse cx="24.5" cy="21" rx="3.2" ry="6.5" fill="#FFFFFF" opacity="0.35" transform="rotate(-12 24.5 21)" />
      {/* 스템 + 받침 */}
      <rect x="29" y="41" width="6" height="7" rx="2" fill={`url(#${baseId})`} />
      <rect x="21" y="48" width="22" height="5" rx="2.5" fill={`url(#${baseId})`} />
      <rect x="18" y="53" width="28" height="4.5" rx="2.25" fill="#C77E06" />
    </svg>
  );
}

/* confetti */
const CONFETTI_COLORS = ['#3182F6','#FCD34D','#10B981','#F97316','#8B5CF6','#EC4899','#EF4444','#06B6D4','#84CC16','#F59E0B'];

function ConfettiPiece({ idx }: { idx: number }) {
  const color = CONFETTI_COLORS[idx % CONFETTI_COLORS.length];
  const left  = 5 + (idx * 17 + idx * 7) % 90;
  const delay = ((idx * 137) % 1600) / 1000;
  const size  = 6 + (idx * 31) % 8;
  const dur   = 1.8 + (idx * 53) % 1.2;
  const isRect = idx % 3 === 0;
  return (
    <div aria-hidden="true" style={{
      position: 'absolute', left: left + '%', top: '-16px',
      width: isRect ? size * 1.6 : size, height: size,
      borderRadius: isRect ? 2 : '50%', background: color,
      opacity: 0, animation: `tmConfettiFall ${dur}s ${delay}s ease-out forwards`,
      willChange: 'transform, opacity',
    }} />
  );
}

function Confetti({ count = 40 }: { count?: number }) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 2 }}>
      {Array.from({ length: count }, (_, i) => <ConfettiPiece key={i} idx={i} />)}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * 데스크탑 전용 챔피언 히어로 (풀 너비, 드라마틱)
 * ───────────────────────────────────────────────────────── */
function DesktopChampionHero({
  champion,
  tournament,
}: {
  champion: string;
  tournament: V1TournamentDetail;
}) {
  const rec = computeTeamRecord(champion, tournament.fixtures);
  const diff = rec.gf - rec.ga;
  return (
    <div className="tm-show-desktop">
    <div
      className="tm-resd-hero"
      style={{
        position: 'relative',
        background: 'linear-gradient(160deg, #0A0E1A 0%, #0D1B2A 40%, #1A0A2E 100%)',
        borderRadius: 'var(--radius-container)',
        padding: '44px 56px 40px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        marginBottom: 0,
      }}
    >
      {/* 배경 광채 */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 600, height: 600,
        background: 'radial-gradient(ellipse at center, rgba(255,215,0,0.08) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      {/* 트로피 */}
      <div className="tm-resd-trophy" style={{ display: 'flex', justifyContent: 'center', lineHeight: 1, marginBottom: 20, filter: 'drop-shadow(0 6px 20px rgba(246,185,59,0.45))' }} aria-hidden="true">
        <TrophyMark size={60} />
      </div>
      {/* 팀명 — 배지 제거 후에도 스크린리더에는 '우승팀' 맥락 유지 */}
      <div className="tm-resd-name" style={{
        fontSize: 44, fontWeight: 900, color: '#FFFFFF',
        letterSpacing: '-0.03em', lineHeight: 1.1,
        marginBottom: 8,
      }}>
        <span className="sr-only">우승팀 </span>{champion}
      </div>
      {/* 대회명 */}
      <div className="tm-resd-meta" style={{
        fontSize: 12, color: 'rgba(255,255,255,0.7)',
        fontWeight: 600, letterSpacing: '0.04em',
        marginBottom: 28,
      }}>
        {tournament.sport?.name ?? ''} &middot; {tournament.title}
      </div>
      {/* 스탯 3칸 */}
      <div style={{ display: 'flex', gap: 40, alignItems: 'center' }}>
        {[
          { n: String(rec.w), label: '승리', sub: `${rec.games}경기 중` },
          { n: String(rec.gf), label: '득점', sub: `${rec.ga}실점` },
          { n: `${diff > 0 ? '+' : ''}${diff}`, label: '득실차', sub: '전 경기 합산' },
        ].map(({ n, label, sub }) => (
          <div key={label} className="tm-resd-stat" style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 36, fontWeight: 900, lineHeight: 1,
              color: '#FDE68A', fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
            }}>{n}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{label}</div>
            {/* [R-T2] 고정폭 없는 3칸 flex(gap 40) — 12로 상향. */}
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}

/* 모바일 챔피언 히어로 (tm-res-hero CSS 기반 애니메이션) */
function MobileChampionBanner({
  champion,
  tournament,
}: {
  champion: string;
  tournament: V1TournamentDetail;
}) {
  const [played, setPlayed] = useState(false);
  const rec = computeTeamRecord(champion, tournament.fixtures);
  const diff = rec.gf - rec.ga;
  const rafRef = useRef<number | null>(null);
  const replayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setPlayed(true), 80);
    return () => {
      clearTimeout(t);
      // replay()가 예약한 RAF/setTimeout도 언마운트 시 함께 취소한다 —
      // 안 그러면 테스트 환경 정리 이후 콜백이 실행돼 "window is not defined"로 죽는다.
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (replayTimeoutRef.current !== null) clearTimeout(replayTimeoutRef.current);
    };
  }, []);

  const replay = () => {
    setPlayed(false);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (replayTimeoutRef.current !== null) clearTimeout(replayTimeoutRef.current);
    rafRef.current = requestAnimationFrame(() => {
      replayTimeoutRef.current = setTimeout(() => setPlayed(true), 30);
    });
  };

  return (
    <div
      className={`tm-hide-desktop tm-res-hero${played ? ' tm-res-hero-in' : ''}`}
      aria-label={`우승팀: ${champion}. 축하 효과 다시 재생`}
      role="button"
      tabIndex={0}
      onClick={replay}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          replay();
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      {played && <Confetti count={32} />}
      <div className="tm-res-hero-trophy" aria-hidden="true"><TrophyMark size={44} /></div>
      <div className="tm-res-hero-name">{champion}</div>
      <div className="tm-res-hero-inline-stat">
        {tournament.sport?.name ?? ''} &middot; {rec.games}경기 &middot; {rec.w}승 &middot; {rec.gf}득점
      </div>
      {/* 스탯 3칸 */}
      <div style={{ display: 'flex', gap: 28, marginTop: 16, alignItems: 'center' }}>
        {[
          { n: String(rec.w), label: '승리', sub: `${rec.games}경기 중` },
          { n: String(rec.gf), label: '득점', sub: `${rec.ga}실점` },
          { n: `${diff > 0 ? '+' : ''}${diff}`, label: '득실차', sub: '전 경기 합산' },
        ].map(({ n, label, sub }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: '#FDE68A', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{n}</div>
            {/* [R-T2] 모바일 챔피언 히어로 3칸(gap 28, 고정폭 없음) — label 11→12,
                sub 9→12(알파 실측 최다 위반과 같은 9px). 텍스트가 짧고("승리",
                "3경기 중" 등) 컬럼에 폭 제약이 없어 12px도 흡수된다. */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>{label}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 최종 순위 테이블 ── */
const ROUND_LABEL_MAP: Record<string, string> = {
  final: '결승', '결승': '결승',
  semi: '4강', '4강': '4강',
  third_place: '3·4위전', '3·4위전': '3·4위전',
};

/**
 * 결선 결과 카드.
 *
 * 어떤 경기가 결승·4강·3·4위전인지는 **호출자가 넘긴 `kindOf`** 로만 판정한다.
 * 예전에는 여기서 `f.round` 문자열을 또 비교했는데, 바깥 필터와 판정 기준이 갈리면
 * "필터는 통과했는데 어느 카드에도 안 들어가는" 경기가 조용히 사라진다.
 */
function KnockoutResultsTable({
  fixtures,
  kindOf,
}: {
  fixtures: V1TournamentFixture[];
  kindOf: (fixture: V1TournamentFixture) => KnockoutKind | null;
}) {
  if (fixtures.length === 0) return null;

  const semiByMatchup = new Map<number | string, V1TournamentFixture[]>();
  const finalFixtures: V1TournamentFixture[] = [];
  const thirdFixtures: V1TournamentFixture[] = [];

  for (const f of fixtures) {
    // 4강은 1·2차전을 대진 번호로 묶는다. 번호가 비어도 4강 카드로는 남겨야 하므로
    // 경기 id 로 단독 버킷을 만든다 — 결승 카드로 흘려보내면 라벨이 "결승"으로 뒤바뀐다.
    switch (kindOf(f)) {
      case 'semi': {
        const key = f.fixtureNumber ?? `solo-${f.id}`;
        const bucket = semiByMatchup.get(key) ?? [];
        bucket.push(f);
        semiByMatchup.set(key, bucket);
        break;
      }
      case 'third_place':
        thirdFixtures.push(f);
        break;
      case 'final':
        finalFixtures.push(f);
        break;
      default:
        // 호출자가 이미 걸러 낸 경우만 여기 온다. 조용히 버리지 않고 결승 카드로 낸다.
        finalFixtures.push(f);
    }
  }

  const calcAggregate = (legs: V1TournamentFixture[]) => {
    const leg1 = legs.find((f) => f.legNumber === 1 || !f.legNumber);
    const leg2 = legs.find((f) => f.legNumber === 2);
    if (!leg1?.result) return null;
    const homeTeam = leg1.homeTeamName;
    const awayTeam = leg1.awayTeamName;
    const isReversed = leg2 ? leg2.homeTeamName === awayTeam : false;
    const homeTotal = (leg1.result.homeScore ?? 0) + (isReversed ? (leg2?.result?.awayScore ?? 0) : (leg2?.result?.homeScore ?? 0));
    const awayTotal = (leg1.result.awayScore ?? 0) + (isReversed ? (leg2?.result?.homeScore ?? 0) : (leg2?.result?.awayScore ?? 0));
    return { homeTeam, awayTeam, homeTotal, awayTotal, leg1, leg2 };
  };

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '';

  /* ── 개별 경기 행 ── */
  const MatchRow = ({
    label, labelColor = 'var(--text-caption)',
    home, away, homeScore, awayScore,
    winner, hasPenalty, homePK, awayPK,
    date, isAccent = false, isAgg = false,
  }: {
    label: React.ReactNode; labelColor?: string;
    // 참가팀 공개 정책 통일(fix/v1-publish) — 이 페이지는 status==='completed'
    // 대회만 다루므로(모집 중이 아님) hideIdentity는 실질적으로 항상 false지만,
    // 타입은 V1TournamentFixture.homeTeamName/awayTeamName을 그대로 따르므로
    // string | null을 받는다. null은 '팀 정보 없음'으로 방어적으로 표시한다.
    home: string | null; away: string | null; homeScore: number; awayScore: number;
    winner: 'home' | 'away' | null;
    hasPenalty?: boolean; homePK?: number | null; awayPK?: number | null;
    date?: string; isAccent?: boolean; isAgg?: boolean;
  }) => (
    <div style={{
      padding: '12px 16px',
      background: 'transparent',
    }}>
      {/* 상단: 라벨 + 날짜 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        {/* [R-T2] accent 라운드(10→12로 통일)와 일반 라운드가 같은 12px가 됐다 —
            accent 구분은 옆 스코어 폰트(16 vs 14)가 계속 담당해 위계 손실 없음. */}
        <span style={{ fontSize: 12, fontWeight: 700, color: labelColor, letterSpacing: '0.02em' }}>
          {label}
        </span>
        {date && <span style={{ fontSize: 12, color: 'var(--text-caption)' }}>{date}</span>}
      </div>
      {/* 팀 – 스코어 – 팀 (전체 팀명 노출, 잘리지 않음) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          flex: 1, textAlign: 'right',
          fontSize: isAccent ? 15 : 13, fontWeight: winner === 'home' ? 700 : 400,
          color: winner === 'home' ? 'var(--text-strong)' : 'var(--text-muted)',
          wordBreak: 'keep-all', lineHeight: 1.35,
        }}>
          {home ?? '팀 정보 없음'}{isAgg && winner === 'home' && <span style={{ fontSize: 12, color: 'var(--text-strong)', marginLeft: 4 }}>✓</span>}
        </span>
        <div style={{
          flex: '0 0 60px', textAlign: 'center',
          background: 'var(--grey100)',
          border: 'none',
          borderRadius: 'var(--radius-chip)', padding: '4px 0',
        }}>
          <div style={{
            fontSize: isAccent ? 16 : 14, fontWeight: 900,
            color: 'var(--text-strong)',
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
          }}>
            {homeScore}<span style={{ fontSize: 12, opacity: 0.35, margin: '0 2px' }}>:</span>{awayScore}
          </div>
          {/* [R-T2] flex:0 0 60px 고정폭 박스 — PK 표기는 짧아(예: "PK 4:3") 12px도
              여유 있게 들어간다. */}
          {hasPenalty && homePK != null && awayPK != null && (
            <div style={{ fontSize: 12, color: 'var(--text-caption)', lineHeight: 1.2 }}>PK {homePK}:{awayPK}</div>
          )}
        </div>
        <span style={{
          flex: 1, textAlign: 'left',
          fontSize: isAccent ? 15 : 13, fontWeight: winner === 'away' ? 700 : 400,
          color: winner === 'away' ? 'var(--text-strong)' : 'var(--text-muted)',
          wordBreak: 'keep-all', lineHeight: 1.35,
        }}>
          {isAgg && winner === 'away' && <span style={{ fontSize: 12, color: 'var(--text-strong)', marginRight: 4 }}>✓</span>}{away ?? '팀 정보 없음'}
        </span>
      </div>
    </div>
  );

  const divider = <div style={{ height: 1, background: 'var(--grey100)', margin: '0 16px' }} />;
  const cardStyle: React.CSSProperties = { borderRadius: 'var(--radius-control)', overflow: 'hidden', border: '1px solid var(--grey150)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* ── 결승 카드 ── */}
      {finalFixtures.map((f) => {
        if (!f.result) return null;
        const { homeScore, awayScore, hasPenalty, homePenaltyScore, awayPenaltyScore } = f.result;
        const winner = getWinnerSide(f.result);
        return (
          <div key={f.id} style={cardStyle}>
            <MatchRow
              label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Trophy size={13} className="tm-medal-gold" strokeWidth={2.4} aria-hidden="true" />결승</span>}
              home={f.homeTeamName} away={f.awayTeamName}
              homeScore={homeScore} awayScore={awayScore}
              winner={winner}
              hasPenalty={hasPenalty} homePK={homePenaltyScore} awayPK={awayPenaltyScore}
              date={fmtDate(f.scheduledAt)} isAccent
            />
          </div>
        );
      })}

      {/* ── 4강 매치업 그룹 카드 ── */}
      {Array.from(semiByMatchup.values()).map((legs) => {
        const agg = calcAggregate(legs);
        if (!agg) return null;
        const { homeTeam, awayTeam, homeTotal, awayTotal, leg1, leg2 } = agg;
        const aggWinner = homeTotal > awayTotal ? 'home' : awayTotal > homeTotal ? 'away' : null;

        return (
          <div key={`semi-${homeTeam}`} style={cardStyle}>
            {leg1?.result && (
              <MatchRow
                label="4강 1차" home={leg1.homeTeamName} away={leg1.awayTeamName}
                homeScore={leg1.result.homeScore} awayScore={leg1.result.awayScore}
                winner={getWinnerSide(leg1.result)}
                hasPenalty={leg1.result.hasPenalty} homePK={leg1.result.homePenaltyScore} awayPK={leg1.result.awayPenaltyScore}
                date={fmtDate(leg1.scheduledAt)}
              />
            )}
            {leg2?.result && <>{divider}<MatchRow
              label="4강 2차" home={leg2.homeTeamName} away={leg2.awayTeamName}
              homeScore={leg2.result.homeScore} awayScore={leg2.result.awayScore}
              winner={getWinnerSide(leg2.result)}
              hasPenalty={leg2.result.hasPenalty} homePK={leg2.result.homePenaltyScore} awayPK={leg2.result.awayPenaltyScore}
              date={fmtDate(leg2.scheduledAt)}
            /></>}
            {/* 합산 */}
            <div style={{ borderTop: '1px solid var(--grey150)' }}>
              <MatchRow
                label="합산" isAgg
                home={homeTeam} away={awayTeam}
                homeScore={homeTotal} awayScore={awayTotal}
                winner={aggWinner}
              />
            </div>
          </div>
        );
      })}

      {/* ── 3·4위전 카드 ── */}
      {thirdFixtures.map((f) => {
        if (!f.result) return null;
        const { homeScore, awayScore, hasPenalty, homePenaltyScore, awayPenaltyScore } = f.result;
        const winner = getWinnerSide(f.result);
        return (
          <div key={f.id} style={{ ...cardStyle, background: 'var(--grey50)' }}>
            <MatchRow
              label="3·4위전"
              home={f.homeTeamName} away={f.awayTeamName}
              homeScore={homeScore} awayScore={awayScore}
              winner={winner}
              hasPenalty={hasPenalty} homePK={homePenaltyScore} awayPK={awayPenaltyScore}
              date={fmtDate(f.scheduledAt)}
            />
          </div>
        );
      })}

    </div>
  );
}

/* 순위별 스타일 */
const POS_CFG: Record<number, { bg: string; numColor: string; label: string }> = {
  1: { bg: 'var(--grey50)',    numColor: 'var(--text-strong)',  label: '우승'   },
  2: { bg: 'transparent',     numColor: 'var(--text-caption)', label: '준우승' },
  3: { bg: 'transparent',     numColor: 'var(--text-caption)', label: '3위'    },
  4: { bg: 'transparent',     numColor: 'var(--text-caption)', label: '4위'    },
};

function FinalStandingsTable({ rows, fixtures }: { rows: FinalRankRow[]; fixtures: V1TournamentFixture[] }) {
  return (
    <div style={{ borderRadius: 'var(--radius-control)', overflow: 'hidden', border: '1px solid var(--grey150)' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '40px 1fr 64px 36px 36px 40px',
        padding: '8px 16px', background: 'var(--grey50)', borderBottom: '1px solid var(--grey150)',
      }}>
        {/* [R-T2] 그리드 컬럼(40px/1fr/64px/36px/36px/40px) 헤더 — 가장 좁은 36px도
            'W'/'GF' 한두 글자라 12px 여유. */}
        {['#', '팀', '결과', 'W', 'GF', '+/-'].map((h) => (
          <div key={h} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: h === '팀' ? 'left' : 'center' }}>{h}</div>
        ))}
      </div>
      {rows.map((row, idx) => {
        // 리그는 팀 수만큼 순위가 이어진다(4위 밑으로도 존재) — POS_CFG에 없는 순위는
        // "4위"로 잘못 라벨링하지 않고 실제 순위 숫자로 표기한다.
        const cfg = POS_CFG[row.pos] ?? { bg: 'transparent', numColor: 'var(--text-caption)', label: `${row.pos}위` };
        const rec = computeTeamRecord(row.name, fixtures);
        const diff = rec.gf - rec.ga;
        const isChamp = row.pos === 1;
        return (
          <div key={row.pos} style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 64px 36px 36px 40px',
            padding: '12px 16px', background: cfg.bg,
            borderTop: idx > 0 ? '1px solid var(--grey100)' : 'none',
            alignItems: 'center',
          }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: cfg.numColor, fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>{row.pos}</div>
            <div style={{ fontWeight: isChamp ? 700 : 500, fontSize: 14, color: 'var(--text-strong)', wordBreak: 'keep-all', lineHeight: 1.35 }}>
              {row.name}
            </div>
            <div style={{ textAlign: 'center' }}>
              {/* [R-T2] 64px 고정폭 컬럼 — '준우승'(3자)도 12px에서 여유 있게 들어간다. */}
              <span style={{ fontSize: 12, fontWeight: 600, color: cfg.numColor }}>
                {cfg.label}
              </span>
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{rec.w}</div>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{rec.gf}</div>
            <div style={{ textAlign: 'center', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
              {diff > 0 ? '+' : ''}{diff}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── 대회 요약 카드 — 상세 페이지의 정보 카드 언어를 그대로 사용 ── */
function TournamentSummaryCard({ tournament }: { tournament: V1TournamentDetail }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: '종목', value: tournament.sport?.name ?? '-' },
    { label: '일정', value: formatTournamentDateRangeShort(tournament.scheduledAt, tournament.scheduledEndAt) ?? '미정' },
    ...(tournament.venue ? [{ label: '장소', value: tournament.venue }] : []),
    { label: '참가 팀', value: `${tournament.confirmedCount}팀` },
  ];
  return (
    <Card pad={0}>
      {rows.map((r, i) => (
        <div key={r.label} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderTop: i > 0 ? '1px solid var(--grey100)' : 'none',
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-caption)' }}>{r.label}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', textAlign: 'right', wordBreak: 'keep-all' }}>{r.value}</span>
        </div>
      ))}
      <Link
        href={`/tournaments/${tournament.id}`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          minHeight: 44, borderTop: '1px solid var(--grey100)',
          fontSize: 13, fontWeight: 600, color: 'var(--blue700)', textDecoration: 'none',
        }}
      >
        대회 상세 보기 <ChevronRight size={14} aria-hidden="true" />
      </Link>
    </Card>
  );
}

/* ── 경기 영상 모아보기 — 전 경기 하이라이트를 한 섹션에 (경기 행은 스코어만 유지) ── */
function fixtureVideoLabel(f: V1TournamentFixture): string {
  const round: Record<string, string> = { final: '결승', semi: '4강', third_place: '3·4위전', group: '조별리그' };
  const base = round[f.round] ?? f.round;
  const leg = f.round === 'semi' || f.round === '4강' ? ` ${f.legNumber}차` : '';
  return `${base}${leg}`;
}

function VideoGallerySection({ fixtures }: { fixtures: V1TournamentFixture[] }) {
  const roundOrder: Record<string, number> = { final: 0, '결승': 0, semi: 1, '4강': 1, third_place: 2, '3·4위전': 2, group: 3, '조별리그': 3 };
  const withVideos = fixtures
    .filter((f) => f.status === 'completed' && f.videos.length > 0)
    .sort((a, b) =>
      (roundOrder[a.round] ?? 9) - (roundOrder[b.round] ?? 9) ||
      a.fixtureNumber - b.fixtureNumber ||
      a.legNumber - b.legNumber,
    );
  if (withVideos.length === 0) return null;
  return (
    <section style={{ padding: '16px 20px 0' }}>
      <p style={{ fontSize: 12, color: 'var(--text-caption)', margin: '0 0 12px' }}>경기 영상은 대회 운영진이 등록해요. 눌러서 바로 재생할 수 있어요.</p>
      <Card pad={16}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {withVideos.map((f) => (
            <div key={f.id}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)' }}>{fixtureVideoLabel(f)}</span>
                <span style={{ fontSize: 12, color: 'var(--text-caption)' }}>{f.homeTeamName} vs {f.awayTeamName}</span>
              </div>
              <MatchVideos videos={f.videos} matchLabel={`${f.homeTeamName} vs ${f.awayTeamName}`} variant="strip" />
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
 * 조별리그 경기 — 이 화면에서 조별 경기를 나열하는 **유일한** 블록.
 *
 * 원래는 "완료 + 결과 등록"된 조별 경기만 담던 접힘 목록이었다. 그래서 조별 결과가
 * 아직 하나도 입력되지 않은 대회에서는 블록 자체가 사라져, 최종결과 화면에서 조별
 * 일정을 확인할 방법이 전혀 없었다. 지금은 조별 경기 **전체**(예정·진행 중·취소
 * 포함)를 조별로 묶어 보여주고, 결과가 없는 경기는 스코어 대신 상태 칩으로 구분한다.
 *
 * 새 목록을 별도로 추가하지 말 것 — 같은 화면에 조별 경기 목록이 두 벌 생긴다.
 * ───────────────────────────────────────────────────────── */

/* 조별·결선 분류는 `fixture.round` 문자열이 아니라 편성(`groups[].phase`)으로 판정한다.
 *
 * `round`는 대회마다 운영진이 정하는 자유 라벨이라 목록으로 따라잡을 수 없다.
 * alpha 실측(2026-08-13) 기준 조별 경기의 실제 round 값은
 *   'group'(12건) · '조별 1라운드'(10) · '조별 2라운드'(6) · '조별 3라운드'(6)
 * 이고, 예전 상수에 적혀 있던 '조별리그'는 **한 건도 없었다**. 그 결과 정확일치
 * 필터가 조별 경기 34건 중 22건을 떨어뜨려, 최종결과 화면이 "조별리그 경기 0경기 /
 * 아직 등록되지 않았어요"라는 틀린 안내를 냈다(일정 화면에는 같은 경기가 보였다).
 *
 * `phase`는 백엔드가 관리하는 닫힌 값('group'|'semi'|'final'|'third_place')이라
 * 새 라운드 라벨이 생겨도 깨지지 않는다. 라벨 매칭은 편성에 붙지 못한 경기의
 * 폴백으로만 남긴다.
 */
/** 결선 카드의 종류. 이 화면이 실제로 그릴 수 있는 세 가지뿐이다. */
export type KnockoutKind = 'final' | 'semi' | 'third_place';

/** 결선 섹션 정렬 순서(결승 → 4강 → 3·4위전). */
const KNOCKOUT_KIND_ORDER: Record<KnockoutKind, number> = { final: 0, semi: 1, third_place: 2 };

/** 편성에 붙지 못한(groupId 없음/편성 삭제됨) 경기용 폴백 — 알려진 라벨만 인정한다. */
const KNOCKOUT_KIND_BY_LABEL: Record<string, KnockoutKind> = {
  final: 'final', '결승': 'final',
  semi: 'semi', '4강': 'semi',
  third_place: 'third_place', '3·4위전': 'third_place',
};

/**
 * `tournament.groups`를 한 번 순회해 groupId → phase 표를 만든 뒤 경기의 단계를 판정한다.
 *
 * 판정을 여기 한 곳에 모으는 이유: 예전에는 바깥 필터와 `KnockoutResultsTable` 내부가
 * **각자** 라운드 문자열을 분류해서, 한쪽만 넓히면 통과했는데 안 그려지는 경기가
 * 생겼다. `knockoutKind`가 null 이면 결선 목록에서도 빠지므로 필터와 렌더가 항상 같은
 * 집합을 본다 — 조용히 사라지는 경기가 없다.
 *
 * `phase`가 알려지지 않은 값이면(백엔드가 새 단계를 추가한 경우) 조별에도 결선에도
 * 넣지 않는다. 이는 기존 동작과 같고, 잘못된 칸에 넣는 것보다 안전하다.
 */
function createStageResolver(groups: V1TournamentDetail['groups']) {
  const phaseByGroupId = new Map(groups.map((g) => [g.id, g.phase]));

  const phaseOf = (fixture: V1TournamentFixture): string | undefined =>
    (fixture.groupId === null ? undefined : phaseByGroupId.get(fixture.groupId));

  const isGroupStage = (fixture: V1TournamentFixture): boolean => {
    const phase = phaseOf(fixture);
    if (phase !== undefined) return phase === 'group';
    const label = fixture.round.trim();
    return label === 'group' || label.startsWith('조별');
  };

  const knockoutKind = (fixture: V1TournamentFixture): KnockoutKind | null => {
    const phase = phaseOf(fixture);
    if (phase !== undefined) {
      return phase in KNOCKOUT_KIND_ORDER ? (phase as KnockoutKind) : null;
    }
    return KNOCKOUT_KIND_BY_LABEL[fixture.round.trim()] ?? null;
  };

  return {
    isGroupStage,
    knockoutKind,
    knockoutOrder: (fixture: V1TournamentFixture): number => {
      const kind = knockoutKind(fixture);
      return kind === null ? 9 : KNOCKOUT_KIND_ORDER[kind];
    },
  };
}

interface GroupSection { key: string; name: string; fixtures: V1TournamentFixture[] }

/** 일정순(시각 미정은 뒤로) → 대진 번호순. 목록 순서가 데이터 순서에 흔들리지 않게 고정한다. */
function compareGroupFixtures(a: V1TournamentFixture, b: V1TournamentFixture): number {
  const at = a.scheduledAt ? Date.parse(a.scheduledAt) : Number.POSITIVE_INFINITY;
  const bt = b.scheduledAt ? Date.parse(b.scheduledAt) : Number.POSITIVE_INFINITY;
  if (at !== bt) return at - bt;
  return a.fixtureNumber - b.fixtureNumber;
}

function buildGroupSections(
  groups: V1TournamentDetail['groups'],
  fixtures: V1TournamentFixture[],
): GroupSection[] {
  const sections: GroupSection[] = [...groups]
    .filter((g) => g.phase === 'group')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({
      key: g.id,
      name: g.name,
      fixtures: fixtures.filter((f) => f.groupId === g.id).sort(compareGroupFixtures),
    }))
    .filter((section) => section.fixtures.length > 0);

  // 조가 지워졌거나 groupId가 비어 편성에 붙지 못한 경기도 목록에서 빠지면 안 된다.
  const sectioned = new Set(sections.flatMap((s) => s.fixtures.map((f) => f.id)));
  const rest = fixtures.filter((f) => !sectioned.has(f.id)).sort(compareGroupFixtures);
  if (rest.length > 0) sections.push({ key: '__unsectioned__', name: '기타', fixtures: rest });
  return sections;
}

/** 결과가 아직 없는 경기의 상태 표시 — 색만으로 구분하지 않도록 항상 텍스트를 함께 낸다. */
function GroupFixtureStatusChip({ fixture }: { fixture: V1TournamentFixture }) {
  if (fixture.result !== null) return null;
  // 원본 `status` 컬럼이 아니라 `liveStatus`(V1Game.state 파생)로 판정한다. 컬럼에는
  // `in_progress`/`cancelled` 가 기록되지 않아서(생성 시 scheduled, 결과 확정 시
  // completed 뿐) 그 두 분기는 도달 불가능한 죽은 가지였다 — 진행 중인 경기가 계속
  // "경기 예정" 으로 표시되던 원인이다.
  const chip =
    fixture.liveStatus === 'cancelled'
      ? { tone: 'tm-badge-red', label: '취소' }
      : fixture.liveStatus === 'live'
        ? { tone: 'tm-badge-blue', label: '진행 중' }
        : fixture.liveStatus === 'ended'
          ? { tone: 'tm-badge-grey', label: '결과 미등록' }
          : { tone: 'tm-badge-grey', label: '경기 예정' };
  return <span className={`tm-badge tm-badge-sm ${chip.tone}`}>{chip.label}</span>;
}

function GroupFixtureRow({
  tournamentId,
  fixture,
}: {
  tournamentId: string;
  fixture: V1TournamentFixture;
}) {
  const result = fixture.result;
  const winner = result ? getWinnerSide(result) : null;
  // null은 "배정됐지만 아직 비공개"(모집 중) — 이 화면에서는 사실상 나오지 않지만
  // 타입상 가능하므로 결선 카드(MatchRow)와 같은 문구로 방어한다.
  const home = fixture.homeTeamName ?? '팀 정보 없음';
  const away = fixture.awayTeamName ?? '팀 정보 없음';
  const when = formatTournamentDateTimeShort(fixture.scheduledAt);
  const meta = [when, fixture.venue].filter((v): v is string => Boolean(v)).join(' · ');
  const scoreLabel = result ? `${result.homeScore} 대 ${result.awayScore}` : '경기 결과 미정';

  return (
    <Link
      href={`/tournaments/${tournamentId}/matches/${fixture.id}`}
      className="tm-res-match-row"
      style={{ minHeight: 44, textDecoration: 'none', color: 'inherit' }}
      aria-label={`${home} ${scoreLabel} ${away}, 경기 상세 보기`}
    >
      <div className="tm-res-match-meta">
        <GroupFixtureStatusChip fixture={fixture} />
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-caption)', wordBreak: 'keep-all' }}>
          {meta === '' ? '일정 미정' : meta}
        </span>
      </div>
      <div className="tm-res-match-teams">
        <span
          className="tm-res-match-team"
          style={{ fontWeight: winner === 'home' ? 700 : 400, color: winner === 'home' ? 'var(--text-strong)' : 'var(--text-muted)' }}
        >
          {home}
        </span>
        <span className="tm-res-match-score tab-num">
          {result
            ? <>{result.homeScore}<span style={{ opacity: 0.35, margin: '0 2px' }}>:</span>{result.awayScore}</>
            : <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)' }}>vs</span>}
        </span>
        <span
          className="tm-res-match-team tm-res-match-team-right"
          style={{ fontWeight: winner === 'away' ? 700 : 400, color: winner === 'away' ? 'var(--text-strong)' : 'var(--text-muted)' }}
        >
          {away}
        </span>
      </div>
      <ChevronRight
        size={16}
        aria-hidden="true"
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-caption)' }}
      />
    </Link>
  );
}

export function GroupStageFixtures({ tournament }: { tournament: V1TournamentDetail }) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);

  const { isGroupStage } = createStageResolver(tournament.groups);
  const fixtures = tournament.fixtures.filter(isGroupStage);
  const hasGroupPhase = tournament.groups.some((g) => g.phase === 'group');
  // 조별리그 자체가 없는 대회(순수 토너먼트)에서는 블록을 아예 내지 않는다.
  if (fixtures.length === 0 && !hasGroupPhase) return null;

  const recorded = fixtures.filter((f) => f.result !== null).length;
  const sections = buildGroupSections(tournament.groups, fixtures);

  return (
    <section style={{ marginTop: 16 }}>
      <button
        type="button"
        className="tm-res-expand-btn"
        style={{ minHeight: 44 }}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={panelId}
      >
        <span>
          조별리그 경기 {fixtures.length}경기
          {recorded < fixtures.length && (
            <span style={{ marginLeft: 8, fontWeight: 500, color: 'var(--text-caption)' }}>
              결과 등록 {recorded}경기
            </span>
          )}
        </span>
        <span
          className="tm-res-expand-chevron"
          aria-hidden="true"
          style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
        >
          ▾
        </span>
      </button>
      {expanded && (
        <div id={panelId} style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sections.length === 0 ? (
            <EmptyState
              illustration={{ name: 'journey-done' }}
              title="조별리그 경기가 아직 등록되지 않았어요."
              sub="운영진이 조별 대진을 확정하면 이곳에서 경기를 확인할 수 있어요."
            />
          ) : (
            sections.map((section) => (
              <div key={section.key}>
                <div className="tm-res-group-label">{section.name} · {section.fixtures.length}경기</div>
                <div className="tm-res-matches-block">
                  {section.fixtures.map((fixture) => (
                    <GroupFixtureRow key={fixture.id} tournamentId={tournament.id} fixture={fixture} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

/* ── 메인 콘텐츠 ── */
export function ResultsPageContent({ tournament }: { tournament: V1TournamentDetail }) {
  // 결과(순위·결선·조별)와 경기 영상을 세그먼트 탭으로 분리
  const [activeTab, setActiveTab] = useState<'results' | 'videos'>('results');
  const videosTotal = tournament.fixtures.reduce(
    (sum, f) => sum + (f.status === 'completed' ? f.videos.length : 0), 0,
  );
  const isCompleted  = tournament.status === 'completed';
  const isInProgress = tournament.status === 'in_progress';
  // format 만 보면 정규 리그(거울 행 format='group_knockout')를 놓친다 — 두 질문을 다 한다.
  const isLeague = isLeagueCompetition(tournament);
  const isMultiGroupLeague = isLeague && tournament.groups.filter((g) => g.phase === 'group').length > 1;
  // 다조 리그일 때만 통합 순위 API를 조회한다 — 훅 자체는 매 렌더 동일한 순서로
  // 호출해야 하므로(react hooks rule) enabled 플래그로 조건을 안쪽에 둔다.
  const overallLeagueRows = useLeagueOverallFinalRanking(tournament.id, isCompleted && isMultiGroupLeague);
  const knockoutRows = !isCompleted
    ? []
    : isLeague
      ? (isMultiGroupLeague ? (overallLeagueRows ?? []) : buildSingleGroupLeagueRanking(tournament))
      : buildKnockoutFinalRanking(tournament.fixtures);
  const championName = knockoutRows.find((r) => r.pos === 1)?.name ?? null;

  // 조별과 같은 이유로 라운드 라벨 정확일치를 쓰지 않는다 — 편성 phase 가 판정 기준이다.
  const { knockoutKind, knockoutOrder } = createStageResolver(tournament.groups);
  const knockoutFixtures = tournament.fixtures
    .filter((f) => f.status === 'completed' && f.result !== null && knockoutKind(f) !== null)
    .sort((a, b) => knockoutOrder(a) - knockoutOrder(b));

  return (
    <div className="tm-tourn-sub-page" style={{ paddingBottom: 40 }}>
      <h1 className="sr-only">{tournament.title} 최종 결과</h1>
      {/* ── 챔피언 섹션 ── */}
      {isCompleted && championName && (
        <div style={{ padding: '16px 20px 0' }}>
          {/* 데스크탑: 풀 화면 히어로 */}
          <DesktopChampionHero champion={championName} tournament={tournament} />
          {/* 모바일: 컴팩트 배너 */}
          <MobileChampionBanner champion={championName} tournament={tournament} />
          {/* 대회 요약 — 데스크탑에서는 최종 순위 아래(좌측 컬럼)로 이동 */}
          <div className="tm-hide-desktop" style={{ marginTop: 16 }}>
            <TournamentSummaryCard tournament={tournament} />
          </div>
        </div>
      )}

      {/* 결과/영상 탭 전환 — 우승팀을 못 뽑는 대회(리그전, 결승 무승부 등)에서도
          등록된 경기 영상에 접근할 수 있어야 하므로 챔피언 섹션과 무관하게 렌더한다. */}
      {isCompleted && videosTotal > 0 && (
        <div style={{ padding: '16px 20px 0' }}>
          <nav className="tm-segment-row" aria-label="결과 보기 전환">
            <button
              type="button"
              className="tm-review-tab"
              data-active={activeTab === 'results'}
              aria-pressed={activeTab === 'results'}
              onClick={() => setActiveTab('results')}
            >
              경기 결과
            </button>
            <button
              type="button"
              className="tm-review-tab"
              data-active={activeTab === 'videos'}
              aria-pressed={activeTab === 'videos'}
              onClick={() => setActiveTab('videos')}
            >
              경기 영상 {videosTotal}
            </button>
          </nav>
        </div>
      )}

      {/* 진행 중에는 조별리그 블록을 포함해 결과 영역 전체를 감춘다 — 아직 확정되지
          않은 성적을 "최종결과" 화면에 얹으면 최종 순위로 오해되기 때문. 대신 진행
          중인 조별 일정·스코어의 정본인 경기 일정 화면으로 보낸다. */}
      {isInProgress && (
        <div style={{ padding: '12px 20px 0' }}>
          <div style={{ padding: '20px', textAlign: 'center', background: 'var(--blue50)', borderRadius: 10 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--blue700)' }}>대회가 진행 중이에요</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--blue700)' }}>종료 후 최종 결과를 확인할 수 있어요.</p>
            <Link
              href={`/tournaments/${tournament.id}/bracket`}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                minHeight: 44, marginTop: 4, padding: '0 12px',
                fontSize: 13, fontWeight: 700, color: 'var(--blue700)', textDecoration: 'none',
              }}
            >
              조별리그 경기 일정 보기 <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}

      {isCompleted && activeTab === 'results' && (
        <div className="tm-tourn-sub-grid tm-tourn-sub-grid-6040 tm-results-grid">
          <div className="tm-tourn-sub-col" style={{ padding: '16px 20px 0' }}>
            <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>최종 순위</h3>
            {knockoutRows.length > 0 ? (
              <FinalStandingsTable rows={knockoutRows} fixtures={tournament.fixtures} />
            ) : (
              <EmptyState
                illustration={{ name: 'journey-done' }}
                title="최종 순위가 아직 등록되지 않았어요."
                sub="운영진이 결과를 확정하면 이곳에서 순위를 확인할 수 있어요."
              />
            )}
            {/* 데스크탑: 순위표가 짧아 비는 좌측 컬럼을 대회 요약으로 채우고 sticky로 고정 */}
            <div className="tm-show-desktop" style={{ marginTop: 16 }}>
              <TournamentSummaryCard tournament={tournament} />
            </div>
          </div>
          <div className="tm-tourn-sub-col" style={{ padding: '16px 20px 0' }}>
            {knockoutFixtures.length > 0 && (
              <>
                <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>결선 경기</h3>
                <KnockoutResultsTable fixtures={knockoutFixtures} kindOf={knockoutKind} />
              </>
            )}
            <GroupStageFixtures tournament={tournament} />
          </div>
        </div>
      )}

      {isCompleted && activeTab === 'videos' && <VideoGallerySection fixtures={tournament.fixtures} />}

      {!isCompleted && !isInProgress && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-caption)', fontSize: 13 }}>
          대회 종료 후 최종 결과가 공개돼요.
        </div>
      )}
    </div>
  );
}

function ResultsPageSkeleton() {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 56, borderRadius: 10 }} />
      <div className="tm-skeleton" style={{ height: 180, borderRadius: 'var(--radius-container)' }} />
      <div className="tm-skeleton" style={{ height: 160, borderRadius: 'var(--radius-control)' }} />
    </div>
  );
}

export function ResultsPageClient({ tournamentId }: { tournamentId: string }) {
  const { data, isLoading, isError, error, refetch } = useV1Tournament(tournamentId);
  if (isLoading) {
    return <ResultsPageSkeleton />;
  }
  if (isError || !data) {
    const msg = extractErrorMessage(error, '대회 정보를 불러오지 못했어요.');
    return (
      <div style={{ padding: '40px 20px' }}>
        <ErrorState message={msg} onRetry={() => void refetch()} />
      </div>
    );
  }
  return (
    <>
      <ResultsPageContent tournament={data} />
      <div className="tm-tourn-sub-flownav">
        <TournamentFlowNav
          prev={{ href: '/tournaments/' + tournamentId + '/bracket', label: '순위·브래킷' }}
          next={{ href: '/tournaments/' + tournamentId + '/awards', label: '시상·리뷰', enabled: data.status === 'completed', disabledHint: '대회 종료 후 공개' }}
        />
      </div>
    </>
  );
}
