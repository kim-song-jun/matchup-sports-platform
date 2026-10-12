import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const owner = randomUUID();

describe('팀 목록 totalCount·facets HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  let sportA: string;
  let sportB: string;
  let regionId: string;

  const list = async (params: Record<string, string | number | boolean> = {}) => {
    const response = await request(app.getHttpServer()).get('/api/v1/teams').query({ regionId, limit: 50, includeFacets: true, ...params }).expect(200);
    return response.body.data as {
      items: Array<{ id: string }>;
      pageInfo: { totalCount?: number; nextCursor: string | null };
      facets?: { sports: Array<{ sportId: string; count: number }> };
    };
  };
  const team = (name: string, sportId: string, over: Record<string, unknown> = {}) =>
    db.v1Team.create({ data: { ownerUserId: owner, sportId, regionId, name: `${name}-${owner.slice(0, 8)}`, ...over } });

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    await db.v1User.create({ data: { id: owner, email: `${owner}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
    sportA = (await db.v1Sport.create({ data: { code: `team-facet-a-${owner}`, name: '풋살' } })).id;
    sportB = (await db.v1Sport.create({ data: { code: `team-facet-b-${owner}`, name: '러닝' } })).id;
    regionId = (await db.v1Region.create({ data: { code: `team-facet-${owner}`, name: '건수 지역', level: 2 } })).id;
    await team('가', sportA);
    await team('나', sportA, { joinPolicy: 'closed' });
    await team('다', sportB);
    await team('보관', sportA, { status: 'archived' }); // 공개 목록에 없으므로 안 셈
    await team('삭제', sportA, { deletedAt: new Date() }); // 삭제: 안 셈
  });

  afterAll(async () => {
    await db.v1Team.deleteMany({ where: { ownerUserId: owner } });
    await db.v1User.delete({ where: { id: owner } });
    await db.v1Region.delete({ where: { id: regionId } });
    await db.v1Sport.deleteMany({ where: { id: { in: [sportA, sportB] } } });
    await cleanup?.();
  });

  it('필터 없는 첫 페이지: 전체 건수는 보이는 목록 크기이고 보관·삭제 팀은 세지 않는다', async () => {
    const body = await list();

    expect(body.items).toHaveLength(3);
    expect(body.pageInfo.totalCount).toBe(3);
    expect(body.facets?.sports).toEqual([{ sportId: sportA, count: 2 }, { sportId: sportB, count: 1 }]);
  });

  it('종목 필터: 전체 건수는 그 종목만, 다른 종목 칩 건수는 그대로 남는다', async () => {
    const body = await list({ sportId: sportB });

    expect(body.items).toHaveLength(1);
    expect(body.pageInfo.totalCount).toBe(1);
    expect(body.facets?.sports).toEqual([{ sportId: sportA, count: 2 }, { sportId: sportB, count: 1 }]);
  });

  it('다른 필터(joinPolicy)는 종목 건수에도 적용된다', async () => {
    const body = await list({ joinPolicy: 'closed' });

    expect(body.pageInfo.totalCount).toBe(1);
    expect(body.facets?.sports).toEqual([{ sportId: sportA, count: 1 }]);
  });

  it('includeFacets 를 요청하지 않으면 건수를 싣지 않는다', async () => {
    const body = await list({ includeFacets: false });

    expect(body.items).toHaveLength(3);
    expect(body.pageInfo).not.toHaveProperty('totalCount');
    expect(body).not.toHaveProperty('facets');
  });

  it('다음 페이지는 건수를 싣지 않는다', async () => {
    const first = await list({ limit: 2 });
    expect(first.pageInfo.totalCount).toBe(3);

    const second = await list({ limit: 2, cursor: first.pageInfo.nextCursor! });
    expect(second.pageInfo).not.toHaveProperty('totalCount');
    expect(second).not.toHaveProperty('facets');
  });
});
