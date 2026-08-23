import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

// 이 파일이 jest.config.ts 의 integration testMatch(`test/team-contacts/**`) 에 등록되지
// 않으면 디스크에 있어도 CI 가 절대 실행하지 않는다 — 이 레포에서 이미 4회 반복된 실수다.
// 글롭은 Phase 1 에서 team-contacts/** 로 등록돼 있어 이 파일도 그대로 잡힌다(확인은
// `--listTests` 로 한다, 여기서 실행 자체를 시도하지 않는다).
//
// 이 스펙은 팀 컨택 신고 운영 조치 전체 파이프라인을 실 DB(격리된 클론)로 왕복한다:
// A→B 컨택 발신 → B 가 신고(POST /inquiries) → InquiriesService.create() 가
// reportedTeamId 를 신고 시점에 확정해 저장 → 어드민이 상세에서 롤업 요약을 보고 →
// 대리 차단(POST block-reported-team) → 멱등 재호출 → 누적 목록(GET reports/teams) →
// support 역할의 권한 거부까지. 유닛 스펙(mock Prisma) 은 이 팀들 사이의 실제 FK·
// TransformInterceptor·V1AuthGuard 전체 파이프라인을 통과하는 응답 바이트를 증명하지
// 못한다.

const ids = {
  ownerA: '68890000-0000-4000-8000-000000000001',
  ownerB: '68890000-0000-4000-8000-000000000002',
  adminOwnerUser: '68890000-0000-4000-8000-000000000003',
  adminSupportUser: '68890000-0000-4000-8000-000000000004',
  region: '68890000-0000-4000-8000-000000000011',
  teamA: '68890000-0000-4000-8000-000000000020',
  teamB: '68890000-0000-4000-8000-000000000021',
} as const;

const allUserIds = [ids.ownerA, ids.ownerB, ids.adminOwnerUser, ids.adminSupportUser];

describe('팀 컨택 신고 운영 조치 — 롤업 · 대리 차단 · 권한', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);

    await prisma.v1User.createMany({
      data: allUserIds.map((id) => ({
        id,
        email: `${id}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        // V1AuthGuard 의 휴대폰 인증 전역 게이트(쓰기 요청 차단)를 피한다 — 이 스펙은
        // POST/PATCH 로 실 HTTP 파이프라인을 태우므로 서비스 유닛 스펙과 달리 필요하다.
        // 어드민 액터도 V1AuthGuard 를 통과해야 하므로 동일하게 인증 완료 상태로 만든다.
        phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
    });

    // V1AuthGuard 의 약관 재동의 게이트(TERMS_RECONSENT_REQUIRED) — DB 시드 유저는
    // v1ManagedTermsConsentEvent 가 0건이라 기본값으로는 모든 write 가 막힌다.
    const termsService = app.get(ManagedTermsRuntimeService);
    const currentSignupTerms = await termsService.currentSignupTerms();
    const requiredDocumentIds = currentSignupTerms.items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await Promise.all(
      allUserIds.map((id) => termsService.acceptSignupTerms(id, requiredDocumentIds)),
    );

    // getMutationAdmin/getActiveAdmin 은 V1AdminUser.status='active' + V1User.accountStatus
    // ='active' 를 요구한다. owner 역할은 블록 조치가 허용되고, support 역할은
    // getMutationAdmin 에서 거부된다(시나리오 6).
    await prisma.v1AdminUser.createMany({
      data: [
        { id: 'task9-report-enforcement-owner-admin', userId: ids.adminOwnerUser, adminRole: 'owner' },
        { id: 'task9-report-enforcement-support-admin', userId: ids.adminSupportUser, adminRole: 'support' },
      ],
    });

    const sport = await prisma.v1Sport.upsert({
      where: { code: 'task9-team-report-enforcement-football' },
      update: {},
      create: { code: 'task9-team-report-enforcement-football', name: 'Task 9 team report enforcement football' },
      select: { id: true },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK9_TEAM_REPORT_REGION', name: 'Task 9 team report region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.teamA, ownerUserId: ids.ownerA, sportId: sport.id, regionId: ids.region, name: 'Task 9 team A' },
        { id: ids.teamB, ownerUserId: ids.ownerB, sportId: sport.id, regionId: ids.region, name: 'Task 9 team B' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.teamA, userId: ids.ownerA, role: 'owner', status: 'active' },
        { teamId: ids.teamB, userId: ids.ownerB, role: 'owner', status: 'active' },
      ],
    });
  });

  afterAll(async () => cleanupApp?.());

  let contactId: string;
  let inquiryId: string;

  it('1) A owner 가 B 로 컨택을 보내고 B owner 가 신고하면 reportedTeamId 가 A팀으로 저장된다', async () => {
    const contactRes = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamB}/contacts`)
      .set('x-v1-user-id', ids.ownerA)
      .send({ fromTeamId: ids.teamA, message: '주말 경기 가능하실까요?' })
      .expect(201);
    contactId = contactRes.body.data.id;
    expect(typeof contactId).toBe('string');

    // 신고자는 B 소속(toTeamId) 이므로 대상은 반대쪽인 A(fromTeamId) 가 된다 —
    // InquiriesService.resolveReportedTeamId() 의 계약.
    const reportRes = await request(app.getHttpServer())
      .post('/api/v1/inquiries')
      .set('x-v1-user-id', ids.ownerB)
      .send({
        category: 'report',
        relatedType: 'team_contact',
        relatedId: contactId,
        reportReason: 'harassment',
        title: '팀 컨택 신고: 부적절한 메시지',
        body: '상대 팀이 컨택 메시지로 부적절한 표현을 사용했어요.',
      })
      .expect(201);
    inquiryId = reportRes.body.data.inquiryId;
    expect(typeof inquiryId).toBe('string');

    const inquiryRow = await prisma.v1Inquiry.findUniqueOrThrow({ where: { id: inquiryId } });
    expect(inquiryRow.category).toBe('report');
    expect(inquiryRow.reportedTeamId).toBe(ids.teamA);
    expect(inquiryRow.userId).toBe(ids.ownerB);
  });

  it('2) 어드민이 신고 상세를 열면 대상 팀 요약에 최근 신고 1건이 잡힌다', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/inquiries/${inquiryId}`)
      .set('x-v1-user-id', ids.adminOwnerUser)
      .expect(200);

    expect(res.body.data.reportedTeam).toMatchObject({
      teamId: ids.teamA,
      name: 'Task 9 team A',
      status: 'active',
      recentReportCount: 1,
    });
  });

  it('3) 어드민이 대리 차단하면 v1_team_contact_blocks 에 teamId=B, blockedTeamId=A, reason 이 생긴다', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/inquiries/${inquiryId}/block-reported-team`)
      .set('x-v1-user-id', ids.adminOwnerUser)
      .expect(200);

    expect(res.body.data).toMatchObject({
      blocked: true,
      alreadyBlocked: false,
      teamId: ids.teamB,
      blockedTeamId: ids.teamA,
    });

    const blockRow = await prisma.v1TeamContactBlock.findFirstOrThrow({
      where: { teamId: ids.teamB, blockedTeamId: ids.teamA },
    });
    expect(blockRow.createdByUserId).toBe(ids.adminOwnerUser);
    expect(blockRow.reason).toContain(inquiryId);
  });

  it('4) 같은 차단 요청을 다시 보내면 500 이 아니라 200 + alreadyBlocked:true', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/inquiries/${inquiryId}/block-reported-team`)
      .set('x-v1-user-id', ids.adminOwnerUser)
      .expect(200);

    expect(res.body.data).toMatchObject({
      blocked: true,
      alreadyBlocked: true,
      teamId: ids.teamB,
      blockedTeamId: ids.teamA,
    });

    // @@unique([teamId, blockedTeamId]) — 재호출로 새 row 가 늘지 않았는지 DB 로 확인한다.
    const blockCount = await prisma.v1TeamContactBlock.count({
      where: { teamId: ids.teamB, blockedTeamId: ids.teamA },
    });
    expect(blockCount).toBe(1);
  });

  it('5) GET /admin/reports/teams 에 A팀이 최근 신고 팀으로 나온다', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/reports/teams')
      .set('x-v1-user-id', ids.adminOwnerUser)
      .expect(200);

    expect(res.body.data.windowDays).toBeGreaterThan(0);
    const row = res.body.data.items.find((item: { teamId: string }) => item.teamId === ids.teamA);
    expect(row).toMatchObject({
      teamId: ids.teamA,
      name: 'Task 9 team A',
      status: 'active',
      totalCount: 1,
      recentCount: 1,
      topReason: 'harassment',
    });
    expect(row.lastReportedAt).toBeTruthy();
  });

  it('6) support 역할 관리자가 대리 차단을 시도하면 403 PERMISSION_DENIED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/inquiries/${inquiryId}/block-reported-team`)
      .set('x-v1-user-id', ids.adminSupportUser)
      .expect(403);

    expect(res.body.code).toBe('PERMISSION_DENIED');

    // 거부된 시도가 이미 존재하는 차단 row 를 건드리지 않았는지도 확인한다.
    const blockCount = await prisma.v1TeamContactBlock.count({
      where: { teamId: ids.teamB, blockedTeamId: ids.teamA },
    });
    expect(blockCount).toBe(1);
  });
});
