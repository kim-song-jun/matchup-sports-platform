import { BRACKET_SOURCE_PHASES } from '@/lib/tournament-bracket-rounds';
import { isKnockoutPhase, tournamentRoundLabel } from '@/lib/tournament-round-label';
import { effectiveBracketTrack } from '@/lib/bracket-track';
import type { V1AdminBracketFixture, V1AdminBracketGroup } from '@/types/api';

export function knockoutRoundLabel(phase: string): string | null {
  return isKnockoutPhase(phase) ? tournamentRoundLabel(phase) : null;
}

/** 연결 API가 허용하는 경기 상태를 응답에 노출된 필드로 판정한다. DRAFT 리비전 자체는 잠금 조건이 아니다. */
export function isFixtureLinkable(fixture: V1AdminBracketFixture): boolean {
  return fixture.game !== null && fixture.status === 'scheduled' && fixture.result === null &&
    fixture.legNumber === 1 && !fixture.parentFixtureId && fixture.game.state === 'SCHEDULED' &&
    !fixture.game.hasOfficialResult;
}

export function bracketSourceCandidates(input: {
  target: V1AdminBracketFixture;
  groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[];
}): V1AdminBracketFixture[] {
  const { target, groups, fixtures } = input;
  const phaseByGroup = new Map(groups.map((group) => [group.id, group.phase]));
  const targetPhase = phaseByGroup.get(target.groupId ?? '') ?? '';
  const trackByGroup = new Map(groups.map((group) => [group.id, effectiveBracketTrack(group.bracketTrack)]));
  const targetTrack = trackByGroup.get(target.groupId ?? '') ?? 'overall';
  const previousPhases = BRACKET_SOURCE_PHASES[targetPhase];
  if (previousPhases === undefined) return [];
  const sourceOutcome = targetPhase === 'third_place' ? 'LOSER' : 'WINNER';
  return fixtures.filter(
    (fixture) =>
      previousPhases.includes(phaseByGroup.get(fixture.groupId ?? '') ?? '') &&
      (trackByGroup.get(fixture.groupId ?? '') ?? 'overall') === targetTrack &&
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

/** Keep a structurally valid current predecessor visible after it stops being eligible for a new link. */
export function bracketExistingSource(input: {
  target: V1AdminBracketFixture;
  sourceFixtureId: string;
  groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[];
}): V1AdminBracketFixture | null {
  const { target, sourceFixtureId, groups, fixtures } = input;
  const phaseByGroup = new Map(groups.map((group) => [group.id, group.phase]));
  const targetPhase = phaseByGroup.get(target.groupId ?? '') ?? '';
  const previousPhases = BRACKET_SOURCE_PHASES[targetPhase];
  if (previousPhases === undefined) return null;

  const trackByGroup = new Map(groups.map((group) => [group.id, effectiveBracketTrack(group.bracketTrack)]));
  const targetTrack = trackByGroup.get(target.groupId ?? '') ?? 'overall';
  const source = fixtures.find((fixture) => fixture.id === sourceFixtureId);
  if (source === undefined) return null;
  if (!previousPhases.includes(phaseByGroup.get(source.groupId ?? '') ?? '')) return null;
  if ((trackByGroup.get(source.groupId ?? '') ?? 'overall') !== targetTrack) return null;
  if (source.legNumber !== 1 || source.parentFixtureId) return null;
  return source;
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
