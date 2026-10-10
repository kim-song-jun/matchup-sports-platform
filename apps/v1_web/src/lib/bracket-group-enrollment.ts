import type { V1AdminBracketGroup } from '@/types/api';

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
 * current team, which stays selectable.
 */
export function applyGroupRule<T>(
  candidates: readonly T[],
  idOf: (item: T) => string,
  blocked: ReadonlySet<string>,
  keepId: string | null,
): { shown: T[]; hidesOtherGroupTeams: boolean } {
  const shown = candidates.filter((item) => !blocked.has(idOf(item)) || idOf(item) === keepId);
  return { shown, hidesOtherGroupTeams: shown.length < candidates.length };
}
