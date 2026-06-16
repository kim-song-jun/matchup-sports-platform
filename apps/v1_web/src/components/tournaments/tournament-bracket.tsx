'use client';

/**
 * TournamentBracket
 *
 * Renders knockout fixtures in round order.
 *
 * Mobile (default — .tm-hide-desktop): vertical stacked rounds, top→bottom,
 *   with CSS pseudo-element vertical connector lines between rounds.
 * Desktop (≥1024px — .tm-show-desktop): horizontal bracket columns left→right,
 *   with CSS pseudo-element elbow connector lines between columns.
 *
 * Round grouping logic:
 *  1. For each fixture, look up its groupId in the provided `groups` array.
 *     Use group.phase as the round key. Phase sort order: semi → final → third_place.
 *  2. If groupId is null (fixture not assigned to a group), fall back to
 *     fixture.round string. These are sorted lexicographically after the
 *     phase-keyed rounds.
 *  3. Within each round, fixtures are sorted by fixtureNumber ascending.
 *
 * Rendering note — third_place is a PARALLEL section, NOT the next bracket column:
 *  - "결승" is the final column; the trophy is placed at its right end.
 *  - "3·4위전" is rendered in a visually separated section (mobile: below trophy;
 *    desktop: below the main bracket row) with a divider label so the reader
 *    understands it is a consolation match between the two semi-final losers,
 *    NOT a round that follows the final.
 *  - No connector arrow is drawn between "결승" and "3·4위전".
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

/* ── Score/winner helpers ── */

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

/** 결승이 종료됐으면 우승 팀명을 반환(없으면 null) — 우승 슬롯에 챔피언 표시용. */
function getChampion(rounds: RoundGroup[]): string | null {
  const finalRound = rounds.find((r) => r.key === 'final');
  const finalFixture = finalRound?.fixtures[0];
  if (!finalFixture || finalFixture.status !== 'completed') return null;
  const w = getWinner(finalFixture);
  if (w === 'home') return finalFixture.homeTeamName ?? null;
  if (w === 'away') return finalFixture.awayTeamName ?? null;
  return null;
}

function fixtureStatusBadge(status: string): string {
  switch (status) {
    case 'in_progress': return 'tm-badge-green';
    case 'completed': return 'tm-badge-grey';
    case 'cancelled': return 'tm-badge-red';
    default: return 'tm-badge-grey';
  }
}

/**
 * D4: Scheduled 예정 뱃지 — 회색 배경 + 파란 점으로 종료(completed)와 시각 구분.
 * 점에만 의존하지 않고 '예정' 텍스트를 함께 유지 (a11y: 컬러+텍스트 병행).
 */
function FixtureStatusBadge({ status }: { status: string }) {
  const badgeClass = fixtureStatusBadge(status);
  const label = fixtureStatusLabel(status);
  return (
    <span className={`tm-badge ${badgeClass}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {status === 'scheduled' ? (
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--blue500)',
            flexShrink: 0,
            display: 'inline-block',
          }}
        />
      ) : null}
      {label}
    </span>
  );
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
        <FixtureStatusBadge status={fixture.status} />
      </div>

      {/* VS row: home · score · away */}
      <div
        role="group"
        aria-label={`${fixture.homeTeamName || '미정'} 대 ${fixture.awayTeamName || '미정'}`}
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
            {fixture.homeTeamName || '미정'}
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
              vs
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
            {fixture.awayTeamName || '미정'}
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

function TrophyPlaceholder({ champion }: { champion?: string | null }) {
  const decided = Boolean(champion);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '12px 0',
      }}
      aria-label={decided ? `우승 ${champion}` : '우승'}
    >
      <div
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: decided
            ? 'linear-gradient(135deg, var(--orange500) 0%, #f08a00 100%)'
            : 'linear-gradient(135deg, var(--blue500) 0%, var(--blue600) 100%)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--static-white)',
        }}
      >
        <TrophyIcon size={22} strokeWidth={1.8} />
      </div>
      {decided ? (
        <>
          <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>우승</span>
          <span className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 700, textAlign: 'center' }}>
            {champion}
          </span>
        </>
      ) : (
        <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>우승</span>
      )}
    </div>
  );
}

/* ── Mobile vertical layout ── */

/**
 * MobileBracket splits rounds into:
 *  - mainRounds: semi, final, and any non-third_place rounds (connected by arrows,
 *    trophy after final)
 *  - thirdPlaceRound: rendered separately below the trophy with a divider so the
 *    user sees it as a parallel consolation match, NOT as a round after the final.
 */
function MobileBracket({ rounds }: { rounds: RoundGroup[] }) {
  const mainRounds = rounds.filter((r) => r.key !== 'third_place');
  const thirdPlaceRound = rounds.find((r) => r.key === 'third_place') ?? null;
  const finalIndex = mainRounds.findIndex((r) => r.key === 'final');
  const champion = getChampion(rounds);

  return (
    <div
      className="tm-hide-desktop"
      style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
    >
      {/* ── Main bracket: semi → final → trophy ── */}
      {mainRounds.map((round, idx) => (
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

          {/* Trophy after the final round; connector line between earlier rounds */}
          {idx === finalIndex ? (
            <TrophyPlaceholder champion={champion} />
          ) : idx < mainRounds.length - 1 ? (
            /* Vertical connector line — styled via .tm-bracket-mobile-connector
               in desktop/tournaments.css (visible at all breakpoints) */
            <div
              className="tm-bracket-mobile-connector"
              aria-hidden="true"
            />
          ) : null}
        </div>
      ))}

      {/* ── 3·4위전: parallel section — 4강 패자 consolation match ── */}
      {thirdPlaceRound !== null ? (
        <div
          style={{ marginTop: 24 }}
          aria-label="3·4위전 — 4강 패자 경기"
        >
          {/* Divider with label */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}
            aria-hidden="true"
          >
            <div style={{ flex: 1, height: 1, background: 'var(--grey200)' }} />
            <span
              className="tm-text-micro"
              style={{
                color: 'var(--text-caption)',
                whiteSpace: 'nowrap',
                padding: '2px 8px',
                border: '1px solid var(--grey200)',
                borderRadius: 99,
                background: 'var(--grey50)',
              }}
            >
              3·4위전 — 4강 패자 경기
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--grey200)' }} />
          </div>

          {/* Round label row */}
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
              {thirdPlaceRound.label}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--grey100)' }} aria-hidden="true" />
          </div>

          {/* Fixture cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {thirdPlaceRound.fixtures.map((fixture) => (
              <BracketFixtureCard key={fixture.id} fixture={fixture} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── Desktop horizontal layout — columnar bracket with real connector lines ── */

/**
 * DesktopBracket splits rounds into two groups:
 *
 *  mainRounds  — semi, final, and any non-third_place rounds rendered as
 *                sequential bracket columns with connector arrows between them.
 *                Trophy is placed at the right end of the "final" column.
 *
 *  thirdPlaceRound — "3·4위전" rendered as a separate section BELOW the main
 *                bracket row, with a pill-style divider label.
 *                NO connector is drawn between final and third_place.
 *
 * Structure:
 *   .tm-bracket-desktop-wrapper                 — outer flex column
 *     .tm-tournament-bracket-h                  — main bracket row (semi → final → trophy)
 *       .tm-bracket-col-wrapper (×n)
 *         .tm-bracket-column
 *           .tm-bracket-column-label
 *           .tm-bracket-column-fixtures
 *           .tm-bracket-trophy (final column only)
 *         .tm-bracket-connector (omitted on last wrapper)
 *     .tm-bracket-third-place-section (optional) — parallel consolation section
 *       divider label
 *       .tm-tournament-bracket-h (single column)
 */
function DesktopBracket({ rounds }: { rounds: RoundGroup[] }) {
  const mainRounds = rounds.filter((r) => r.key !== 'third_place');
  const thirdPlaceRound = rounds.find((r) => r.key === 'third_place') ?? null;
  const champion = getChampion(rounds);

  return (
    <div className="tm-show-desktop" role="region" aria-label="대진표">
      {/* ── Main bracket: semi → final → trophy ── */}
      <div className="tm-tournament-bracket-h">
        {mainRounds.map((round, idx) => {
          const isFinal = round.key === 'final';
          const isLast = idx === mainRounds.length - 1;

          return (
            <div key={round.key} className="tm-bracket-col-wrapper">
              {/* Column */}
              <div className="tm-bracket-column">
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

                {/* Trophy at the right end of the final column — tournament endpoint */}
                {isFinal ? (
                  <div className="tm-bracket-trophy">
                    <TrophyPlaceholder champion={champion} />
                  </div>
                ) : null}
              </div>

              {/* Connector arrow between consecutive main-bracket columns.
                  Omitted on the last main column — no arrow after the final.
                  aria-hidden so screen readers see only fixture content. */}
              {!isLast ? (
                <div className="tm-bracket-connector" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>

      {/* ── 3·4위전: parallel consolation section — 4강 패자 경기 ── */}
      {thirdPlaceRound !== null ? (
        <div
          style={{ marginTop: 24 }}
          aria-label="3·4위전 — 4강 패자 경기"
        >
          {/* Pill divider label */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
            }}
            aria-hidden="true"
          >
            <div style={{ flex: 1, height: 1, background: 'var(--grey200)' }} />
            <span
              className="tm-text-micro"
              style={{
                color: 'var(--text-caption)',
                whiteSpace: 'nowrap',
                padding: '2px 10px',
                border: '1px solid var(--grey200)',
                borderRadius: 99,
                background: 'var(--grey50)',
              }}
            >
              3·4위전 — 4강 패자 경기
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--grey200)' }} />
          </div>

          {/* Single column — no connectors, no trophy */}
          <div className="tm-tournament-bracket-h" style={{ maxWidth: 300 }}>
            <div className="tm-bracket-col-wrapper">
              <div className="tm-bracket-column">
                <div className="tm-bracket-column-label">
                  <span className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
                    {thirdPlaceRound.label}
                  </span>
                </div>
                <div className="tm-bracket-column-fixtures">
                  {thirdPlaceRound.fixtures.map((fixture) => (
                    <BracketFixtureCard key={fixture.id} fixture={fixture} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
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
      {/* Desktop: horizontal columns — styled via desktop/tournaments.css */}
      <DesktopBracket rounds={rounds} />
    </div>
  );
}
