'use client';

import { useState, useEffect } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useV1Tournament } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { TournamentFlowNav } from '@/components/tournaments/tournament-flow-nav';
import { formatTournamentDateShort } from '@/lib/date-utils';
import type {
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

function getChampionName(tournament: V1TournamentDetail): string | null {
  const f = tournament.fixtures.find((x) => x.round === 'final' || x.round === '결승');
  if (!f?.result) return null;
  const w = getWinnerSide(f.result);
  return w === 'home' ? (f.homeTeamName || null) : w === 'away' ? (f.awayTeamName || null) : null;
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
  return (
    <div className="tm-show-desktop">
    <div
      style={{
        position: 'relative',
        background: 'linear-gradient(160deg, #0A0E1A 0%, #0D1B2A 40%, #1A0A2E 100%)',
        borderRadius: 16,
        padding: '48px 56px',
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
      <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 16, filter: 'drop-shadow(0 0 24px rgba(255,215,0,0.5))' }} aria-hidden="true">
        🏆
      </div>
      {/* CHAMPION 배지 */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.3)',
        borderRadius: 20, padding: '4px 14px',
        fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
        color: 'rgba(255,215,0,0.85)', textTransform: 'uppercase',
        marginBottom: 12,
      }}>
        ★ CHAMPION ★
      </div>
      {/* 팀명 */}
      <div style={{
        fontSize: 44, fontWeight: 900, color: '#FFFFFF',
        letterSpacing: '-0.03em', lineHeight: 1.1,
        marginBottom: 8,
      }}>
        {champion}
      </div>
      {/* 대회명 */}
      <div style={{
        fontSize: 12, color: 'rgba(255,255,255,0.4)',
        fontWeight: 600, letterSpacing: '0.04em',
        marginBottom: 28,
      }}>
        {tournament.sport?.name ?? ''} &middot; {tournament.title}
      </div>
      {/* 스탯 3칸 */}
      <div style={{ display: 'flex', gap: 40, alignItems: 'center' }}>
        {[
          { n: rec.w, label: '승리', sub: `${rec.games}경기 중` },
          { n: rec.gf, label: '득점', sub: `${rec.ga}실점` },
          { n: rec.w, label: '무패', sub: '전 경기' },
        ].map(({ n, label, sub }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 36, fontWeight: 900, lineHeight: 1,
              color: '#FDE68A', fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
            }}>{n}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{label}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{sub}</div>
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

  useEffect(() => {
    const t = setTimeout(() => setPlayed(true), 80);
    return () => clearTimeout(t);
  }, []);

  const replay = () => {
    setPlayed(false);
    requestAnimationFrame(() => { setTimeout(() => setPlayed(true), 30); });
  };

  return (
    <div
      className={`tm-hide-desktop tm-res-hero${played ? ' tm-res-hero-in' : ''}`}
      aria-label={`우승팀: ${champion}`}
      onClick={replay}
      style={{ cursor: 'pointer' }}
    >
      {played && <Confetti count={32} />}
      <div className="tm-res-hero-trophy" aria-hidden="true">🏆</div>
      <div className="tm-res-hero-label">★ CHAMPION ★</div>
      <div className="tm-res-hero-name">{champion}</div>
      <div className="tm-res-hero-inline-stat">
        {tournament.sport?.name ?? ''} &middot; {rec.games}경기 &middot; {rec.w}승 &middot; {rec.gf}득점
      </div>
      {/* 스탯 3칸 */}
      <div style={{ display: 'flex', gap: 28, marginTop: 16, alignItems: 'center' }}>
        {[
          { n: rec.w, label: '승리', sub: `${rec.games}경기 중` },
          { n: rec.gf, label: '득점', sub: `${rec.ga}실점` },
          { n: rec.w, label: '무패', sub: '전 경기' },
        ].map(({ n, label, sub }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: '#FDE68A', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{n}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>{label}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{sub}</div>
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

function KnockoutResultsTable({ fixtures }: { fixtures: V1TournamentFixture[] }) {
  if (fixtures.length === 0) return null;

  const semiByMatchup = new Map<number, V1TournamentFixture[]>();
  const nonSemiFixtures: V1TournamentFixture[] = [];

  for (const f of fixtures) {
    const isSemi = f.round === 'semi' || f.round === '4강';
    if (isSemi && f.fixtureNumber != null) {
      const bucket = semiByMatchup.get(f.fixtureNumber) ?? [];
      bucket.push(f);
      semiByMatchup.set(f.fixtureNumber, bucket);
    } else {
      nonSemiFixtures.push(f);
    }
  }

  const finalFixtures = nonSemiFixtures.filter((f) => f.round === 'final' || f.round === '결승');
  const thirdFixtures = nonSemiFixtures.filter((f) => f.round === 'third_place' || f.round === '3·4위전');

  const calcAggregate = (legs: V1TournamentFixture[]) => {
    const leg1 = legs.find((f) => f.legNumber === 1 || !f.legNumber);
    const leg2 = legs.find((f) => f.legNumber === 2);
    if (!leg1?.result) return null;
    const homeTeam = leg1.homeTeamName;
    const awayTeam = leg1.awayTeamName;
    const isReversed = leg2 ? leg2.homeTeamName === awayTeam : false;
    const homeTotal = (leg1.result.homeScore ?? 0) + (isReversed ? (leg2?.result?.awayScore ?? 0) : (leg2?.result?.homeScore ?? 0));
    const awayTotal = (leg1.result.awayScore ?? 0) + (isReversed ? (leg2?.result?.homeScore ?? 0) : (leg2?.result?.awayScore ?? 0));
    return { homeTeam, awayTeam, homeTotal, awayTotal, legs, leg1, leg2 };
  };

  /* ── 경기 결과 행 (범용) ── */
  const ScoreBox = ({ home, away, bg, hasPenalty, homePK, awayPK, size = 14 }: {
    home: number; away: number; bg: string;
    hasPenalty?: boolean; homePK?: number | null; awayPK?: number | null; size?: number;
  }) => (
    <div style={{ textAlign: 'center', background: bg, borderRadius: 6, padding: '3px 0' }}>
      <div style={{ fontSize: size, fontWeight: 900, color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
        {home}<span style={{ fontSize: size - 4, opacity: 0.3, margin: '0 2px' }}>:</span>{away}
      </div>
      {hasPenalty && homePK != null && awayPK != null && (
        <div style={{ fontSize: 8, color: 'var(--text-caption)', lineHeight: 1 }}>PK {homePK}:{awayPK}</div>
      )}
    </div>
  );

  const ROW_GRID = '56px 1fr 64px 1fr 40px';

  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--grey150)' }}>

      {/* ── 결승 ── */}
      {finalFixtures.map((f, idx) => {
        if (!f.result) return null;
        const { homeScore, awayScore, hasPenalty, homePenaltyScore, awayPenaltyScore } = f.result;
        const winner = getWinnerSide(f.result);
        return (
          <div key={f.id} style={{
            display: 'grid', gridTemplateColumns: ROW_GRID,
            padding: '13px 16px', alignItems: 'center',
            borderTop: idx > 0 ? '1px solid var(--grey100)' : 'none',
            background: 'var(--blue50)',
            borderLeft: '3px solid var(--blue500)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--blue500)', letterSpacing: '0.02em' }}>
              🏆 결승
            </div>
            <div style={{ textAlign: 'right', fontSize: 14, fontWeight: winner === 'home' ? 800 : 500,
              color: winner === 'home' ? 'var(--text-strong)' : 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
              {f.homeTeamName}
            </div>
            <ScoreBox home={homeScore} away={awayScore} bg="rgba(49,130,246,0.12)"
              hasPenalty={hasPenalty} homePK={homePenaltyScore} awayPK={awayPenaltyScore} size={16} />
            <div style={{ textAlign: 'left', fontSize: 14, fontWeight: winner === 'away' ? 800 : 500,
              color: winner === 'away' ? 'var(--text-strong)' : 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 8 }}>
              {f.awayTeamName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-caption)', textAlign: 'right', whiteSpace: 'nowrap' }}>
              {f.scheduledAt ? new Date(f.scheduledAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : ''}
            </div>
          </div>
        );
      })}

      {/* ── 4강 — 1차전·2차전·합산 묶음 ── */}
      {Array.from(semiByMatchup.values()).map((legs) => {
        const agg = calcAggregate(legs);
        if (!agg) return null;
        const { homeTeam, awayTeam, homeTotal, awayTotal, leg1, leg2 } = agg;
        const aggWinner = homeTotal > awayTotal ? 'home' : awayTotal > homeTotal ? 'away' : null;

        const renderLeg = (f: V1TournamentFixture, legLabel: string) => {
          if (!f.result) return null;
          const { homeScore, awayScore, hasPenalty, homePenaltyScore, awayPenaltyScore } = f.result;
          const w = getWinnerSide(f.result);
          return (
            <div key={f.id} style={{
              display: 'grid', gridTemplateColumns: ROW_GRID,
              padding: '9px 16px', alignItems: 'center',
              borderTop: '1px solid var(--grey100)',
              background: 'transparent',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-caption)', letterSpacing: '0.02em' }}>
                {legLabel}
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: w === 'home' ? 700 : 400,
                color: w === 'home' ? 'var(--text-strong)' : 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                {f.homeTeamName}
              </div>
              <ScoreBox home={homeScore} away={awayScore} bg="var(--grey50)"
                hasPenalty={hasPenalty} homePK={homePenaltyScore} awayPK={awayPenaltyScore} size={13} />
              <div style={{ textAlign: 'left', fontSize: 12, fontWeight: w === 'away' ? 700 : 400,
                color: w === 'away' ? 'var(--text-strong)' : 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 8 }}>
                {f.awayTeamName}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-caption)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {f.scheduledAt ? new Date(f.scheduledAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : ''}
              </div>
            </div>
          );
        };

        return (
          <div key={`semi-${homeTeam}`} style={{ borderTop: '1px solid var(--grey150)' }}>
            {leg1 && renderLeg(leg1, '4강 1차')}
            {leg2 && renderLeg(leg2, '4강 2차')}
            {/* 합산 행 */}
            <div style={{
              display: 'grid', gridTemplateColumns: ROW_GRID,
              padding: '10px 16px', alignItems: 'center',
              background: 'rgba(49,130,246,0.05)',
              borderTop: '1px solid rgba(49,130,246,0.15)',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue500)', letterSpacing: '0.02em' }}>
                합산
              </div>
              <div style={{ textAlign: 'right', fontSize: 13, fontWeight: aggWinner === 'home' ? 700 : 400,
                color: aggWinner === 'home' ? 'var(--blue500)' : 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                {homeTeam}{aggWinner === 'home' && <span style={{ fontSize: 9, marginLeft: 4 }}>✓ 진출</span>}
              </div>
              <div style={{ textAlign: 'center', background: 'rgba(49,130,246,0.1)', borderRadius: 6, padding: '3px 0', border: '1px solid rgba(49,130,246,0.25)' }}>
                <div style={{ fontSize: 14, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', color: 'var(--blue500)' }}>
                  {homeTotal}<span style={{ fontSize: 10, opacity: 0.4, margin: '0 2px' }}>:</span>{awayTotal}
                </div>
              </div>
              <div style={{ textAlign: 'left', fontSize: 13, fontWeight: aggWinner === 'away' ? 700 : 400,
                color: aggWinner === 'away' ? 'var(--blue500)' : 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 8 }}>
                {awayTeam}{aggWinner === 'away' && <span style={{ fontSize: 9, marginLeft: 4 }}>✓ 진출</span>}
              </div>
              <div />
            </div>
          </div>
        );
      })}

      {/* ── 3·4위전 ── */}
      {thirdFixtures.map((f, idx) => {
        if (!f.result) return null;
        const { homeScore, awayScore, hasPenalty, homePenaltyScore, awayPenaltyScore } = f.result;
        const winner = getWinnerSide(f.result);
        return (
          <div key={f.id} style={{
            display: 'grid', gridTemplateColumns: ROW_GRID,
            padding: '10px 16px', alignItems: 'center',
            borderTop: '1px solid var(--grey150)',
            background: 'var(--grey50)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-caption)', letterSpacing: '0.02em' }}>3·4위전</div>
            <div style={{ textAlign: 'right', fontSize: 13, fontWeight: winner === 'home' ? 800 : 500,
              color: winner === 'home' ? 'var(--text-strong)' : 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
              {f.homeTeamName}
            </div>
            <div style={{ textAlign: 'center', background: 'var(--grey50)', borderRadius: 6, padding: '3px 0' }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {homeScore}<span style={{ fontSize: 10, opacity: 0.3, margin: '0 2px' }}>:</span>{awayScore}
              </div>
              {hasPenalty && <div style={{ fontSize: 8, color: 'var(--text-caption)', lineHeight: 1 }}>PK {homePenaltyScore}:{awayPenaltyScore}</div>}
            </div>
            <div style={{ textAlign: 'left', fontSize: 13, fontWeight: winner === 'away' ? 800 : 500,
              color: winner === 'away' ? 'var(--text-strong)' : 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 8 }}>
              {f.awayTeamName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-caption)', textAlign: 'right', whiteSpace: 'nowrap' }}>
              {f.scheduledAt ? new Date(f.scheduledAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* 순위별 스타일 */
const POS_CFG: Record<number, { bg: string; numColor: string; label: string }> = {
  1: { bg: 'var(--blue50)',    numColor: 'var(--blue500)',      label: '우승'   },
  2: { bg: 'transparent',     numColor: 'var(--text-caption)', label: '준우승' },
  3: { bg: 'transparent',     numColor: 'var(--text-caption)', label: '3위'    },
  4: { bg: 'transparent',     numColor: 'var(--text-caption)', label: '4위'    },
};

function FinalStandingsTable({ rows, fixtures }: { rows: FinalRankRow[]; fixtures: V1TournamentFixture[] }) {
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--grey150)' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '40px 1fr 64px 36px 36px 40px',
        padding: '7px 14px', background: 'var(--grey50)', borderBottom: '1px solid var(--grey150)',
      }}>
        {['#', '팀', '결과', 'W', 'GF', '+/-'].map((h) => (
          <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-caption)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: h === '팀' ? 'left' : 'center' }}>{h}</div>
        ))}
      </div>
      {rows.map((row, idx) => {
        const cfg = POS_CFG[row.pos] ?? POS_CFG[4];
        const rec = computeTeamRecord(row.name, fixtures);
        const diff = rec.gf - rec.ga;
        const isChamp = row.pos === 1;
        return (
          <div key={row.pos} style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 64px 36px 36px 40px',
            padding: '11px 14px', background: cfg.bg,
            borderTop: idx > 0 ? '1px solid var(--grey100)' : 'none',
            alignItems: 'center',
          }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: cfg.numColor, fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>{row.pos}</div>
            <div style={{ fontWeight: isChamp ? 700 : 500, fontSize: 14, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.name}
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: cfg.numColor }}>
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

/* ── 메인 콘텐츠 ── */
function ResultsPageContent({ tournament }: { tournament: V1TournamentDetail }) {
  const [showGroup, setShowGroup] = useState(false);
  const isCompleted  = tournament.status === 'completed';
  const isInProgress = tournament.status === 'in_progress';
  const championName = isCompleted ? getChampionName(tournament) : null;
  const knockoutRows = !isCompleted ? [] : buildKnockoutFinalRanking(tournament.fixtures);

  const knockoutFixtures = tournament.fixtures.filter(
    (f) => f.status === 'completed' && f.result !== null &&
      ['final', 'semi', 'third_place', '결승', '4강', '3·4위전'].includes(f.round),
  ).sort((a, b) => {
    const order: Record<string, number> = { final: 0, '결승': 0, semi: 1, '4강': 1, third_place: 2, '3·4위전': 2 };
    return (order[a.round] ?? 9) - (order[b.round] ?? 9);
  });

  const groupFixtures = tournament.fixtures.filter(
    (f) => f.status === 'completed' && f.result !== null && ['group', '조별리그'].includes(f.round),
  ).sort((a, b) => a.fixtureNumber - b.fixtureNumber);

  return (
    <div className="tm-tourn-sub-page" style={{ paddingBottom: 40 }}>
      {/* ── 챔피언 섹션 ── */}
      {isCompleted && championName && (
        <div style={{ padding: '16px 20px 0' }}>
          {/* 데스크탑: 풀 화면 히어로 */}
          <DesktopChampionHero champion={championName} tournament={tournament} />
          {/* 모바일: 컴팩트 배너 */}
          <MobileChampionBanner champion={championName} tournament={tournament} />
        </div>
      )}

      {isInProgress && (
        <div style={{ padding: '12px 20px 0' }}>
          <div style={{ padding: '20px', textAlign: 'center', background: 'var(--blue50)', borderRadius: 10 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--blue500)' }}>대회가 진행 중이에요</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-caption)' }}>종료 후 최종 결과를 확인할 수 있어요.</p>
          </div>
        </div>
      )}

      {isCompleted && (
        <div className="tm-tourn-sub-grid tm-tourn-sub-grid-6040">
          <div className="tm-tourn-sub-col" style={{ padding: '16px 20px 0' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-caption)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              최종 순위
            </h3>
            {knockoutRows.length > 0 && <FinalStandingsTable rows={knockoutRows} fixtures={tournament.fixtures} />}
          </div>
          <div className="tm-tourn-sub-col" style={{ padding: '16px 20px 0' }}>
            {knockoutFixtures.length > 0 && (
              <>
                <h3 style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-caption)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  결선 경기
                </h3>
                <KnockoutResultsTable fixtures={knockoutFixtures} />
              </>
            )}
            {groupFixtures.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <button type="button" className="tm-res-expand-btn"
                  onClick={() => setShowGroup((v) => !v)} aria-expanded={showGroup}>
                  <span>조별리그 결과 {groupFixtures.length}경기</span>
                  <span className="tm-res-expand-chevron" style={{ transform: showGroup ? 'rotate(180deg)' : undefined }}>▾</span>
                </button>
                {showGroup && (
                  <div className="tm-res-matches-block" style={{ marginTop: 8 }}>
                    {groupFixtures.map((f) => (
                      <div key={f.id} className="tm-res-match-row">
                        <div className="tm-res-match-meta"><span className="tm-res-match-round">조별</span></div>
                        <div className="tm-res-match-teams">
                          <span className="tm-res-match-team" style={{ fontWeight: getWinnerSide(f.result!) === 'home' ? 700 : 400 }}>{f.homeTeamName}</span>
                          <span className="tm-res-match-score tab-num">{f.result?.homeScore}<span style={{ opacity: 0.35, margin: '0 2px' }}>:</span>{f.result?.awayScore}</span>
                          <span className="tm-res-match-team tm-res-match-team-right" style={{ fontWeight: getWinnerSide(f.result!) === 'away' ? 700 : 400 }}>{f.awayTeamName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
      <div className="tm-skeleton" style={{ height: 180, borderRadius: 16 }} />
      <div className="tm-skeleton" style={{ height: 160, borderRadius: 12 }} />
    </div>
  );
}

export function ResultsPageClient({ tournamentId }: { tournamentId: string }) {
  const { data, isLoading, isError, error, refetch } = useV1Tournament(tournamentId);
  if (isLoading) {
    return (
      <AppChrome title="최종결과" backHref={'/tournaments/' + tournamentId + '/bracket'} bottomNav={false} activeTab="tournaments">
        <ResultsPageSkeleton />
      </AppChrome>
    );
  }
  if (isError || !data) {
    const msg = extractErrorMessage(error, '대회 정보를 불러오지 못했어요.');
    return (
      <AppChrome title="최종결과" backHref={'/tournaments/' + tournamentId + '/bracket'} bottomNav={false} activeTab="tournaments">
        <div style={{ padding: '40px 20px' }}>
          <ErrorState message={msg} onRetry={() => void refetch()} />
        </div>
      </AppChrome>
    );
  }
  return (
    <AppChrome title="최종결과" backHref={'/tournaments/' + tournamentId + '/bracket'} bottomNav={false} activeTab="tournaments">
      <ResultsPageContent tournament={data} />
      <div className="tm-tourn-sub-flownav">
        <TournamentFlowNav
          prev={{ href: '/tournaments/' + tournamentId + '/bracket', label: '순위·브래킷' }}
          next={{ href: '/tournaments/' + tournamentId + '/awards', label: '시상·리뷰', enabled: data.status === 'completed', disabledHint: '대회 종료 후 공개' }}
        />
      </div>
    </AppChrome>
  );
}
