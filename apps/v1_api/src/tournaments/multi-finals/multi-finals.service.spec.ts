import type { AdminContextService } from '../../common/admin-context.service';
import type { GamesService } from '../../games/games.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BracketTemplateService } from '../templates/bracket-template.service';
import { FOOTBALL_V1_CONFIG } from '../competition-config/competition-config.presets';
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
      v1TournamentSlot: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentStanding: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentGroup: { count: jest.fn().mockResolvedValue(0) },
      v1TournamentMatchDetails: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _max: { fixtureNumber: 6 } }) },
      v1AdminActionLog: { findFirst: jest.fn().mockResolvedValue(null) }, v1OperationAudit: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const admins = { getTournamentMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin' }) };
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
      v1TournamentSlot: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentStanding: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentGroup: { count: jest.fn().mockResolvedValue(0) },
      v1TournamentMatchDetails: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _max: { fixtureNumber: maximum } }) },
      v1AdminActionLog: { findFirst: jest.fn().mockResolvedValue(null) }, v1OperationAudit: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const admins = { getTournamentMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin' }) };
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

describe('진출 규칙 저장 시 시드 순서', () => {
  const admin = { id: 'admin', email: 'admin@example.test', accountStatus: 'active', onboardingStatus: 'completed' } as const;
  // Typed group by group (A1, A2, A3, B1, B2, B3), the order the rules screen produces by default.
  const typed = (a: string, b: string) => [a, b].flatMap(groupId => [1, 2, 3].map(rank => ({ groupId, rank })));
  const named = { name: '본선', capacity: 6, thirdPlace: false, registrationIds: null };
  function harness(multiFinals: unknown, revision: number) {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      v1Tournament: { findFirst: jest.fn().mockResolvedValue({
        id: 'tournament', kind: 'regular_tournament', format: 'league_knockouts', multiFinals, multiFinalsRevision: revision, competitionConfigVersionId: 'config',
      }), update },
      v1TournamentRegistration: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentGroupTeam: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentSlot: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentStanding: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentGroup: { count: jest.fn().mockResolvedValue(0) },
      v1TournamentAward: { count: jest.fn().mockResolvedValue(0) },
      v1TournamentAwardSet: { count: jest.fn().mockResolvedValue(0) },
      v1TournamentMatchDetails: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const admins = { getTournamentMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin' }), logAdminAction: jest.fn().mockResolvedValue(undefined) };
    const templates = { materialize: jest.fn().mockResolvedValue({ groupIds: new Map([['0', 'saved-0'], ['1', 'saved-1']]), slotIds: new Map() }) };
    const service = new MultiFinalsService(prisma as unknown as PrismaService, admins as unknown as AdminContextService, {} as GamesService, templates as unknown as BracketTemplateService);
    const savedRules = () => (update.mock.calls[0][0].data.multiFinals as { finals: Array<{ rules: Array<{ groupId: string; rank: number }> }> }).finals[0].rules;
    return { service, savedRules };
  }

  it('최초 저장(setup)은 조 순서대로 눌러 넣은 규칙을 순위 먼저, 같은 순위는 조 순서로 저장한다', async () => {
    const { service, savedRules } = harness(null, 0);
    await service.setup(admin, 'tournament', { expectedRevision: 0,
      groups: [{ name: 'A조', capacity: 5, legs: 1 }, { name: 'B조', capacity: 5, legs: 1 }],
      finals: [{ ...named, rules: typed('0', '1') }] });
    expect(savedRules()).toEqual([
      { groupId: 'saved-0', rank: 1 }, { groupId: 'saved-1', rank: 1 }, { groupId: 'saved-0', rank: 2 }, { groupId: 'saved-1', rank: 2 }, { groupId: 'saved-0', rank: 3 }, { groupId: 'saved-1', rank: 3 },
    ]);
  });
  it('setup 에서 뒤 조부터 눌러도 같은 순위끼리는 편성 순서(조 인덱스)를 따른다', async () => {
    const { service, savedRules } = harness(null, 0);
    await service.setup(admin, 'tournament', { expectedRevision: 0,
      groups: [{ name: 'A조', capacity: 5, legs: 1 }, { name: 'B조', capacity: 5, legs: 1 }],
      finals: [{ ...named, rules: typed('1', '0') }] });
    expect(savedRules().slice(0, 2)).toEqual([{ groupId: 'saved-0', rank: 1 }, { groupId: 'saved-1', rank: 1 }]);
  });
  it('규칙 저장(select)은 저장된 조 순서를 기준으로 같은 정렬을 한다', async () => {
    const stored = { groups: [{ id: 'g-a', name: 'A조', capacity: 5, legs: 1 }, { id: 'g-b', name: 'B조', capacity: 5, legs: 1 }], finals: [{ ...named, id: 'f-1', rules: [] }] };
    const { service, savedRules } = harness(stored, 3);
    await service.select(admin, 'tournament', { expectedRevision: 3, finals: [{ ...named, id: 'f-1', rules: typed('g-a', 'g-b') }] });
    expect(savedRules()).toEqual([
      { groupId: 'g-a', rank: 1 }, { groupId: 'g-b', rank: 1 }, { groupId: 'g-a', rank: 2 }, { groupId: 'g-b', rank: 2 }, { groupId: 'g-a', rank: 3 }, { groupId: 'g-b', rank: 3 },
    ]);
  });
  it('이미 순위 먼저 넣은 규칙은 select 에서 순서가 바뀌지 않는다', async () => {
    const stored = { groups: [{ id: 'g-a', name: 'A조', capacity: 5, legs: 1 }, { id: 'g-b', name: 'B조', capacity: 5, legs: 1 }], finals: [{ ...named, id: 'f-1', rules: [] }] };
    const { service, savedRules } = harness(stored, 3);
    const ranked = [1, 2, 3].flatMap(rank => ['g-a', 'g-b'].map(groupId => ({ groupId, rank })));
    await service.select(admin, 'tournament', { expectedRevision: 3, finals: [{ ...named, id: 'f-1', rules: ranked }] });
    expect(savedRules()).toEqual(ranked);
  });
});

describe('옛 순서로 저장된 진출 규칙의 추천', () => {
  const official = (home: number, away: number) => ({ currentOfficialRevision: { state: 'OFFICIAL', score: { home, away }, officialAt: new Date('2026-11-01T00:00:00Z') } });
  const standing = (groupId: string, registrationId: string, position: number) => ({
    groupId, registrationId, position, wins: position === 1 ? 1 : 0, draws: 0, losses: position === 1 ? 0 : 1, goalsFor: 0, goalsAgainst: 0, points: 0, recalculatedAt: null,
  });
  // Two finished 2-team groups: a1 beats a2 and b1 beats b2.
  const teams = [['g-a', 'a1'], ['g-a', 'a2'], ['g-b', 'b1'], ['g-b', 'b2']] as const;
  const rule = (groupId: string, rank: number) => ({ groupId, rank });

  it('조회는 저장된 규칙 순서를 그대로 따르고 읽을 때 순위 먼저로 다시 정렬하지 않는다', async () => {
    const tx = {
      v1Tournament: { findFirst: jest.fn().mockResolvedValue({
        id: 'tournament', kind: 'regular_tournament', format: 'league_knockouts', multiFinalsRevision: 4,
        competitionConfigVersionId: 'cfg', competitionConfig: FOOTBALL_V1_CONFIG,
        multiFinals: {
          groups: [{ id: 'g-a', name: 'A조', capacity: 2, legs: 1 }, { id: 'g-b', name: 'B조', capacity: 2, legs: 1 }],
          finals: [{ name: '본선', capacity: 4, thirdPlace: false, registrationIds: null, rules: [rule('g-a', 1), rule('g-a', 2), rule('g-b', 1), rule('g-b', 2)] }],
        },
      }) },
      v1TournamentRegistration: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentGroupTeam: { findMany: jest.fn().mockResolvedValue(teams.map(([groupId, registrationId]) => ({ groupId, registrationId, registration: { team: { name: registrationId } } }))) },
      v1TournamentSlot: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentStanding: { findMany: jest.fn().mockResolvedValue([standing('g-a', 'a1', 1), standing('g-a', 'a2', 2), standing('g-b', 'b1', 1), standing('g-b', 'b2', 2)]) },
      v1TournamentGroup: { count: jest.fn().mockResolvedValue(0) },
      v1TournamentMatchDetails: { count: jest.fn().mockResolvedValue(2), findMany: jest.fn().mockResolvedValue([
        { groupId: 'g-a', homeRegistrationId: 'a1', awayRegistrationId: 'a2', teamMatch: { game: official(1, 0) } },
        { groupId: 'g-b', homeRegistrationId: 'b1', awayRegistrationId: 'b2', teamMatch: { game: official(1, 0) } },
      ]) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const admins = { getTournamentAdmin: jest.fn().mockResolvedValue({ id: 'admin' }) };
    const service = new MultiFinalsService(prisma as unknown as PrismaService, admins as unknown as AdminContextService, {} as GamesService, {} as BracketTemplateService);
    const view = await service.get({ id: 'admin', email: 'admin@example.test', accountStatus: 'active', onboardingStatus: 'completed' }, 'tournament');
    expect(view.finals[0].unresolved).toEqual([]);
    expect(view.finals[0].rules).toEqual([rule('g-a', 1), rule('g-a', 2), rule('g-b', 1), rule('g-b', 2)]);
    expect(view.finals[0].suggestedRegistrationIds).toEqual(['a1', 'a2', 'b1', 'b2']);
  });
});
