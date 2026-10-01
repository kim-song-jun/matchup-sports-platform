import { teamRoleLabel } from '@/lib/v1-status-labels';
import type { V1AdminUserDetail } from '@/types/api';

export type AdminUserTeam = {
  teamId: string;
  name: string;
  status: string;
  memberCount: number;
  /** 팀 내 역할 라벨(팀장·매니저·멤버) */
  roleLabel: string | null;
};

/**
 * 서버는 소유 팀(`V1Team.ownerUserId`)과 활성 소속 팀을 별도 배열로 주고, 소유 팀은 5건에서 잘려 있다.
 * 소유자는 소속 팀의 role=owner(팀장)와 같은 개념이라 별도 "소유자" 표시 없이 역할 라벨 하나로 합친다.
 * 활성 멤버십이 없는 소유 팀(보관 팀 등)만 소유 팀 배열에서 보충하므로 잘림은 그 경우에만 영향이 있다.
 */
export function mergeUserTeams(
  ownedTeams: V1AdminUserDetail['ownedTeams'],
  memberships: NonNullable<V1AdminUserDetail['teamMemberships']>,
): AdminUserTeam[] {
  const merged: AdminUserTeam[] = memberships.map((membership) => ({
    teamId: membership.teamId,
    name: membership.name,
    status: membership.status,
    memberCount: membership.memberCount,
    roleLabel: teamRoleLabel(membership.role),
  }));
  const memberTeamIds = new Set(memberships.map((membership) => membership.teamId));
  for (const team of ownedTeams) {
    if (memberTeamIds.has(team.teamId)) continue;
    merged.push({ teamId: team.teamId, name: team.name, status: team.status, memberCount: team.memberCount, roleLabel: teamRoleLabel('owner') });
  }
  return merged;
}
