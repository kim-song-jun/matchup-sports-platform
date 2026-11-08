import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import type { AdminContextService } from '../../common/admin-context.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { AdminDisciplineService } from './admin-discipline.service';

jest.mock('../../league-matches/league-roster-autofill', () => ({
  fillLeagueTeamRoster: jest.fn(),
  notifyLeagueRosterFillOutcomes: jest.fn(),
}));

const PROFILE = (nickname: string) => ({ profile: { nickname, displayName: null } });
const USER = { id: 'admin-1' } as V1AuthUser;

// m1 A-B 종료(g1) · m2 C-A 예정(g2). B 팀은 남은 경기가 없다.
const MATCHES = [
  { id: 'm1', hostTeamId: 'team-A', approvedApplicantTeamId: 'team-B', startAt: new Date('2026-11-07T09:00:00Z'), game: { id: 'g1' }, tournamentDetails: null },
  { id: 'm2', hostTeamId: 'team-C', approvedApplicantTeamId: 'team-A', startAt: new Date('2026-11-14T09:00:00Z'), game: { id: 'g2' }, tournamentDetails: null },
];

interface World {
  competition: Record<string, unknown> | null;
  results: Array<{ participantId: string; userId: string; yellow: number; red: number }>;
}

function build(world: World) {
  const prisma = {
    v1Tournament: {
      findFirst: jest.fn(async () =>
        world.competition === null
          ? null
          : { title: '퀸즈컵', kind: 'regular_tournament', yellowAccumulationLimit: 2, redCardSuspensionMatches: 1, ...world.competition },
      ),
    },
    v1TeamMatch: { findMany: jest.fn(async () => MATCHES) },
    v1Team: {
      findMany: jest.fn(async () => [
        { id: 'team-A', name: '수원FC' },
        { id: 'team-B', name: '중앙FC' },
        { id: 'team-C', name: '광교FC' },
      ]),
    },
    v1Game: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({
          id,
          state: id === 'g1' ? 'ENDED' : 'SCHEDULED',
          currentOfficialRevisionId: null,
          resultRevisions: id === 'g1' ? [{ id: 'rev-g1' }] : [],
        })),
      ),
    },
    v1GameResultParticipant: {
      findMany: jest.fn(async () =>
        world.results.map((row) => ({ resultRevisionId: 'rev-g1', participantId: row.participantId, cards: { yellow: row.yellow, red: row.red } })),
      ),
    },
    v1GameParticipant: { findMany: jest.fn(async () => world.results.map((row) => ({ id: row.participantId, userId: row.userId }))) },
    v1TournamentRegistration: {
      findFirst: jest.fn(async ({ where }: { where: { teamId: string } }) => {
        const users = ({ 'team-A': ['pa', 'pb', 'pc'], 'team-B': ['pd'], 'team-C': ['pe'] } as Record<string, string[]>)[where.teamId] ?? [];
        return { id: `reg-${where.teamId}`, players: users.map((userId, index) => ({ id: `tp-${userId}-${index}`, userId, goalkeeper: false, user: PROFILE(`선수${userId}`) })) };
      }),
    },
    $queryRaw: jest.fn(async () => []),
    v1User: {
      findMany: jest.fn(async () => [{ id: 'pa', profile: { realName: '김도윤' } }]),
    },
  } as unknown as PrismaService;
  const adminContext = { getActiveAdmin: jest.fn(async () => ({ id: 'a', userId: 'admin-1', adminRole: 'support', status: 'active' })) };
  return { prisma, adminContext, service: new AdminDisciplineService(prisma, adminContext as unknown as AdminContextService) };
}

const RESULTS = [
  { participantId: 'gp-a', userId: 'pa', yellow: 0, red: 1 },
  { participantId: 'gp-b', userId: 'pb', yellow: 1, red: 0 },
  { participantId: 'gp-c', userId: 'pc', yellow: 0, red: 0 },
  { participantId: 'gp-d', userId: 'pd', yellow: 1, red: 0 },
];

describe('AdminDisciplineService.overview', () => {
  it('정지 중 → 경고 임박 → 카드만 받은 순으로 싣고, 카드 없는 선수는 싣지 않는다', async () => {
    const { service } = build({ competition: {}, results: RESULTS });
    const result = await service.overview(USER, 'cup');

    expect(result.rules).toEqual({ yellowAccumulationLimit: 2, redCardSuspensionMatches: 1 });
    expect(result.summary).toEqual({ suspended: 1, imminent: 1, withCards: 3 });
    expect(result.players.map((player) => [player.userId, player.status, player.teamName])).toEqual([
      ['pa', 'SUSPENDED', '수원FC'],
      ['pb', 'IMMINENT', '수원FC'],
      ['pd', 'CARDS', '중앙FC'],
    ]);
    expect(result.players[0]).toMatchObject({
      realName: '김도윤',
      redTotal: 1,
      remainingMatches: 1,
      nextGame: { teamMatchId: 'm2', gameId: 'g2', opponentName: '광교FC' },
    });
    expect(result.players[0].reason).toContain('퇴장 1회');
    // 실명이 없는 선수에는 키 자체가 없다.
    expect('realName' in result.players[1]).toBe(false);
  });

  it('남은 경기가 없는 팀(B)은 카드 누적만 보이고 정지·임박으로 판정하지 않는다', async () => {
    const { service } = build({ competition: { yellowAccumulationLimit: 1 }, results: RESULTS });
    const result = await service.overview(USER, 'cup');
    const pd = result.players.find((player) => player.userId === 'pd');
    expect(pd).toMatchObject({ status: 'CARDS', nextGame: null, remainingMatches: 0, reason: null, yellowTotal: 1 });
    // 같은 한도 1장 규정에서 남은 경기가 있는 A 팀의 pb 는 경고 1장이 곧 정지다.
    expect(result.players.find((player) => player.userId === 'pb')?.status).toBe('SUSPENDED');
  });

  it('규정이 둘 다 꺼진 대회는 카드가 있어도 비어 있고 rules 가 null 이다', async () => {
    const { service, prisma } = build({ competition: { yellowAccumulationLimit: null, redCardSuspensionMatches: null }, results: RESULTS });
    const result = await service.overview(USER, 'cup');
    expect(result).toMatchObject({ rules: null, players: [], summary: { suspended: 0, imminent: 0, withCards: 0 } });
    expect((prisma.v1TeamMatch.findMany as jest.Mock)).not.toHaveBeenCalled();
  });

  it('플랫폼 어드민이 아니면 거부하고 아무것도 읽지 않는다', async () => {
    const { service, adminContext, prisma } = build({ competition: {}, results: RESULTS });
    adminContext.getActiveAdmin.mockRejectedValueOnce(new ForbiddenException({ code: 'PERMISSION_DENIED' }));
    await expect(service.overview(USER, 'cup')).rejects.toBeInstanceOf(ForbiddenException);
    expect((prisma.v1Tournament.findFirst as jest.Mock)).not.toHaveBeenCalled();
  });

  it('없는 대회는 404 TOURNAMENT_NOT_FOUND', async () => {
    const { service } = build({ competition: null, results: [] });
    await expect(service.overview(USER, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
