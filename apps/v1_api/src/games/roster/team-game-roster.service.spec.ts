import type { PrismaService } from '../../prisma/prisma.service';
import type { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import type { GameRosterService } from './game-roster.service';
import { TeamGameRosterService } from './team-game-roster.service';
import { loadTeamRosterColumns } from './team-roster-columns';

jest.mock('./team-roster-columns', () => ({ loadTeamRosterColumns: jest.fn() }));

const USER = { id: 'viewer', email: 'viewer@example.test', accountStatus: 'active', onboardingStatus: 'completed' } as const;
const entry = (userId: string, accountLinked = true) => ({
  userId,
  accountLinked,
  displayNameSnapshot: `닉-${userId}`,
  jerseyNumber: null,
  sourceParticipantId: `p-${userId}`,
});

// 어드민 참가 신청 화면의 출전 표. 선수 실명은 대회 운영진(owner·ops 어드민, 디렉터·현장 운영자 스태프)만 받는다.
function build(viewer: { adminRole?: 'owner' | 'ops' | 'support'; staffRole?: string }) {
  jest.mocked(loadTeamRosterColumns).mockResolvedValue([
    {
      game: {
        gameId: 'g1', sideId: 's1', teamMatchId: 'tm1', competitionId: 'cup', competitionKind: 'TOURNAMENT',
        competitionTitle: '컵', opponentName: '상대', scheduledAt: null, gameState: 'SCHEDULED',
      },
      loaded: {
        context: {}, baseSource: 'REGISTRATION', base: [entry('u1'), entry('guest', false)],
        computation: { participants: [], excluded: [], unavailable: [], suspended: [] },
      },
    },
  ] as never);
  const tx = {
    v1TournamentRegistration: { findFirst: jest.fn(async () => ({ teamId: 'team-1' })) },
    v1User: { findMany: jest.fn(async () => [{ id: 'u1', profile: { realName: '김실명' } }]) },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
    v1AdminUser: {
      findUnique: jest.fn(async () =>
        viewer.adminRole === undefined
          ? null
          : { adminRole: viewer.adminRole, status: 'active', revokedAt: null, user: { accountStatus: 'active' } },
      ),
    },
  };
  const staffAccess = { assertAccess: jest.fn(async () => ({ role: viewer.staffRole })) };
  const service = new TeamGameRosterService(
    prisma as unknown as PrismaService,
    {} as GameRosterService,
    staffAccess as unknown as TournamentStaffAccessService,
  );
  return { service, tx };
}

describe('TeamGameRosterService.getRegistrationMatrix — 운영진 실명', () => {
  it.each([
    ['owner 어드민', { adminRole: 'owner' as const }],
    ['ops 어드민', { adminRole: 'ops' as const }],
    ['대회 디렉터 스태프', { staffRole: 'tournament_director' }],
    ['현장 운영자 스태프', { staffRole: 'field_operator' }],
  ])('%s 에게는 계정 선수의 실명을 싣는다', async (_, viewer) => {
    const { service, tx } = build(viewer);

    const matrix = await service.getRegistrationMatrix(USER, 'cup', 'reg-1');

    expect(matrix.players.find((player) => player.userId === 'u1')).toMatchObject({ displayName: '닉-u1', realName: '김실명' });
    expect(matrix.players.find((player) => player.userId === 'guest')).not.toHaveProperty('realName');
    // 계정 없는 행은 조회하지 않는다.
    expect(tx.v1User.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['u1'] }, deletedAt: null } }));
  });

  it.each([
    ['support 어드민', { adminRole: 'support' as const }],
    ['조회 전용 스태프', { staffRole: 'support_readonly' }],
  ])('%s 에게는 realName 키가 없고 계정도 조회하지 않는다', async (_, viewer) => {
    const { service, tx } = build(viewer);

    const matrix = await service.getRegistrationMatrix(USER, 'cup', 'reg-1');

    for (const player of matrix.players) expect(player).not.toHaveProperty('realName');
    expect(tx.v1User.findMany).not.toHaveBeenCalled();
  });
});
