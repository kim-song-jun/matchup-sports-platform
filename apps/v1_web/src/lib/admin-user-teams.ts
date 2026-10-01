import { teamRoleLabel } from '@/lib/v1-status-labels';
import type { V1AdminUserDetail } from '@/types/api';

export type AdminUserTeam = {
  teamId: string;
  name: string;
  status: string;
  memberCount: number;
  /** "소유자"(생성/소유 팀) 다음에 팀 내 역할(팀장·매니저·멤버) 순서 */
  roleTags: string[];
};

/**
 * 서버는 소유 팀·소속 팀을 별도 배열로 주고 같은 팀이 양쪽에 모두 나온다 —
 * teamId 로 합쳐 팀 한 줄에 역할 태그를 모은다. 소유 팀 응답은 5건에서 잘려 있으므로
 * 소속 팀 배열이 있는 팀은 그 값을 기준으로 삼는다.
 */
export function mergeUserTeams(
  ownedTeams: V1AdminUserDetail['ownedTeams'],
  memberships: NonNullable<V1AdminUserDetail['teamMemberships']>,
): AdminUserTeam[] {
  const ownedIds = new Set(ownedTeams.map((team) => team.teamId));
  const merged: AdminUserTeam[] = memberships.map((membership) => {
    const role = teamRoleLabel(membership.role);
    return {
      teamId: membership.teamId,
      name: membership.name,
      status: membership.status,
      memberCount: membership.memberCount,
      roleTags: [...(ownedIds.has(membership.teamId) ? ['소유자'] : []), ...(role ? [role] : [])],
    };
  });
  const memberTeamIds = new Set(memberships.map((membership) => membership.teamId));
  for (const team of ownedTeams) {
    if (memberTeamIds.has(team.teamId)) continue;
    merged.push({ teamId: team.teamId, name: team.name, status: team.status, memberCount: team.memberCount, roleTags: ['소유자'] });
  }
  return merged;
}
