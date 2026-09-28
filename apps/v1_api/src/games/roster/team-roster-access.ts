import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export interface TeamRosterAccess {
  readonly viewerRole: 'TEAM_MANAGER' | 'TEAM_MEMBER' | 'ADMIN';
  /** 결장 기간·조정 기록에 남는 역할. null 이면 읽기만 한다. */
  readonly writeRole: 'TEAM_MANAGER' | 'ADMIN' | null;
}

/**
 * 팀 단위 명단 화면(선수 × 경기 표, 결장 기간)의 권한. 대회 스태프는 대회에 묶인 권한이라
 * 팀 단위로는 열지 않는다 — 스태프는 어드민 참가 신청 경로와 경기 단위 API 를 쓴다.
 */
export function decideTeamRosterAccess(input: {
  membershipRole: 'owner' | 'manager' | 'member' | null;
  adminRole: 'owner' | 'ops' | 'support' | null;
}): TeamRosterAccess | null {
  if (input.membershipRole === 'owner' || input.membershipRole === 'manager') {
    return { viewerRole: 'TEAM_MANAGER', writeRole: 'TEAM_MANAGER' };
  }
  if (input.adminRole !== null) {
    return { viewerRole: 'ADMIN', writeRole: input.adminRole === 'support' ? null : 'ADMIN' };
  }
  if (input.membershipRole === 'member') return { viewerRole: 'TEAM_MEMBER', writeRole: null };
  return null;
}

/** 팀이 없으면 404 `TEAM_NOT_FOUND`, 권한이 없으면 null(호출자가 403 을 준다). */
export async function resolveTeamRosterAccess(tx: Tx, teamId: string, userId: string): Promise<TeamRosterAccess | null> {
  const team = await tx.v1Team.findFirst({ where: { id: teamId, deletedAt: null }, select: { id: true } });
  if (team === null) throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: '팀을 찾을 수 없어요.' });
  const [membership, admin] = await Promise.all([
    tx.v1TeamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { role: true, status: true },
    }),
    tx.v1AdminUser.findUnique({
      where: { userId },
      select: { adminRole: true, status: true, revokedAt: true, user: { select: { accountStatus: true } } },
    }),
  ]);
  const activeAdmin =
    admin !== null && admin.status === 'active' && admin.revokedAt === null && admin.user.accountStatus === 'active';
  return decideTeamRosterAccess({
    membershipRole: membership?.status === 'active' ? membership.role : null,
    adminRole: activeAdmin ? admin.adminRole : null,
  });
}
