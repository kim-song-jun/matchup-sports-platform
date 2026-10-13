import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request = require('supertest');
import { PrismaService } from '../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration/integration-app';

const PREFIX = 'integration-social-link-uploads';
const CALLER = `${PREFIX}-caller`;
const HOLDER = `${PREFIX}-holder`;
const OTHER = `${PREFIX}-other`;
const ACTIVITY_TEAM = `${PREFIX}-team`;
const ACTIVITY_SPORT = `${PREFIX}-sport`;
const ACTIVITY_REGION = `${PREFIX}-region`;
const PHONE = '01055550125';
const USER_IDS = [CALLER, HOLDER, OTHER];
const HOLDER_IMAGE = '/uploads/integration-social-link-uploads-holder.png';
const CALLER_IMAGE = '/uploads/integration-social-link-uploads-caller.png';
const ENV_KEYS = ['V1_VERIFICATION_DEV_ECHO', 'SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_SENDER_NUMBER', 'V1_SESSION_SECRET'] as const;

class SocialLinkFixtureError extends Error {}

describe('V1 social link upload ownership integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cleanupApp: (() => Promise<void>) | undefined;
  let ownedTermsPolicyId: string | undefined;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeAll(async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    delete process.env.SOLAPI_API_KEY;
    delete process.env.SOLAPI_API_SECRET;
    delete process.env.SOLAPI_SENDER_NUMBER;
    process.env.V1_SESSION_SECRET = 'integration-social-link-uploads-session-secret-0123456789';
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    const terms = app.get(ManagedTermsRuntimeService);
    if (!(await terms.currentSignupTerms()).ready) {
      const policy = await prisma.v1ManagedTermsPolicy.create({
        data: { code: `${PREFIX}-policy`, name: '계정 연결 업로드 테스트 전용 약관' },
      });
      ownedTermsPolicyId = policy.id;
      const content = '격리된 계정 연결 업로드 검증에만 사용하는 필수 약관입니다.';
      await prisma.v1ManagedTermsDocument.create({
        data: {
          policyId: policy.id, version: '1', title: '계정 연결 업로드 테스트 전용 약관', content,
          contentHash: createHash('sha256').update(content).digest('hex'), status: 'published',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'), effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      await prisma.v1ManagedTermsPlacement.create({
        data: { policyId: policy.id, context: 'signup', requirement: 'required' },
      });
    }
  }, 60_000);

  async function cleanupFixtures() {
    if (!prisma) return;
    await prisma.v1ChatRoom.deleteMany({ where: { id: `${PREFIX}-room` } });
    await prisma.v1Team.deleteMany({ where: { id: ACTIVITY_TEAM } });
    await prisma.v1Sport.deleteMany({ where: { id: ACTIVITY_SPORT } });
    await prisma.v1Region.deleteMany({ where: { id: ACTIVITY_REGION } });
    await prisma.v1UploadAsset.deleteMany({ where: { ownerUserId: { in: USER_IDS } } });
    await prisma.v1Notification.deleteMany({ where: { recipientUserId: { in: USER_IDS } } });
    await prisma.v1StatusChangeLog.deleteMany({ where: { targetId: `${PREFIX}-identity` } });
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: USER_IDS } } });
    await prisma.v1PhoneVerificationChallenge.deleteMany({ where: { phone: PHONE } });
    await prisma.v1User.deleteMany({ where: { id: { in: USER_IDS } } });
  }

  beforeEach(async () => {
    await cleanupFixtures();
    await prisma.v1User.createMany({
      data: [
        { id: CALLER, onboardingStatus: 'social_profile_deferred' },
        { id: HOLDER, email: 'social-link-uploads@integration.test', onboardingStatus: 'completed', phone: PHONE, phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z') },
        { id: OTHER, onboardingStatus: 'completed' },
      ],
    });
    await prisma.v1AuthIdentity.create({
      data: { id: `${PREFIX}-identity`, userId: CALLER, provider: 'kakao', providerUserKey: `${PREFIX}-key`, status: 'active' },
    });
    await prisma.v1UserProfile.createMany({
      data: [
        { userId: CALLER, nickname: '업로드임시125', profileImageUrl: CALLER_IMAGE },
        { userId: HOLDER, nickname: '업로드기존125', realName: '기존 이름', gender: 'male', birthDate: '19900101', profileImageUrl: HOLDER_IMAGE },
      ],
    });
    await prisma.v1UploadAsset.createMany({
      data: [
        { id: `${PREFIX}-avatar`, ownerUserId: CALLER, kind: 'image', mimeType: 'image/png', byteSize: 123n, url: CALLER_IMAGE, storagePath: `${PREFIX}/caller.png` },
        { id: `${PREFIX}-unused`, ownerUserId: CALLER, kind: 'image', mimeType: 'image/jpeg', byteSize: 456n, url: `/uploads/${PREFIX}-unused.jpg`, storagePath: `${PREFIX}/unused.jpg` },
        { id: `${PREFIX}-other`, ownerUserId: OTHER, kind: 'image', mimeType: 'image/png', byteSize: 789n, url: `/uploads/${PREFIX}-other.png`, storagePath: `${PREFIX}/other.png` },
      ],
    });
    await prisma.v1Inquiry.create({
      data: { id: `${PREFIX}-inquiry`, userId: CALLER, category: 'account', title: '연결 문의', body: '기존 계정 연결' },
    });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items
      .filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await terms.acceptSignupTerms(CALLER, required);
  });

  afterAll(async () => {
    try {
      await cleanupFixtures();
      if (ownedTermsPolicyId !== undefined) {
        await prisma.v1ManagedTermsPlacement.deleteMany({ where: { policyId: ownedTermsPolicyId } });
        await prisma.v1ManagedTermsDocument.deleteMany({ where: { policyId: ownedTermsPolicyId } });
        await prisma.v1ManagedTermsPolicy.delete({ where: { id: ownedTermsPolicyId } });
      }
      await cleanupApp?.();
    } finally {
      for (const key of ENV_KEYS) {
        const value = savedEnv[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  async function provePhone() {
    const issued = await request(app.getHttpServer()).post('/api/v1/auth/phone/issue').send({ phone: PHONE }).expect(200);
    const verified = await request(app.getHttpServer()).post('/api/v1/auth/phone/verify')
      .send({ phone: PHONE, code: issued.body.data.devCode, purpose: 'social_link' }).expect(200);
    const token: unknown = verified.body.data.proofToken;
    if (typeof token !== 'string') throw new SocialLinkFixtureError('Phone verification did not issue a proof token');
    return token;
  }

  const link = (proofToken: string) => request(app.getHttpServer())
    .post('/api/v1/auth/social-link').set('x-v1-user-id', CALLER).send({ phone: PHONE, proofToken });

  it('enforces the real Restrict foreign key when a caller still owns an upload', async () => {
    // Given: a real deferred user owns uploads in the isolated PostgreSQL clone.
    expect(await prisma.v1UploadAsset.count({ where: { ownerUserId: CALLER } })).toBe(2);

    // When: deleting the owner without transferring those uploads.
    const deletion = prisma.v1User.delete({ where: { id: CALLER } });

    // Then: PostgreSQL prevents an orphan rather than silently deleting the assets.
    await expect(deletion).rejects.toMatchObject({ code: 'P2003' });
    expect(await prisma.v1UploadAsset.count({ where: { ownerUserId: CALLER } })).toBe(2);
  });

  it('links a deferred uploader without losing assets or overwriting the holder profile', async () => {
    // Given: the caller has an avatar and an unused upload; another user owns a third asset.
    const callerAssets = await prisma.v1UploadAsset.findMany({ where: { ownerUserId: CALLER }, orderBy: { id: 'asc' } });
    const holderProfile = await prisma.v1UserProfile.findUniqueOrThrow({ where: { userId: HOLDER } });
    const otherAsset = await prisma.v1UploadAsset.findUniqueOrThrow({ where: { id: `${PREFIX}-other` } });
    const proof = await provePhone();

    // When: the actual authenticated HTTP account-link endpoint runs with verified proof.
    const response = await link(proof);

    // Then: the link succeeds, transfers metadata unchanged, and retains the holder's profile.
    expect({ status: response.status, code: response.body.code }).toEqual({ status: 200, code: undefined });
    expect(response.body.data.session.userId).toBe(HOLDER);
    expect(await prisma.v1UploadAsset.findMany({ where: { ownerUserId: HOLDER }, orderBy: { id: 'asc' } }))
      .toEqual(callerAssets.map((asset) => ({ ...asset, ownerUserId: HOLDER })));
    expect(await prisma.v1UploadAsset.findUniqueOrThrow({ where: { id: otherAsset.id } })).toEqual(otherAsset);
    expect(await prisma.v1UserProfile.findUniqueOrThrow({ where: { userId: HOLDER } })).toEqual(holderProfile);
    expect(await prisma.v1User.findUnique({ where: { id: CALLER } })).toBeNull();
    expect((await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: `${PREFIX}-identity` } })).userId).toBe(HOLDER);
    expect((await prisma.v1Inquiry.findUniqueOrThrow({ where: { id: `${PREFIX}-inquiry` } })).userId).toBe(HOLDER);
  });

  it('rolls back upload ownership and proof consumption when disallowed activity prevents caller deletion', async () => {
    // Given: a retained activity FK deliberately makes this caller non-empty.
    await prisma.v1Sport.create({
      data: { id: ACTIVITY_SPORT, code: ACTIVITY_SPORT, name: '계정 연결 활동 테스트 종목' },
    });
    await prisma.v1Region.create({
      data: { id: ACTIVITY_REGION, code: ACTIVITY_REGION, name: '계정 연결 활동 테스트 지역', level: 1 },
    });
    await prisma.v1Team.create({
      data: { id: ACTIVITY_TEAM, ownerUserId: OTHER, sportId: ACTIVITY_SPORT, regionId: ACTIVITY_REGION, name: '계정 연결 활동 테스트 팀' },
    });
    await prisma.v1ChatRoom.create({ data: { id: `${PREFIX}-room`, teamId: ACTIVITY_TEAM } });
    await prisma.v1ChatMessage.create({ data: { chatRoomId: `${PREFIX}-room`, senderUserId: CALLER, body: '이전 활동' } });
    const callerAssets = await prisma.v1UploadAsset.findMany({ where: { ownerUserId: CALLER }, orderBy: { id: 'asc' } });
    const proof = await provePhone();

    // When: the HTTP link transaction reaches the remaining Restrict activity FK.
    const response = await link(proof);

    // Then: rejection preserves the complete original account and the unused proof.
    expect({ status: response.status, code: response.body.code }).toEqual({ status: 409, code: 'SOCIAL_LINK_ACCOUNT_NOT_EMPTY' });
    expect(await prisma.v1UploadAsset.findMany({ where: { ownerUserId: CALLER }, orderBy: { id: 'asc' } })).toEqual(callerAssets);
    expect(await prisma.v1User.findUnique({ where: { id: CALLER } })).not.toBeNull();
    expect((await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: `${PREFIX}-identity` } })).userId).toBe(CALLER);
    expect((await prisma.v1Inquiry.findUniqueOrThrow({ where: { id: `${PREFIX}-inquiry` } })).userId).toBe(CALLER);
    expect(await prisma.v1PhoneVerificationChallenge.count({ where: { phone: PHONE, verifiedAt: { not: null } } })).toBe(1);
    expect(await prisma.v1StatusChangeLog.count({ where: { targetId: `${PREFIX}-identity` } })).toBe(0);
  });
});
