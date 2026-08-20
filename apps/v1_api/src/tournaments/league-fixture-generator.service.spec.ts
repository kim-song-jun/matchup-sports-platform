import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { GenerateLeagueFixturesDto } from './dto/admin-league.dto';
import {
  assertLeagueGenerationAllowed,
  buildLeagueFixtureRows,
  LeagueFixtureGeneratorService,
} from './league-fixture-generator.service';

describe('assertLeagueGenerationAllowed', () => {
  const base = {
    format: 'league' as const,
    groupPhase: 'group' as const,
    teamCount: 4,
    existingFixtureCount: 0,
    fixturesWithResultCount: 0,
    fixturesWithGameCount: 0,
    minMatchesPerTeam: null as number | null,
    legs: 1,
    replaceExisting: false,
  };

  it('결과가 없어도 Game 이 연결된 대진이 있으면 교체를 거부한다', () => {
    // V1Game.tournamentFixtureId 가 onDelete: Restrict 라 deleteMany 가 FK 위반으로
    // 터진다(2026-08-17 alpha 에서 500 으로 재현). 가드가 먼저 막아야 한다.
    try {
      assertLeagueGenerationAllowed({
        ...base,
        replaceExisting: true,
        existingFixtureCount: 3,
        fixturesWithResultCount: 0,
        fixturesWithGameCount: 1,
      });
      throw new Error('should have thrown');
    } catch (error) {
      const response = (error as ConflictException).getResponse() as {
        code: string;
        fixturesWithGameCount: number;
      };
      expect(response.code).toBe('LEAGUE_FIXTURES_HAVE_GAMES');
      expect(response.fixturesWithGameCount).toBe(1);
    }
  });

  it('Game 이 하나도 없으면 교체를 허용한다', () => {
    expect(() =>
      assertLeagueGenerationAllowed({
        ...base,
        replaceExisting: true,
        existingFixtureCount: 3,
        fixturesWithGameCount: 0,
      }),
    ).not.toThrow();
  });

  it('순수 토너먼트 대회면 거부한다 — 브래킷 대진은 조 순위에서 뽑아야 한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, format: 'knockout' }))
      .toThrow(UnprocessableEntityException);
  });

  // 조별리그+토너먼트의 조 단계는 리그와 대진 규칙이 같은데도 format 검사에서 먼저 막혀
  // 8팀 조 28경기를 손으로 넣어야 했다.
  it('조별리그+토너먼트 대회의 조 단계는 허용한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, format: 'group_knockout' })).not.toThrow();
  });

  // 다만 결선 조는 여전히 막는다 — 진출팀 결정은 이 생성기가 할 일이 아니다.
  it('조별리그+토너먼트라도 결선 조에서는 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, format: 'group_knockout', groupPhase: 'semi' }))
      .toThrow(UnprocessableEntityException);
  });

  it('조 phase가 group이 아니면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, groupPhase: 'knockout' }))
      .toThrow(UnprocessableEntityException);
  });

  it('팀이 2팀 미만이면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, teamCount: 1 }))
      .toThrow(UnprocessableEntityException);
  });

  it('replaceExisting=false인데 fixture가 이미 있으면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, existingFixtureCount: 3 }))
      .toThrow(ConflictException);
  });

  it('replaceExisting=true여도 결과가 확정된 fixture가 있으면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({
      ...base, replaceExisting: true, existingFixtureCount: 3, fixturesWithResultCount: 1,
    })).toThrow(ConflictException);
  });

  it('최소 경기 수에 미달하면 거부하고 필요한 legs를 알려준다', () => {
    try {
      assertLeagueGenerationAllowed({ ...base, teamCount: 4, legs: 1, minMatchesPerTeam: 5 });
      throw new Error('should have thrown');
    } catch (error) {
      const response = (error as UnprocessableEntityException).getResponse() as {
        code: string; requiredLegs: number;
      };
      expect(response.code).toBe('LEAGUE_MIN_MATCHES_NOT_MET');
      expect(response.requiredLegs).toBe(2);
    }
  });

  it('조건을 모두 만족하면 통과한다', () => {
    expect(() => assertLeagueGenerationAllowed(base)).not.toThrow();
  });
});

describe('buildLeagueFixtureRows', () => {
  it('라운드 번호를 round 문자열로, leg를 legNumber로 매핑한다', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g1',
      registrationIds: ['r1', 'r2'],
      legs: 2,
      balanceHome: true,
      schedule: null,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].legNumber).toBe(1);
    expect(rows[1].legNumber).toBe(2);
    expect(rows[0].round).toBe('league_r1');
    expect(rows[0].startAt).toBeNull();
  });

  it('fixtureNumber가 1부터 연속으로 매겨진다', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g1',
      registrationIds: ['r1', 'r2', 'r3', 'r4'],
      legs: 1, balanceHome: true, schedule: null,
    });
    expect(rows.map((r) => r.fixtureNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('fixtureNumberOffset을 주면 그만큼 밀려서 매겨진다 (F3)', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g2',
      registrationIds: ['r3', 'r4'],
      legs: 1, balanceHome: true, schedule: null,
      fixtureNumberOffset: 6,
    });
    expect(rows.map((r) => r.fixtureNumber)).toEqual([7]);
  });

  it('schedule이 있으면 라운드별 startAt을 주차로 채운다', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g1',
      registrationIds: ['r1', 'r2', 'r3', 'r4'],
      legs: 1, balanceHome: true,
      schedule: { startsOn: new Date('2026-09-01T00:00:00.000Z'), template: { dayOfWeek: 6, time: '20:00' } },
    });
    const round1 = rows.filter((r) => r.round === 'league_r1');
    const round2 = rows.filter((r) => r.round === 'league_r2');
    expect(round1[0].startAt).not.toBeNull();
    expect(round2[0].startAt!.getTime() - round1[0].startAt!.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('LeagueFixtureGeneratorService.generate', () => {
  const user: V1AuthUser = {
    id: 'user-1',
    email: 'user-1@teameet.test',
    accountStatus: 'active',
    onboardingStatus: 'completed',
  };
  const admin = { id: 'admin-1', userId: 'user-1', adminRole: 'ops' as const, status: 'active' as const };

  const prisma = {
    v1Tournament: { findUnique: jest.fn() },
    v1TournamentGroup: { findFirst: jest.fn() },
    v1TournamentFixture: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const adminContext = { getMutationAdmin: jest.fn() };

  let service: LeagueFixtureGeneratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma));
    adminContext.getMutationAdmin.mockResolvedValue(admin);
    prisma.v1Tournament.findUnique.mockResolvedValue({ id: 't1', format: 'league', minMatchesPerTeam: null });
    prisma.v1TournamentFixture.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentFixture.createMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentFixture.aggregate.mockResolvedValue({ _max: { fixtureNumber: null } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new LeagueFixtureGeneratorService(prisma as any, adminContext as any);
  });

  function dto(overrides: Partial<GenerateLeagueFixturesDto> = {}): GenerateLeagueFixturesDto {
    return { groupId: 'group-a', legs: 1, ...overrides } as GenerateLeagueFixturesDto;
  }

  // F3: 조가 2개면 대진 생성이 실패한다 — fixtureNumber가 대회 전체에서 겹치지 않는지 증명.
  it('F3: 조 2개에 각각 대진을 생성해도 fixtureNumber가 겹치지 않는다', async () => {
    prisma.v1TournamentFixture.findMany.mockResolvedValue([]);

    // A조: 2팀 → 1경기. 대회에 기존 fixture 없음(max=null).
    prisma.v1TournamentGroup.findFirst.mockResolvedValueOnce({
      id: 'group-a',
      name: 'A조',
      phase: 'group',
      groupTeams: [
        { registrationId: 'r1', sortOrder: 0 },
        { registrationId: 'r2', sortOrder: 1 },
      ],
    });
    prisma.v1TournamentFixture.aggregate.mockResolvedValueOnce({ _max: { fixtureNumber: null } });

    await service.generate(user, 't1', dto({ groupId: 'group-a' }));
    const groupARows = prisma.v1TournamentFixture.createMany.mock.calls[0][0].data as Array<{
      round: string;
      fixtureNumber: number;
      legNumber: number;
    }>;
    expect(groupARows.map((r) => r.fixtureNumber)).toEqual([1]);

    // B조: 3팀 → 3경기. B조 생성 시점엔 A조가 이미 fixtureNumber=1을 썼으므로 max=1.
    prisma.v1TournamentGroup.findFirst.mockResolvedValueOnce({
      id: 'group-b',
      name: 'B조',
      phase: 'group',
      groupTeams: [
        { registrationId: 'r3', sortOrder: 0 },
        { registrationId: 'r4', sortOrder: 1 },
        { registrationId: 'r5', sortOrder: 2 },
      ],
    });
    prisma.v1TournamentFixture.aggregate.mockResolvedValueOnce({ _max: { fixtureNumber: 1 } });

    await service.generate(user, 't1', dto({ groupId: 'group-b' }));
    const groupBRows = prisma.v1TournamentFixture.createMany.mock.calls[1][0].data as Array<{
      round: string;
      fixtureNumber: number;
      legNumber: number;
    }>;

    // 수정 전이었다면 B조도 round='league_r1', fixtureNumber=1, legNumber=1로 시작해서
    // A조의 (tournamentId, round, fixtureNumber, legNumber) unique 제약을 위반했을 것이다.
    expect(groupBRows.map((r) => r.fixtureNumber)).toEqual([2, 3, 4]);

    const combined = [...groupARows, ...groupBRows];
    const uniqueKeys = new Set(combined.map((r) => `${r.round}:${r.fixtureNumber}:${r.legNumber}`));
    expect(uniqueKeys.size).toBe(combined.length);
  });

  // F2-1: VOID 등 비공식 리비전은 "결과 있음"으로 오판하면 안 된다.
  it('F2: VOID 리비전만 있는 fixture는 "결과 확정"으로 치지 않지만, Game 이 붙어 있어 교체는 막힌다', async () => {
    // VOID 리비전이 있다는 건 그 fixture 에 V1Game 이 연결돼 있다는 뜻이다.
    // `V1Game.tournamentFixtureId` 가 onDelete: Restrict 라 deleteMany 가 FK 위반으로
    // 터진다 — 2026-08-17 alpha 에서 실제로 500 이 났다. 따라서 결과 판정(HAVE_RESULTS)에는
    // 걸리지 않아도 Game 가드(HAVE_GAMES)가 먼저 막아야 하고, deleteMany 는 호출되지 않아야 한다.
    prisma.v1TournamentGroup.findFirst.mockResolvedValue({
      id: 'group-a',
      name: 'A조',
      phase: 'group',
      groupTeams: [
        { registrationId: 'r1', sortOrder: 0 },
        { registrationId: 'r2', sortOrder: 1 },
      ],
    });
    prisma.v1TournamentFixture.findMany.mockResolvedValue([
      { id: 'fx-1', game: { id: 'g-1', currentOfficialRevision: { state: 'VOID' } }, result: null },
    ]);

    await expect(
      service.generate(user, 't1', dto({ groupId: 'group-a', replaceExisting: true })),
    ).rejects.toMatchObject({ response: { code: 'LEAGUE_FIXTURES_HAVE_GAMES' } });

    expect(prisma.v1TournamentFixture.deleteMany).not.toHaveBeenCalled();
  });

  // F2-2: game 연결이 없는 레거시 완료 경기(V1TournamentFixtureResult만 존재)를 놓치면
  // replaceExisting=true일 때 결과가 있는 경기를 조용히 삭제하게 된다.
  it('F2: 레거시 결과만 있고 game 연결이 없는 완료 경기가 있으면 재생성을 막는다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue({
      id: 'group-a',
      name: 'A조',
      phase: 'group',
      groupTeams: [
        { registrationId: 'r1', sortOrder: 0 },
        { registrationId: 'r2', sortOrder: 1 },
      ],
    });
    prisma.v1TournamentFixture.findMany.mockResolvedValue([
      { id: 'fx-1', game: null, result: { id: 'legacy-result-1' } },
    ]);

    await expect(
      service.generate(user, 't1', dto({ groupId: 'group-a', replaceExisting: true })),
    ).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1TournamentFixture.deleteMany).not.toHaveBeenCalled();
  });

  // F1: groupTeams 조회 순서(DB 반환 순서)가 달라도 sortOrder 기준 정렬로 결정적이어야 한다.
  it('F1: groupTeams 배열 순서가 달라도 sortOrder 기준 정렬로 동일한 대진이 나온다', async () => {
    prisma.v1TournamentFixture.findMany.mockResolvedValue([]);

    const teamsInSortOrder = [
      { registrationId: 'r1', sortOrder: 0 },
      { registrationId: 'r2', sortOrder: 1 },
      { registrationId: 'r3', sortOrder: 2 },
      { registrationId: 'r4', sortOrder: 3 },
    ];
    // 같은 sortOrder 값이지만 DB가 다른 배열 순서로 반환한 상황을 흉내낸다.
    const teamsShuffled = [teamsInSortOrder[2], teamsInSortOrder[0], teamsInSortOrder[3], teamsInSortOrder[1]];

    prisma.v1TournamentGroup.findFirst.mockResolvedValueOnce({
      id: 'group-a',
      name: 'A조',
      phase: 'group',
      groupTeams: teamsInSortOrder,
    });
    await service.generate(user, 't1', dto({ groupId: 'group-a', balanceHome: true }));
    const firstRows = prisma.v1TournamentFixture.createMany.mock.calls[0][0].data;

    prisma.v1TournamentGroup.findFirst.mockResolvedValueOnce({
      id: 'group-a',
      name: 'A조',
      phase: 'group',
      groupTeams: teamsShuffled,
    });
    await service.generate(user, 't1', dto({ groupId: 'group-a', balanceHome: true }));
    const secondRows = prisma.v1TournamentFixture.createMany.mock.calls[1][0].data;

    expect(secondRows).toEqual(firstRows);
  });
});
