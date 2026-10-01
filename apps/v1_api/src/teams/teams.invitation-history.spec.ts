/**
 * 초대 한 번 = 한 행(Task 180 W4-V8). 다시 초대해도 끝난 초대(수락·거절·취소)는 그대로 남고 새 대기 행이 생긴다.
 * 초대 표를 메모리 DB 로 들고, 대기 중 부분 unique(v1_team_invitations_pending_key)도 create 에서 똑같이 막는다.
 */
import { Prisma } from '@prisma/client';
import { TeamsService } from './teams.service';

const TEAM = 'team-1';
const DAY = 24 * 60 * 60 * 1000;

type Invitation = {
  id: string;
  teamId: string;
  invitedUserId: string;
  invitedByUserId: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  message: string | null;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type InvitationWhere = {
  teamId?: string;
  invitedUserId?: string;
  status?: Invitation['status'] | { in: Invitation['status'][] };
  updatedAt?: { gte: Date };
};

const owner = { id: 'owner', email: 'owner@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

function matches(row: Invitation, where: InvitationWhere) {
  if (where.teamId !== undefined && row.teamId !== where.teamId) return false;
  if (where.invitedUserId !== undefined && row.invitedUserId !== where.invitedUserId) return false;
  if (typeof where.status === 'string' && row.status !== where.status) return false;
  if (typeof where.status === 'object' && !where.status.in.includes(row.status)) return false;
  if (where.updatedAt && row.updatedAt < where.updatedAt.gte) return false;
  return true;
}

function setup(seed: Array<Partial<Invitation> & Pick<Invitation, 'id' | 'invitedUserId' | 'status'>>) {
  let clock = Date.now() - 3 * DAY;
  const tick = () => new Date((clock += DAY / 2));
  const memberships = [
    { teamId: TEAM, userId: 'owner', role: 'owner', status: 'active' },
    // 초대를 수락했다가 나간 사람 — 멤버십 행은 남고 status 만 left 다.
    { teamId: TEAM, userId: 'u-kim', role: 'member', status: 'left' },
  ];
  const invitations: Invitation[] = seed.map((row) => {
    const at = tick();
    return { teamId: TEAM, invitedByUserId: 'owner', message: null, respondedAt: null, createdAt: at, updatedAt: at, ...row };
  });
  let beforeCreate: (() => void) | null = null;
  const prisma = {
    v1TeamMembership: {
      findFirst: jest.fn(async ({ where }: { where: { teamId: string; userId: string; role: { in: string[] }; status: string } }) =>
        memberships.find(
          (row) => row.teamId === where.teamId && row.userId === where.userId && where.role.in.includes(row.role) && row.status === where.status,
        ) ?? null,
      ),
      findUnique: jest.fn(async ({ where }: { where: { teamId_userId: { teamId: string; userId: string } } }) =>
        memberships.find((row) => row.teamId === where.teamId_userId.teamId && row.userId === where.teamId_userId.userId) ?? null,
      ),
    },
    v1Team: {
      findFirst: jest.fn(async () => ({ id: TEAM, name: '마포 FC', status: 'active', memberCount: 1, profile: { memberGoalCount: 24 } })),
    },
    v1User: {
      findUnique: jest.fn(async ({ where }: { where: { email: string } }) => ({ id: `u-${where.email.split('@')[0]}` })),
    },
    v1TeamInvitation: {
      findFirst: jest.fn(async ({ where }: { where: InvitationWhere }) => invitations.find((row) => matches(row, where)) ?? null),
      create: jest.fn(async ({ data }: { data: Pick<Invitation, 'teamId' | 'invitedUserId' | 'invitedByUserId' | 'status' | 'message'> }) => {
        beforeCreate?.();
        const clash = invitations.some(
          (row) => row.status === 'pending' && data.status === 'pending' && row.teamId === data.teamId && row.invitedUserId === data.invitedUserId,
        );
        if (clash) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
        }
        const at = tick();
        const row: Invitation = { id: `inv-new-${invitations.length + 1}`, respondedAt: null, createdAt: at, updatedAt: at, ...data };
        invitations.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy }: { where: InvitationWhere; orderBy: Array<{ createdAt?: 'desc'; updatedAt?: 'desc' }> }) => {
        const key = orderBy[0].createdAt ? 'createdAt' : 'updatedAt';
        return invitations
          .filter((row) => matches(row, where))
          .sort((a, b) => b[key].getTime() - a[key].getTime())
          .map((row) => ({ ...row, invitedUser: { id: row.invitedUserId, profile: { nickname: row.invitedUserId, displayName: null, profileImageUrl: null } } }));
      }),
    },
  };
  const notifications = { emitNotification: jest.fn().mockResolvedValue(undefined) };
  const service = new TeamsService(prisma as never, notifications as never, {} as never);
  return {
    service,
    invitations,
    notifications,
    raceWith: (row: Pick<Invitation, 'id' | 'invitedUserId'>) => {
      beforeCreate = () => {
        beforeCreate = null;
        const at = tick();
        invitations.push({ teamId: TEAM, invitedByUserId: 'manager', status: 'pending', message: null, respondedAt: null, createdAt: at, updatedAt: at, ...row });
      };
    },
  };
}

describe('TeamsService 초대 기록 — 초대 한 번 = 한 행 (W4-V8)', () => {
  it('수락하고 나간 사람을 다시 초대하면 수락 기록은 지난 초대에 남고, 새 대기 행이 생겨 보낸 날짜도 새 날짜다', async () => {
    const ctx = setup([{ id: 'inv-kim-1', invitedUserId: 'u-kim', status: 'accepted' }]);
    const accepted = { ...ctx.invitations[0] };

    const result = await ctx.service.createInvitation(owner, TEAM, { invitedEmail: 'kim@example.com' });

    expect(result).toMatchObject({ alreadyInvited: false, status: 'pending' });
    expect(result.invitationId).not.toBe('inv-kim-1');
    expect(ctx.invitations.find((row) => row.id === 'inv-kim-1')).toEqual(accepted);
    const listed = await ctx.service.listInvitations(owner, TEAM);
    expect(listed.items.map((item) => item.invitationId)).toEqual([result.invitationId]);
    expect(listed.items[0].createdAt.getTime()).toBeGreaterThan(accepted.createdAt.getTime());
    expect(listed.pastItems.map((item) => [item.invitationId, item.status])).toEqual([['inv-kim-1', 'accepted']]);
    expect(ctx.notifications.emitNotification).toHaveBeenCalledTimes(1);
  });

  it('거절한 사람을 다시 초대하면 거절 기록과 새 초대가 둘 다 남는다 — 같은 사람이 지난 초대와 보낸 초대에 함께 보인다', async () => {
    const ctx = setup([{ id: 'inv-lee-1', invitedUserId: 'u-lee', status: 'declined' }]);

    const result = await ctx.service.createInvitation(owner, TEAM, { invitedEmail: 'lee@example.com' });

    expect(ctx.invitations.map((row) => [row.id, row.status])).toEqual([
      ['inv-lee-1', 'declined'],
      [result.invitationId, 'pending'],
    ]);
    const listed = await ctx.service.listInvitations(owner, TEAM);
    expect(listed.items.map((item) => item.invitedUserId)).toEqual(['u-lee']);
    expect(listed.pastItems.map((item) => [item.invitationId, item.status])).toEqual([['inv-lee-1', 'declined']]);
  });

  it('대기 중인 사람을 다시 초대하면 새 행을 만들지 않고 그 초대를 그대로 돌려준다(알림도 다시 보내지 않는다)', async () => {
    const ctx = setup([
      { id: 'inv-park-0', invitedUserId: 'u-park', status: 'cancelled' },
      { id: 'inv-park-1', invitedUserId: 'u-park', status: 'pending' },
    ]);

    const result = await ctx.service.createInvitation(owner, TEAM, { invitedEmail: 'park@example.com' });

    expect(result).toMatchObject({ invitationId: 'inv-park-1', alreadyInvited: true });
    expect(ctx.invitations).toHaveLength(2);
    expect(ctx.notifications.emitNotification).not.toHaveBeenCalled();
  });

  it('동시에 다시 보낸 초대가 먼저 들어가 대기 중 고유 제약(P2002)에 걸리면 이미 초대한 것으로 정리한다', async () => {
    const ctx = setup([{ id: 'inv-choi-1', invitedUserId: 'u-choi', status: 'declined' }]);
    ctx.raceWith({ id: 'inv-choi-race', invitedUserId: 'u-choi' });

    const result = await ctx.service.createInvitation(owner, TEAM, { invitedEmail: 'choi@example.com' });

    expect(result).toMatchObject({ invitationId: 'inv-choi-race', alreadyInvited: true });
    expect(ctx.invitations.filter((row) => row.status === 'pending').map((row) => row.id)).toEqual(['inv-choi-race']);
    expect(ctx.notifications.emitNotification).not.toHaveBeenCalled();
  });
});
