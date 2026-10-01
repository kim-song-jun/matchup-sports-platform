/**
 * team-invite-links.integration-spec.ts — Task 180 G12 초대 링크·여러 명 초대를 HTTP + 실제 DB 로 본다.
 *
 * 유닛 스펙은 메모리 DB 라 부분 unique 인덱스·라우트 가드·에러 봉투를 못 본다. 여기서는 "링크로 오면 가입 신청만
 * 생기고 멤버는 아니다", "재발급·만료·해체 뒤 옛 링크는 막힌다"를 행과 응답으로 확인한다.
 */
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { TeamDissolutionService } from '../../src/teams/team-dissolution.service';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { createV1IntegrationApp } from '../integration/integration-app';

const PREFIX = 'team-invite-link-it';
const ownerId = `${PREFIX}-owner`;
const managerId = `${PREFIX}-manager`;
const memberId = `${PREFIX}-member`;
const newcomerId = `${PREFIX}-newcomer`;
const outsiderId = `${PREFIX}-outsider`;
const inviteeAId = `${PREFIX}-invitee-a`;
const inviteeBId = `${PREFIX}-invitee-b`;
const userIds = [ownerId, managerId, memberId, newcomerId, outsiderId, inviteeAId, inviteeBId];
const teamId = `${PREFIX}-team`;
const regionId = `${PREFIX}-region`;
const SECRET = 'integration-team-invite-link-secret-0123456789';

let sportId = `${PREFIX}-sport`;
let sportOwnedByThisSuite = false;

describe('팀 초대 링크·여러 명 초대 계약', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  const previousSecret = process.env.V1_SESSION_SECRET;

  const http = () => request(app.getHttpServer());
  const issue = (userId: string) => http().post(`/api/v1/teams/${teamId}/invite-link`).set('x-v1-user-id', userId);
  const reissue = (userId: string) => http().post(`/api/v1/teams/${teamId}/invite-link/reissue`).set('x-v1-user-id', userId);
  const preview = (token: string, userId?: string) => {
    const req = http().get(`/api/v1/team-invite-links/${token}`);
    return userId === undefined ? req : req.set('x-v1-user-id', userId);
  };
  const join = (token: string, userId: string) =>
    http().post(`/api/v1/team-invite-links/${token}/join-applications`).set('x-v1-user-id', userId);

  beforeAll(async () => {
    process.env.V1_SESSION_SECRET = SECRET;
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupApp?.();
    await app?.close();
    process.env.V1_SESSION_SECRET = previousSecret;
  });

  beforeEach(async () => {
    await cleanupFixtures();
    await seedFixtures();
  });

  async function cleanupFixtures() {
    await prisma.v1Notification.deleteMany({ where: { recipientUserId: { in: userIds } } });
    await prisma.v1TeamInviteLink.deleteMany({ where: { teamId } });
    await prisma.v1TeamInvitation.deleteMany({ where: { teamId } });
    await prisma.v1TeamJoinApplication.deleteMany({ where: { teamId } });
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
    await prisma.v1Region.create({ data: { id: regionId, code: `${PREFIX}-region-code`, name: '링크지역', level: 1 } });
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
      data: { id: teamId, name: '링크 테스트팀', sportId, regionId, ownerUserId: ownerId, status: 'active', memberCount: 3, managerCount: 1 },
    });
    await prisma.v1TeamProfile.create({ data: { teamId, memberGoalCount: 24 } });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId, userId: ownerId, role: 'owner', status: 'active' },
        { teamId, userId: managerId, role: 'manager', status: 'active' },
        { teamId, userId: memberId, role: 'member', status: 'active' },
      ],
    });
  }

  it('링크로 들어온 사람은 가입 신청(대기)만 생기고 멤버가 되지 않는다', async () => {
    const issued = await issue(ownerId).expect(201);
    const token: string = issued.body.data.token;
    expect(issued.body.data).toMatchObject({ status: 'active', created: true });

    const shown = await preview(token).expect(200);
    expect(shown.body.data.team).toEqual({ id: teamId, name: '링크 테스트팀', sportName: expect.any(String), regionName: '링크지역 전체', logoUrl: null });
    expect(shown.body.data.viewer).toBeNull();

    const joined = await join(token, newcomerId).expect(201);
    expect(joined.body.data).toMatchObject({ teamId, status: 'requested', joinState: 'requested' });
    await expect(prisma.v1TeamJoinApplication.findMany({ where: { teamId } })).resolves.toEqual([
      expect.objectContaining({ applicantUserId: newcomerId, status: 'requested' }),
    ]);
    await expect(prisma.v1TeamMembership.findUnique({ where: { teamId_userId: { teamId, userId: newcomerId } } })).resolves.toBeNull();
    await expect(
      prisma.v1StatusChangeLog.count({ where: { targetType: 'team_join_application', reason: 'team_join_application_created_via_invite_link' } }),
    ).resolves.toBe(1);

    const again = await join(token, newcomerId).expect(409);
    expect(again.body.code).toBe('ALREADY_REQUESTED');
    const member = await join(token, memberId).expect(409);
    expect(member.body.code).toBe('ALREADY_MEMBER');
  });

  it('멤버·비팀원은 링크를 만들거나 재발급할 수 없다 — 매니저는 된다', async () => {
    for (const userId of [memberId, outsiderId]) {
      expect((await issue(userId).expect(403)).body.code).toBe('PERMISSION_DENIED');
      expect((await reissue(userId).expect(403)).body.code).toBe('PERMISSION_DENIED');
      await http().get(`/api/v1/teams/${teamId}/invite-link`).set('x-v1-user-id', userId).expect(403);
    }
    await issue(managerId).expect(201);
    await expect(prisma.v1TeamInviteLink.count({ where: { teamId } })).resolves.toBe(1);
  });

  it('재발급하면 이전 링크는 410 으로 막히고, 살아 있는 링크는 DB 에서도 하나다', async () => {
    const old: string = (await issue(ownerId).expect(201)).body.data.token;
    const next: string = (await reissue(managerId).expect(201)).body.data.token;
    expect(next).not.toBe(old);

    expect((await preview(old).expect(410)).body.code).toBe('TEAM_INVITE_LINK_REVOKED');
    expect((await join(old, newcomerId).expect(410)).body.code).toBe('TEAM_INVITE_LINK_REVOKED');
    await preview(next).expect(200);
    await expect(prisma.v1TeamInviteLink.count({ where: { teamId, revokedAt: null } })).resolves.toBe(1);

    // 부분 unique 인덱스가 마이그레이션 체인에 실제로 있다 — 서비스를 거치지 않은 두 번째 활성 행은 DB 가 거절한다.
    await expect(
      prisma.v1TeamInviteLink.create({
        data: { teamId, createdByUserId: ownerId, tokenSalt: 'x', tokenHash: 'manual-hash', expiresAt: new Date(Date.now() + 60_000) },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('만료 시각이 지나면 410 TEAM_INVITE_LINK_EXPIRED, 지나기 전엔 통한다', async () => {
    const token: string = (await issue(ownerId).expect(201)).body.data.token;

    await prisma.v1TeamInviteLink.updateMany({ where: { teamId }, data: { expiresAt: new Date(Date.now() + 60_000) } });
    await preview(token).expect(200);
    await prisma.v1TeamInviteLink.updateMany({ where: { teamId }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect((await preview(token).expect(410)).body.code).toBe('TEAM_INVITE_LINK_EXPIRED');
    expect((await join(token, newcomerId).expect(410)).body.code).toBe('TEAM_INVITE_LINK_EXPIRED');
    await expect(prisma.v1TeamJoinApplication.count({ where: { teamId } })).resolves.toBe(0);

    const current = await http().get(`/api/v1/teams/${teamId}/invite-link`).set('x-v1-user-id', ownerId).expect(200);
    expect(current.body.data).toMatchObject({ status: 'expired', token: null });
  });

  it('모르는 토큰은 404, 팀을 해체하면 링크가 닫히고 410 TEAM_NOT_ACTIVE', async () => {
    expect((await preview('A'.repeat(32)).expect(404)).body.code).toBe('TEAM_INVITE_LINK_NOT_FOUND');

    const token: string = (await issue(ownerId).expect(201)).body.data.token;
    const owner = { id: ownerId, accountStatus: 'active' } as V1AuthUser;
    await app.get(TeamDissolutionService).dissolve(owner, teamId, { confirmTeamName: '링크 테스트팀' });

    expect((await preview(token).expect(410)).body.code).toBe('TEAM_NOT_ACTIVE');
    await expect(prisma.v1TeamInviteLink.count({ where: { teamId, revokedAt: null } })).resolves.toBe(0);
  });

  it('여러 명 초대는 항목별 결과를 돌려주고 새로 초대한 사람에게만 대기 초대가 생긴다', async () => {
    const response = await http()
      .post(`/api/v1/teams/${teamId}/invitations/batch`)
      .set('x-v1-user-id', managerId)
      .send({
        recipients: [`${inviteeAId}@integration.test`, `${inviteeBId}-nick`, `${memberId}-nick`, 'nobody@integration.test', `${inviteeBId}-nick`],
      })
      .expect(201);

    expect(response.body.data.invitedCount).toBe(2);
    expect(response.body.data.results.map((row: { status: string }) => row.status)).toEqual([
      'invited',
      'invited',
      'already_member',
      'not_found',
      'duplicate',
    ]);
    const pending = await prisma.v1TeamInvitation.findMany({ where: { teamId, status: 'pending' }, select: { invitedUserId: true, invitedByUserId: true } });
    expect(pending.map((row) => row.invitedUserId).sort()).toEqual([inviteeAId, inviteeBId].sort());
    expect(pending.every((row) => row.invitedByUserId === managerId)).toBe(true);

    expect((await http().post(`/api/v1/teams/${teamId}/invitations/batch`).set('x-v1-user-id', memberId).send({ recipients: ['x@y.z'] }).expect(403)).body.code)
      .toBe('PERMISSION_DENIED');
    await http().post(`/api/v1/teams/${teamId}/invitations/batch`).set('x-v1-user-id', ownerId).send({ recipients: [] }).expect(400);
  });
});
