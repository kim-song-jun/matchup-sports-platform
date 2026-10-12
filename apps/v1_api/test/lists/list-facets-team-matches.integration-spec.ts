import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { KST_TODAY_FIXTURE_TIMEOUT_MS, startAtLaterTodayKst } from './kst-today-fixture';

const DAY = 24 * 60 * 60 * 1000;
const host = randomUUID();

describe('팀 매치 목록 totalCount·facets HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  let sportA: string;
  let sportB: string;
  let regionId: string;
  let teamId: string;

  const list = async (params: Record<string, string | number | boolean> = {}) => {
    const response = await request(app.getHttpServer()).get('/api/v1/team-matches').query({ regionId, limit: 50, includeFacets: true, ...params }).expect(200);
    return response.body.data as {
      items: Array<{ teamMatchId: string; status: string; displayState: string }>;
      pageInfo: { totalCount?: number; nextCursor: string | null };
      facets?: { sports: Array<{ sportId: string; count: number }>; today: number; recruiting: number };
    };
  };
  const row = (sportId: string, over: Partial<Prisma.V1TeamMatchCreateManyInput> = {}): Prisma.V1TeamMatchCreateManyInput => ({
    platformManaged: true, createdByUserId: host, sportId, regionId, title: '건수 검증', placeName: '서울 운동장',
    startAt: new Date(Date.now() + 3 * DAY), ...over,
  });

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    await db.v1User.create({ data: { id: host, email: `${host}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
    sportA = (await db.v1Sport.create({ data: { code: `facet-a-${host}`, name: '풋살' } })).id;
    sportB = (await db.v1Sport.create({ data: { code: `facet-b-${host}`, name: '러닝' } })).id;
    regionId = (await db.v1Region.create({ data: { code: `facet-${host}`, name: '건수 지역', level: 2 } })).id;

    teamId = (await db.v1Team.create({ data: { ownerUserId: host, sportId: sportA, regionId, name: `보관팀-${host.slice(0, 8)}`, status: 'archived' } })).id;
    const laterToday = await startAtLaterTodayKst();
    await db.v1TeamMatch.createMany({
      data: [
        row(sportA, { startAt: laterToday }), // A 모집 중, KST 오늘 안에 아직 시작 전(유일한 오늘 경기)
        row(sportA), // A 모집 중
        row(sportA, { status: 'closed' }), // A 마감: 목록·종목 건수엔 포함, 모집 중 건수엔 제외
        row(sportA, { deletedAt: new Date() }), // 삭제: 어디에도 안 셈
        row(sportA, { status: 'cancelled' }), // 취소: 기본 목록에 없으므로 안 셈
        row(sportA, { platformManaged: false, hostTeamId: teamId }), // 보관된 호스트 팀: 공개 목록에서 가려지므로 안 셈
        row(sportB), // B 모집 중
        row(sportB, { deadlineAt: new Date(Date.now() - 1000) }), // B 마감 시각 지남: 목록엔 있고 모집 중 건수엔 제외
      ],
    });
  }, KST_TODAY_FIXTURE_TIMEOUT_MS);

  afterAll(async () => {
    await db.v1TeamMatch.deleteMany({ where: { createdByUserId: host } });
    await db.v1Team.delete({ where: { id: teamId } });
    await db.v1User.delete({ where: { id: host } });
    await db.v1Region.delete({ where: { id: regionId } });
    await db.v1Sport.deleteMany({ where: { id: { in: [sportA, sportB] } } });
    await cleanup?.();
  });

  it('필터 없는 첫 페이지: 전체 건수는 보이는 목록 크기와 같고, 삭제·취소는 어떤 건수에도 없다', async () => {
    const body = await list();

    expect(body.items).toHaveLength(5);
    expect(body.pageInfo.totalCount).toBe(5);
    expect(body.facets?.sports).toEqual([{ sportId: sportA, count: 3 }, { sportId: sportB, count: 2 }]);
    expect(body.facets?.today).toBe(1);
    expect(body.facets?.recruiting).toBe(3);
  });

  it('종목 필터: 전체 건수는 그 종목만 세지만 다른 종목 칩 건수는 그대로 남는다', async () => {
    const body = await list({ sportId: sportB });

    expect(body.items).toHaveLength(2);
    expect(body.pageInfo.totalCount).toBe(2);
    expect(body.facets?.sports).toEqual([{ sportId: sportA, count: 3 }, { sportId: sportB, count: 2 }]);
    expect(body.facets?.recruiting).toBe(1); // 종목 B 중 마감 시각이 지나지 않은 모집 중
    expect(body.facets?.today).toBe(0); // 오늘 시작하는 경기는 종목 A 뿐
  });

  it('모집 중 토글: 목록·전체 건수·종목 건수는 줄고, 모집 중 칩 건수는 토글 유무와 같다', async () => {
    const body = await list({ recruitingOnly: true });

    expect(body.items).toHaveLength(3);
    expect(body.pageInfo.totalCount).toBe(3);
    expect(body.facets?.sports).toEqual([{ sportId: sportA, count: 2 }, { sportId: sportB, count: 1 }]);
    expect(body.facets?.recruiting).toBe(3);
    expect(body.facets?.today).toBe(1);
  });

  it('오늘 토글: 오늘 시작하지 않는 경기는 빠지고 오늘 칩 건수는 토글 전(오늘 경기 수)이다', async () => {
    const body = await list({ today: true });

    expect(body.pageInfo.totalCount).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.facets?.today).toBe(1);
    expect(body.facets?.recruiting).toBe(1);
  });

  it('kind=friendly 도 같은 where 를 쓴다: 일반 팀 매치 5건 전부가 세어진다', async () => {
    const body = await list({ kind: 'friendly' });

    expect(body.pageInfo.totalCount).toBe(5);
    expect(body.items).toHaveLength(5);
    const competition = await list({ kind: 'competition' });
    expect(competition.pageInfo.totalCount).toBe(0);
    expect(competition.facets?.sports).toEqual([]);
  });

  it('다음 페이지는 건수를 싣지 않고, 첫 페이지 건수는 limit 과 무관하게 전체 크기다', async () => {
    const first = await list({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.pageInfo.totalCount).toBe(5);

    const second = await list({ limit: 2, cursor: first.pageInfo.nextCursor! });
    expect(second.pageInfo).not.toHaveProperty('totalCount');
    expect(second).not.toHaveProperty('facets');
  });

  it('includeFacets 를 요청하지 않으면 건수를 싣지 않는다(폴링·부가 조회 경로)', async () => {
    const body = await list({ includeFacets: false });

    expect(body.items).toHaveLength(5);
    expect(body.pageInfo).not.toHaveProperty('totalCount');
    expect(body).not.toHaveProperty('facets');
  });

  it('잘못된 토글 값은 400 이다', async () => {
    await request(app.getHttpServer()).get('/api/v1/team-matches').query({ today: 'yes' }).expect(400);
  });

  it('deadlineAt 만료는 검색·closed 필터에 포함되고 recruiting 필터에서는 제외된다', async () => {
    const futureMatchId = randomUUID();
    const startedMatchId = randomUUID();
    const title = `마감 자동 처리 ${futureMatchId}`;
    const exactCutoff = new Date();
    await db.v1TeamMatch.createMany({
      data: [
        row(sportA, {
          id: futureMatchId,
          title,
          status: 'recruiting',
          deadlineAt: exactCutoff,
          startAt: new Date(Date.now() + DAY),
        }),
        row(sportA, {
          id: startedMatchId,
          title,
          status: 'recruiting',
          deadlineAt: new Date(exactCutoff.getTime() - DAY),
          startAt: new Date(exactCutoff.getTime() - 1000),
        }),
      ],
    });

    try {
      const closed = await list({ status: 'closed', query: title, includeFacets: false });
      expect(closed.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ teamMatchId: futureMatchId, status: 'closed', displayState: 'closed' }),
        expect.objectContaining({ teamMatchId: startedMatchId, status: 'closed', displayState: 'closed' }),
      ]));

      const recruiting = await list({ status: 'recruiting', query: title, includeFacets: false });
      expect(recruiting.items).toEqual([]);
      const available = await list({ recruitingOnly: true, query: title, includeFacets: false });
      expect(available.items).toEqual([]);
      const recommended = await list({ sort: 'recommended', query: title, includeFacets: false });
      expect(recommended.items).toEqual([]);

      for (const id of [futureMatchId, startedMatchId]) {
        const detail = await request(app.getHttpServer()).get(`/api/v1/team-matches/${id}`).expect(200);
        expect(detail.body.data).toEqual(expect.objectContaining({ status: 'closed', displayState: 'closed' }));
      }
    } finally {
      await db.v1TeamMatch.deleteMany({ where: { id: { in: [futureMatchId, startedMatchId] } } });
    }
  });

  it('GET /me/team-matches의 closed/recruiting 필터는 만료 deadline의 파생 상태와 일치한다', async () => {
    const expiredTitle = `내 팀매치 만료 ${host}`;
    const activeTitle = `내 팀매치 모집 ${host}`;
    const manuallyClosedTitle = `내 팀매치 수동 마감 ${host}`;
    const cancelledTitle = `내 팀매치 취소 ${host}`;
    const matchedTitle = `내 팀매치 상대 확정 ${host}`;
    await db.v1TeamMatch.createMany({
      data: [
        row(sportA, { title: expiredTitle, deadlineAt: new Date(Date.now() - 60_000) }),
        row(sportA, { title: activeTitle, deadlineAt: new Date(Date.now() + DAY) }),
        row(sportA, { title: manuallyClosedTitle, status: 'closed', deadlineAt: new Date(Date.now() + DAY) }),
        row(sportA, { title: cancelledTitle, status: 'cancelled', deadlineAt: new Date(Date.now() + DAY) }),
        row(sportA, { title: matchedTitle, status: 'matched', approvedApplicantTeamId: teamId, deadlineAt: new Date(Date.now() + DAY) }),
      ],
    });

    try {
      const readMine = async (status: 'closed' | 'recruiting') => request(app.getHttpServer())
        .get('/api/v1/me/team-matches')
        .set('x-v1-user-id', host)
        .query({ scope: 'created', status, limit: 50 })
        .expect(200);
      const [closed, recruiting] = await Promise.all([readMine('closed'), readMine('recruiting')]);
      const ourItems = (response: request.Response) => response.body.data.items.filter(
        (item: { title: string }) => [expiredTitle, activeTitle, manuallyClosedTitle, cancelledTitle, matchedTitle].includes(item.title),
      );
      expect(ourItems(closed)).toEqual(expect.arrayContaining([
        expect.objectContaining({ title: expiredTitle, status: 'closed', displayState: 'closed' }),
        expect.objectContaining({ title: manuallyClosedTitle, status: 'closed' }),
      ]));
      expect(ourItems(closed)).toHaveLength(2);
      expect(ourItems(recruiting)).toEqual([expect.objectContaining({ title: activeTitle, status: 'recruiting' })]);
      expect(ourItems(recruiting)).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ title: manuallyClosedTitle }),
        expect.objectContaining({ title: cancelledTitle }),
        expect.objectContaining({ title: matchedTitle }),
      ]));
      expect(ourItems(closed)).not.toEqual(expect.arrayContaining([expect.objectContaining({ title: matchedTitle })]));
    } finally {
      await db.v1TeamMatch.deleteMany({ where: { createdByUserId: host, title: { in: [expiredTitle, activeTitle, manuallyClosedTitle, cancelledTitle, matchedTitle] } } });
    }
  });
});
