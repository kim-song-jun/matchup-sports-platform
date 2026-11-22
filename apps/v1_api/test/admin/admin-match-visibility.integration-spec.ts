import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const DAY = 24 * 60 * 60 * 1000;
const run = randomUUID();
const ids = {
  owner: randomUUID(), ops: randomUUID(), support: randomUUID(),
  host: randomUUID(), guest: randomUUID(), reviewer: randomUUID(),
};

describe('어드민 개인 매치 숨김·복원 HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  let sportId: string;
  let regionId: string;
  const created: string[] = [];

  const as = (userId: string) => ({
    get: (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`).set('x-v1-user-id', userId),
    post: (path: string, body: object = {}) => request(app.getHttpServer()).post(`/api/v1${path}`).set('x-v1-user-id', userId).send(body),
  });
  const anonymous = () => request(app.getHttpServer());

  async function makeMatch(title: string, over: Record<string, unknown> = {}) {
    const match = await db.v1Match.create({
      data: {
        hostUserId: ids.host, sportId, regionId, title: `${title}-${run}`, placeName: '시험 구장', maxParticipants: 4,
        startAt: new Date(Date.now() + 3 * DAY), ...over,
      },
    });
    created.push(match.id);
    await db.v1MatchParticipant.create({ data: { matchId: match.id, userId: ids.host, role: 'host', status: 'active' } });
    return match.id;
  }
  const publicIds = async () => {
    const response = await anonymous().get('/api/v1/matches').query({ regionId, limit: 50 }).expect(200);
    return (response.body.data.items as Array<{ matchId: string }>).map((item) => item.matchId);
  };

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    // 인증 가드가 필수 약관 동의를 요구하므로, 동의하지 않은 계정은 권한 검사 전에 막힌다.
    const terms = app.get(ManagedTermsRuntimeService);
    const policy = await db.v1ManagedTermsPolicy.create({ data: { code: `hide-${run}`, name: '숨김 시험 필수 약관' } });
    await db.v1ManagedTermsDocument.create({
      data: {
        policyId: policy.id, version: '1', title: '숨김 시험 필수 약관', content: '시험용 약관입니다.', contentHash: `hide-${run}`,
        status: 'published', publishedAt: new Date(), effectiveAt: new Date(),
      },
    });
    await db.v1ManagedTermsPlacement.create({ data: { policyId: policy.id, context: 'signup', requirement: 'required', displayOrder: 0 } });
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    for (const [key, id] of Object.entries(ids)) {
      await db.v1User.create({
        data: { id, email: `${key}-${run}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed', phone: `010${id.replace(/\D/g, '').padEnd(8, '0').slice(0, 8)}`, phoneVerifiedAt: new Date(), profile: { create: { nickname: `숨김시험-${key}` } } },
      });
      await terms.acceptSignupTerms(id, required);
    }
    await db.v1AdminUser.createMany({ data: [
      { userId: ids.owner, adminRole: 'owner' }, { userId: ids.ops, adminRole: 'ops' }, { userId: ids.support, adminRole: 'support' },
    ] });
    sportId = (await db.v1Sport.create({ data: { code: `hide-${run}`, name: '풋살' } })).id;
    regionId = (await db.v1Region.create({ data: { code: `hide-${run}`, name: '숨김 지역', level: 2 } })).id;
  }, 60_000);

  afterAll(async () => {
    try {
      await db.v1AdminActionLog.deleteMany({ where: { targetId: { in: created } } });
      await db.v1PostEventReview.deleteMany({ where: { sourceId: { in: created } } });
      await db.v1MatchApplication.deleteMany({ where: { matchId: { in: created } } });
      await db.v1MatchParticipant.deleteMany({ where: { matchId: { in: created } } });
      await db.v1Match.deleteMany({ where: { id: { in: created } } });
      await db.v1AdminUser.deleteMany({ where: { userId: { in: [ids.owner, ids.ops, ids.support] } } });
      await db.v1User.deleteMany({ where: { id: { in: Object.values(ids) } } });
      await db.v1Region.deleteMany({ where: { id: regionId } });
      await db.v1Sport.deleteMany({ where: { id: sportId } });
    } finally { await cleanup?.(); }
  });

  it('권한: support·일반 사용자·비로그인은 거부하고 owner·ops 는 숨기며, 사유가 없으면 400', async () => {
    const matchId = await makeMatch('권한');
    for (const userId of [ids.support, ids.guest]) {
      const denied = await as(userId).post(`/admin/matches/${matchId}/hide`, { reason: '시험' }).expect(403);
      expect(denied.body.code).toBe('PERMISSION_DENIED');
    }
    await anonymous().post(`/api/v1/admin/matches/${matchId}/hide`).send({ reason: '시험' }).expect(401);
    for (const reason of [undefined, '', '   ']) {
      await as(ids.owner).post(`/admin/matches/${matchId}/hide`, reason === undefined ? {} : { reason }).expect(400);
    }
    await as(ids.owner).post(`/admin/matches/${matchId}/hide`, { reason: 'x'.repeat(501) }).expect(400);
    expect((await db.v1Match.findUniqueOrThrow({ where: { id: matchId } })).deletedAt).toBeNull();

    await as(ids.ops).post(`/admin/matches/${matchId}/hide`, { reason: '  운영 시험용  ' }).expect(201);
    expect((await db.v1Match.findUniqueOrThrow({ where: { id: matchId } })).deletedAt).not.toBeNull();
    await as(ids.support).post(`/admin/matches/${matchId}/unhide`, { reason: '복원' }).expect(403);
    await as(ids.owner).post(`/admin/matches/${matchId}/unhide`, { reason: '복원' }).expect(201);
    expect((await db.v1Match.findUniqueOrThrow({ where: { id: matchId } })).deletedAt).toBeNull();
  });

  it('숨기면 공개 목록·상세·내 매치·신청·후기·상태 변경에서 빠지고, 안 숨긴 매치는 그대로 보인다', async () => {
    const hidden = await makeMatch('숨길것', { status: 'completed', completedAt: new Date(Date.now() - DAY), startAt: new Date(Date.now() - 2 * DAY) });
    const kept = await makeMatch('남길것', { status: 'completed', completedAt: new Date(Date.now() - DAY), startAt: new Date(Date.now() - 2 * DAY) });
    for (const matchId of [hidden, kept]) {
      await db.v1MatchParticipant.create({ data: { matchId, userId: ids.reviewer, role: 'participant', status: 'completed' } });
    }
    const before = await publicIds();
    expect(before).toEqual(expect.arrayContaining([hidden, kept]));
    await as(ids.reviewer).get(`/reviews/sources/match/${hidden}`).expect(200);

    const hide = await as(ids.ops).post(`/admin/matches/${hidden}/hide`, { reason: '운영 시험용' }).expect(201);
    expect(hide.body.data).toMatchObject({ matchId: hidden, hidden: true });

    const after = await publicIds();
    expect(after).not.toContain(hidden);
    expect(after).toContain(kept);
    await anonymous().get(`/api/v1/matches/${hidden}`).expect(404);
    await anonymous().get(`/api/v1/matches/${kept}`).expect(200);
    const mine = await as(ids.reviewer).get('/me/matches').expect(200);
    const mineIds = (mine.body.data.items as Array<{ matchId: string }>).map((item) => item.matchId);
    expect(mineIds).not.toContain(hidden);
    expect(mineIds).toContain(kept);
    await as(ids.reviewer).get(`/matches/${hidden}/application-eligibility`).expect(404);

    await as(ids.reviewer).get(`/reviews/sources/match/${hidden}`).expect(404);
    await as(ids.reviewer).post('/reviews', { sourceType: 'match', sourceId: hidden, targetType: 'user', targetUserId: ids.host, rating: 5, tagCodes: ['manner'] }).expect(404);
    expect(await db.v1PostEventReview.count({ where: { sourceId: hidden } })).toBe(0);
    await as(ids.reviewer).get(`/reviews/sources/match/${kept}`).expect(200);

    await as(ids.ops).post(`/admin/matches/${hidden}/status`, { status: 'archived', reason: '시험' }).expect(409)
      .expect((res) => expect(res.body.code).toBe('MATCH_HIDDEN'));
    expect((await db.v1Match.findUniqueOrThrow({ where: { id: hidden } })).status).toBe('completed');
    await as(ids.ops).post(`/admin/matches/${kept}/status`, { status: 'archived', reason: '시험' }).expect(201);

    await as(ids.ops).post(`/admin/matches/${hidden}/unhide`, { reason: '복원' }).expect(201);
    expect(await publicIds()).toContain(hidden);
    await anonymous().get(`/api/v1/matches/${hidden}`).expect(200);
    await as(ids.reviewer).get(`/reviews/sources/match/${hidden}`).expect(200);
    await as(ids.ops).post(`/admin/matches/${hidden}/status`, { status: 'archived', reason: '시험' }).expect(201);
  });

  it('시작 전인데 신청자·확정 참가자가 있으면 409 로 막고, 취소하면 숨길 수 있다', async () => {
    const withApplicant = await makeMatch('신청자');
    await db.v1MatchApplication.create({ data: { matchId: withApplicant, applicantUserId: ids.guest, status: 'requested' } });
    const withParticipant = await makeMatch('참가자');
    await db.v1MatchParticipant.create({ data: { matchId: withParticipant, userId: ids.guest, role: 'participant', status: 'active' } });

    for (const matchId of [withApplicant, withParticipant]) {
      const blocked = await as(ids.owner).post(`/admin/matches/${matchId}/hide`, { reason: '정리' }).expect(409);
      expect(blocked.body.code).toBe('MATCH_HIDE_HAS_PARTICIPANTS');
      expect((await db.v1Match.findUniqueOrThrow({ where: { id: matchId } })).deletedAt).toBeNull();
      expect(await db.v1AdminActionLog.count({ where: { targetId: matchId, action: 'match.hide' } })).toBe(0);
      await as(ids.owner).post(`/admin/matches/${matchId}/status`, { status: 'cancelled', reason: '먼저 취소' }).expect(201);
      await as(ids.owner).post(`/admin/matches/${matchId}/hide`, { reason: '정리' }).expect(201);
    }

    const emptyUpcoming = await makeMatch('주최자만');
    await as(ids.owner).post(`/admin/matches/${emptyUpcoming}/hide`, { reason: '정리' }).expect(201);
  });

  it('홈의 "대기 중인 신청" 건수에서 숨긴 매치의 신청은 빠진다', async () => {
    const visible = await makeMatch('대기-보임');
    const hidden = await makeMatch('대기-숨김');
    const reviewerSummary = async () => (await as(ids.reviewer).get('/home').expect(200)).body.data.summary.pendingLabel as string | null;
    await db.v1MatchApplication.createMany({ data: [
      { matchId: visible, applicantUserId: ids.reviewer, status: 'requested' },
      { matchId: hidden, applicantUserId: ids.reviewer, status: 'requested' },
    ] });
    expect(await reviewerSummary()).toBe('대기 중인 신청 2건');
    await db.v1Match.update({ where: { id: hidden }, data: { deletedAt: new Date() } });
    expect(await reviewerSummary()).toBe('대기 중인 신청 1건');
  });

  it('이미 숨긴 매치·숨기지 않은 매치·주최자가 지운 매치는 409, 없는 매치는 404', async () => {
    const matchId = await makeMatch('멱등');
    await as(ids.owner).post(`/admin/matches/${matchId}/unhide`, { reason: '복원' }).expect(409)
      .expect((res) => expect(res.body.code).toBe('MATCH_NOT_HIDDEN'));
    await as(ids.owner).post(`/admin/matches/${matchId}/hide`, { reason: '정리' }).expect(201);
    await as(ids.owner).post(`/admin/matches/${matchId}/hide`, { reason: '정리' }).expect(409)
      .expect((res) => expect(res.body.code).toBe('MATCH_ALREADY_HIDDEN'));

    const hostDeleted = await makeMatch('주최자삭제', { status: 'archived', deletedAt: new Date() });
    await as(ids.owner).post(`/admin/matches/${hostDeleted}/unhide`, { reason: '복원' }).expect(409)
      .expect((res) => expect(res.body.code).toBe('MATCH_DELETED_BY_HOST'));
    await as(ids.owner).post(`/admin/matches/${randomUUID()}/hide`, { reason: '정리' }).expect(404);
  });

  it('어드민 목록·상세에 숨김 정보가 실리고, visibility 필터가 목록과 상태 칩에 모두 적용된다', async () => {
    const visible = await makeMatch('보이는');
    const hidden = await makeMatch('가려진');
    await as(ids.ops).post(`/admin/matches/${hidden}/hide`, { reason: '운영 시험용' }).expect(201);
    const hostDeleted = await makeMatch('지워진', { status: 'archived', deletedAt: new Date() });

    const list = async (visibility?: string) => {
      const response = await as(ids.support).get('/admin/matches').query({ q: run, limit: 50, ...(visibility ? { visibility } : {}) }).expect(200);
      return response.body.data as { items: Array<{ matchId: string; hiddenAt: string | null }>; summary: { total: number } };
    };
    const all = await list();
    expect(all.items.map((item) => item.matchId).sort()).toEqual(expect.arrayContaining([visible, hidden, hostDeleted]));
    expect(all.items.find((item) => item.matchId === hidden)?.hiddenAt).not.toBeNull();
    expect(all.items.find((item) => item.matchId === visible)?.hiddenAt).toBeNull();

    const onlyPublic = await list('public');
    expect(onlyPublic.items.some((item) => item.matchId === visible)).toBe(true);
    expect(onlyPublic.items.some((item) => [hidden, hostDeleted].includes(item.matchId))).toBe(false);
    expect(onlyPublic.items.every((item) => item.hiddenAt === null)).toBe(true);

    const onlyHidden = await list('hidden');
    expect(onlyHidden.items.map((item) => item.matchId)).toEqual(expect.arrayContaining([hidden, hostDeleted]));
    expect(onlyHidden.items.some((item) => item.matchId === visible)).toBe(false);
    expect(onlyHidden.summary.total).toBe(onlyHidden.items.length);
    expect(onlyPublic.summary.total + onlyHidden.summary.total).toBe(all.summary.total);
    await as(ids.support).get('/admin/matches').query({ visibility: 'nope' }).expect(400);

    const detail = await as(ids.support).get(`/admin/matches/${hidden}`).expect(200);
    expect(detail.body.data).toMatchObject({ hiddenBy: 'admin', hiddenReason: '운영 시험용', hiddenByName: '숨김시험-ops', canUnhide: true });
    const hostDetail = await as(ids.support).get(`/admin/matches/${hostDeleted}`).expect(200);
    expect(hostDetail.body.data).toMatchObject({ hiddenBy: 'host', canUnhide: false });
    const visibleDetail = await as(ids.support).get(`/admin/matches/${visible}`).expect(200);
    expect(visibleDetail.body.data).toMatchObject({ hiddenAt: null, hiddenBy: null, canUnhide: false });
  });

  it('감사 기록에 누가·언제·사유·이전 상태가 남고, 알림은 보내지 않는다', async () => {
    const matchId = await makeMatch('감사', { status: 'closed' });
    const notificationsBefore = await db.v1Notification.count();
    await as(ids.ops).post(`/admin/matches/${matchId}/hide`, { reason: '  감사 사유  ' }).expect(201);
    await as(ids.owner).post(`/admin/matches/${matchId}/unhide`, { reason: '되돌림' }).expect(201);

    const logs = await db.v1AdminActionLog.findMany({ where: { targetType: 'match', targetId: matchId }, orderBy: { createdAt: 'asc' }, include: { adminUser: true } });
    expect(logs.map((log) => log.action)).toEqual(['match.hide', 'match.unhide']);
    expect(logs[0]).toMatchObject({ reason: '감사 사유', beforeJson: expect.objectContaining({ status: 'closed', deletedAt: null }) });
    expect(logs[0].adminUser.userId).toBe(ids.ops);
    expect(logs[0].createdAt).toBeInstanceOf(Date);
    expect(logs[1]).toMatchObject({ reason: '되돌림', afterJson: expect.objectContaining({ deletedAt: null }) });
    expect(logs[1].adminUser.userId).toBe(ids.owner);
    expect(await db.v1Notification.count()).toBe(notificationsBefore);
  });
});
