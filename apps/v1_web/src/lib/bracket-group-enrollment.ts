import type { V1AdminBracketFixture, V1AdminBracketGroup } from '@/types/api';

export const TEAM_IN_OTHER_GROUP_MESSAGE = '다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.';
export const TEAM_IN_OTHER_GROUP_HIDDEN_NOTE = '다른 조에 있는 팀은 목록에서 빠져 있어요.';

const NONE: ReadonlySet<string> = new Set();

export function registrationIdsBlockedForGroup(groups: readonly V1AdminBracketGroup[], groupId: string | null): ReadonlySet<string> {
  const target = groups.find((group) => group.id === groupId);
  if (target === undefined || target.phase !== 'group') return NONE;
  const here = new Set(target.groupTeams.map((team) => team.registrationId));
  const blocked = new Set<string>();
  for (const group of groups) {
    if (group.id === target.id || group.phase !== 'group') continue;
    for (const team of group.groupTeams) {
      if (team.registrationId !== null && !here.has(team.registrationId)) blocked.add(team.registrationId);
    }
  }
  return blocked;
}

/**
 * Applies the one-team-one-group rule to a picker's candidates (already narrowed by every other rule, e.g.
 * "placed elsewhere"), so the hidden-team note reflects only teams this rule removed. `keepId` is the side's
 * current team, which stays selectable. `alsoExclude` (e.g. `registrationIdsInOppositeFinalStage`) drops teams
 * without counting toward that note, which says "other group".
 */
export function applyGroupRule<T>(
  candidates: readonly T[],
  idOf: (item: T) => string,
  blocked: ReadonlySet<string>,
  keepId: string | null,
  alsoExclude: ReadonlySet<string> = NONE,
): { shown: T[]; hidesOtherGroupTeams: boolean } {
  const eligible = candidates.filter((item) => !alsoExclude.has(idOf(item)) || idOf(item) === keepId);
  const shown = eligible.filter((item) => !blocked.has(idOf(item)) || idOf(item) === keepId);
  return { shown, hidesOtherGroupTeams: shown.length < eligible.length };
}

const OPPOSITE_FINAL_PHASE: Readonly<Record<string, string>> = { third_place: 'final', final: 'third_place' };

/**
 * Teams already in the final when `groupId` is the 3rd-place group, and the reverse. The same team in both
 * would appear twice in the final standings and podium; the server rejects it with 409, this keeps the
 * pickers from offering it. Callers keep a side's current team selectable (see `applyGroupRule`'s `keepId`).
 */
export function registrationIdsInOppositeFinalStage(
  groups: readonly V1AdminBracketGroup[],
  fixtures: readonly V1AdminBracketFixture[],
  groupId: string | null,
): ReadonlySet<string> {
  const target = groups.find((group) => group.id === groupId);
  const oppositePhase = target === undefined ? undefined : OPPOSITE_FINAL_PHASE[target.phase];
  if (oppositePhase === undefined) return NONE;
  const oppositeIds = new Set(groups.filter((group) => group.phase === oppositePhase).map((group) => group.id));
  const taken = new Set<string>();
  for (const group of groups) {
    if (!oppositeIds.has(group.id)) continue;
    for (const team of group.groupTeams) if (team.registrationId !== null) taken.add(team.registrationId);
  }
  for (const fixture of fixtures) {
    if (fixture.groupId === null || !oppositeIds.has(fixture.groupId)) continue;
    if (fixture.homeRegistrationId !== null) taken.add(fixture.homeRegistrationId);
    if (fixture.awayRegistrationId !== null) taken.add(fixture.awayRegistrationId);
  }
  return taken;
}
