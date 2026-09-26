import { LeagueSeriesAdminService } from './league-series-admin.service';

// commitPromotions 의 가드가 **쓰기에 닿기 전에** 막는지만 좁게 확인한다(글로벌 지침 24 --
// 변경 크기에 비례). loadSeries/loadSeasonStandings/규칙 계산 등 나머지 계약은 통합 스펙
// test/league-matches/league-promotion.integration-spec.ts 가 실 DB로 검증한다.

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
    // BE-5: 시즌 리그 목록이 통합 축으로 옮겨졌다 — `state` 는 `status` 에서 파생한다
    // (`completed` → `completed`). fake 도 저장되는 모양(`status`)을 줘야 파생이 실제로 돈다.
    v1Tournament: {
      findMany: jest.fn().mockResolvedValue([
        { id: LEAGUE_TIER_1, tier: 1, status: 'completed' },
        { id: LEAGUE_TIER_2, tier: 2, status: 'completed' },
      ]),
      count: jest.fn().mockResolvedValue(0),
    },
    v1LeaguePromotion: {
      findFirst: jest.fn().mockResolvedValue(null),
      // 가드가 "쓰기 전에" 막았는지를 단언하려면 쓰기 자체가 목에 있어야 한다.
      // 없으면 가드가 풀렸을 때 TypeError 로 죽어 실패 이유가 가드와 무관해 보인다.
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
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

describe('LeagueSeriesAdminService.commitPromotions 가드', () => {
  // Task 166: 여기 있던 "열린 이의가 있으면 승강 확정 불가" 테스트를 지웠다 — 그 가드가
  // 쌍으로 존재하던 이의 경로가 사라졌다(정본 §4). 아래 `PROMOTION_ALREADY_DECIDED`
  // 가드는 이의와 무관하게 그대로 살아 있으므로 남긴다.
  it('승강이 이미 확정된 시즌은 PROMOTION_ALREADY_DECIDED 로 막는다', async () => {
    const prisma = makePrisma();
    prisma.v1LeaguePromotion.findFirst.mockResolvedValue({ fromLeagueId: LEAGUE_TIER_1 });
    const service = makeService(prisma);

    await expect(
      service.commitPromotions(adminActor, SERIES_ID, SEASON_NO, { entries: [] } as any),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_ALREADY_DECIDED' } });
  });
});
