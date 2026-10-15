import { LeagueMatchPublicService } from './league-match-public.service';

// 공개 상세는 allow-list select 라 새 컬럼이 자동으로 따라오지 않는다 — 입금 계좌는 select 에도 응답에도 없어야 한다.
const SECRET = { bankName: 'SENTINEL-BANK', bankAccount: 'SENTINEL-ACCOUNT-1', bankHolder: 'SENTINEL-HOLDER' };

function makeService(row: Record<string, unknown>, pendingPaymentCount = 0) {
  const findFirst = jest.fn().mockResolvedValue({
    id: 'league-1', title: '리그', status: 'draft', registrationDeadlineAt: null,
    scheduledAt: new Date('2026-10-30T00:00:00.000Z'), scheduledEndAt: new Date('2026-12-30T00:00:00.000Z'),
    seriesId: null, tier: null, seasonNo: null,
    sport: { id: 'sport-1', code: 'futsal', name: '풋살' }, region: { id: 'region-1', name: '서울' },
    registrations: [], series: null,
    kind: 'regular_league', teamCount: 8, maxTeams: null,
    coverImageUrl: null, entryFee: 0, entryFeeConfiguredAt: null,
    ...SECRET, // 목은 select 를 지키지 않는다 — 서비스가 응답에 새로 싣지 않는지까지 본다.
    ...row,
  });
  const prisma = {
    v1Tournament: { findFirst, findMany: jest.fn().mockResolvedValue([]) },
    v1TournamentRegistration: { count: jest.fn().mockResolvedValue(pendingPaymentCount) },
    v1TeamMatch: { findMany: jest.fn().mockResolvedValue([]) },
    v1GameOfficialFact: { findMany: jest.fn().mockResolvedValue([]) },
    v1GameOperationFlag: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  return { service: new LeagueMatchPublicService(prisma as never), findFirst, prisma };
}

describe('MD-QA #145 review follow-up public capacity', () => {
  it.each([[3, 3, false], [3, 2, true], [null, 9, true]] as const)(
    'nextRound maxTeams=%s reserved=%s exposes registrationOpen=%s to the next-season application link',
    async (maxTeams, reservedCount, registrationOpen) => {
      const { service, prisma } = makeService({
        seriesId: 'series-1', tier: 1, seasonNo: 1, series: { title: '연속 리그' },
      });
      prisma.v1Tournament.findMany.mockResolvedValue([{
        id: 'next-league-1', title: '다음 회차', tier: 1, seasonNo: 2, status: 'draft',
        registrationDeadlineAt: new Date('2098-01-01T00:00:00.000Z'),
        scheduledAt: new Date('2098-02-01T00:00:00.000Z'), scheduledEndAt: new Date('2098-12-01T00:00:00.000Z'),
        kind: 'regular_league', teamCount: 8, maxTeams, _count: { registrations: reservedCount },
      }]);
      const result = await service.detail('league-1');
      expect(result.nextRound).toMatchObject({ leagueId: 'next-league-1', registrationOpen });
      expect(Object.keys(result.nextRound as NonNullable<typeof result.nextRound>).sort()).toEqual([
        'endsOn', 'leagueId', 'registrationDeadlineAt', 'registrationOpen', 'seasonNo', 'startsOn', 'title',
      ]);
      expect(Object.keys(result.seriesSiblings[0]).sort()).toEqual(['leagueId', 'seasonNo', 'state', 'tier', 'tierLabel']);
    },
  );

  it('nextRound actually reads its configured team limit and all-source holding count in the sibling query', async () => {
    const { service, prisma } = makeService({
      seriesId: 'series-1', tier: 1, seasonNo: 1, series: { title: '연속 리그' },
    });
    await service.detail('league-1');
    expect(prisma.v1Tournament.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        maxTeams: true,
        _count: { select: { registrations: { where: {
          status: { in: ['awaiting_payment', 'payment_checking', 'paid', 'confirmed'] },
        } } } },
      }),
    }));
  });

  it.each([
    ['draft', 3, 3, 0, false],
    ['open', 3, 2, 1, false],
    ['in_progress', 3, 2, 1, false],
    ['draft', 3, 2, 0, true],
    ['draft', null, 10, 5, true],
  ] as const)('detail %s maxTeams=%s confirmed=%s pending=%s exposes registrationOpen=%s to the public join guide', async (
    status, maxTeams, confirmedCount, pendingPaymentCount, registrationOpen,
  ) => {
    const registrations = Array.from({ length: confirmedCount }, (_, index) => ({
      teamId: `team-${index}`, team: { name: `팀 ${index}`, profile: { logoUrl: null } },
    }));
    const { service, findFirst, prisma } = makeService({
      status, maxTeams, registrations, registrationDeadlineAt: new Date('2098-01-01T00:00:00.000Z'),
    }, pendingPaymentCount);
    // The actual public detail response drives LeagueJoinGuideCard's recruiting badge and application link.
    const result = await service.detail('league-1');
    expect(result).toMatchObject({ maxTeams, confirmedCount, pendingPaymentCount, registrationOpen });
    expect(findFirst.mock.calls[0][0].select.registrations.where).toEqual({ status: 'confirmed' });
    expect(prisma.v1TournamentRegistration.count).toHaveBeenCalledWith({ where: {
      tournamentId: 'league-1', status: { in: ['awaiting_payment', 'payment_checking', 'paid'] },
    } });
  });
});

describe('LeagueMatchPublicService.detail — 참가비·대표 이미지', () => {
  it('설정된 리그는 금액·이미지·종목 코드를 내려주고 설정 여부를 boolean 으로만 말한다', async () => {
    const { service } = makeService({
      coverImageUrl: '/uploads/2026/10/cover.webp', entryFee: 70000, entryFeeConfiguredAt: new Date('2026-10-02T00:00:00.000Z'),
    });
    const result = await service.detail('league-1');
    expect(result).toMatchObject({
      sportCode: 'futsal', coverImageUrl: '/uploads/2026/10/cover.webp', entryFee: 70000, entryFeeConfigured: true,
    });
    const json = JSON.stringify(result);
    for (const value of Object.values(SECRET)) expect(json).not.toContain(value);
    expect(json).not.toContain('entryFeeConfiguredAt');
    expect(json).not.toContain('2026-10-02T00:00:00.000Z');
  });

  it('대조: 미설정 리그는 entryFeeConfigured=false, 0원 무료 확정은 true — 금액만으로는 구분되지 않는다', async () => {
    const unset = await makeService({}).service.detail('league-1');
    const free = await makeService({ entryFeeConfiguredAt: new Date('2026-10-02T00:00:00.000Z') }).service.detail('league-1');
    expect(unset).toMatchObject({ entryFee: 0, entryFeeConfigured: false });
    expect(free).toMatchObject({ entryFee: 0, entryFeeConfigured: true });
  });

  it('조회 select 는 입금 계좌 컬럼을 요청하지 않는다', async () => {
    const { service, findFirst } = makeService({});
    await service.detail('league-1');
    const select = findFirst.mock.calls[0][0].select as Record<string, unknown>;
    expect(select).toMatchObject({ coverImageUrl: true, entryFee: true, entryFeeConfiguredAt: true });
    for (const key of ['bankName', 'bankAccount', 'bankHolder']) expect(select).not.toHaveProperty(key);
  });
});

describe('LeagueMatchPublicService.detail — 기본 장소', () => {
  it('고른 기본 장소를 defaultPlace 하나로 내리고 원시 venue 칸은 따로 싣지 않는다', async () => {
    const { service } = makeService({
      venue: '망원한강공원 풋살장', venueAddress: '서울 마포구 마포나루길 467', latitude: 37.5551, longitude: 126.8946,
      venueProvider: 'kakao', venueProviderId: '27355437',
    });
    const result = await service.detail('league-1');
    expect(result.defaultPlace).toEqual({
      name: '망원한강공원 풋살장', address: '서울 마포구 마포나루길 467', latitude: 37.5551, longitude: 126.8946,
      provider: 'kakao', providerPlaceId: '27355437',
    });
    expect(result).not.toHaveProperty('venueProviderId');
  });

  it('기본 장소가 없는 리그는 defaultPlace=null', async () => {
    const { service } = makeService({ venue: null, venueAddress: null, latitude: null, longitude: null, venueProvider: null, venueProviderId: null });
    expect((await service.detail('league-1')).defaultPlace).toBeNull();
  });
});
