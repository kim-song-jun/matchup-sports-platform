import { isFixtureLocked } from '@/lib/bracket-canvas-layout';
import { BRACKET_SOURCE_PHASES } from '@/lib/tournament-bracket-rounds';
import { isKnockoutPhase, tournamentRoundLabel } from '@/lib/tournament-round-label';
import type { V1AdminBracketFixture, V1AdminBracketGroup } from '@/types/api';

export function knockoutRoundLabel(phase: string): string | null {
  return isKnockoutPhase(phase) ? tournamentRoundLabel(phase) : null;
}

/** 서버 `updateBracketSources` 와 같은 기준 — 게임이 있고 예정 상태이며 기록이 없는 경기만 연결할 수 있다. */
export function isFixtureLinkable(fixture: V1AdminBracketFixture): boolean {
  return fixture.game !== null && !isFixtureLocked(fixture);
}

export function bracketSourceCandidates(input: {
  target: V1AdminBracketFixture;
  groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[];
}): V1AdminBracketFixture[] {
  const { target, groups, fixtures } = input;
  const phaseByGroup = new Map(groups.map((group) => [group.id, group.phase]));
  const targetPhase = phaseByGroup.get(target.groupId ?? '') ?? '';
  const previousPhases = BRACKET_SOURCE_PHASES[targetPhase];
  if (previousPhases === undefined) return [];
  const sourceOutcome = targetPhase === 'third_place' ? 'LOSER' : 'WINNER';
  return fixtures.filter(
    (fixture) =>
      previousPhases.includes(phaseByGroup.get(fixture.groupId ?? '') ?? '') &&
      fixture.legNumber === 1 &&
      !fixture.parentFixtureId &&
      fixture.status === 'scheduled' &&
      fixture.result === null &&
      isFixtureLinkable(fixture) &&
      !fixtures.some((otherTarget) =>
        otherTarget.id !== target.id &&
        otherTarget.bracketSources?.some((source) => source.fixtureId === fixture.id && source.outcome === sourceOutcome),
      ),
  );
}

/** Keep each source picker distinct while retaining an existing link that is no longer otherwise eligible. */
export function bracketSourceSideOptions(input: {
  candidates: readonly V1AdminBracketFixture[];
  fixtures: readonly V1AdminBracketFixture[];
  currentFixtureId: string;
  oppositeFixtureId: string;
}): V1AdminBracketFixture[] {
  const options = input.candidates.filter((fixture) => fixture.id !== input.oppositeFixtureId);
  if (input.currentFixtureId === '' || input.currentFixtureId === input.oppositeFixtureId || options.some((fixture) => fixture.id === input.currentFixtureId)) {
    return options;
  }
  const current = input.fixtures.find((fixture) => fixture.id === input.currentFixtureId);
  return current === undefined ? options : [current, ...options];
}
