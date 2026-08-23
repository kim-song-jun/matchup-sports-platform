import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

// 이 파일이 jest.config.ts 의 integration testMatch 에 등록되지 않으면 디스크에 있어도 CI 가
// 절대 실행하지 않는다(team-contacts/** 글롭은 Phase 1 에서 이미 등록됨 — 확인은
// `--listTests` 로 한다).
//
// 이 스펙의 목적은 team-contacts.service.spec.ts(mock Prisma 유닛 테스트)가 이미 증명한
// "차단 / closed / recruiting_only+모집없음 세 거부 사유가 발신자 입장에서 구분되지 않는다"는
// 프라이버시 성질을, 실제 HTTP 응답 **바이트**로 재증명하는 것이다. 유닛 테스트는 서비스 메서드가
// 같은 코드·메시지 객체를 던지는지만 보지만, 이 스펙은 AllExceptionsFilter 를 통과한 뒤
// 클라이언트가 실제로 받는 JSON 전체(상태 코드 포함)가 세 사유에서 동일한지 본다.

const ids = {
  ownerA: '68870000-0000-4000-8000-000000000001',
  ownerB: '68870000-0000-4000-8000-000000000002',
  region: '68870000-0000-4000-8000-000000000011',
  teamA: '68870000-0000-4000-8000-000000000020',
  teamB: '68870000-0000-4000-8000-000000000021',
} as const;

/**
 * AllExceptionsFilter 응답 본문의 `requestId`(요청마다 pino-http 가 새로 발급)와
 * `timestamp`(응답 시각)는 요청마다 달라지는 게 정상이라 "본문이 동일한지" 비교에 포함하면
 * 항상 실패한다. 이 둘을 제외한 나머지(status/statusCode/code/message/details)가 세 거부
 * 사유(차단/closed/recruiting_only)에서 완전히 같은지가 이 스펙이 증명하려는 것이다.
 */
function stripVolatileResponseFields(body: Record<string, unknown>) {
  const { requestId: _requestId, timestamp: _timestamp, ...rest } = body;
  return rest;
}

describe('팀 컨택 수신 가드(차단/정책) — 프라이버시 응답 통일', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);

    await prisma.v1User.createMany({
      data: [ids.ownerA, ids.ownerB].map((id) => ({
        id,
        email: `${id}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        // V1AuthGuard 의 휴대폰 인증 전역 게이트(쓰기 요청 차단)를 피한다.
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
      [ids.ownerA, ids.ownerB].map((id) => termsService.acceptSignupTerms(id, requiredDocumentIds)),
    );

    const sport = await prisma.v1Sport.upsert({
      where: { code: 'task7-team-contact-guards-football' },
      update: {},
      create: { code: 'task7-team-contact-guards-football', name: 'Task 7 team contact guards football' },
      select: { id: true },
    });
    await prisma.v1Region.create({
      data: {
        id: ids.region,
        code: 'TASK7_TEAM_CONTACT_GUARDS_REGION',
        name: 'Task 7 team contact guards region',
        level: 1,
      },
    });
    // teamB 는 기본 정책(open)으로 만든다 — 시나리오 4·5 에서 PATCH 로 직접 바꿔가며
    // 같은 팀쌍을 재사용한다(브리프가 "B 의 정책을 closed 로 바꾸면"이라고 명시).
    await prisma.v1Team.createMany({
      data: [
        { id: ids.teamA, ownerUserId: ids.ownerA, sportId: sport.id, regionId: ids.region, name: 'Task 7 team A' },
        { id: ids.teamB, ownerUserId: ids.ownerB, sportId: sport.id, regionId: ids.region, name: 'Task 7 team B' },
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

  let firstContactId: string;
  let blockedResponseBody: Record<string, unknown>;

  it('1) A→B 컨택이 정상 발신된다 (기준선)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamB}/contacts`)
      .set('x-v1-user-id', ids.ownerA)
      .send({ fromTeamId: ids.teamA, message: '주말에 친선 경기 가능하실까요?' })
      .expect(201);

    expect(res.body.data).toMatchObject({
      fromTeamId: ids.teamA,
      toTeamId: ids.teamB,
      status: 'requested',
    });
    firstContactId = res.body.data.id;
    expect(typeof firstContactId).toBe('string');

    // 이 컨택을 곧바로 철회해 A-B 팀쌍을 다시 비워 둔다. 그래야 시나리오 3(차단 해제 후 재발신)이
    // TEAM_CONTACT_ALREADY_ACTIVE(409) 가 아니라 실제 성공(201)을 검증하게 된다 — 차단/정책
    // 판정은 create() 안에서 "이미 진행 중인 컨택" 충돌 판정보다 먼저 실행되므로(서비스 코드 순서),
    // 이 철회는 시나리오 2(차단)의 403 판정 자체에는 영향이 없다.
    // 201 이다. withdraw 는 @Post 인데 @HttpCode 가 없어 NestJS 기본값 201 이 나간다
    // (Phase 1 에서 이미 배포된 동작이다 — 여기서 바꾸지 않는다). 200 을 기대하면 CI 에서
    // 깨진다: 실제로 이 첫 CI 실행에서 그렇게 깨졌다.
    const withdrawRes = await request(app.getHttpServer())
      .post(`/api/v1/team-contacts/${firstContactId}/withdraw`)
      .set('x-v1-user-id', ids.ownerA)
      .expect(201);
    expect(withdrawRes.body.data.contact.status).toBe('withdrawn');
  });

  it('2) B 가 A 를 차단하면 A→B 발신이 403 TEAM_CONTACT_NOT_ACCEPTING', async () => {
    const blockRes = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamB}/contact-blocks`)
      .set('x-v1-user-id', ids.ownerB)
      .send({ blockedTeamId: ids.teamA, reason: '스팸성 컨택' })
      .expect(201);
    expect(blockRes.body.data.alreadyBlocked).toBe(false);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamB}/contacts`)
      .set('x-v1-user-id', ids.ownerA)
      .send({ fromTeamId: ids.teamA, message: '다시 한 번 문의드려요' })
      .expect(403);

    expect(res.body.code).toBe('TEAM_CONTACT_NOT_ACCEPTING');
    expect(res.body.message).toBe('이 팀은 지금 컨택을 받지 않고 있어요.');
    blockedResponseBody = stripVolatileResponseFields(res.body);

    // 차단으로 거부됐을 뿐, 새 컨택 row 가 생기지 않았는지도 DB 로 확인한다.
    const count = await prisma.v1TeamContact.count({
      where: { fromTeamId: ids.teamA, toTeamId: ids.teamB, status: 'requested' },
    });
    expect(count).toBe(0);
  });

  it('3) 차단을 해제하면 다시 발신된다', async () => {
    const unblockRes = await request(app.getHttpServer())
      .delete(`/api/v1/teams/${ids.teamB}/contact-blocks/${ids.teamA}`)
      .set('x-v1-user-id', ids.ownerB)
      .expect(200);
    expect(unblockRes.body.data.removed).toBe(true);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamB}/contacts`)
      .set('x-v1-user-id', ids.ownerA)
      .send({ fromTeamId: ids.teamA, message: '차단 해제 후 다시 문의드려요' })
      .expect(201);

    expect(res.body.data).toMatchObject({
      fromTeamId: ids.teamA,
      toTeamId: ids.teamB,
      status: 'requested',
    });

    const row = await prisma.v1TeamContact.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.status).toBe('requested');
  });

  it('4) B 의 정책을 closed 로 바꾸면 403 — 2번(차단)과 응답 본문이 바이트 동일하다', async () => {
    const policyRes = await request(app.getHttpServer())
      .patch(`/api/v1/teams/${ids.teamB}/contact-policy`)
      .set('x-v1-user-id', ids.ownerB)
      .send({ contactPolicy: 'closed' })
      .expect(200);
    expect(policyRes.body.data.contactPolicy).toBe('closed');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamB}/contacts`)
      .set('x-v1-user-id', ids.ownerA)
      .send({ fromTeamId: ids.teamA, message: '정책이 닫혀 있을 때 문의드려요' })
      .expect(403);

    // status code 도, requestId/timestamp 를 제외한 본문 전체도 차단 시나리오와 완전히 같다 —
    // 발신자가 "차단당한 건지 정책이 닫힌 건지"를 응답으로 구분할 수 없어야 한다(스펙 §8(b)).
    expect(res.status).toBe(403);
    expect(stripVolatileResponseFields(res.body)).toEqual(blockedResponseBody);
  });

  it('5) 정책 recruiting_only + 모집 중 팀매치 없음 → 403 — 역시 동일 응답', async () => {
    const policyRes = await request(app.getHttpServer())
      .patch(`/api/v1/teams/${ids.teamB}/contact-policy`)
      .set('x-v1-user-id', ids.ownerB)
      .send({ contactPolicy: 'recruiting_only' })
      .expect(200);
    expect(policyRes.body.data.contactPolicy).toBe('recruiting_only');

    // teamB 가 host 인 recruiting 상태 팀매치가 하나도 없음을 전제로 한다 — 이 스펙 전체에서
    // teamB 이름으로 V1TeamMatch 를 만든 적이 없으므로 항상 참이다.
    const recruitingCount = await prisma.v1TeamMatch.count({
      where: { hostTeamId: ids.teamB, status: 'recruiting' },
    });
    expect(recruitingCount).toBe(0);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamB}/contacts`)
      .set('x-v1-user-id', ids.ownerA)
      .send({ fromTeamId: ids.teamA, message: '모집 중이 아닐 때 문의드려요' })
      .expect(403);

    expect(res.status).toBe(403);
    expect(stripVolatileResponseFields(res.body)).toEqual(blockedResponseBody);
  });

  it('6) 신고를 생성하면 V1Inquiry 에 category=report + relatedId=contactId + reportReason 이 저장된다', async () => {
    // 시나리오 3 에서 실제로 존재하게 된 컨택(A→B, requested)을 신고 대상으로 쓴다.
    const activeContact = await prisma.v1TeamContact.findFirstOrThrow({
      where: { fromTeamId: ids.teamA, toTeamId: ids.teamB, status: 'requested' },
      select: { id: true },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/inquiries')
      .set('x-v1-user-id', ids.ownerA)
      .send({
        category: 'report',
        relatedType: 'team_contact',
        relatedId: activeContact.id,
        reportReason: 'harassment',
        title: '팀 컨택 신고: 괴롭힘·욕설',
        body: '상대 팀이 컨택 메시지로 부적절한 표현을 사용했어요.',
      })
      .expect(201);

    expect(res.body.data).toMatchObject({
      category: 'report',
      relatedType: 'team_contact',
      relatedId: activeContact.id,
      reportReason: 'harassment',
    });

    const inquiry = await prisma.v1Inquiry.findUniqueOrThrow({ where: { id: res.body.data.inquiryId } });
    expect(inquiry.category).toBe('report');
    expect(inquiry.relatedType).toBe('team_contact');
    expect(inquiry.relatedId).toBe(activeContact.id);
    expect(inquiry.reportReason).toBe('harassment');
    expect(inquiry.userId).toBe(ids.ownerA);
  });
});
