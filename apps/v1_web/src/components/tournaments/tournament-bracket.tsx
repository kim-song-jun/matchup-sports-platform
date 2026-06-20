'use client';

/**
 * TournamentBracket — hand-authored knockout bracket.
 *
 * Desktop (≥768px): round columns left→right (4강 → 결승 → 우승) that fill the
 *   width, joined by elbow connectors so the path of advancement reads clearly.
 *   3·4위전 is a separate labelled card below the main bracket (it is a
 *   consolation match between the two semi-final losers, NOT a round after the
 *   final, so no connector is drawn to it).
 * Mobile (<768px): the same rounds stacked vertically with a downward connector.
 *
 * Replaces the earlier `bracketry` integration, which rendered a small, hard-to-
 * read tree adrift in the desktop bleed. Round grouping (`groupFixturesByRound`)
 * stays a pure, unit-tested function.
 */

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

/** 결승이 종료됐으면 우승 팀명을 반환(없으면 null). */
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
    default: return '알 수 없음';
  }
}

function penaltyText(fixture: V1TournamentFixture): string {
  const r = fixture.result;
  if (r?.hasPenalty && r.homePenaltyScore !== null && r.awayPenaltyScore !== null) {
    return `승부차기 ${r.homePenaltyScore}:${r.awayPenaltyScore}`;
  }
  return '';
}

/* ── Match card — one fixture (home / away rows + status) ── */

function MatchCard({ fixture }: { fixture: V1TournamentFixture }) {
  const winner = getWinner(fixture);
  const hasResult = fixture.result !== null;
  const penalty = penaltyText(fixture);
  const statusLine = fixture.status === 'scheduled'
    ? null
    : [fixtureStatusLabel(fixture.status), penalty].filter(Boolean).join(' · ');

  return (
    <div
      className={`tm-bk-match${fixture.status === 'in_progress' ? ' tm-bk-match-live' : ''}`}
      role="group"
      aria-label={`${fixture.homeTeamName || '미정'} 대 ${fixture.awayTeamName || '미정'}`}
    >
      <MatchRow name={fixture.homeTeamName} score={hasResult ? fixture.result!.homeScore : null} win={winner === 'home'} />
      <div className="tm-bk-divider" aria-hidden="true" />
      <MatchRow name={fixture.awayTeamName} score={hasResult ? fixture.result!.awayScore : null} win={winner === 'away'} />
      {statusLine ? <div className="tm-bk-status">{statusLine}</div> : null}
    </div>
  );
}

function MatchRow({ name, score, win }: { name: string; score: number | null; win: boolean }) {
  const decided = name?.trim().length > 0;
  return (
    <div className={`tm-bk-row${win ? ' tm-bk-row-win' : ''}`}>
      <span className={`tm-bk-team${decided ? '' : ' tm-bk-team-tbd'}`}>{decided ? name : '미정'}</span>
      <span className="tm-bk-score tab-num">{score === null ? '' : score}</span>
    </div>
  );
}

/* ── Champion slot — end of the bracket ── */

function ChampionSlot({ champion }: { champion: string | null }) {
  return (
    <div className={`tm-bk-champ${champion ? ' tm-bk-champ-decided' : ''}`} aria-label={champion ? `우승 ${champion}` : '우승 미정'}>
      <span className="tm-bk-champ-icon" aria-hidden="true">
        <TrophyIcon size={20} strokeWidth={1.8} />
      </span>
      <span className="tm-bk-champ-name">{champion ?? '우승팀 미정'}</span>
    </div>
  );
}

/* ── Empty bracket ── */

function BracketEmpty() {
  return (
    <Card pad={16} style={{ background: 'var(--grey50)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
        <div
          aria-hidden="true"
          style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--grey100)', display: 'grid', placeItems: 'center', color: 'var(--text-caption)' }}
        >
          <TrophyIcon size={20} strokeWidth={1.6} />
        </div>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>대진표 준비 중</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>대회 시작 전에 대진표가 공개돼요.</div>
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
  const rounds = groupFixturesByRound(fixtures, groups);
  if (fixtures.length === 0 || rounds.length === 0) {
    return <BracketEmpty />;
  }

  const mainRounds = rounds.filter((r) => r.key !== 'third_place');
  const thirdPlace = rounds.find((r) => r.key === 'third_place') ?? null;
  const champion = getChampion(rounds);

  return (
    <div className="tm-bracket-wrap">
      <div className="tm-bracket" role="group" aria-label="결선 대진표">
        {mainRounds.map((round) => (
          <div className="tm-bracket-col" key={round.key}>
            <div className="tm-bracket-col-head">{round.label}</div>
            <div className="tm-bracket-col-body">
              {round.fixtures.map((fixture) => <MatchCard key={fixture.id} fixture={fixture} />)}
            </div>
          </div>
        ))}
        <div className="tm-bracket-col tm-bracket-col-champ">
          <div className="tm-bracket-col-head">우승</div>
          <div className="tm-bracket-col-body">
            <ChampionSlot champion={champion} />
          </div>
        </div>
      </div>

      {thirdPlace ? (
        <section className="tm-bracket-third" aria-label="3·4위전">
          <div className="tm-bracket-third-head">
            <span className="tm-bracket-third-pill">3·4위전</span>
            <span className="tm-text-caption">4강에서 진 두 팀이 3위를 가려요</span>
          </div>
          <div className="tm-bracket-third-body">
            {thirdPlace.fixtures.map((fixture) => <MatchCard key={fixture.id} fixture={fixture} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
