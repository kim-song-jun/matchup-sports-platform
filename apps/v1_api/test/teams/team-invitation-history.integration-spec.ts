/**
 * team-invitation-history.integration-spec.ts — Task 180 W4-V8 "초대 한 번 = 한 행"을 HTTP + 실제 DB 로 본다.
 *
 * 유닛 스펙은 메모리 DB 라 마이그레이션이 실제로 만든 부분 unique(v1_team_invitations_pending_key)를 못 본다.
 * 여기서는 재초대 뒤에도 끝난 초대가 남는지, 대기 중 행만 (팀, 사람)당 하나로 막히는지를 행과 응답으로 확인한다.
 */
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const PREFIX = 'team-invitation-history-it';
const ownerId = `${PREFIX}-owner`;
const managerId = `${PREFIX}-manager`;
const inviteeId = `${PREFIX}-invitee`;
const userIds = [ownerId, managerId, inviteeId];
const teamId = `${PREFIX}-team`;
const regionId = `${PREFIX}-region`;

let sportId = `${PREFIX}-sport`;
let sportOwnedByThisSuite = false;

describe('팀 초대 기록 — 초대 한 번 = 한 행 (W4-V8)', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  const http = () => request(app.getHttpServer());
  const invite = (actorId: string) =>
    http().post(`/api/v1/teams/${teamId}/invitations`).set('x-v1-user-id', actorId).send({ invitedEmail: `${inviteeId}@integration.test` });
  const inviteeRows = () =>
    prisma.v1TeamInvitation.findMany({
      where: { teamId, invitedUserId: inviteeId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true, createdAt: true },
    });

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupApp?.();
    await app?.close();
  });

  beforeEach(async () => {
    await cleanupFixtures();
    await seedFixtures();
  });

  async function cleanupFixtures() {
    await prisma.v1Notification.deleteMany({ where: { recipientUserId: { in: userIds } } });
    await prisma.v1TeamInvitation.deleteMany({ where: { teamId } });
    await prisma.v1StatusChangeLog.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetId: teamId }] } });
    await prisma.v1ChatRoom.deleteMany({ where: { teamId } });
    await prisma.v1TeamMembership.deleteMany({ where: { teamId } });
    await prisma.v1TeamProfile.deleteMany({ where: { teamId } });
    await prisma.v1Team.deleteMany({ where: { id: teamId } });
    await prisma.v1UserProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.v1User.deleteMany({ where: { id: { in: userIds } } });
    if (sportOwnedByThisSuite) await prisma.v1Sport.deleteMany({ where: { id: sportId } });
    await prisma.v1Region.deleteMany({ where: { id: regionId } });
  }

  async function seedFixtures() {
    const existingSport = await prisma.v1Sport.findUnique({ where: { code: 'futsal' } });
    if (existingSport === null) {
      sportId = (await prisma.v1Sport.create({ data: { id: sportId, code: 'futsal', name: '풋살', isActive: true } })).id;
      sportOwnedByThisSuite = true;
    } else {
      sportId = existingSport.id;
      sportOwnedByThisSuite = false;
    }
    await prisma.v1Region.create({ data: { id: regionId, code: `${PREFIX}-region-code`, name: '초대기록지역', level: 1 } });
    await prisma.v1User.createMany({
      // 휴대폰 인증 게이트가 쓰기 요청을 막는다 — 모든 사용자를 인증된 상태로 둔다.
      data: userIds.map((id) => ({
        id,
        email: `${id}@integration.test`,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
        phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
    });
    await prisma.v1UserProfile.createMany({ data: userIds.map((id) => ({ userId: id, nickname: `${id}-nick` })) });
    // 약관 재동의 게이트도 쓰기 요청을 막는다 — 지금 필수인 가입 약관에 모두 동의한 상태로 둔다.
    const terms = app.get(ManagedTermsRuntimeService);
    const requiredDocumentIds = (await terms.currentSignupTerms()).items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await Promise.all(userIds.map((id) => terms.acceptSignupTerms(id, requiredDocumentIds)));
    await prisma.v1Team.create({
      data: { id: teamId, name: '초대 기록 테스트팀', sportId, regionId, ownerUserId: ownerId, status: 'active', memberCount: 2, managerCount: 1 },
    });
    await prisma.v1TeamProfile.create({ data: { teamId, memberGoalCount: 24 } });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId, userId: ownerId, role: 'owner', status: 'active' },
        { teamId, userId: managerId, role: 'manager', status: 'active' },
      ],
    });
  }

  it('수락하고 나간 사람을 다시 초대하면 수락 기록이 지난 초대에 남고 새 대기 행이 생긴다 — 대기 중 재초대는 행을 늘리지 않는다', async () => {
    const firstId: string = (await invite(ownerId).expect(201)).body.data.invitationId;
    await http().post(`/api/v1/team-invitations/${firstId}/accept`).set('x-v1-user-id', inviteeId).expect(201);
    await http().post(`/api/v1/teams/${teamId}/leave`).set('x-v1-user-id', inviteeId).send({}).expect(201);

    const second = (await invite(managerId).expect(201)).body.data;
    expect(second).toMatchObject({ alreadyInvited: false, status: 'pending' });
    expect(second.invitationId).not.toBe(firstId);
    const again = (await invite(ownerId).expect(201)).body.data;
    expect(again).toMatchObject({ invitationId: second.invitationId, alreadyInvited: true });

    const rows = await inviteeRows();
    expect(rows.map((row) => [row.id, row.status])).toEqual([
      [firstId, 'accepted'],
      [second.invitationId, 'pending'],
    ]);
    const listed = (await http().get(`/api/v1/teams/${teamId}/invitations`).set('x-v1-user-id', ownerId).expect(200)).body.data;
    expect(listed.items.map((item: { invitationId: string }) => item.invitationId)).toEqual([second.invitationId]);
    // 다시 보낸 초대의 날짜는 처음 보낸 날이 아니라 그 행을 보낸 시각이다.
    expect(listed.items[0].createdAt).toBe(rows[1].createdAt.toISOString());
    expect(listed.pastItems.map((item: { invitationId: string; status: string }) => [item.invitationId, item.status])).toEqual([
      [firstId, 'accepted'],
    ]);
  });

  it('거절한 사람을 다시 초대하면 거절 기록과 새 초대가 둘 다 남고, 받은 초대함에는 대기 중인 새 초대만 보인다', async () => {
    const firstId: string = (await invite(ownerId).expect(201)).body.data.invitationId;
    await http().post(`/api/v1/team-invitations/${firstId}/decline`).set('x-v1-user-id', inviteeId).expect(201);

    const secondId: string = (await invite(ownerId).expect(201)).body.data.invitationId;

    expect((await inviteeRows()).map((row) => [row.id, row.status])).toEqual([
      [firstId, 'declined'],
      [secondId, 'pending'],
    ]);
    const inbox = (await http().get('/api/v1/me/invitations').set('x-v1-user-id', inviteeId).expect(200)).body.data;
    expect(inbox.items.map((item: { invitationId: string }) => item.invitationId)).toEqual([secondId]);
  });

  it('부분 unique 는 (팀, 사람)당 대기 중 행만 하나로 막는다 — 끝난 행은 여럿 남을 수 있다', async () => {
    await invite(ownerId).expect(201);
    const row = { teamId, invitedUserId: inviteeId, invitedByUserId: managerId };

    // 서비스를 거치지 않은 두 번째 대기 행은 DB 가 거절한다(마이그레이션이 만든 인덱스가 실제로 있다).
    await expect(prisma.v1TeamInvitation.create({ data: { ...row, status: 'pending' } })).rejects.toMatchObject({ code: 'P2002' });
    // 옛 (팀, 사람) 전체 unique 는 없어졌다 — 같은 사람의 끝난 행은 대기 행과 함께, 서로 여럿 남는다.
    await prisma.v1TeamInvitation.create({ data: { ...row, status: 'cancelled' } });
    await prisma.v1TeamInvitation.create({ data: { ...row, status: 'declined' } });

    expect((await inviteeRows()).map((invitation) => invitation.status).sort()).toEqual(['cancelled', 'declined', 'pending']);
  });

  it('같은 사람에게 동시에 두 번 보내도 대기 행은 하나이고 두 응답이 같은 초대를 가리킨다', async () => {
    const [a, b] = await Promise.all([invite(ownerId).expect(201), invite(managerId).expect(201)]);

    expect(a.body.data.invitationId).toBe(b.body.data.invitationId);
    expect([a.body.data.alreadyInvited, b.body.data.alreadyInvited].sort()).toEqual([false, true]);
    expect((await inviteeRows()).map((row) => row.status)).toEqual(['pending']);
  });
});
