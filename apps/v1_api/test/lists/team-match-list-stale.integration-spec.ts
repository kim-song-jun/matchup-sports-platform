import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Prisma, V1GameState } from '@prisma/client';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { FUTSAL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config.presets';
import { competitionConfigContentHash } from '../../src/tournaments/competition-config/competition-config.validator';
import { createV1IntegrationApp } from '../integration/integration-app';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const host = randomUUID();

/**
 * 일반 팀매치 공개 목록: 끝날 시각이 지나도록 시작하지 않은 상대 확정 경기와 경기 기록이 취소된 경기는 숨기고,
 * 진행 중·일시중지·종료(결과 대기) 경기와 아직 끝날 시각 전인 경기는 그대로 보인다.
 */
describe('팀매치 공개 목록 — 지난·취소 경기 정리', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  let sportId: string;
  let regionId: string;
  let configId: string;
  const ids: Record<string, string> = {};

  const list = async (params: Record<string, string | number | boolean> = {}) => {
    const response = await request(app.getHttpServer()).get('/api/v1/team-matches').query({ regionId, limit: 50, includeFacets: true, ...params }).expect(200);
    return response.body.data as { items: Array<{ teamMatchId: string }>; pageInfo: { totalCount?: number } };
  };
  const make = async (key: string, game: V1GameState | null, over: Partial<Prisma.V1TeamMatchCreateManyInput>) => {
    const id = randomUUID();
    ids[key] = id;
    await db.v1TeamMatch.create({ data: {
      id, platformManaged: true, createdByUserId: host, sportId, regionId, title: key, placeName: '서울 운동장', status: 'matched', ...over,
    } as Prisma.V1TeamMatchUncheckedCreateInput });
    if (game) await db.v1Game.create({ data: { teamMatchId: id, sourceType: 'TEAM_MATCH', competitionConfigVersionId: configId, state: game } });
  };

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    await db.v1User.create({ data: { id: host, email: `${host}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
    sportId = (await db.v1Sport.create({ data: { code: `stale-${host}`, name: '풋살' } })).id;
    regionId = (await db.v1Region.create({ data: { code: `stale-${host}`, name: '정리 지역', level: 2 } })).id;
    const hash = competitionConfigContentHash(FUTSAL_V1_CONFIG);
    configId = (await db.v1CompetitionConfigVersion.upsert({ where: { contentHash: hash }, update: {}, create: {
      sportCode: 'futsal', name: 'futsal-v1', version: 1, contentHash: hash, ...JSON.parse(JSON.stringify(FUTSAL_V1_CONFIG)),
    } })).id;
    const now = Date.now();
    const past = { startAt: new Date(now - 3 * 60 * MIN), endAt: new Date(now - 90 * MIN) };
    const future = { startAt: new Date(now + 2 * DAY), endAt: new Date(now + 2 * DAY + 90 * MIN) };
    await make('notStarted', 'SCHEDULED', past);
    await make('notStartedNoEnd', 'SCHEDULED', { startAt: past.startAt, endAt: null });
    await make('noGame', null, past);
    await make('beforeEnd', 'SCHEDULED', { startAt: new Date(now - 30 * MIN), endAt: new Date(now + 60 * MIN) });
    await make('live', 'LIVE', past);
    await make('paused', 'PAUSED', past);
    await make('ended', 'ENDED', past);
    await make('cancelledGame', 'CANCELLED', future);
    await make('cancelledGameRecruiting', 'CANCELLED', { ...future, status: 'recruiting' });
    await make('upcoming', 'SCHEDULED', future);
  });

  afterAll(async () => {
    await db.v1Game.deleteMany({ where: { teamMatchId: { in: Object.values(ids) } } });
    await db.v1TeamMatch.deleteMany({ where: { createdByUserId: host } });
    await db.v1User.delete({ where: { id: host } });
    await db.v1Region.delete({ where: { id: regionId } });
    await db.v1Sport.delete({ where: { id: sportId } });
    await cleanup?.();
  });

  const visible = ['beforeEnd', 'live', 'paused', 'ended', 'upcoming'];
  const hidden = ['notStarted', 'notStartedNoEnd', 'noGame', 'cancelledGame', 'cancelledGameRecruiting'];

  it.each([[{}], [{ sort: 'recommended' }], [{ sort: 'latest' }]])('목록 %j — 진행 중·결과 대기는 남기고 시작 안 한 지난 경기·취소 경기는 뺀다', async (params) => {
    const body = await list(params);
    const shown = body.items.map((item) => item.teamMatchId);
    for (const key of visible) expect({ key, shown: shown.includes(ids[key]) }).toEqual({ key, shown: true });
    for (const key of hidden) expect({ key, shown: shown.includes(ids[key]) }).toEqual({ key, shown: false });
    expect(body.pageInfo.totalCount).toBe(shown.length);
  });

  it('모집 중 필터(팀 상세 열린 매치)도 경기 기록이 취소된 매치를 보이지 않는다', async () => {
    const shown = (await list({ status: 'recruiting' })).items.map((item) => item.teamMatchId);
    expect(shown).not.toContain(ids.cancelledGameRecruiting);
  });

  it('숨겨도 상세 주소는 그대로 열린다', async () => {
    await request(app.getHttpServer()).get(`/api/v1/team-matches/${ids.notStarted}`).expect(200);
  });
});
