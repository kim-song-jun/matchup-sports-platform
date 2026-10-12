import { AdminContextService } from '../../common/admin-context.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { BracketTemplateService } from './bracket-template.service';

describe('BracketTemplateService split-bracket lifecycle', () => {
  it('single-track replacement preserves and blocks scoped awards until the operator re-scopes them', async () => {
    const admin = { id: 'admin-1', userId: 'user-1', adminRole: 'owner', status: 'active', user: { accountStatus: 'active' } };
    const tournament = {
      id: 'tournament-1', format: 'group_knockout', kind: 'regular_tournament', sportId: 'sport-1', regionId: null,
      title: '대회', competitionConfigVersionId: 'config-1', venueId: null, venueName: null, venueAddress: null,
      latitude: null, longitude: null,
    };
    const prisma = {
      v1AdminUser: { findUnique: jest.fn().mockResolvedValue(admin) },
      v1Tournament: { findFirst: jest.fn().mockResolvedValue(tournament) },
      v1TournamentMatchDetails: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _max: { fixtureNumber: 0 } }) },
      v1TournamentGroup: { findMany: jest.fn().mockResolvedValue([
        { id: 'upper', phase: 'final', bracketTrack: 'upper' },
        { id: 'lower', phase: 'final', bracketTrack: 'lower' },
      ]) },
      v1TournamentSlot: { count: jest.fn().mockResolvedValue(4) },
      v1TournamentAward: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentAwardSet: { findMany: jest.fn().mockResolvedValue([{ bracketTrack: 'upper', prizePool: 100000 }]) },
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
    const adminContext = new AdminContextService(prisma as unknown as PrismaService);
    jest.spyOn(adminContext, 'logAdminAction').mockResolvedValue({ actionLogId: 'audit-1', statusChangeLogId: null });
    const service = new BracketTemplateService(
      prisma as unknown as PrismaService,
      adminContext,
      {} as never,
    );
    const boundary = service as unknown as { teardown: () => Promise<void>; materialize: () => Promise<void> };
    const teardown = jest.spyOn(boundary, 'teardown').mockResolvedValue(undefined);
    jest.spyOn(boundary, 'materialize').mockResolvedValue(undefined);

    await expect(service.apply({ id: 'user-1', email: 'owner@test.v1', accountStatus: 'active', onboardingStatus: 'completed' }, 'tournament-1', {
      kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1,
      thirdPlace: false, lowerBracket: false, replaceExisting: true,
    })).rejects.toMatchObject({ response: { code: 'BRACKET_TRACK_AWARDS_REQUIRE_RESCOPING' } });
    expect(prisma.v1TournamentAwardSet.findMany).toHaveBeenCalled();
    expect(prisma.v1TournamentAward.findMany).toHaveBeenCalled();
    expect(teardown).not.toHaveBeenCalled();
  });
});
