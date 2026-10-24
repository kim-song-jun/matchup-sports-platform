import type { PrismaService } from '../../prisma/prisma.service';
import type { GamesService } from '../games.service';
import type { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { GameRosterService } from './game-roster.service';
import { TeamGameRosterService } from './team-game-roster.service';
import * as sync from './game-roster-sync';

describe('종료 경기 batch — 서버 권한과 잠금 후 상태 검증', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each([
    ['owner', 'active', null, 'active', 'ENDED', true],
    ['ops', 'active', null, 'active', 'ENDED', true],
    ['support', 'active', null, 'active', 'ENDED', false],
    ['ops', 'inactive', null, 'active', 'ENDED', false],
    ['ops', 'active', new Date(), 'active', 'ENDED', false],
    ['ops', 'active', null, 'blocked', 'ENDED', false],
    [null, 'active', null, 'active', 'ENDED', false],
    ['ops', 'active', null, 'active', 'LIVE', false],
    ['ops', 'active', null, 'active', 'PAUSED', false],
    ['ops', 'active', null, 'active', 'CANCELLED', false],
  ])('admin=%s status=%s revoked=%s account=%s game=%s -> %s', async (adminRole, status, revokedAt, accountStatus, state, allowed) => {
    jest.spyOn(sync, 'lockRosterWriteScope').mockResolvedValue();
    const tx = {
      v1Team: { findFirst: async () => ({ id: 'team' }) },
      v1GameSide: { findMany: async () => [{ id: 'side', gameId: 'game' }] },
      v1AdminUser: { findUnique: async () => adminRole === null ? null : ({ adminRole, status, revokedAt, user: { accountStatus } }) },
      v1Game: { findMany: async () => [{ id: 'game', state }] },
    };
    const prisma = { $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } as unknown as PrismaService;
    const roster = new GameRosterService(prisma, {} as GamesService);
    // The caller may also be a team manager; this must never bypass the admin check for ended games.
    jest.spyOn(roster, 'authorizeSide').mockResolvedValue({ teamId: 'team', viewerRole: 'TEAM_MANAGER', writeRole: 'TEAM_MANAGER' });
    jest.spyOn(roster, 'applyExclude').mockResolvedValue({ alreadyApplied: true, adjustment: {} as never });
    const service = new TeamGameRosterService(prisma, roster, {} as TournamentStaffAccessService);
    const result = service.applyBatch({ id: 'user' } as never, 'team', { changes: [{ gameId: 'game', userId: 'player', op: 'EXCLUDE' }] });
    if (allowed) await expect(result).resolves.toMatchObject({ results: [{ op: 'EXCLUDE', alreadyApplied: true }] });
    else {
      await expect(result).rejects.toMatchObject({ response: { code: 'LINEUP_DEADLINE_PASSED', details: { gameIds: ['game'] } } });
      expect(roster.applyExclude).not.toHaveBeenCalled();
    }
  });
});
