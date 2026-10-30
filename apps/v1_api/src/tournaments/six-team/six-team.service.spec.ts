import { SixTeamService } from './six-team.service';

function setup() {
  const state = {
    rounds: ['a', 'b', 'c', 's', 'f'],
    winners: {},
    bye: null,
    manual: false,
    sourceVersion: null,
    needsReview: false,
  };
  const tx = {
    $executeRaw: jest.fn(),
    v1Tournament: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ sixTeamBracket: state, status: 'in_progress' }),
      update: jest.fn(),
    },
    v1TournamentMatchDetails: {
      findMany: jest.fn().mockResolvedValue(
        state.rounds.map((id, i) => ({
          teamMatchId: id,
          homeRegistrationId: `${id}-home`,
          awayRegistrationId: `${id}-away`,
          teamMatch: {
            game: {
              currentOfficialRevision:
                i < 3
                  ? {
                      id: id + '-r',
                      state: 'OFFICIAL',
                      score: { home: 5 - i, away: 1 },
                    }
                  : null,
            },
          },
        }))
      ),
    },
    v1TournamentRegistration: {
      findMany: jest.fn().mockResolvedValue(
        state.rounds.slice(0, 3).flatMap((id) =>
          ['home', 'away'].map((side) => ({
            id: `${id}-${side}`,
            team: { name: `${id}-${side}` },
          }))
        )
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
  };
  const admins = {
    getTournamentAdmin: jest.fn().mockResolvedValue({ id: 'admin' }),
    getTournamentMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin' }),
    logAdminAction: jest.fn(),
  };
  const service = new SixTeamService(prisma as never, admins as never);
  return { tx, admins, service };
}
describe('6강 관리자 계약', () => {
  it('읽기 권한 없는 사용자는 대진을 읽지 못한다', async () => {
    const { service, admins, tx } = setup();
    admins.getTournamentAdmin.mockRejectedValue(new Error('FORBIDDEN'));
    await expect(service.preview({ id: 'user' } as never, 't')).rejects.toThrow(
      'FORBIDDEN'
    );
    expect(tx.v1Tournament.findFirst).not.toHaveBeenCalled();
  });
  it('쓰기 권한 없는 사용자는 진출 결정을 바꾸지 못한다', async () => {
    const { service, admins, tx } = setup();
    admins.getTournamentMutationAdmin.mockRejectedValue(new Error('FORBIDDEN'));
    await expect(
      service.decide({ id: 'user' } as never, 't', {} as never)
    ).rejects.toThrow('FORBIDDEN');
    expect(tx.v1Tournament.update).not.toHaveBeenCalled();
  });
  it('이전 버전의 진출 결정을 덮어쓰지 않는다', async () => {
    const { service, tx } = setup();
    await expect(
      service.decide({ id: 'user' } as never, 't', {
        version: 'stale',
        reason: '변경',
        manual: true,
        bye: 'a-home',
        winners: {},
      })
    ).rejects.toMatchObject({ response: { code: 'SIX_TEAM_STALE' } });
    expect(tx.v1Tournament.update).not.toHaveBeenCalled();
  });
  it('해당 경기 참가팀이 아닌 수동 승리팀을 거절한다', async () => {
    const { service, tx } = setup();
    const preview = await service.preview({ id: 'user' } as never, 't');
    expect(preview.automaticBye).toBe('a-home');
    await expect(
      service.decide({ id: 'user' } as never, 't', {
        version: preview.version,
        reason: '변경',
        manual: true,
        bye: 'a-home',
        winners: { a: 'b-home' },
      })
    ).rejects.toMatchObject({ response: { code: 'SIX_TEAM_WINNER_INVALID' } });
    expect(tx.v1Tournament.update).not.toHaveBeenCalled();
  });
});
