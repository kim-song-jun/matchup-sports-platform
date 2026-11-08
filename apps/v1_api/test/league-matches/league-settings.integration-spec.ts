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
    const { title, rulesText, regionId, startsOn, endsOn, registrationDeadlineAt, plannedFixtureCount, updatedAt } = res.body.data;
    return { title, rulesText, regionId, startsOn, endsOn, registrationDeadlineAt, plannedFixtureCount, expectedUpdatedAt: updatedAt };
  }
  it('저장·재조회·공개 안내·audit를 같은 리그에 반영하고 이전 버전 저장을 막는다', async () => {
    const id = await h.makeLeague();
    const original = await snapshot(id);
    const body = { ...original, title: '수정된 가을 리그', rulesText: '첫 줄 운영 안내\n두 번째 줄',
      startsOn: '2098-01-01T00:00:00+09:00', endsOn: '2098-12-31T23:59:59+09:00',
      registrationDeadlineAt: '2098-01-01T00:00:00+09:00', plannedFixtureCount: 24 };
    const saved = await patch(id, body);
    expect(saved.status).toBe(200);
    expect((await get(id)).body.data).toMatchObject({ title: body.title, rulesText: body.rulesText, startsOn: '2097-12-31T15:00:00.000Z', plannedFixtureCount: 24 });
    expect(await h.prisma.v1Tournament.findUnique({ where: { id } })).toMatchObject({ title: body.title, rulesText: body.rulesText, plannedFixtureCount: 24 });
    const audit = await h.prisma.v1AdminActionLog.findFirstOrThrow({ where: { targetId: id, action: 'league_match.update_settings' } });
    expect(audit.beforeJson).toMatchObject({ title: original.title, plannedFixtureCount: original.plannedFixtureCount });
    expect(audit.afterJson).toMatchObject({ title: body.title, plannedFixtureCount: 24 });
    const publicView = await request(app.getHttpServer()).get(`/api/v1/league-matches/${id}`);
    expect(publicView.status).toBe(200);
    expect(publicView.body.data.rulesText).toBe(body.rulesText);
    // 2026-10-27: 마감을 정하는 것만으로는 열리지 않는다 — 대회처럼 '접수 시작하기'(open)가 연다.
    expect(publicView.body.data.registrationOpen).toBe(false);
    await h.prisma.v1Tournament.update({ where: { id }, data: { status: 'open' } });
    expect((await request(app.getHttpServer()).get(`/api/v1/league-matches/${id}`)).body.data.registrationOpen).toBe(true);
    const stale = await patch(id, { ...body, title: '오래된 화면' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('LEAGUE_SETTINGS_STALE');
    expect(await h.prisma.v1AdminActionLog.count({ where: { targetId: id, action: 'league_match.update_settings' } })).toBe(1);
    const cleared = await patch(id, { ...await snapshot(id), registrationDeadlineAt: null, plannedFixtureCount: null });
    expect(cleared.status).toBe(200);
    expect((await get(id)).body.data.plannedFixtureCount).toBeNull();
    // 마감을 비우면 '접수 마감하기'를 누를 때까지 받는다(대회와 같다).
    expect((await request(app.getHttpServer()).get(`/api/v1/league-matches/${id}`)).body.data.registrationOpen).toBe(true);
  });
  // 2026-11-03 사용자 요청: 리그도 만들 때 대회와 같은 성별을 고른다.
  it('생성 때 고른 성별을 저장해 설정·공개 상세에 싣고, 수정은 생략하면 유지하고 보내면 바꾼다', async () => {
    const http = () => request(app.getHttpServer());
    const base = { sportId: h.sportId, regionId: h.regionId, startsOn: '2098-01-01T00:00:00.000Z', endsOn: '2098-12-31T00:00:00.000Z', teamIds: [] };
    const invalid = await http().post('/api/v1/admin/league-matches').set('x-v1-user-id', h.adminUserId)
      .send({ ...base, title: `성별 오류 ${h.sportId}`, genderCategory: 'unknown' });
    expect(invalid.status).toBe(400);
    const created = await http().post('/api/v1/admin/league-matches').set('x-v1-user-id', h.adminUserId)
      .send({ ...base, title: `여성부 리그 ${h.sportId}`, genderCategory: 'female' });
    expect(created.status).toBe(201);
    const id = created.body.data.leagueId as string;
    expect(await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id } })).toMatchObject({ genderCategory: 'female' });
    const createAudit = await h.prisma.v1AdminActionLog.findFirstOrThrow({ where: { targetId: id, action: 'league_match.create' } });
    expect(createAudit.afterJson).toMatchObject({ genderCategory: 'female' });
    expect((await get(id)).body.data.genderCategory).toBe('female');
    expect((await http().get(`/api/v1/tournaments/${id}`).expect(200)).body.data.genderCategory).toBe('female');

    // 화면이 바꾸지 않은 성별을 생략해도 그대로 남는다.
    expect((await patch(id, { ...await snapshot(id), title: '여성부 리그 수정' })).status).toBe(200);
    expect((await get(id)).body.data.genderCategory).toBe('female');
    expect((await patch(id, { ...await snapshot(id), genderCategory: 'nope' })).status).toBe(400);
    const changed = await patch(id, { ...await snapshot(id), genderCategory: 'mixed' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.genderCategory).toBe('mixed');
    const audit = await h.prisma.v1AdminActionLog.findFirstOrThrow({ where: { targetId: id, action: 'league_match.update_settings' }, orderBy: { createdAt: 'desc' } });
    expect(audit.beforeJson).toMatchObject({ genderCategory: 'female' });
    expect(audit.afterJson).toMatchObject({ genderCategory: 'mixed' });

    // 성별을 받기 전 경로로 만든 리그는 null 이다.
    expect((await get(await h.makeLeague())).body.data.genderCategory).toBeNull();
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
  });
  it.each(['completed', 'cancelled'] as const)('%s 리그는 이름·설명·지역만 저장되고 기간·마감·경기 수·정원은 409 로 잠긴다', async (status) => {
    const id = await h.makeLeague();
    await h.prisma.v1Tournament.update({ where: { id }, data: { status } });
    const body = await snapshot(id);
    const saved = await patch(id, { ...body, title: `정정한 ${status} 리그`, rulesText: '정정한 안내' });
    expect(saved.status).toBe(200);
    expect(await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id } })).toMatchObject({ title: `정정한 ${status} 리그`, rulesText: '정정한 안내', status });
    const audit = await h.prisma.v1AdminActionLog.findFirstOrThrow({ where: { targetId: id, action: 'league_match.update_settings' } });
    expect(audit.beforeJson).toMatchObject({ title: body.title });
    expect(audit.afterJson).toMatchObject({ title: `정정한 ${status} 리그` });
    const fresh = await snapshot(id);
    for (const changes of [{ endsOn: '2099-12-31T00:00:00Z' }, { registrationDeadlineAt: null }, { plannedFixtureCount: 99 }, { maxTeams: 99 }]) {
      const locked = await patch(id, { ...fresh, title: '저장되면 안 됨', ...changes });
      expect([locked.status, locked.body.code]).toEqual([409, 'LEAGUE_ENDED_FIELD_LOCKED']);
    }
    expect((await get(id)).body.data.title).toBe(`정정한 ${status} 리그`);
    expect(await h.prisma.v1AdminActionLog.count({ where: { targetId: id, action: 'league_match.update_settings' } })).toBe(1);
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
