import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

jest.setTimeout(180000);
describe('리그 기본 정보 — 실제 HTTP/DB', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'league-settings');
  });
  afterAll(async () => cleanup?.());
  const path = (id: string) => `/api/v1/admin/league-matches/${id}/settings`;
  const get = (id: string, user?: string) => request(app.getHttpServer()).get(path(id)).set('x-v1-user-id', user ?? h.adminUserId);
  const patch = (id: string, body: object, user?: string) => request(app.getHttpServer()).patch(path(id)).set('x-v1-user-id', user ?? h.adminUserId).send(body);
  async function snapshot(id: string) {
    const res = await get(id);
    expect(res.status).toBe(200);
    const { title, rulesText, regionId, startsOn, endsOn, registrationDeadlineAt, updatedAt } = res.body.data;
    return { title, rulesText, regionId, startsOn, endsOn, registrationDeadlineAt, expectedUpdatedAt: updatedAt };
  }
  it('저장·재조회·공개 안내·audit를 같은 리그에 반영하고 이전 버전 저장을 막는다', async () => {
    const id = await h.makeLeague();
    const original = await snapshot(id);
    const body = { ...original, title: '수정된 가을 리그', rulesText: '첫 줄 운영 안내\n두 번째 줄',
      startsOn: '2098-01-01T00:00:00+09:00', endsOn: '2098-12-31T23:59:59+09:00', registrationDeadlineAt: '2098-01-01T00:00:00+09:00' };
    const saved = await patch(id, body);
    expect(saved.status).toBe(200);
    expect((await get(id)).body.data).toMatchObject({ title: body.title, rulesText: body.rulesText, startsOn: '2097-12-31T15:00:00.000Z' });
    expect(await h.prisma.v1Tournament.findUnique({ where: { id } })).toMatchObject({ title: body.title, rulesText: body.rulesText });
    const audit = await h.prisma.v1AdminActionLog.findFirstOrThrow({ where: { targetId: id, action: 'league_match.update_settings' } });
    expect(audit.beforeJson).toMatchObject({ title: original.title });
    expect(audit.afterJson).toMatchObject({ title: body.title });
    const publicView = await request(app.getHttpServer()).get(`/api/v1/league-matches/${id}`);
    expect(publicView.status).toBe(200);
    expect(publicView.body.data.rulesText).toBe(body.rulesText);
    expect(publicView.body.data.registrationOpen).toBe(true);
    const stale = await patch(id, { ...body, title: '오래된 화면' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('LEAGUE_SETTINGS_STALE');
    expect(await h.prisma.v1AdminActionLog.count({ where: { targetId: id, action: 'league_match.update_settings' } })).toBe(1);
    const close = await patch(id, { ...await snapshot(id), registrationDeadlineAt: null });
    expect(close.status).toBe(200);
    expect((await request(app.getHttpServer()).get(`/api/v1/league-matches/${id}`)).body.data.registrationOpen).toBe(false);
  });
  it('실제 권한, kind, 종료 상태와 DTO whitelist를 검사한다', async () => {
    const id = await h.makeLeague();
    const support = await h.makeAdmin('support');
    const body = await snapshot(id);
    expect((await get(id, support)).status).toBe(200);
    expect((await patch(id, { ...body, title: '불가' }, support)).status).toBe(403);
    expect((await request(app.getHttpServer()).get(path(id))).status).toBe(401);
    for (const extra of [{ title: '   ' }, { uiOnly: true }, { registrationDeadlineAt: 'not-a-date' }, { expectedUpdatedAt: null }]) {
      expect((await patch(id, { ...body, ...extra })).status).toBe(400);
    }
    await h.prisma.v1Tournament.update({ where: { id }, data: { kind: 'regular_tournament' } });
    expect((await get(id)).status).toBe(404);
    await h.prisma.v1Tournament.update({ where: { id }, data: { kind: 'regular_league', status: 'completed' } });
    const ended = await patch(id, await snapshot(id));
    expect(ended.status).toBe(409);
    expect(ended.body.code).toBe('LEAGUE_ENDED');
  });
  it('기간 역전·기존 경기 배제·지난 마감 변경을 거절하고 실패는 저장/audit하지 않는다', async () => {
    const id = await h.makeLeague();
    await h.prisma.v1Tournament.update({ where: { id }, data: { scheduledAt: new Date('2098-01-01T00:00:00Z'), scheduledEndAt: new Date('2098-12-31T00:00:00Z') } });
    await h.createFixture(id, { startAt: new Date('2098-06-01T00:00:00Z') });
    const body = await snapshot(id);
    const cases = [
      [{ startsOn: '2099-01-01T00:00:00Z' }, 'LEAGUE_PERIOD_INVALID', 422],
      [{ endsOn: '2098-02-01T00:00:00Z' }, 'LEAGUE_FIXTURES_OUTSIDE_PERIOD', 409],
      [{ registrationDeadlineAt: '2000-01-01T00:00:00Z' }, 'LEAGUE_REGISTRATION_DEADLINE_PAST', 422],
      [{ regionId: 'missing-district' }, 'LEAGUE_REGION_INVALID', 422],
    ] as const;
    for (const [changes, code, status] of cases) {
      const res = await patch(id, { ...body, title: '저장되면 안 됨', ...changes });
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
    }
    expect((await get(id)).body.data.title).toBe(body.title);
    expect(await h.prisma.v1AdminActionLog.count({ where: { targetId: id } })).toBe(0);
    expect((await patch(id, { ...body, title: '기간은 유지하고 이름만 변경' })).status).toBe(200);
  });
});
