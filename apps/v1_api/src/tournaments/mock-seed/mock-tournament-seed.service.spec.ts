import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MockTournamentSeedService } from './mock-tournament-seed.service';

const user = { id: 'admin-1', email: 'a@teameet.v1', accountStatus: 'active', onboardingStatus: 'completed' } as never;

function makeWorld(teamCount = 4) {
  const teams = Array.from({ length: teamCount }, (_, i) => ({
    id: `team-${i}`,
    name: `팀${i}`,
    memberships: [
      { userId: `owner-${i}`, role: 'owner' },
      { userId: `member-${i}-1`, role: 'member' },
      { userId: `member-${i}-2`, role: 'member' },
    ],
  }));
  const fixtures: Array<Record<string, unknown>> = [];
  const results: Array<Record<string, unknown>> = [];
  const players: Array<Record<string, unknown>> = [];
  const tx = {
    v1Tournament: { create: jest.fn(async ({ data }: never) => ({ ...(data as object), id: 'tour-1' })) },
    v1TournamentRegistration: { create: jest.fn(async ({ data }: never) => ({ ...(data as object), id: `reg-${Math.random()}` })) },
    v1TournamentPlayer: { createMany: jest.fn(async ({ data }: { data: unknown[] }) => { players.push(...(data as never[])); return { count: data.length }; }) },
    v1TournamentGroup: { create: jest.fn(async () => ({ id: 'group-1' })) },
    v1TournamentGroupTeam: { createMany: jest.fn(async () => ({ count: 0 })) },
    v1TournamentFixture: { create: jest.fn(async ({ data }: never) => { fixtures.push(data as never); return { ...(data as object), id: `fx-${fixtures.length}` }; }) },
    v1TournamentFixtureResult: { create: jest.fn(async ({ data }: never) => { results.push(data as never); return data; }) },
  };
  const prisma = {
    v1Sport: { findFirst: jest.fn().mockResolvedValue({ id: 'sport-futsal', code: 'futsal' }) },
    v1Team: { findMany: jest.fn().mockResolvedValue(teams) },
    $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
  };
  const adminContext = {
    getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin-row', role: 'ops' }),
    logAdminAction: jest.fn(),
  };
  const service = new MockTournamentSeedService(prisma as never, adminContext as never);
  return { service, prisma, tx, fixtures, results, players, adminContext };
}

describe('MockTournamentSeedService', () => {
  const originalFlag = process.env.V1_ENABLE_MOCK_SEED;
  beforeEach(() => { process.env.V1_ENABLE_MOCK_SEED = 'true'; });
  afterAll(() => { process.env.V1_ENABLE_MOCK_SEED = originalFlag; });

  // 데이터를 대량 생성하는 기능이라 프로덕션에서 눌릴 여지 자체를 없앤다.
  // NODE_ENV 로는 alpha 와 프로덕션을 구분할 수 없어서 전용 플래그를 쓴다.
  it('플래그가 꺼져 있으면 404 로 존재조차 감춘다', async () => {
    process.env.V1_ENABLE_MOCK_SEED = '';
    const { service, prisma } = makeWorld();

    await expect(service.createTournament(user, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // 이 테스트가 없어서 alpha 에서 500 이 났다: 존재하지 않는 `jerseyNumber` 를 createMany 에 넘겼는데,
  // 로컬 generated Prisma client 가 stale 이라 tsc 가 통과했고 mock prisma 는 where/data 를 검증하지
  // 않아 유닛테스트도 통과했다. 그래서 mock 이 아니라 **schema.prisma 원문**을 권위로 삼아
  // 서비스가 실제로 넘긴 필드가 모델에 존재하는지 대조한다.
  it('명단 payload 의 모든 필드가 schema.prisma 의 V1TournamentPlayer 에 실재한다', async () => {
    const { service, players } = makeWorld();
    await service.createTournament(user, { format: 'league', teamCount: 4 });
    expect(players.length).toBeGreaterThan(0);

    const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
    const model = /model V1TournamentPlayer \{([\s\S]*?)\n\}/.exec(schema);
    expect(model).not.toBeNull();
    const scalarFields = new Set(
      model![1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
        .map((line) => line.split(/\s+/)[0]),
    );
    expect(scalarFields.has('realName')).toBe(true); // 파서 자체가 망가지면 이 단언이 먼저 깨진다

    const unknownFields = [...new Set(players.flatMap((row) => Object.keys(row)))].filter(
      (field) => !scalarFields.has(field),
    );
    expect(unknownFields).toEqual([]);
  });

  // 명단이 needs_review 로 남으면 "명단까지 채워진 대회"가 아니다 — 실 시드와 같은 값을 쓴다.
  it('명단은 non_pro 로 확정 상태로 넣는다', async () => {
    const { service, players } = makeWorld();
    await service.createTournament(user, { format: 'league', teamCount: 4 });
    expect(players.every((row) => row.eligibilityStatus === 'non_pro')).toBe(true);
  });

  it('라인업은 만들지 않는다 — 라인업 제출은 손으로 테스트하는 게 목적이다', async () => {
    const { service, tx } = makeWorld();

    await service.createTournament(user, { format: 'league', teamCount: 4 });

    expect(tx.v1TournamentFixture.create).toHaveBeenCalled();
    expect(tx).not.toHaveProperty('v1GameLineup');
  });

  it('명단은 항상 실제 userId 로 채운다 — 그래야 상대 선수 후기 대상이 생긴다', async () => {
    const { service, players } = makeWorld(4);

    await service.createTournament(user, { format: 'league', teamCount: 4 });

    expect(players.length).toBeGreaterThan(0);
    expect(players.every((p) => typeof p.userId === 'string' && (p.userId as string).length > 0)).toBe(true);
  });

  it('리그는 라운드로빈으로 전 팀이 맞붙는다 (4팀 → 6경기)', async () => {
    const { service, fixtures } = makeWorld(4);

    const result = await service.createTournament(user, { format: 'league', teamCount: 4 });

    expect(result.fixtureCount).toBe(6);
    expect(fixtures).toHaveLength(6);
  });

  it('토너먼트는 단판 대진으로 짝을 짓는다 (4팀 → 2경기)', async () => {
    const { service } = makeWorld(4);

    const result = await service.createTournament(user, { format: 'knockout', teamCount: 4 });

    expect(result.fixtureCount).toBe(2);
  });

  it('조별리그+토너먼트는 조별 라운드로빈에 4강을 더한다 (4팀 → 6+2)', async () => {
    const { service } = makeWorld(4);

    const result = await service.createTournament(user, { format: 'group_knockout', teamCount: 4 });

    expect(result.fixtureCount).toBe(8);
  });

  // 후기 대상은 "공식 결과가 있는 완료 경기"에서만 열린다 — 결과 없이 종료시키면 쓸 게 없다.
  it('후기 작성 가능으로 만들면 경기 결과까지 채운다', async () => {
    const { service, results, fixtures } = makeWorld(4);

    await service.createTournament(user, { format: 'league', teamCount: 4, reviewReady: true });

    expect(results).toHaveLength(fixtures.length);
    expect(fixtures.every((f) => f.status === 'completed')).toBe(true);
  });

  it('명단을 채울 팀이 부족하면 반쪽 대회를 만들지 않고 실패한다', async () => {
    const { service } = makeWorld(2);

    await expect(service.createTournament(user, { teamCount: 8 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('대회 이름에 날짜와 조건이 들어간다', async () => {
    const { service } = makeWorld(4);

    const result = await service.createTournament(user, { format: 'league', teamCount: 4, status: 'completed' });

    expect(result.title).toContain('(목업)');
    expect(result.title).toContain('리그 4팀 종료');
  });
});
