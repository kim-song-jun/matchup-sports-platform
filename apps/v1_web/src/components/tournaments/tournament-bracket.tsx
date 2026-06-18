'use client';

/**
 * TournamentBracket
 *
 * Renders knockout fixtures as a proper tournament tree using the `bracketry`
 * library (zero-dependency, framework-agnostic — mounted imperatively into a
 * wrapper element). bracketry draws the round columns, the contestant cards,
 * scores, winner highlight, connector lines, and (natively) the 3·4위전 as a
 * "bronze match" below the final.
 *
 * Why bracketry (not @g-loot/react-tournament-brackets): the React bracket
 * libraries are all pre-React-19 and pull styled-components, which clashes with
 * this app's hand-authored CSS and React 19.2. bracketry is vanilla JS with no
 * peer deps, so it drops in cleanly and is themed entirely through options.
 *
 * Data flow:
 *  1. `groupFixturesByRound` groups fixtures into ordered rounds
 *     (semi → final → third_place) — same pure logic as before, still unit-tested.
 *  2. `buildBracketData` maps those rounds into bracketry's { rounds, matches,
 *     contestants } shape. The third_place round becomes a bronze match attached
 *     to the final round's index (bracketry renders it below the final).
 *  3. The component mounts bracketry in a useEffect (client-only, dynamic import
 *     so SSR never touches the DOM) and tears it down via `uninstall()`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { Card } from '@/components/v1-ui/primitives';
import type { V1TournamentFixture, V1TournamentGroup } from '@/types/api';

/* ── Round-grouping types & helpers (pure — unit-tested) ── */

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

/**
 * Groups fixtures into rounds. Returns rounds sorted by phase order,
 * then by fallback round string alphabetically.
 *
 * Exported for unit-testing the pure grouping logic.
 */
export function groupFixturesByRound(
  fixtures: V1TournamentFixture[],
  groups: V1TournamentGroup[],
): RoundGroup[] {
  const groupById = new Map<string, V1TournamentGroup>(
    groups.map((g) => [g.id, g]),
  );

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
        // groupId present but group not found — treat as fallback
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
    } else {
      roundMap.set(key, {
        key,
        label: getRoundLabel(key),
        sortIndex,
        fixtures: [fixture],
      });
    }
  }

  // Sort fixtures within each round by fixtureNumber
  for (const round of roundMap.values()) {
    round.fixtures.sort((a, b) => a.fixtureNumber - b.fixtureNumber);
  }

  return Array.from(roundMap.values()).sort((a, b) => {
    if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
    return a.key.localeCompare(b.key);
  });
}

/* ── Score / winner helpers ── */

type WinnerSide = 'home' | 'away' | null;

function getWinner(fixture: V1TournamentFixture): WinnerSide {
  if (!fixture.result) return null;
  const { homeScore, awayScore, hasPenalty, homePenaltyScore, awayPenaltyScore } = fixture.result;
  if (hasPenalty && homePenaltyScore !== null && awayPenaltyScore !== null) {
    // 승부차기 점수가 같으면 무승부/미결 처리 — 승자 강조 없음
    if (homePenaltyScore === awayPenaltyScore) return null;
    return homePenaltyScore > awayPenaltyScore ? 'home' : 'away';
  }
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return null;
}

/** 결승이 종료됐으면 우승 팀명을 반환(없으면 null) — 챔피언 배너 표시용. */
function getChampion(rounds: RoundGroup[]): string | null {
  const finalRound = rounds.find((r) => r.key === 'final');
  const finalFixture = finalRound?.fixtures[0];
  if (!finalFixture || finalFixture.status !== 'completed') return null;
  const w = getWinner(finalFixture);
  if (w === 'home') return finalFixture.homeTeamName || null;
  if (w === 'away') return finalFixture.awayTeamName || null;
  return null;
}

function fixtureStatusLabel(status: string): string {
  switch (status) {
    case 'scheduled': return '예정';
    case 'in_progress': return '진행 중';
    case 'completed': return '종료';
    case 'cancelled': return '취소';
    default: return status;
  }
}

/* ── bracketry data shape (locally typed — bracketry ships no usable Data type) ── */

interface BracketScore {
  mainScore: number | string;
  isWinner?: boolean;
}
interface BracketSide {
  contestantId?: string;
  scores?: BracketScore[];
  isWinner?: boolean;
}
interface BracketMatch {
  roundIndex: number;
  order: number;
  sides: [BracketSide, BracketSide];
  matchStatus?: string;
  isLive?: boolean;
  isBronzeMatch?: boolean;
}
interface BracketContestant {
  entryStatus?: string;
  players: { title: string }[];
}
export interface BracketData {
  rounds: { name: string }[];
  matches: BracketMatch[];
  contestants: Record<string, BracketContestant>;
}

/**
 * Maps grouped knockout rounds → bracketry data.
 *
 * - Each fixture becomes a match; sides reference contestants by a stable id
 *   (registrationId, or `name:<team>` when no registration id) so a team that
 *   advances from 4강 to 결승 reuses one contestant (enables path highlight).
 * - Empty / 미정 sides carry no contestantId → bracketry renders an empty slot.
 * - third_place is emitted as a bronze match pinned to the final round index
 *   (bracketry positions it below the final). Degenerate case (no main rounds)
 *   falls back to rendering it as a normal round.
 *
 * Exported for unit testing.
 */
export function buildBracketData(
  fixtures: V1TournamentFixture[],
  groups: V1TournamentGroup[],
): BracketData {
  const rounds = groupFixturesByRound(fixtures, groups);
  const mainRounds = rounds.filter((r) => r.key !== 'third_place');
  const thirdPlace = rounds.find((r) => r.key === 'third_place') ?? null;

  const contestants: Record<string, BracketContestant> = {};

  function makeSide(name: string, regId: string | null, hasResult: boolean, isWinner: boolean, score?: number): BracketSide {
    const title = (name ?? '').trim();
    if (!title) {
      // 미정 / TBD — empty slot, no contestant, no score
      return {};
    }
    const id = regId ?? `name:${title}`;
    if (!contestants[id]) {
      contestants[id] = { players: [{ title }] };
    }
    const side: BracketSide = { contestantId: id };
    if (isWinner) side.isWinner = true;
    if (hasResult && score !== undefined) {
      side.scores = [{ mainScore: score, isWinner }];
    }
    return side;
  }

  function makeMatch(
    fixture: V1TournamentFixture,
    roundIndex: number,
    order: number,
    isBronze: boolean,
  ): BracketMatch {
    const winner = getWinner(fixture);
    const hasResult = fixture.result !== null;
    const home = makeSide(
      fixture.homeTeamName, fixture.homeRegistrationId, hasResult, winner === 'home',
      fixture.result?.homeScore,
    );
    const away = makeSide(
      fixture.awayTeamName, fixture.awayRegistrationId, hasResult, winner === 'away',
      fixture.result?.awayScore,
    );

    const penalty = fixture.result?.hasPenalty
      && fixture.result.homePenaltyScore !== null
      && fixture.result.awayPenaltyScore !== null
      ? ` · 승부차기 ${fixture.result.homePenaltyScore}:${fixture.result.awayPenaltyScore}`
      : '';
    // 예정 경기는 상태 텍스트를 비워 깔끔하게(점수 부재로 미경기임이 드러남).
    const matchStatus = fixture.status === 'scheduled'
      ? undefined
      : `${fixtureStatusLabel(fixture.status)}${penalty}`;

    const match: BracketMatch = {
      roundIndex,
      order,
      sides: [home, away],
      isLive: fixture.status === 'in_progress',
    };
    if (matchStatus) match.matchStatus = matchStatus;
    if (isBronze) match.isBronzeMatch = true;
    return match;
  }

  const outRounds: { name: string }[] = mainRounds.map((r) => ({ name: r.label }));
  const matches: BracketMatch[] = [];

  mainRounds.forEach((round, ri) => {
    round.fixtures.forEach((fixture, oi) => {
      matches.push(makeMatch(fixture, ri, oi, false));
    });
  });

  if (thirdPlace) {
    if (mainRounds.length > 0) {
      // bronze match attaches to the final (last) round, order 1 (final is order 0)
      const bronzeRoundIndex = mainRounds.length - 1;
      thirdPlace.fixtures.forEach((fixture) => {
        matches.push(makeMatch(fixture, bronzeRoundIndex, 1, true));
      });
    } else {
      // No main rounds at all — render third_place as a standalone round.
      outRounds.push({ name: thirdPlace.label });
      thirdPlace.fixtures.forEach((fixture, oi) => {
        matches.push(makeMatch(fixture, 0, oi, false));
      });
    }
  }

  return { rounds: outRounds, matches, contestants };
}

/* ── bracketry theming (v1 design tokens via nested CSS vars) ── */

/**
 * bracketry sizes its tree to content (it does not stretch to fill a wide
 * container), so on desktop we widen each match and the gaps to give the small
 * 2-round bracket real presence; on mobile we keep it compact so both rounds fit.
 */
function buildBracketOptions(isWide: boolean) {
  return {
    rootBgColor: 'transparent',
    rootBorderColor: 'transparent',
    wrapperBorderColor: 'transparent',
    mainVerticalPadding: 8,

    // Round titles
    roundTitleColor: 'var(--text-muted)',
    roundTitlesFontSize: isWide ? 14 : 13,
    roundTitlesFontFamily: 'inherit',
    roundTitlesVerticalPadding: 10,
    roundTitlesBorderColor: 'var(--grey100)',

    // Matches — responsive width/margins
    matchTextColor: 'var(--text-strong)',
    matchFontSize: 14,
    matchMaxWidth: isWide ? 230 : 156,
    matchAxisMargin: isWide ? 16 : 8,
    matchHorMargin: isWide ? 28 : 8,
    matchMinVerticalGap: isWide ? 20 : 14,
    hoveredMatchBorderColor: 'var(--grey300)',
    matchStatusBgColor: 'var(--grey50)',

    // Localize the bronze (3·4위전) match label — bracketry's default getMatchTopHTML
    // hardcodes a large black English "3RD PLACE"; replace with a muted Korean caption.
    getMatchTopHTML: (match: { isBronzeMatch?: boolean }) =>
      match?.isBronzeMatch
        ? '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-align:center;padding-bottom:6px;">3·4위전</div>'
        : '',

    // Connectors
    connectionLinesColor: 'var(--grey300)',
    connectionLinesWidth: 2,
    highlightedConnectionLinesColor: 'var(--blue500)',

    // Path highlight (on click) + winner emphasis
    highlightedPlayerTitleColor: 'var(--blue500)',

    // Live match
    liveMatchBorderColor: 'var(--green500)',

    // Fonts inherit Pretendard from the app shell
    rootFontFamily: 'inherit',
    playerTitleFontFamily: 'inherit',
    scoreFontFamily: 'inherit',

    // Navigation — small bracket; show subtle nav only when rounds overflow (mobile)
    navButtonsPosition: 'overTitles' as const,
    navButtonSvgColor: 'var(--text-muted)',
    navButtonArrowSize: 9,
    navGutterBorderColor: 'transparent',

    // Vertical overflow scrolls natively; scrollbar hidden app-wide already
    verticalScrollMode: 'native' as const,
    showScrollbar: false,
  };
}

/* bracketry's createBracket — typed loosely (the shipped Data type is unusable). */
type BracketInstance = { uninstall: () => void };
type CreateBracket = (
  data: BracketData,
  el: Element,
  options?: Record<string, unknown>,
) => BracketInstance;

/* ── Champion banner — celebrates the decided winner above the tree ── */

function ChampionBanner({ champion }: { champion: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 99,
        background: 'var(--orange50, var(--grey50))',
        border: '1px solid var(--orange500)',
        marginBottom: 12,
      }}
      aria-label={`우승 ${champion}`}
    >
      <span
        aria-hidden="true"
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--orange500) 0%, #f08a00 100%)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--static-white)',
          flexShrink: 0,
        }}
      >
        <TrophyIcon size={13} strokeWidth={2} />
      </span>
      <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>우승</span>
      <span className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
        {champion}
      </span>
    </div>
  );
}

/* ── Empty bracket ── */

function BracketEmpty() {
  return (
    <Card pad={16} style={{ background: 'var(--grey50)' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: '8px 0',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--grey100)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--text-caption)',
          }}
        >
          <TrophyIcon size={20} strokeWidth={1.6} />
        </div>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
          대진표 준비 중
        </div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          대회 시작 전에 대진표가 공개돼요.
        </div>
      </div>
    </Card>
  );
}

/* ── Public component ── */

export interface TournamentBracketProps {
  /** Knockout fixtures to display (phase: semi / final / third_place). */
  fixtures: V1TournamentFixture[];
  /** All groups — used to resolve groupId → phase. */
  groups: V1TournamentGroup[];
}

export function TournamentBracket({ fixtures, groups }: TournamentBracketProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  // ≥768px → widen the bracket so a small 2-round tree fills the desktop bleed.
  const [isWide, setIsWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );

  const rounds = useMemo(() => groupFixturesByRound(fixtures, groups), [fixtures, groups]);
  const data = useMemo(() => buildBracketData(fixtures, groups), [fixtures, groups]);
  const champion = useMemo(() => getChampion(rounds), [rounds]);

  // Wrapper height — bracketry fills its container, so size it to the content.
  const wrapperHeight = useMemo(() => {
    const mainRounds = rounds.filter((r) => r.key !== 'third_place');
    const hasBronze = rounds.some((r) => r.key === 'third_place');
    const maxStack = Math.max(
      1,
      ...mainRounds.map((r) => r.fixtures.length),
      hasBronze ? 2 : 1,
    );
    return Math.max(300, (isWide ? 88 : 64) + maxStack * (isWide ? 120 : 104));
  }, [rounds, isWide]);

  // Track the desktop breakpoint to re-theme the bracket responsively.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsWide(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (data.matches.length === 0) return;
    const el = mountRef.current;
    if (!el) return;

    let instance: BracketInstance | null = null;
    let cancelled = false;

    // Lay out at full width first so bracketry shows every round with room to spare.
    el.style.width = '100%';

    void import('bracketry').then((mod) => {
      if (cancelled || !mountRef.current) return;
      const createBracket = mod.createBracket as unknown as CreateBracket;
      instance = createBracket(data, mountRef.current, buildBracketOptions(isWide));

      // Desktop: bracketry left-aligns its content inside the wrapper, so a compact
      // tree drifts left in the wide bleed. Shrink the wrapper to the tree's natural
      // width (only when it comfortably fits) so the flex parent centers it.
      if (isWide) {
        requestAnimationFrame(() => {
          const node = mountRef.current;
          if (cancelled || !node) return;
          const root = node.querySelector('.bracket-root');
          const contentWidth = root instanceof HTMLElement ? root.scrollWidth : 0;
          if (contentWidth > 0 && contentWidth < node.clientWidth) {
            node.style.width = `${Math.ceil(contentWidth)}px`;
          }
        });
      }
    });

    return () => {
      cancelled = true;
      instance?.uninstall();
    };
  }, [data, isWide]);

  if (fixtures.length === 0 || data.matches.length === 0) {
    return <BracketEmpty />;
  }

  return (
    <div>
      {champion ? <ChampionBanner champion={champion} /> : null}
      {/* bracketry sizes to content; the flex parent centers the (width-fitted) tree. */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          ref={mountRef}
          role="group"
          aria-label="대진표"
          style={{ height: wrapperHeight }}
        />
      </div>
    </div>
  );
}
