import type { AdminContextService } from '../../common/admin-context.service';
import type { GamesService } from '../../games/games.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BracketTemplateService } from '../templates/bracket-template.service';
import { MultiFinalsService } from './multi-finals.service';

describe('N개 결선 미리보기 경기 번호', () => {
  it('미완료 예선과 동률은 참가팀을 추측하지 않고 규칙 수만큼 미정 대진을 반환한다', async () => {
    const tx = {
      v1Tournament: { findFirst: jest.fn().mockResolvedValue({
        id: 'tournament', kind: 'regular_tournament', format: 'league_knockouts', multiFinalsRevision: 1,
        multiFinals: { groups: [{ id: 'preliminary', name: '예선', capacity: 4, legs: 1 }],
          finals: [{ name: '챔피언', rules: [1, 2, 3, 4].map(rank => ({ groupId: 'preliminary', rank })), thirdPlace: true, registrationIds: null }] },
      }) },
      v1TournamentRegistration: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentGroupTeam: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentStanding: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentGroup: { count: jest.fn().mockResolvedValue(0) },
      v1TournamentMatchDetails: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _max: { fixtureNumber: 6 } }) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const admins = { getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin' }) };
    const service = new MultiFinalsService(prisma as unknown as PrismaService, admins as unknown as AdminContextService,
      {} as GamesService, {} as BracketTemplateService);
    const result = await service.preview({ id: 'admin', email: 'admin@example.test', accountStatus: 'active', onboardingStatus: 'completed' }, 'tournament');
    expect(result.finals[0].registrationIds).toBeNull();
    expect(result.counts).toEqual({ tournaments: 1, fixtures: 4, byes: 0 });
    expect(result.plan.slots).toHaveLength(4);
    expect(result.plan.fixtures.map(row => row.fixtureNumber)).toEqual([7, 8, 9, 10]);
  });
  it.each([12, null])('예선 최대 번호 %s 다음부터 결선과 승자 연결을 미리 보여준다', async maximum => {
    const registrationIds = ['r1', 'r2', 'r3', 'r4'];
    const tx = {
      v1Tournament: { findFirst: jest.fn().mockResolvedValue({
        id: 'tournament', kind: 'regular_tournament', format: 'league_knockouts', multiFinalsRevision: 2,
        multiFinals: { groups: [{ id: 'preliminary', name: '예선', capacity: 4, legs: 1 }],
          finals: [{ name: '챔피언', rules: [], thirdPlace: false, registrationIds }] },
      }) },
      v1TournamentRegistration: { findMany: jest.fn().mockResolvedValue(registrationIds.map(id => ({ id, team: { id, name: id } }))) },
      v1TournamentGroupTeam: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentStanding: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentGroup: { count: jest.fn().mockResolvedValue(0) },
      v1TournamentMatchDetails: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _max: { fixtureNumber: maximum } }) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const admins = { getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin' }) };
    const service = new MultiFinalsService(prisma as unknown as PrismaService, admins as unknown as AdminContextService,
      {} as GamesService, {} as BracketTemplateService);
    const result = await service.preview({ id: 'admin', email: 'admin@example.test', accountStatus: 'active', onboardingStatus: 'completed' }, 'tournament');
    const offset = maximum ?? 0;
    expect(result.plan.fixtures.map(f => f.fixtureNumber)).toEqual([offset + 1, offset + 2, offset + 3]);
    expect(result.plan.edges.map(edge => result.plan.fixtures.find(f => f.key === edge.sourceFixtureKey)?.fixtureNumber)).toEqual([offset + 1, offset + 2]);
    expect(tx.v1TournamentMatchDetails.aggregate).toHaveBeenCalledWith({
      where: { tournamentId: 'tournament', group: { phase: 'group' }, teamMatch: { deletedAt: null } }, _max: { fixtureNumber: true },
    });
  });
});
