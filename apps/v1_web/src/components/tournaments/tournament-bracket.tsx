'use client';

/**
 * TournamentBracket
 *
 * Renders knockout fixtures in round order.
 *
 * Mobile (default — .tm-hide-desktop): vertical stacked rounds, top→bottom.
 * Desktop (≥1024px — .tm-show-desktop): horizontal bracket columns left→right.
 *
 * Round grouping logic:
 *  1. For each fixture, look up its groupId in the provided `groups` array.
 *     Use group.phase as the round key. Phase sort order: semi → final → third_place.
 *  2. If groupId is null (fixture not assigned to a group), fall back to
 *     fixture.round string. These are sorted lexicographically after the
 *     phase-keyed rounds.
 *  3. Within each round, fixtures are sorted by fixtureNumber ascending.
 */

import { TrophyIcon } from '@/components/v1-ui/icons';
import { Card } from '@/components/v1-ui/primitives';
import type { V1TournamentFixture, V1TournamentGroup } from '@/types/api';

/* ── Types ── */

interface RoundGroup {
  key: string;
  label: string;
  sortIndex: number;
  fixtures: V1TournamentFixture[];
}

/* ── Helpers ── */

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
 */
function groupFixturesByRound(
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

/* ── Score/winner helpers ── */

type WinnerSide = 'home' | 'away' | null;

function getWinner(fixture: V1TournamentFixture): WinnerSide {
  if (!fixture.result) return null;
  const { homeScore, awayScore, hasPenalty, homePenaltyScore, awayPenaltyScore } = fixture.result;
  if (hasPenalty && homePenaltyScore !== null && awayPenaltyScore !== null) {
    return homePenaltyScore > awayPenaltyScore ? 'home' : 'away';
  }
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return null;
}

function fixtureStatusBadge(status: string): string {
  switch (status) {
    case 'in_progress': return 'tm-badge-green';
    case 'completed': return 'tm-badge-grey';
    case 'cancelled': return 'tm-badge-red';
    default: return 'tm-badge-blue';
  }
}

function fixtureStatusLabel(status: string): string {
  switch (status) {
    case 'scheduled': return '예정';
    case 'in_progress': return '진행중';
    case 'completed': return '종료';
    case 'cancelled': return '취소';
    default: return status;
  }
}

/* ── Fixture card shared between mobile and desktop ── */

function BracketFixtureCard({ fixture }: { fixture: V1TournamentFixture }) {
  const hasResult = fixture.result !== null;
  const winner = getWinner(fixture);

  const homeColor = winner === 'home' ? 'var(--blue500)' : 'var(--text-strong)';
  const awayColor = winner === 'away' ? 'var(--blue500)' : 'var(--text-strong)';

  return (
    <Card pad={12}>
      {/* Status row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <span className={`tm-badge ${fixtureStatusBadge(fixture.status)}`}>
          {fixtureStatusLabel(fixture.status)}
        </span>
      </div>

      {/* VS row: home · score · away */}
      <div
        role="group"
        aria-label={`${fixture.homeTeamName || 'TBD'} 대 ${fixture.awayTeamName || 'TBD'}`}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {/* Home */}
        <div style={{ textAlign: 'right', minWidth: 0 }}>
          <span
            className="tm-text-label"
            style={{
              color: homeColor,
              fontWeight: winner === 'home' ? 700 : undefined,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {fixture.homeTeamName || 'TBD'}
          </span>
        </div>

        {/* Score / VS */}
        <div style={{ textAlign: 'center', minWidth: 44 }}>
          {hasResult ? (
            <span
              className="tm-text-body-lg tab-num"
              style={{ color: 'var(--text-strong)', letterSpacing: 1 }}
            >
              {fixture.result!.homeScore} : {fixture.result!.awayScore}
            </span>
          ) : (
            <span
              className="tm-text-label"
              style={{ color: 'var(--text-caption)', letterSpacing: 1 }}
            >
              VS
            </span>
          )}
        </div>

        {/* Away */}
        <div style={{ textAlign: 'left', minWidth: 0 }}>
          <span
            className="tm-text-label"
            style={{
              color: awayColor,
              fontWeight: winner === 'away' ? 700 : undefined,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {fixture.awayTeamName || 'TBD'}
          </span>
        </div>
      </div>

      {/* Penalty */}
      {hasResult && fixture.result!.hasPenalty ? (
        <div
          className="tm-text-micro"
          style={{ textAlign: 'center', marginTop: 6, color: 'var(--text-caption)' }}
        >
          승부차기 {fixture.result!.homePenaltyScore} : {fixture.result!.awayPenaltyScore}
        </div>
      ) : null}
    </Card>
  );
}

/* ── Trophy placeholder: shown after the final round ── */

function TrophyPlaceholder() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '12px 0',
      }}
      aria-label="우승"
    >
      <div
        aria-hidden="true"
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #f0b429 0%, #d97706 100%)',
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
        }}
      >
        <TrophyIcon size={20} strokeWidth={1.8} />
      </div>
      <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>
        우승
      </span>
    </div>
  );
}

/* ── Mobile vertical layout ── */

function MobileBracket({ rounds }: { rounds: RoundGroup[] }) {
  const finalIndex = rounds.findIndex((r) => r.key === 'final');

  return (
    <div
      className="tm-hide-desktop"
      style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
    >
      {rounds.map((round, idx) => (
        <div key={round.key}>
          {/* Round label */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              padding: '4px 0',
            }}
          >
            <span
              className="tm-text-body-lg"
              style={{ color: 'var(--text-strong)' }}
            >
              {round.label}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--grey100)' }} aria-hidden="true" />
          </div>

          {/* Fixture cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {round.fixtures.map((fixture) => (
              <BracketFixtureCard key={fixture.id} fixture={fixture} />
            ))}
          </div>

          {/* Trophy after the final round; connector hint between other rounds */}
          {idx === finalIndex ? (
            <TrophyPlaceholder />
          ) : idx < rounds.length - 1 ? (
            <div
              aria-hidden="true"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 28,
                color: 'var(--text-caption)',
              }}
            >
              <span className="tm-text-micro">↓ 승자 진출</span>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ── Desktop horizontal layout — columnar bracket ── */

function DesktopBracket({ rounds }: { rounds: RoundGroup[] }) {
  return (
    <div className="tm-show-desktop tm-tournament-bracket-h">
      {rounds.map((round, idx) => {
        const isFinal = round.key === 'final';
        return (
          <div key={round.key} className="tm-bracket-column">
            {/* Column header */}
            <div className="tm-bracket-column-label">
              <span className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
                {round.label}
              </span>
            </div>

            {/* Fixtures */}
            <div className="tm-bracket-column-fixtures">
              {round.fixtures.map((fixture) => (
                <BracketFixtureCard key={fixture.id} fixture={fixture} />
              ))}
            </div>

            {/* Trophy appended after the final column */}
            {isFinal ? (
              <div className="tm-bracket-trophy">
                <TrophyPlaceholder />
              </div>
            ) : null}

            {/* Arrow connector between columns (not after last) */}
            {idx < rounds.length - 1 ? (
              <div className="tm-bracket-connector" aria-hidden="true">
                <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>→</span>
              </div>
            ) : null}
          </div>
        );
      })}
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
  if (fixtures.length === 0) {
    return <BracketEmpty />;
  }

  const rounds = groupFixturesByRound(fixtures, groups);

  if (rounds.length === 0) {
    return <BracketEmpty />;
  }

  return (
    <div>
      {/* Mobile: vertical */}
      <MobileBracket rounds={rounds} />
      {/* Desktop: horizontal — styled via desktop/tournaments.css .tm-tournament-bracket-h */}
      <DesktopBracket rounds={rounds} />
    </div>
  );
}
