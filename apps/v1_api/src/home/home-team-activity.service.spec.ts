import { Logger } from '@nestjs/common';
import { HomeTeamActivityService } from './home-team-activity.service';

const NOW = new Date('2026-09-29T15:00:00.000Z');
const nextGame = { gameId: 'game-1', teamId: 'team-a' };

const memberships = [
  { userId: 'user-1', teamId: 'team-a', role: 'member', status: 'active' },
  { userId: 'user-1', teamId: 'team-left', role: 'member', status: 'left' },
  { userId: 'user-2', teamId: 'team-b', role: 'owner', status: 'active' },
];

function build(upcoming: { nextForMemberships: jest.Mock }) {
  const prisma = {
    v1TeamMembership: {
      findMany: jest.fn(({ where }: { where: { userId: string; status: string } }) =>
        Promise.resolve(
          memberships
            .filter((row) => row.userId === where.userId && row.status === where.status)
            .map(({ teamId, role }) => ({ teamId, role })),
        ),
      ),
    },
  };
  return { service: new HomeTeamActivityService(prisma as never, upcoming as never), prisma };
}

describe('HomeTeamActivityService.forUser', () => {
  it('내 활성 멤버십의 팀만 다음 경기 수집에 넘긴다 — 다른 사람의 팀·탈퇴한 팀은 들어가지 않는다', async () => {
    const upcoming = { nextForMemberships: jest.fn().mockResolvedValue(nextGame) };
    const { service } = build(upcoming);

    const result = await service.forUser({ id: 'user-1' } as never, NOW);

    expect(result).toEqual({ hasTeam: true, nextGame });
    expect(upcoming.nextForMemberships).toHaveBeenCalledWith('user-1', [{ teamId: 'team-a', role: 'member' }], NOW);
  });

  it('팀이 하나도 없으면 경기 수집 없이 "팀 없음"을 돌려준다 (먼저 해 볼 일 빈 상태의 근거)', async () => {
    const upcoming = { nextForMemberships: jest.fn() };
    const { service } = build(upcoming);

    expect(await service.forUser({ id: 'user-3' } as never, NOW)).toEqual({ hasTeam: false, nextGame: null });
    expect(upcoming.nextForMemberships).not.toHaveBeenCalled();
  });

  it('로그인하지 않았으면 팀 없음이다', async () => {
    const upcoming = { nextForMemberships: jest.fn() };
    const { service, prisma } = build(upcoming);

    expect(await service.forUser(null, NOW)).toEqual({ hasTeam: false, nextGame: null });
    expect(prisma.v1TeamMembership.findMany).not.toHaveBeenCalled();
  });

  it('팀은 있는데 앞으로의 경기가 없으면 팀 있음 + 다음 경기 없음이다 (빈 상태가 아니다)', async () => {
    const upcoming = { nextForMemberships: jest.fn().mockResolvedValue(null) };
    const { service } = build(upcoming);

    expect(await service.forUser({ id: 'user-1' } as never, NOW)).toEqual({ hasTeam: true, nextGame: null });
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
