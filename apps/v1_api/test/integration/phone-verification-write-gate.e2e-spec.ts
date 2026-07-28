import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration-app';

const unverifiedUserId = 'integration-write-gate-unverified';
const verifiedUserId = 'integration-write-gate-verified';

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
    ]);
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupApp?.();
  });

  async function cleanupFixtures() {
    if (!prisma) return;
    await prisma.v1ManagedTermsConsentEvent.deleteMany({
      where: { userId: { in: [unverifiedUserId, verifiedUserId] } },
    });
    await prisma.v1User.deleteMany({ where: { id: { in: [unverifiedUserId, verifiedUserId] } } });
  }

  it('blocks a write from an unverified account with the verification route', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('x-v1-user-id', unverifiedUserId)
      .send({ nickname: '게이트미인증', gender: 'male' })
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

  it('keeps the verification endpoint itself reachable for the unverified account', async () => {
    // 인증 요청까지 막히면 계정이 영구히 잠긴다 — 이 경로만은 열려 있어야 한다.
    const response = await request(app.getHttpServer())
      .post('/api/v1/verification/phone/request')
      .set('x-v1-user-id', unverifiedUserId)
      .send({ phone: '01055556666' });

    expect(response.status).not.toBe(403);
  });

  it('lets a verified account write', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('x-v1-user-id', verifiedUserId)
      .send({ nickname: '게이트인증완료', gender: 'male' })
      .expect(200);
  });
});
