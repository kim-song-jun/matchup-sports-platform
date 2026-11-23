import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  ALPHA_QA_SQUAD_MEMBERS_PER_TEAM,
  ALPHA_QA_SQUAD_TEAM_COUNT,
  seedAlphaQaSquads,
} from '../../prisma/seed-alpha-qa-squads';

const prisma = new PrismaService();
const seedFlag = process.env.V1_ALPHA_QA_SEED;
const PASSWORD_SOURCE_EMAIL = 'alpha.e2e.captain.a@teameet.test';
const PASSWORD_HASH = 'hash-copied-to-every-squad-account';
const TRANSACTION_OPTIONS = { timeout: 15_000 } as const;
const SQUAD_EMAIL_PREFIX = 'alpha.qa.t';
const SQUAD_TEAM_NAME_PREFIX = '(테스트) QA 스쿼드';
// 5번 팀 3번 선수의 휴대폰 번호(`0102` + 팀 2자리 + 선수 2자리 + `000`).
const TEAM5_PLAYER3_PHONE = '01020503000';

let sportId: string;
let regionId: string;

async function squadCounts() {
  const [users, teams, memberships] = await Promise.all([
    prisma.v1User.count({ where: { email: { startsWith: SQUAD_EMAIL_PREFIX } } }),
    prisma.v1Team.count({ where: { name: { startsWith: SQUAD_TEAM_NAME_PREFIX } } }),
    prisma.v1TeamMembership.count({ where: { team: { name: { startsWith: SQUAD_TEAM_NAME_PREFIX } } } }),
  ]);
  return { users, teams, memberships };
}

describe('alpha QA 스쿼드 시드(팀 10 × 선수 10)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    const run = randomUUID().slice(0, 8);
    const sport = await prisma.v1Sport.create({ data: { code: `squad-seed-futsal-${run}`, name: '풋살' } });
    const region = await prisma.v1Region.create({ data: { code: `squad-seed-region-${run}`, name: '시드 지역', level: 1 } });
    sportId = sport.id;
    regionId = region.id;
    const source = await prisma.v1User.create({
      data: { email: PASSWORD_SOURCE_EMAIL, accountStatus: 'active', onboardingStatus: 'completed' },
    });
    await prisma.v1AuthIdentity.create({
      data: {
        userId: source.id,
        provider: 'email',
        providerUserKey: PASSWORD_SOURCE_EMAIL,
        email: PASSWORD_SOURCE_EMAIL,
        passwordHash: PASSWORD_HASH,
        status: 'active',
      },
    });
    process.env.V1_ALPHA_QA_SEED = 'true';
  });

  afterAll(async () => {
    if (seedFlag === undefined) delete process.env.V1_ALPHA_QA_SEED;
    else process.env.V1_ALPHA_QA_SEED = seedFlag;
    await prisma.$disconnect();
  });

  it('팀마다 트랜잭션을 나눠 커밋해, 중간 팀이 실패해도 앞 팀은 남고 실패한 팀은 통째로 되돌려지며 다시 돌리면 이어서 끝난다', async () => {
    const squadCount = ALPHA_QA_SQUAD_TEAM_COUNT * ALPHA_QA_SQUAD_MEMBERS_PER_TEAM;
    // 5번 팀 3번 선수의 번호를 다른 계정이 쥐고 있으면 그 팀 트랜잭션의 세 번째 user upsert 가 실패한다.
    const squatter = await prisma.v1User.create({ data: { email: 'phone-squatter@teameet.test', phone: TEAM5_PLAYER3_PHONE } });

    await expect(seedAlphaQaSquads(prisma, sportId, regionId, TRANSACTION_OPTIONS)).rejects.toThrow();

    expect(await squadCounts()).toEqual({ users: 4 * ALPHA_QA_SQUAD_MEMBERS_PER_TEAM, teams: 4, memberships: 4 * ALPHA_QA_SQUAD_MEMBERS_PER_TEAM });
    // 실패한 5번 팀은 앞서 만든 선수 1·2번까지 함께 사라진다.
    expect(await prisma.v1User.count({ where: { email: { startsWith: `${SQUAD_EMAIL_PREFIX}05.` } } })).toBe(0);

    await prisma.v1User.delete({ where: { id: squatter.id } });
    await expect(seedAlphaQaSquads(prisma, sportId, regionId, TRANSACTION_OPTIONS)).resolves.toEqual({
      teams: ALPHA_QA_SQUAD_TEAM_COUNT,
      users: squadCount,
    });
    expect(await squadCounts()).toEqual({ users: squadCount, teams: ALPHA_QA_SQUAD_TEAM_COUNT, memberships: squadCount });
  });

  it('역할 구성·팀원 수·비밀번호 출처를 맞추고 다시 돌려도 행이 늘지 않는다', async () => {
    const squadCount = ALPHA_QA_SQUAD_TEAM_COUNT * ALPHA_QA_SQUAD_MEMBERS_PER_TEAM;
    await seedAlphaQaSquads(prisma, sportId, regionId, TRANSACTION_OPTIONS);

    expect(await squadCounts()).toEqual({ users: squadCount, teams: ALPHA_QA_SQUAD_TEAM_COUNT, memberships: squadCount });
    const roles = await prisma.v1TeamMembership.groupBy({
      by: ['role'],
      where: { team: { name: { startsWith: SQUAD_TEAM_NAME_PREFIX } } },
      _count: { _all: true },
    });
    expect(Object.fromEntries(roles.map((row) => [row.role, row._count._all]))).toEqual({
      owner: ALPHA_QA_SQUAD_TEAM_COUNT,
      manager: ALPHA_QA_SQUAD_TEAM_COUNT,
      member: ALPHA_QA_SQUAD_TEAM_COUNT * (ALPHA_QA_SQUAD_MEMBERS_PER_TEAM - 2),
    });
    const teams = await prisma.v1Team.findMany({ where: { name: { startsWith: SQUAD_TEAM_NAME_PREFIX } } });
    expect(teams.every((team) => team.memberCount === ALPHA_QA_SQUAD_MEMBERS_PER_TEAM && team.managerCount === 1)).toBe(true);
    const identities = await prisma.v1AuthIdentity.findMany({
      where: { providerUserKey: { startsWith: SQUAD_EMAIL_PREFIX } },
      select: { passwordHash: true },
    });
    expect(identities).toHaveLength(squadCount);
    expect(identities.every((identity) => identity.passwordHash === PASSWORD_HASH)).toBe(true);

    await seedAlphaQaSquads(prisma, sportId, regionId, TRANSACTION_OPTIONS);
    expect(await squadCounts()).toEqual({ users: squadCount, teams: ALPHA_QA_SQUAD_TEAM_COUNT, memberships: squadCount });
    expect((await prisma.v1Team.findMany({ where: { name: { startsWith: SQUAD_TEAM_NAME_PREFIX } } })).every((team) => team.memberCount === ALPHA_QA_SQUAD_MEMBERS_PER_TEAM)).toBe(true);
  });
});
