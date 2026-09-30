import { Logger } from '@nestjs/common';
import { HomeTeamActivityService } from './home-team-activity.service';

const NOW = new Date('2026-09-29T15:00:00.000Z');
const nextGame = { gameId: 'game-1', teamId: 'team-a' };

// user-1: team-a 팀원, team-m1 매니저, team-m2 팀장, team-left 는 탈퇴. user-2 는 team-b 팀장.
const memberships = [
  { userId: 'user-1', teamId: 'team-a', role: 'member', status: 'active', name: '마포 FC' },
  { userId: 'user-1', teamId: 'team-m1', role: 'manager', status: 'active', name: '합정 유나이티드' },
  { userId: 'user-1', teamId: 'team-m2', role: 'owner', status: 'active', name: '망원 FS' },
  { userId: 'user-1', teamId: 'team-left', role: 'owner', status: 'left', name: '떠난 팀' },
  { userId: 'user-2', teamId: 'team-b', role: 'owner', status: 'active', name: '남의 팀' },
];

const joinApplications = [
  // 팀원으로만 있는 팀·탈퇴한 팀·남의 팀의 신청은 user-1 이 처리할 일이 아니다.
  { teamId: 'team-a', status: 'requested' },
  { teamId: 'team-a', status: 'requested' },
  { teamId: 'team-left', status: 'requested' },
  { teamId: 'team-b', status: 'requested' },
  { teamId: 'team-m1', status: 'requested' },
  { teamId: 'team-m1', status: 'approved' },
  { teamId: 'team-m2', status: 'requested' },
  { teamId: 'team-m2', status: 'requested' },
  { teamId: 'team-m2', status: 'requested' },
];

const invitations = [
  { invitedUserId: 'user-3', status: 'pending', createdAt: new Date('2026-09-20T00:00:00Z'), teamName: '성수 볼러즈' },
  { invitedUserId: 'user-3', status: 'pending', createdAt: new Date('2026-09-25T00:00:00Z'), teamName: '한강 FC' },
  { invitedUserId: 'user-3', status: 'declined', createdAt: new Date('2026-09-27T00:00:00Z'), teamName: '거절한 팀' },
  { invitedUserId: 'user-2', status: 'pending', createdAt: new Date('2026-09-28T00:00:00Z'), teamName: '남에게 온 초대' },
];

function build(upcoming: { nextForMemberships: jest.Mock }) {
  const prisma = {
    v1TeamMembership: {
      findMany: jest.fn(({ where }: { where: { userId: string; status: string } }) =>
        Promise.resolve(
          memberships
            .filter((row) => row.userId === where.userId && row.status === where.status)
            .map(({ teamId, role, name }) => ({ teamId, role, team: { name } })),
        ),
      ),
    },
    v1TeamInvitation: {
      findMany: jest.fn(({ where }: { where: { invitedUserId: string; status: string } }) =>
        Promise.resolve(
          invitations
            .filter((row) => row.invitedUserId === where.invitedUserId && row.status === where.status)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((row) => ({ team: { name: row.teamName } })),
        ),
      ),
    },
    v1TeamJoinApplication: {
      groupBy: jest.fn(({ where }: { where: { teamId: { in: string[] }; status: string } }) => {
        const counts = new Map<string, number>();
        for (const row of joinApplications) {
          if (!where.teamId.in.includes(row.teamId) || row.status !== where.status) continue;
          counts.set(row.teamId, (counts.get(row.teamId) ?? 0) + 1);
        }
        return Promise.resolve([...counts].map(([teamId, all]) => ({ teamId, _count: { _all: all } })));
      }),
    },
  };
  return { service: new HomeTeamActivityService(prisma as never, upcoming as never), prisma };
}

describe('HomeTeamActivityService.forUser', () => {
  it('내 활성 멤버십의 팀만 다음 경기 수집에 넘긴다 — 다른 사람의 팀·탈퇴한 팀은 들어가지 않는다', async () => {
    const upcoming = { nextForMemberships: jest.fn().mockResolvedValue(nextGame) };
    const { service } = build(upcoming);

    const result = await service.forUser({ id: 'user-1' } as never, NOW);

    expect(result).toMatchObject({ hasTeam: true, nextGame });
    const [userId, passed, at] = upcoming.nextForMemberships.mock.calls[0];
    expect([userId, passed.map((row: { teamId: string }) => row.teamId), at]).toEqual(['user-1', ['team-a', 'team-m1', 'team-m2'], NOW]);
  });

  it('가입 신청은 내가 팀장·매니저인 팀의 대기 건만 세고, 링크는 가장 많이 쌓인 팀으로 간다', async () => {
    const { service } = build({ nextForMemberships: jest.fn().mockResolvedValue(null) });

    const result = await service.forUser({ id: 'user-1' } as never, NOW);

    // 팀은 있고 잡힌 경기가 없으면 "팀 있음 + 다음 경기 없음"이다(빈 상태가 아니다).
    expect(result).toMatchObject({ hasTeam: true, nextGame: null });
    expect(result?.pendingJoinRequests).toEqual({ count: 4, teamId: 'team-m2', teamName: '망원 FS', otherTeamCount: 1 });
  });

  it('운영하는 팀이 없으면(팀원으로만 있는 팀에 신청이 쌓여 있어도) 가입 신청은 없다', async () => {
    const { service } = build({ nextForMemberships: jest.fn().mockResolvedValue(null) });

    // user-2 는 team-b 팀장이다 — team-b 대기 1건은 보이고, user-1 의 팀 신청은 섞이지 않는다.
    expect((await service.forUser({ id: 'user-2' } as never, NOW))?.pendingJoinRequests).toEqual({
      count: 1,
      teamId: 'team-b',
      teamName: '남의 팀',
      otherTeamCount: 0,
    });
    expect((await service.forUser({ id: 'user-3' } as never, NOW))?.pendingJoinRequests).toBeNull();
  });

  it('팀이 없는 사람도 받은 대기 초대는 보인다 — 거절한 초대·남에게 온 초대는 세지 않는다', async () => {
    const upcoming = { nextForMemberships: jest.fn() };
    const { service } = build(upcoming);

    expect(await service.forUser({ id: 'user-3' } as never, NOW)).toEqual({
      hasTeam: false,
      nextGame: null,
      pendingInvitations: { count: 2, latestTeamName: '한강 FC' },
      pendingJoinRequests: null,
    });
    expect(upcoming.nextForMemberships).not.toHaveBeenCalled();
  });

  it('로그인하지 않았으면 팀·초대·신청이 모두 없다', async () => {
    const upcoming = { nextForMemberships: jest.fn() };
    const { service, prisma } = build(upcoming);

    expect(await service.forUser(null, NOW)).toEqual({
      hasTeam: false,
      nextGame: null,
      pendingInvitations: null,
      pendingJoinRequests: null,
    });
    expect(prisma.v1TeamMembership.findMany).not.toHaveBeenCalled();
  });

  it('수집이 실패하면 홈을 죽이지 않고 로그를 남긴 뒤 null(계산 못 함)을 돌려준다', async () => {
    const upcoming = { nextForMemberships: jest.fn().mockRejectedValue(new Error('boom')) };
    const { service } = build(upcoming);
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    try {
      expect(await service.forUser({ id: 'user-1' } as never, NOW)).toBeNull();
      expect(logged).toHaveBeenCalledTimes(1);
    } finally {
      logged.mockRestore();
    }
  });
});
