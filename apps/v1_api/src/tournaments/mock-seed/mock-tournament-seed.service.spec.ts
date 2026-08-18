import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// 백필은 별도 모듈의 검증 대상이라 여기서는 호출 여부만 본다.
jest.mock('../../games/migration/fixture-game-backfill', () => ({
  runFixtureGameBackfill: jest.fn(async () => ({
    counts: { gamesCreated: 6, periodsBackfilled: 0, visibilityPoliciesBackfilled: 0, quarantined: 0 },
    quarantine: [],
  })),
}));
import { MockTournamentSeedService, readLineupMinPlayers } from './mock-tournament-seed.service';

/**
 * schema.prisma 원문에서 모델별 필드 맵을 만든다.
 * mock prisma 는 payload/select 를 검증하지 않고 로컬 generated client 는 stale 일 수 있어서,
 * "실제로 존재하는 필드인가"를 판정할 권위가 스키마 원문밖에 없다.
 */
function parseSchemaModels(): Map<string, Map<string, string>> {
  const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
  const models = new Map<string, Map<string, string>>();
  const modelPattern = /model (\w+) \{([\s\S]*?)\n\}/g;
  let match: RegExpExecArray | null;
  while ((match = modelPattern.exec(schema)) !== null) {
    const fields = new Map<string, string>();
    for (const rawLine of match[2].split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const [name, type] = line.split(/\s+/);
      if (!name || !type) continue;
      fields.set(name, type.replace(/[?[\]]/g, ''));
    }
    models.set(match[1], fields);
  }
  return models;
}

/** select 트리를 따라 내려가며 각 단계의 키가 그 모델에 실재하는지 확인한다. */
function unknownSelectFields(
  models: Map<string, Map<string, string>>,
  modelName: string,
  select: Record<string, unknown>,
  path = modelName,
): string[] {
  const fields = models.get(modelName);
  if (!fields) return [`${path}: 모델 없음`];
  const problems: string[] = [];
  for (const [key, value] of Object.entries(select)) {
    const fieldType = fields.get(key);
    if (!fieldType) {
      problems.push(`${path}.${key}`);
      continue;
    }
    const nested = (value as { select?: Record<string, unknown> })?.select;
    if (nested) problems.push(...unknownSelectFields(models, fieldType, nested, `${path}.${key}`));
  }
  return problems;
}

const user = { id: 'admin-1', email: 'a@teameet.v1', accountStatus: 'active', onboardingStatus: 'completed' } as never;

function makeWorld(teamCount = 4) {
  const teams = Array.from({ length: teamCount }, (_, i) => ({
    id: `team-${i}`,
    name: `팀${i}`,
    memberships: [
      { userId: `owner-${i}`, role: 'owner', user: { email: `owner${i}@teameet.test`, profile: { nickname: `팀장${i}` } } },
      { userId: `member-${i}-1`, role: 'member', user: { email: `m${i}a@teameet.test`, profile: { nickname: `선수${i}A` } } },
      { userId: `member-${i}-2`, role: 'member', user: { email: `m${i}b@teameet.test`, profile: { nickname: `선수${i}B` } } },
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
    v1CompetitionConfigVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'config-1', lineup: { minPlayers: 3, maxPlayers: 11 } }) },
    v1Game: { findMany: jest.fn().mockResolvedValue([]) },
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

  // alpha 실측: ACTIVE config 가 minPlayers 7 인데 목업이 멤버 4명 팀을 뽑아, 라인업 화면에서
  // "포지션 자리가 비어 있어요"로 제출 자체가 막혔다. 하한은 config 에서 읽어야 한다.
  it('라인업 최소 인원을 config 에서 읽어 팀 조회 조건에 쓴다', async () => {
    const { service, prisma } = makeWorld(4);
    prisma.v1CompetitionConfigVersion.findFirst.mockResolvedValue({
      id: 'config-1',
      lineup: { minPlayers: 3, maxPlayers: 11 },
    });

    await service.createTournament(user, { format: 'league', teamCount: 4 });

    const where = prisma.v1Team.findMany.mock.calls[0][0].where as { memberCount?: { gte?: number } };
    expect(where.memberCount).toEqual({ gte: 3 });
  });

  it('config 의 lineup 값이 이상하면 안전한 하한으로 되돌린다', () => {
    expect(readLineupMinPlayers({ minPlayers: 7 })).toBe(7);
    expect(readLineupMinPlayers(null)).toBe(3);
    expect(readLineupMinPlayers({ minPlayers: 0 })).toBe(3);
    expect(readLineupMinPlayers({ minPlayers: 'seven' })).toBe(3);
  });

  // 기본은 라인업을 비워 둔다 — 라인업 제출 자체가 손으로 테스트할 대상이기 때문이다.
  it('withLineups 를 주지 않으면 라인업을 건드리지 않는다', async () => {
    const { service, prisma } = makeWorld(4);

    const result = await service.createTournament(user, { format: 'league', teamCount: 4 });

    expect(prisma.v1Game.findMany).not.toHaveBeenCalled();
    expect(result.lineupsSubmitted).toBe(0);
  });

  // 눌러 보고 400 으로 알게 되면 사용자가 조건을 스스로 좁힐 수 없다 — 화면이 미리 상한을 안다.
  it('availability 가 쓸 수 있는 팀 수와 상한을 함께 돌려준다', async () => {
    const { service } = makeWorld(4);

    await expect(service.availability()).resolves.toEqual({
      enabled: true,
      usableTeamCount: 4,
      maxTeamCount: 4,
      // 화면이 "몇 명 이상 팀만 쓸 수 있는지"를 설명하려면 이 값이 필요하다.
      minPlayersPerTeam: 3,
    });
  });

  it('플래그가 꺼져 있으면 availability 도 0 을 돌려준다', async () => {
    process.env.V1_ENABLE_MOCK_SEED = '';
    const { service, prisma } = makeWorld(4);

    await expect(service.availability()).resolves.toEqual({
      enabled: false,
      usableTeamCount: 0,
      maxTeamCount: 0,
      minPlayersPerTeam: 0,
    });
    expect(prisma.v1Team.findMany).not.toHaveBeenCalled();
  });

  // 픽스처만 있으면 운영 콘솔이 "경기 미생성"으로 뜬다(alpha 실측). V1Game 은 백필이 만들고,
  // 그 백필은 competitionConfigVersionId 가 없는 픽스처를 CONFIG_MISSING 으로 격리한다.
  it('픽스처에 competitionConfigVersionId 를 박고 게임 백필을 돌린다', async () => {
    const { runFixtureGameBackfill } = jest.requireMock('../../games/migration/fixture-game-backfill');
    const { service, fixtures } = makeWorld(4);

    const result = await service.createTournament(user, { format: 'league', teamCount: 4 });

    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures.every((fixture) => fixture.competitionConfigVersionId === 'config-1')).toBe(true);
    expect(runFixtureGameBackfill).toHaveBeenCalledWith(expect.anything(), { mode: 'apply' });
    expect(result.gamesCreated).toBe(6);
  });

  // alpha 실측: 4팀 요청은 창이 teamCount*4=16 이라 "사용 가능 3팀"으로 실패했는데 8팀 요청은
  // 창이 32 라 성공했다 — 조건을 못 채우는 소규모 테스트 팀들이 창을 차지한 것이다.
  // 조회 창을 요청 팀 수에 비례시키면 안 된다.
  it('후보 조회 창을 요청 팀 수에 비례시키지 않는다', async () => {
    const { service, prisma } = makeWorld(4);
    await service.createTournament(user, { format: 'league', teamCount: 4 });

    const args = prisma.v1Team.findMany.mock.calls[0][0] as { take: number; where: { memberCount?: unknown } };
    expect(args.take).toBeGreaterThanOrEqual(100);
    // 멤버 3명 미만인 팀은 애초에 후보가 아니다 — DB 에서 걸러 창을 낭비하지 않는다.
    expect(args.where.memberCount).toEqual({ gte: 3 });
  });

  // alpha 에서 13개 대회 생성이 전부 "사용 가능 1팀"으로 실패했다: 후보를 오래된 팀 순으로
  // teamCount*4 개만 가져오는데 그 범위가 실사용자 팀으로 가득 차서, 정작 전원이 테스트
  // 계정인 QA 스쿼드 팀들이 후보에 들지도 못했다. 필터는 DB 쿼리 단계에 있어야 한다.
  it('테스트 계정 팀 조건을 DB where 에서 건다', async () => {
    const { service, prisma } = makeWorld(4);
    await service.createTournament(user, { format: 'league', teamCount: 4 });

    const where = prisma.v1Team.findMany.mock.calls[0][0].where as {
      memberships?: { every?: { user?: { email?: { endsWith?: string } } } };
    };
    expect(where.memberships?.every?.user?.email?.endsWith).toBe('@teameet.test');
  });

  // alpha 에는 실사용자 팀(대행FC 등)이 섞여 있다. 목업 대회가 그 팀을 끌어들이면
  // 실제 사용자 마이페이지에 가짜 대회가 뜨고 후기 대상까지 된다 — 통째로 제외해야 한다.
  it('실사용자가 한 명이라도 섞인 팀은 쓰지 않는다', async () => {
    const { service, prisma } = makeWorld(4);
    const teams = await prisma.v1Team.findMany();
    teams[0].memberships[1].user.email = 'real.person@gmail.com';
    prisma.v1Team.findMany.mockResolvedValue(teams);

    // 4팀이 필요한데 하나가 실사용자 팀이라 3팀만 남는다 → 반쪽 대회를 만들지 않고 실패한다.
    await expect(service.createTournament(user, { format: 'league', teamCount: 4 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // jerseyNumber 와 같은 종류의 두 번째 결함: 닉네임을 V1User 에서 고르려 했는데 실제로는
  // V1UserProfile 에 있다. select 도 payload 와 같은 방식으로 스키마에 대조한다.
  it('팀 조회 select 의 모든 경로가 schema.prisma 에 실재한다', async () => {
    const { service, prisma } = makeWorld();
    await service.createTournament(user, { format: 'league', teamCount: 4 });

    const select = prisma.v1Team.findMany.mock.calls[0][0].select as Record<string, unknown>;
    const models = parseSchemaModels();
    expect(models.get('V1Team')?.has('memberships')).toBe(true); // 파서가 망가지면 여기서 먼저 깨진다

    expect(unknownSelectFields(models, 'V1Team', select)).toEqual([]);
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
