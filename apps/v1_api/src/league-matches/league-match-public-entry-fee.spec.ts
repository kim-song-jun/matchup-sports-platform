import { LeagueMatchPublicService } from './league-match-public.service';

// 공개 상세는 allow-list select 라 새 컬럼이 자동으로 따라오지 않는다 — 입금 계좌는 select 에도 응답에도 없어야 한다.
const SECRET = { bankName: 'SENTINEL-BANK', bankAccount: 'SENTINEL-ACCOUNT-1', bankHolder: 'SENTINEL-HOLDER' };

function makeService(row: Record<string, unknown>) {
  const findFirst = jest.fn().mockResolvedValue({
    id: 'league-1', title: '리그', status: 'draft', registrationDeadlineAt: null,
    scheduledAt: new Date('2026-10-30T00:00:00.000Z'), scheduledEndAt: new Date('2026-12-30T00:00:00.000Z'),
    seriesId: null, tier: null, seasonNo: null,
    sport: { id: 'sport-1', code: 'futsal', name: '풋살' }, region: { id: 'region-1', name: '서울' },
    registrations: [], series: null,
    coverImageUrl: null, entryFee: 0, entryFeeConfiguredAt: null,
    ...SECRET, // 목은 select 를 지키지 않는다 — 서비스가 응답에 새로 싣지 않는지까지 본다.
    ...row,
  });
  const prisma = {
    v1Tournament: { findFirst },
    v1TeamMatch: { findMany: jest.fn().mockResolvedValue([]) },
    v1GameOfficialFact: { findMany: jest.fn().mockResolvedValue([]) },
    v1GameOperationFlag: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  return { service: new LeagueMatchPublicService(prisma as never), findFirst };
}

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
