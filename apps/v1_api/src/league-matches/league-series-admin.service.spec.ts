import { LeagueSeriesAdminService } from './league-series-admin.service';

// 감사 후속(B-promotion-dispute-guard): league-match-dispute.service.ts의 resolveDispute는
// "승강이 이미 확정된 리그의 이의는 수락할 수 없다"고 막는데, 대칭 가드가 commitPromotions
// 쪽에는 없었다. 그 결과 운영자가 열린 이의를 두고 먼저 승강을 확정하면, 그 이의는
// resolveDispute 가드에 막혀 영원히 처리(수락)할 수 없는 409 교착에 빠진다.
// 이 스펙은 commitPromotions가 열린 이의를 발견하면 승강 확정 자체를 막는지만 좁게
// 확인한다(글로벌 지침 24 -- 변경 크기에 비례. loadSeries/loadSeasonStandings/규칙 계산
// 등 나머지 계약은 이미 통합 스펙 test/league-matches/league-promotion.integration-spec.ts가
// 실 DB로 검증한다).

const SERIES_ID = 'series-1';
const SEASON_NO = 1;
const LEAGUE_TIER_1 = 'league-tier-1';
const LEAGUE_TIER_2 = 'league-tier-2';

function makePrisma() {
  const prisma: any = {
    v1LeagueSeries: {
      findUnique: jest.fn().mockResolvedValue({
        id: SERIES_ID,
        title: '테스트 리그',
        sportId: 'sport-futsal',
        regionId: 'region-1',
        tierCount: 2,
        promotionRuleJson: null,
        state: 'active',
        createdAt: new Date(),
      }),
    },
    v1League: {
      findMany: jest.fn().mockResolvedValue([
        { id: LEAGUE_TIER_1, tier: 1, state: 'completed' },
        { id: LEAGUE_TIER_2, tier: 2, state: 'completed' },
      ]),
    },
    v1LeaguePromotion: {
      findFirst: jest.fn().mockResolvedValue(null),
      // 가드가 "쓰기 전에" 막았는지를 단언하려면 쓰기 자체가 목에 있어야 한다.
      // 없으면 가드가 풀렸을 때 TypeError 로 죽어 실패 이유가 가드와 무관해 보인다.
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    v1LeagueMatchDispute: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  return prisma;
}

function makeService(prisma: any) {
  const adminContext = { getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin-row-1' }), getActiveAdmin: jest.fn() } as any;
  const publicService = {
    standings: jest.fn().mockResolvedValue({ pendingFixtures: [], standings: [], tieBreakGroups: [] }),
  } as any;
  const notifications = { emitToManyDeferred: jest.fn() } as any;
  return new LeagueSeriesAdminService(prisma, adminContext, publicService, notifications);
}

const adminActor = { id: 'admin-user-1', email: null, accountStatus: 'active', onboardingStatus: 'completed' } as any;

describe('LeagueSeriesAdminService.commitPromotions 열린 이의 가드', () => {
  it('열린 이의가 있으면 승강 확정을 막는다 -- 409, 아무것도 쓰지 않는다', async () => {
    const prisma = makePrisma();
    prisma.v1LeagueMatchDispute.findFirst.mockResolvedValue({ id: 'dispute-open-1' });
    const service = makeService(prisma);

    await expect(
      service.commitPromotions(adminActor, SERIES_ID, SEASON_NO, { entries: [] } as any),
    ).rejects.toMatchObject({ response: { code: 'LEAGUE_RESULT_DISPUTE_OPEN' } });

    expect(prisma.v1LeagueMatchDispute.findFirst).toHaveBeenCalledWith({
      where: { leagueId: { in: [LEAGUE_TIER_1, LEAGUE_TIER_2] }, status: 'open' },
      select: { id: true },
    });
    // 핵심 단언: 이의 가드가 **쓰기에 닿기 전에** 막아야 한다. 읽기가 일어났는지가
    // 아니라 쓰기가 일어나지 않았는지를 본다 — 가드가 아래로 밀려나거나 그 사이에
    // 새 쓰기가 추가돼도 이 단언이 잡는다.
    expect(prisma.v1LeaguePromotion.createMany).not.toHaveBeenCalled();
  });

  it('열린 이의가 없으면 이의 가드는 통과하고, 승강이 이미 확정된 경우엔 여전히 PROMOTION_ALREADY_DECIDED로 막는다', async () => {
    const prisma = makePrisma();
    prisma.v1LeaguePromotion.findFirst.mockResolvedValue({ fromLeagueId: LEAGUE_TIER_1 });
    const service = makeService(prisma);

    await expect(
      service.commitPromotions(adminActor, SERIES_ID, SEASON_NO, { entries: [] } as any),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_ALREADY_DECIDED' } });
  });
});
