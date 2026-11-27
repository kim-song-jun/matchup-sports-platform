import { bracketExistingSource, isFixtureLinkable } from '@/lib/bracket-fixture-tools';
import type { SideKey } from '@/lib/bracket-canvas-layout';
import type { V1AdminBracketFixture, V1AdminBracketGroup } from '@/types/api';

/** 대상 경기가 3·4위전이면 진 팀(LOSER)이 가는 자리, 아니면 이긴 팀(WINNER)이 가는 자리다. */
export type LinkOutcome = 'WINNER' | 'LOSER';

export interface WinnerTargetOption {
  /** `${대상 경기 id}:${HOME|AWAY}` */
  value: string;
  label: string;
}

const SIDE_LABEL: Record<SideKey, string> = { HOME: '홈 자리', AWAY: '원정 자리' };

function parseValue(value: string): { fixtureId: string; side: SideKey } | null {
  const at = value.lastIndexOf(':');
  if (at <= 0) return null;
  const side = value.slice(at + 1);
  return side === 'HOME' || side === 'AWAY' ? { fixtureId: value.slice(0, at), side } : null;
}

function currentLink(source: V1AdminBracketFixture, outcome: LinkOutcome, fixtures: readonly V1AdminBracketFixture[]) {
  for (const target of fixtures) {
    const link = target.bracketSources?.find(candidate => candidate.fixtureId === source.id && candidate.outcome === outcome);
    if (link !== undefined) return { target, side: link.side };
  }
  return null;
}

function sourceIdOf(target: V1AdminBracketFixture, side: SideKey): string | null {
  return target.bracketSources?.find(candidate => candidate.side === side)?.fixtureId ?? null;
}

export function winnerTargetOptions(input: {
  source: V1AdminBracketFixture;
  outcome: LinkOutcome;
  groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[];
  titleOf: (fixture: V1AdminBracketFixture) => string;
}): { options: WinnerTargetOption[]; current: string } {
  const { source, outcome, groups, fixtures, titleOf } = input;
  const phaseOf = new Map(groups.map(group => [group.id, group.phase]));
  const current = currentLink(source, outcome, fixtures);
  const currentValue = current === null ? '' : `${current.target.id}:${current.side}`;
  const options: WinnerTargetOption[] = [];
  for (const target of fixtures) {
    if (target.id === source.id) continue;
    const targetOutcome: LinkOutcome = phaseOf.get(target.groupId ?? '') === 'third_place' ? 'LOSER' : 'WINNER';
    if (targetOutcome !== outcome) continue;
    // 새로 고를 수 있는 건 옮길 수 있는 경기끼리뿐이고, 이미 이어진 자리는 그 경기가 시작된 뒤에도 보여 준다.
    const eligible = isFixtureLinkable(source) && isFixtureLinkable(target)
      && bracketExistingSource({ target, sourceFixtureId: source.id, groups, fixtures }) !== null;
    for (const side of ['HOME', 'AWAY'] as const) {
      const value = `${target.id}:${side}`;
      const takenByOther = target.bracketSources?.some(link => link.side === side && link.fixtureId !== source.id) ?? false;
      if (value !== currentValue && (!eligible || takenByOther)) continue;
      options.push({ value, label: `${titleOf(target)} · ${SIDE_LABEL[side]}` });
    }
  }
  return { options, current: currentValue };
}

export function planWinnerTargetLink(input: {
  source: V1AdminBracketFixture;
  outcome: LinkOutcome;
  fixtures: readonly V1AdminBracketFixture[];
  nextValue: string;
}): Array<{ fixtureId: string; homeSourceFixtureId: string | null; awaySourceFixtureId: string | null }> {
  const { source, outcome, fixtures, nextValue } = input;
  const current = currentLink(source, outcome, fixtures);
  const next = parseValue(nextValue);
  const nextTarget = next === null ? undefined : fixtures.find(fixture => fixture.id === next.fixtureId);
  if (next !== null && nextTarget === undefined) return [];
  if (current === null && next === null) return [];
  if (current !== null && next !== null && current.target.id === next.fixtureId && current.side === next.side) return [];

  const sourcesOf = (target: V1AdminBracketFixture) => ({ HOME: sourceIdOf(target, 'HOME'), AWAY: sourceIdOf(target, 'AWAY') });
  const patch = (target: V1AdminBracketFixture, edits: Partial<Record<SideKey, string | null>>) => {
    const merged = { ...sourcesOf(target), ...edits };
    return { fixtureId: target.id, homeSourceFixtureId: merged.HOME, awaySourceFixtureId: merged.AWAY };
  };

  if (current !== null && next !== null && nextTarget !== undefined && current.target.id === nextTarget.id) {
    return [patch(nextTarget, { [current.side]: null, [next.side]: source.id })];
  }
  return [
    ...(current === null ? [] : [patch(current.target, { [current.side]: null })]),
    ...(next === null || nextTarget === undefined ? [] : [patch(nextTarget, { [next.side]: source.id })]),
  ];
}
