import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * 대회 공개/비공개 전환(리그와 같은 규칙) — 비공개면 일반 사용자의 목록·상세·순위·후기·선수기록에서
 * 사라지고, 관리자 조회와 데이터(상태·참가)는 그대로다. 다시 공개하면 원래대로 보인다.
 */
describe('대회 공개 여부 전환 HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  const adminUserId = randomUUID();
  const outsiderId = randomUUID();
  const participantId = randomUUID();
  let tournamentId: string;
  let sportId: string;

  const get = (user: string | null, path: string) => {
    const req = request(app.getHttpServer()).get(`/api/v1${path}`);
    return user ? req.set('x-v1-user-id', user) : req;
  };
  const toggle = (isPublic: unknown) =>
    request(app.getHttpServer())
      .patch(`/api/v1/admin/tournaments/${tournamentId}/visibility`)
      .set('x-v1-user-id', adminUserId)
      .send({ isPublic });

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    for (const id of [adminUserId, outsiderId, participantId]) {
      await db.v1User.create({ data: { id, email: `${id}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
      await terms.acceptSignupTerms(id, required);
    }
    await db.v1AdminUser.create({ data: { userId: adminUserId, adminRole: 'owner', status: 'active' } });
    sportId = (await db.v1Sport.create({ data: { code: `visibility-${adminUserId}`, name: '풋살' } })).id;
    tournamentId = (await db.v1Tournament.create({
      data: { sportId, title: `공개 전환 대회 ${adminUserId.slice(0, 6)}`, status: 'open', kind: 'regular_tournament', teamCount: 8 },
    })).id;
  });
  afterAll(async () => cleanup?.());

  it('비공개로 바꾸면 공개 목록·상세·순위·후기·선수기록에서 사라지고 관리자는 그대로 본다', async () => {
    const listed = async () =>
      (await get(null, `/tournaments?sportId=${sportId}&kind=tournament`).expect(200)).body.data.items.map((item: { id: string }) => item.id);
    expect(await listed()).toContain(tournamentId);

    const hidden = await toggle(false).expect(200);
    expect(hidden.body.data).toEqual({ tournamentId, isPublic: false });
    expect(await db.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId } })).toMatchObject({ isPublic: false, status: 'open' });
    const audit = await db.v1AdminActionLog.findFirst({ where: { targetId: tournamentId, action: 'tournament.visibility' } });
    expect(audit).toMatchObject({ beforeJson: { isPublic: true }, afterJson: { isPublic: false } });

    expect(await listed()).not.toContain(tournamentId);
    await get(null, `/tournaments/${tournamentId}`).expect(404);
    await get(outsiderId, `/tournaments/${tournamentId}`).expect(404);
    await get(null, `/tournaments/${tournamentId}/standings/overall`).expect(404);
    await get(null, `/tournaments/${tournamentId}/reviews`).expect(404);
    await get(null, `/tournaments/${tournamentId}/player-records`).expect(404);
    expect((await get(adminUserId, `/admin/tournaments/${tournamentId}`).expect(200)).body.data.isPublic).toBe(false);

    // 같은 값을 다시 보내면 아무것도 바꾸지 않고 감사 기록도 늘리지 않는다.
    await toggle(false).expect(200);
    expect(await db.v1AdminActionLog.count({ where: { targetId: tournamentId, action: 'tournament.visibility' } })).toBe(1);

    await toggle(true).expect(200);
    expect(await listed()).toContain(tournamentId);
    await get(null, `/tournaments/${tournamentId}`).expect(200);
  });

  it('비공개 대회 공지는 미신청자에겐 404, 활성 참가자는 그대로 읽고, 다시 공개하면 미신청자도 공개 공지를 본다', async () => {
    const regionId = (await db.v1Region.create({ data: { code: `visibility-${participantId}`, name: '공개 전환 지역', level: 2 } })).id;
    const team = await db.v1Team.create({ data: { ownerUserId: participantId, sportId, regionId, name: `공개 전환 팀 ${participantId.slice(0, 6)}` } });
    await db.v1TournamentRegistration.create({ data: { tournamentId, teamId: team.id, appliedByUserId: participantId, status: 'confirmed' } });
    await db.v1TournamentAnnouncement.create({ data: { tournamentId, title: '경기장 안내', body: '주차는 B2', audience: 'public', publishedAt: new Date() } });
    const titles = async (user: string) =>
      (await get(user, `/tournaments/${tournamentId}/announcements/me`).expect(200)).body.data.items.map((item: { title: string }) => item.title);

    expect(await titles(outsiderId)).toEqual(['경기장 안내']);

    await toggle(false).expect(200);
    expect((await get(outsiderId, `/tournaments/${tournamentId}/announcements/me`).expect(404)).body.code).toBe('TOURNAMENT_NOT_FOUND');
    expect(await titles(participantId)).toEqual(['경기장 안내']);
    expect((await get(adminUserId, `/admin/tournaments/${tournamentId}/announcements`).expect(200)).body.data.items).toHaveLength(1);

    await toggle(true).expect(200);
    expect(await titles(outsiderId)).toEqual(['경기장 안내']);
  });

  it('문자열 "false" 처럼 JSON 불리언이 아닌 값과 일반 사용자의 전환은 거부한다', async () => {
    await toggle('false').expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/tournaments/${tournamentId}/visibility`)
      .set('x-v1-user-id', outsiderId)
      .send({ isPublic: false })
      .expect(403);
    expect((await db.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId } })).isPublic).toBe(true);
  });
});
