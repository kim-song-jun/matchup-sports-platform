import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { GamesService } from '../games.service';
import { loadGameRoster } from './game-roster-loader';
import { isUnmigratedTeamAuthoredLineup } from './game-roster-sync';
import { GameRosterService } from './game-roster.service';

jest.mock('./game-roster-loader', () => ({ loadGameRoster: jest.fn() }));
jest.mock('./game-roster-sync', () => ({ isUnmigratedTeamAuthoredLineup: jest.fn() }));
const actor = { userId: 'manager', role: 'TEAM_MANAGER' as const };
const target = { gameId: 'game', sideId: 'side', teamId: 'team' };
function setup(isLeague = false) {
  const roles = new Map<string, boolean>();
  const loaded = { context: { ...target, isLeague, competitionId: 'league', tournamentId: null, teamMatchId: 'match' }, base: [{ userId: 'a' }, { userId: 'b' }] };
  jest.mocked(loadGameRoster).mockResolvedValue(loaded as unknown as Awaited<ReturnType<typeof loadGameRoster>>);
  jest.mocked(isUnmigratedTeamAuthoredLineup).mockResolvedValue(false);
  const tx = {
    v1GameLineup: { findFirst: jest.fn(async () => ({ id: 'lineup' })) },
    v1GameRosterRole: {
      findUnique: jest.fn(async ({ where }: { where: { gameId_sideId_teamId_userId: { userId: string } } }) => {
        const userId = where.gameId_sideId_teamId_userId.userId;
        return roles.has(userId) ? { goalkeeper: roles.get(userId) } : null;
      }),
      upsert: jest.fn(async ({ create }: { create: { userId: string; goalkeeper: boolean } }) => { roles.set(create.userId, create.goalkeeper); }),
    },
    v1OperationAudit: { create: jest.fn(async () => ({ id: 'audit' })) },
  };
  const service = new GameRosterService({} as PrismaService, {} as GamesService);
  const change = (userId: string, goalkeeper: boolean) => service.applyGoalkeeper(tx as unknown as Prisma.TransactionClient, actor, target, userId, goalkeeper);
  return { change, roles, tx, loaded };
}
describe('경기 명단 GK 지정 쓰기', () => {
  it('복수 지정·개별 해제와 멱등 저장을 지원하며 실제 변경만 감사에 남긴다', async () => {
    const { change, roles, tx } = setup();
    await change('a', true); await change('b', true);
    expect([...roles]).toEqual([['a', true], ['b', true]]);
    expect(await change('a', true)).toEqual({ alreadyApplied: true });
    expect(tx.v1OperationAudit.create).toHaveBeenCalledTimes(2);
    await change('a', false);
    expect([...roles]).toEqual([['a', false], ['b', true]]);
    expect(tx.v1OperationAudit.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({
      actorUserId: 'manager', action: 'GAME_ROSTER_GOALKEEPER_CHANGED', tournamentId: 'league', teamMatchId: null,
      before: { userId: 'a', goalkeeper: true }, after: { userId: 'a', goalkeeper: false, role: 'TEAM_MANAGER' },
    }) }));
  });
  it('명단 밖 선수와 인가 후 팀 변경은 역할을 저장하지 않는다', async () => {
    const { change, tx, loaded } = setup();
    await expect(change('outsider', true)).rejects.toMatchObject({ response: { code: 'ROSTER_ADJUSTMENT_NOT_IN_ROSTER' } });
    loaded.context.teamId = 'changed-team';
    await expect(change('a', true)).rejects.toMatchObject({ response: { code: 'COMMAND_CONCURRENCY_CONFLICT' } });
    expect(tx.v1GameRosterRole.upsert).not.toHaveBeenCalled();
  });
  it('기록 명단과 연결되지 않은 옛 리그 명단은 성공 처리하지 않는다', async () => {
    const { change, tx } = setup(true);
    jest.mocked(isUnmigratedTeamAuthoredLineup).mockResolvedValue(true);
    await expect(change('a', true)).rejects.toMatchObject({ response: { code: 'ROSTER_GOALKEEPER_MIGRATION_REQUIRED' } });
    expect(tx.v1GameRosterRole.upsert).not.toHaveBeenCalled();
  });
});
