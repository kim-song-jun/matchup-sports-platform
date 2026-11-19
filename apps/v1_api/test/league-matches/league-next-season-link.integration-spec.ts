import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const suiteId = randomUUID().slice(0, 8);
const u = (name: string) => `next-season-link-${name}-${suiteId}`;

/**
 * 이미 따로 만든 두 독립 리그를 사후에 다음 시즌으로 잇고 푸는 길(2026-11-19, real DB).
 *
 * 유닛의 fake 로는 증명할 수 없는 것만 본다: 실제 행에 연결이 쓰이고 양쪽 어드민 상세가 서로를 가리키는지,
 * `previous_league_id` 유니크와 지난 시즌 보유 판정이 둘째 연결을 막는지, 순환 연결이 실제 체인에서 막히는지,
 * 후보 목록이 서버 판정과 같은 집합인지, 풀면 다시 이을 수 있는지, 감사 로그가 남는지.
 */
describe('이미 만든 리그를 다음 시즌으로 잇기', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;
  const admin = u('admin');

  const http = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) => req.set('x-v1-user-id', admin);
  const createLeague = async (title: string, status: 'closed' | 'in_progress' | 'completed' = 'completed') => {
    const res = await asAdmin(http().post('/api/v1/admin/league-matches')).send({
      title: `${title} ${suiteId}`, sportId, regionId, teamIds: [],
      startsOn: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      endsOn: new Date(Date.now() + 60 * 86_400_000).toISOString(),
    }).expect(201);
    const leagueId = res.body.data.leagueId as string;
    if (status !== 'closed') await prisma.v1Tournament.update({ where: { id: leagueId }, data: { status } });
    return leagueId;
  };
  const link = (previousId: string, nextLeagueId: string) =>
    asAdmin(http().post(`/api/v1/admin/league-matches/${previousId}/next-season/link`)).send({ nextLeagueId });
  const unlink = (previousId: string) => asAdmin(http().delete(`/api/v1/admin/league-matches/${previousId}/next-season/link`));
  const candidates = async (leagueId: string) =>
    ((await asAdmin(http().get(`/api/v1/admin/league-matches/${leagueId}/next-season/candidates`)).expect(200)).body.data.candidates as Array<{ leagueId: string }>)
      .map((candidate) => candidate.leagueId);
  const detail = async (leagueId: string) => (await asAdmin(http().get(`/api/v1/admin/league-matches/${leagueId}`)).expect(200)).body.data;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.create({
      data: {
        id: admin, email: `${admin}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed',
        phone: '01032000001', phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        profile: { create: { nickname: '연결어드민', realName: '연결어드민', birthDate: '1990-01-01', gender: 'male' } },
      },
    });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await terms.acceptSignupTerms(admin, required);
    await prisma.v1AdminUser.create({ data: { userId: admin, adminRole: 'owner' } });
    sportId = (await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } })).id;
    regionId = (await prisma.v1Region.create({ data: { code: `next-season-link-region-${suiteId}`, name: '연결 테스트 지역', level: 2 } })).id;
  });
  afterAll(async () => cleanup?.());

  let spring: string;
  let summer: string;
  let autumn: string;

  it('따로 만든 두 리그를 이으면 양쪽 상세가 서로를 가리키고 감사 로그가 남는다', async () => {
    spring = await createLeague('봄 리그');
    summer = await createLeague('여름 리그', 'closed');
    expect(await candidates(spring)).toContain(summer);

    const res = await link(spring, summer).expect(201);
    expect(res.body.data).toMatchObject({ leagueId: spring, nextSeason: { leagueId: summer } });

    expect((await detail(spring)).nextSeason).toEqual({ leagueId: summer, title: `여름 리그 ${suiteId}` });
    expect(await detail(summer)).toMatchObject({ previousSeason: { leagueId: spring, title: `봄 리그 ${suiteId}` } });
    const audit = await prisma.v1AdminActionLog.findFirstOrThrow({ where: { targetId: spring, action: 'league_match.link_next_season' } });
    expect(audit.afterJson).toMatchObject({ previousLeagueId: spring, nextLeagueId: summer });
    // 이은 뒤에는 후보에서 빠진다.
    expect(await candidates(spring)).not.toContain(summer);
  });

  it('한 리그에는 다음 시즌을 하나만, 한 리그는 지난 시즌을 하나만 잇는다', async () => {
    autumn = await createLeague('가을 리그', 'closed');
    const second = await link(spring, autumn).expect(409);
    expect(second.body.code).toBe('LEAGUE_NEXT_SEASON_EXISTS');

    const other = await createLeague('다른 봄 리그');
    const taken = await link(other, summer).expect(409);
    expect(taken.body.code).toBe('LEAGUE_PREVIOUS_SEASON_EXISTS');
  });

  it('자기 자신과 지난 시즌 쪽으로 거슬러 가는 연결은 거절하고 후보에도 넣지 않는다', async () => {
    await prisma.v1Tournament.update({ where: { id: summer }, data: { status: 'in_progress' } });
    const self = await link(summer, summer).expect(422);
    expect(self.body.code).toBe('LEAGUE_NEXT_SEASON_INVALID');
    expect(await candidates(summer)).not.toContain(spring);
    const cycle = await link(summer, spring).expect(422);
    expect(cycle.body.code).toBe('LEAGUE_NEXT_SEASON_INVALID');
    expect((await detail(spring)).previousSeason ?? null).toBeNull();
  });

  it('시작 전 리그나 다른 종목 리그는 잇지 못한다', async () => {
    const draft = await createLeague('시작 전 리그', 'closed');
    const early = await link(draft, autumn).expect(422);
    expect(early.body.code).toBe('LEAGUE_PREVIOUS_SEASON_INVALID');

    const soccer = await prisma.v1Sport.upsert({ where: { code: 'soccer' }, update: {}, create: { code: 'soccer', name: '축구' } });
    const otherSport = await createLeague('축구 리그', 'closed');
    await prisma.v1Tournament.update({ where: { id: otherSport }, data: { sportId: soccer.id } });
    expect(await candidates(summer)).not.toContain(otherSport);
    const mismatch = await link(summer, otherSport).expect(422);
    expect(mismatch.body.code).toBe('LEAGUE_PREVIOUS_SEASON_INVALID');
  });

  it('푸는 길: 연결을 풀면 지난 시즌이 비고 다시 이을 수 있다. 이은 게 없으면 거절한다', async () => {
    await unlink(spring).expect(200);
    expect((await detail(spring)).nextSeason ?? null).toBeNull();
    expect((await detail(summer)).previousSeason ?? null).toBeNull();
    const audit = await prisma.v1AdminActionLog.findFirstOrThrow({ where: { targetId: spring, action: 'league_match.unlink_next_season' } });
    expect(audit.beforeJson).toMatchObject({ previousLeagueId: spring, nextLeagueId: summer });

    const missing = await unlink(spring).expect(422);
    expect(missing.body.code).toBe('LEAGUE_NEXT_SEASON_MISSING');

    await link(spring, autumn).expect(201);
    expect((await detail(spring)).nextSeason).toMatchObject({ leagueId: autumn });
  });

  it('다음 시즌을 이은 리그는 리그 체계로 전환할 수 없다', async () => {
    const res = await asAdmin(http().post(`/api/v1/admin/league-matches/${spring}/series-conversion/preview`)).send({ tierSizes: [2] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LEAGUE_NEXT_SEASON_EXISTS');
  });
});
