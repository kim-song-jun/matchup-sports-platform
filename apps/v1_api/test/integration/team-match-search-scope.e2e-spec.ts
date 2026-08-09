import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { TeamMatchesQueryDto } from '../../src/team-matches/dto/team-matches-query.dto';
import { TeamMatchesService } from '../../src/team-matches/team-matches.service';
import { createV1IntegrationApp } from './integration-app';

/**
 * 팀매칭 검색이 **검색창 placeholder 가 약속한 범위**를 실제로 훑는지 확인한다.
 *
 * placeholder 는 "지역, 팀 이름, 경기조건 검색"이라고 적혀 있는데 서버 쿼리는
 * title/description/placeName 만 보고 있었다. 그래서 alpha 에서 실제로 존재하는 경기를
 * 팀 이름(`Testttt`)이나 지역명(`동구`)으로 찾으면 0건이 나왔다.
 *
 * 이 테스트는 쿼리 구조를 되읊지 않는다 — 실 DB 에 팀·지역·경기를 심고 **검색 결과에
 * 그 경기가 들어오는지**만 본다. hostTeam/region 조건을 서비스에서 빼면 정확히 실패한다.
 */
const userId = 'integration-tm-search-user';
const sportId = 'integration-tm-search-sport';
const regionId = 'integration-tm-search-region';
const teamId = 'integration-tm-search-team';
const teamMatchId = 'integration-tm-search-match';

// 다른 픽스처와 절대 겹치지 않도록 검색어를 고유하게 만든다 — 그래야 "1건"이 이 경기임을 보장한다.
const TEAM_NAME = 'Zzqx검색팀';
const REGION_NAME = 'Zzqx검색구';
const TITLE = 'Zzqx검색제목';

describe('Team match search scope integration contract', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let service: TeamMatchesService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    service = app.get(TeamMatchesService);
    await cleanupFixtures();
    await seed();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupApp?.();
  });

  async function cleanupFixtures() {
    if (!prisma) return;
    await prisma.v1TeamMatch.deleteMany({ where: { id: teamMatchId } });
    await prisma.v1Team.deleteMany({ where: { id: teamId } });
    await prisma.v1Region.deleteMany({ where: { id: regionId } });
    await prisma.v1Sport.deleteMany({ where: { id: sportId } });
    await prisma.v1User.deleteMany({ where: { id: userId } });
  }

  async function seed() {
    await prisma.v1User.create({
      data: { id: userId, email: 'tm-search-scope@integration.test', onboardingStatus: 'completed' },
    });
    await prisma.v1Sport.create({
      data: { id: sportId, code: 'integration-tm-search', name: 'Integration TM Search' },
    });
    await prisma.v1Region.create({
      data: { id: regionId, code: 'integration-tm-search-region', name: REGION_NAME, level: 1 },
    });
    await prisma.v1Team.create({
      data: { id: teamId, ownerUserId: userId, sportId, regionId, name: TEAM_NAME },
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: teamMatchId,
        hostTeamId: teamId,
        createdByUserId: userId,
        sportId,
        regionId,
        title: TITLE,
        // 검색어와 겹치지 않는 장소명 — 그래야 팀명·지역 매칭이 placeName 덕에 통과하는
        // 착시를 만들지 않는다.
        placeName: '통합테스트장소',
        startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async function searchIds(query: string): Promise<string[]> {
    const result = await service.list(null, { query } as TeamMatchesQueryDto);
    return result.items.map((item) => item.teamMatchId);
  }

  it('finds the match by host team name — the placeholder promises 팀 이름', async () => {
    expect(await searchIds(TEAM_NAME)).toContain(teamMatchId);
  });

  it('finds the match by region name — the placeholder promises 지역', async () => {
    expect(await searchIds(REGION_NAME)).toContain(teamMatchId);
  });

  it('still finds the match by title', async () => {
    expect(await searchIds(TITLE)).toContain(teamMatchId);
  });

  it('does not return the match for an unrelated query', async () => {
    // 넓힌 OR 가 조건 없이 전부 통과시키는 형태로 잘못 짜였는지 잡는 대조군.
    expect(await searchIds('Zzqx없는검색어')).not.toContain(teamMatchId);
  });
});
