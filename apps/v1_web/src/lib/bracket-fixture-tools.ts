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
  return fixtures.filter(
    (fixture) =>
      previousPhases.includes(phaseByGroup.get(fixture.groupId ?? '') ?? '') &&
      fixture.legNumber === 1 &&
      !fixture.parentFixtureId &&
      fixture.status === 'scheduled' &&
      fixture.result === null &&
      isFixtureLinkable(fixture),
  );
}
