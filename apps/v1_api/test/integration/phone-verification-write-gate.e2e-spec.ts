import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration-app';

const unverifiedUserId = 'integration-write-gate-unverified';
const verifiedUserId = 'integration-write-gate-verified';
const unverifiedAdminUserId = 'integration-write-gate-unverified-admin';
const revokedAdminUserId = 'integration-write-gate-revoked-admin';

/**
 * 휴대폰 미인증 계정의 쓰기 차단 — 실 DB + 실 HTTP end-to-end.
 *
 * 프론트 리다이렉트/모달은 UX일 뿐 강제력이 없다(요청을 직접 보내면 그만). 이 스펙은
 * V1AuthGuard 가 실제 요청 경로에서 쓰기를 막고 조회는 통과시키는지, 그리고 인증을 마친
 * 계정은 그대로 통과하는지를 확인한다.
 */
describe('V1 phone verification write gate integration', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await cleanupFixtures();
    await prisma.v1User.createMany({
      data: [
        {
          id: unverifiedUserId,
          email: 'write-gate-unverified@integration.test',
          onboardingStatus: 'completed',
        },
        {
          id: verifiedUserId,
          email: 'write-gate-verified@integration.test',
          onboardingStatus: 'completed',
          phone: '01099998888',
          phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          id: unverifiedAdminUserId,
          email: 'write-gate-unverified-admin@integration.test',
          onboardingStatus: 'completed',
        },
        {
          id: revokedAdminUserId,
          email: 'write-gate-revoked-admin@integration.test',
          onboardingStatus: 'completed',
        },
      ],
    });

    // 운영자는 휴대폰 미인증이어도 운영 콘솔을 써야 한다. 회수(revoked)된 관리자는 아니다.
    await prisma.v1AdminUser.createMany({
      data: [
        { userId: unverifiedAdminUserId, adminRole: 'ops', status: 'active' },
        { userId: revokedAdminUserId, adminRole: 'ops', status: 'revoked' },
      ],
    });

    // 약관 재동의 게이트가 먼저 걸리면 휴대폰 게이트에 도달하지 못한다 — 두 사용자 모두
    // 필수 약관에는 동의시켜 두고, 차이를 휴대폰 인증 여부 하나로만 남긴다.
    const termsService = app.get(ManagedTermsRuntimeService);
    const currentSignupTerms = await termsService.currentSignupTerms();
    const requiredDocumentIds = currentSignupTerms.items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await Promise.all([
      termsService.acceptSignupTerms(unverifiedUserId, requiredDocumentIds),
      termsService.acceptSignupTerms(verifiedUserId, requiredDocumentIds),
      termsService.acceptSignupTerms(unverifiedAdminUserId, requiredDocumentIds),
      termsService.acceptSignupTerms(revokedAdminUserId, requiredDocumentIds),
    ]);
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupApp?.();
  });

  async function cleanupFixtures() {
    if (!prisma) return;
    const ids = [unverifiedUserId, verifiedUserId, unverifiedAdminUserId, revokedAdminUserId];
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.v1AdminUser.deleteMany({ where: { userId: { in: ids } } });
    await prisma.v1User.deleteMany({ where: { id: { in: ids } } });
  }

  it('blocks a write that reaches another user, with the verification route', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/teams')
      .set('x-v1-user-id', unverifiedUserId)
      .send({ name: '게이트미인증팀', sportId: 'football' })
      .expect(403);

    expect(response.body.code).toBe('PHONE_VERIFICATION_REQUIRED');
    expect(response.body.details?.next?.route).toBe('/my/phone-verify');
  });

  it('still lets the unverified account read', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/me/profile')
      .set('x-v1-user-id', unverifiedUserId)
      .expect(200);
  });

  /**
   * 인증 도입 이전에 가입한 레거시 계정은 인증을 마치기 전에도 자기 계정은 건사할 수 있어야
   * 한다. 이게 막혀 있으면 로그인은 되는데 프로필 사진 한 장 못 바꾸는 상태로 갇힌다.
   */
  it('lets the unverified account manage its own profile', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('x-v1-user-id', unverifiedUserId)
      .send({ nickname: '게이트미인증', gender: 'male' })
      .expect(200);
  });

  /**
   * 자기 계정 범위를 열어 준 것이 번호까지 열어 준 것은 아니다 — 증명 없이 번호를 붙일 수
   * 있으면 "프로필에서 번호만 교체"로 인증 자체가 우회된다.
   */
  it('still refuses to attach a phone number without a proof token', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('x-v1-user-id', unverifiedUserId)
      .send({ nickname: '게이트미인증', gender: 'male', phone: '01077776666' })
      .expect(400);

    expect(response.body.code).toBe('PHONE_NOT_VERIFIED');
  });

  it('keeps the verification endpoint itself reachable for the unverified account', async () => {
    // 인증 요청까지 막히면 계정이 영구히 잠긴다 — 이 경로만은 열려 있어야 한다.
    const response = await request(app.getHttpServer())
      .post('/api/v1/verification/phone/request')
      .set('x-v1-user-id', unverifiedUserId)
      .send({ phone: '01055556666' });

    expect(response.status).not.toBe(403);
  });

  /**
   * 아래 두 케이스는 **`/teams` 로** 때린다. `/me` 가 아니다.
   *
   * 자기 계정 범위(`/me`)는 미인증 계정 전체에 열려 있으므로, 거기서는 관리자든 아니든 통과한다
   * — 즉 `/me` 로는 면제 배선을 증명할 수도, 회수된 관리자가 막히는지 확인할 수도 없다. 면제가
   * 통째로 죽어도 두 테스트가 green 이 되어 버린다. `POST /teams` 는 이 파일 위쪽에서 미인증
   * 계정에 403 임이 이미 증명된 경로라, 신분 차이만이 결과를 가른다.
   */
  it('lets an unverified platform admin write — the ops console must stay usable', async () => {
    // 운영 콘솔의 쓰기는 대부분 /games/* 로 나가는데 그 경로는 일반 사용자의 신원연동·동의
    // 쓰기와 섞여 있어 경로 허용목록으로 열 수 없다. 그래서 면제는 신분 기준이어야 하고,
    // 이 케이스가 그 배선이 실제 요청 경로에서 동작하는지를 확인한다.
    const response = await request(app.getHttpServer())
      .post('/api/v1/teams')
      .set('x-v1-user-id', unverifiedAdminUserId)
      .send({ name: '운영자미인증팀', sportId: 'football' });

    // 팀 생성 자체의 인가·검증 결과는 여기서 다루지 않는다 — 휴대폰 게이트에 걸리지
    // 않았는지만 본다.
    expect(response.body.code).not.toBe('PHONE_VERIFICATION_REQUIRED');
  });

  it('still blocks a revoked admin — the live grant is what carries the trust', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/teams')
      .set('x-v1-user-id', revokedAdminUserId)
      .send({ name: '회수된관리자팀', sportId: 'football' })
      .expect(403);

    expect(response.body.code).toBe('PHONE_VERIFICATION_REQUIRED');
  });

  it('lets a verified account write', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('x-v1-user-id', verifiedUserId)
      .send({ nickname: '게이트인증완료', gender: 'male' })
      .expect(200);
  });
});
