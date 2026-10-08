import { ForbiddenException, Logger } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { AppleIdentityService } from '../auth/apple-identity.service';
import { sealAppleToken } from '../auth/apple-token-cipher';
import { APPLE_REVOKE_URL, APPLE_TOKEN_ENV, AppleTokenService } from '../auth/apple-token.service';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

const user = {
  id: 'user-1',
  email: 'user@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('ProfileController', () => {
  const profileService = {
    me: jest.fn(),
    activitySummary: jest.fn(),
    updateMe: jest.fn(),
    publicProfile: jest.fn(),
    settings: jest.fn(),
    updateSettings: jest.fn(),
    logout: jest.fn(),
    withdrawalRequest: jest.fn(),
  };

  let controller: ProfileController;
  const prisma = {
    v1AuthIdentity: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        { provide: ProfileService, useValue: profileService },
        AppleTokenService,
        // Only sign-in verifies Apple tokens; withdrawal never reaches it.
        { provide: AppleIdentityService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        { provide: V1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalV1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();
    controller = moduleRef.get(ProfileController);
  });

  it('returns my profile', async () => {
    profileService.me.mockResolvedValue({ userId: 'user-1', profile: { displayName: '민수' } });
    await expect(controller.me(user)).resolves.toEqual({
      userId: 'user-1',
      profile: { displayName: '민수' },
    });
  });

  it('updates my profile', async () => {
    const dto = {
      realName: '김민수',
      nickname: '민수',
      email: 'user@teameet.v1',
      profileImageUrl: null,
      phone: '01012345678',
      birthDate: '19900102',
      gender: 'male' as const,
    };
    profileService.updateMe.mockResolvedValue({ profile: dto });
    await expect(controller.updateMe(user, dto)).resolves.toEqual({ profile: dto });
  });

  it('returns my activity summary', async () => {
    profileService.activitySummary.mockResolvedValue({
      totals: { activityCount: 3, teamCount: 2, mannerScore: 4.8 },
      monthly: { matchCount: 1, mannerScore: 4.8, winRate: null },
    });
    await expect(controller.activitySummary(user)).resolves.toEqual({
      totals: { activityCount: 3, teamCount: 2, mannerScore: 4.8 },
      monthly: { matchCount: 1, mannerScore: 4.8, winRate: null },
    });
  });

  it('returns public profile', async () => {
    profileService.publicProfile.mockResolvedValue({ userId: 'user-2', displayName: '상대' });
    await expect(controller.publicProfile(undefined, 'user-2')).resolves.toEqual({
      userId: 'user-2',
      displayName: '상대',
    });
  });

  it('returns settings', async () => {
    profileService.settings.mockResolvedValue({ account: { email: 'user@teameet.v1' } });
    await expect(controller.settings(user)).resolves.toEqual({ account: { email: 'user@teameet.v1' } });
  });

  it('updates settings', async () => {
    profileService.updateSettings.mockResolvedValue({ profile: { displayName: '민수' } });
    await expect(controller.updateSettings(user, { notifications: { chatEnabled: false } })).resolves.toEqual({
      profile: { displayName: '민수' },
    });
  });

  it('logs out an authenticated user and passes it through so subscriptions can be cleaned up', async () => {
    profileService.logout.mockResolvedValue({ ok: true });
    await expect(controller.logout(user)).resolves.toEqual({ ok: true });
    expect(profileService.logout).toHaveBeenCalledWith(user);
  });

  it('logs out even when the session is already invalid (OptionalV1AuthGuard yields no user)', async () => {
    profileService.logout.mockResolvedValue({ ok: true });
    await expect(controller.logout(undefined)).resolves.toEqual({ ok: true });
    expect(profileService.logout).toHaveBeenCalledWith(undefined);
  });

  it('requests withdrawal', async () => {
    profileService.withdrawalRequest.mockResolvedValue({
      userId: 'user-1',
      accountStatus: 'withdrawal_pending',
    });
    await expect(controller.withdrawalRequest(user, { reason: '그만 사용' })).resolves.toEqual({
      userId: 'user-1',
      accountStatus: 'withdrawal_pending',
    });
  });

  describe('Apple token revoke on withdrawal', () => {
    const encryptionKey = randomBytes(32);
    const savedEnv = { ...process.env };
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      process.env[APPLE_TOKEN_ENV.keyId] = 'ABC123DEFG';
      process.env[APPLE_TOKEN_ENV.teamId] = 'TEAM123456';
      process.env[APPLE_TOKEN_ENV.privateKey] = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
      process.env[APPLE_TOKEN_ENV.encryptionKey] = encryptionKey.toString('base64');
      prisma.v1AuthIdentity.findMany.mockResolvedValue([{
        id: 'identity-1',
        providerRefreshTokenCiphertext: sealAppleToken(encryptionKey, 'identity-1', {
          clientId: 'kr.co.teameet',
          refreshToken: 'refresh-1',
        }),
      }]);
      profileService.withdrawalRequest.mockResolvedValue({ userId: 'user-1', accountStatus: 'withdrawal_pending' });
      fetchSpy = jest.spyOn(globalThis, 'fetch');
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
      process.env = { ...savedEnv };
    });

    it('revokes the Apple token once the withdrawal is recorded', async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

      await controller.withdrawalRequest(user, {});

      expect(fetchSpy).toHaveBeenCalledWith(APPLE_REVOKE_URL, expect.anything());
      expect(profileService.withdrawalRequest.mock.invocationCallOrder[0])
        .toBeLessThan(fetchSpy.mock.invocationCallOrder[0]);
      expect(prisma.v1AuthIdentity.update).toHaveBeenCalledWith({
        where: { id: 'identity-1' },
        data: { providerRefreshTokenCiphertext: null },
      });
    });

    it('still completes the withdrawal when Apple cannot be reached', async () => {
      fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

      await expect(controller.withdrawalRequest(user, {})).resolves.toEqual({
        userId: 'user-1',
        accountStatus: 'withdrawal_pending',
      });
      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('does not revoke anything when the withdrawal itself is refused', async () => {
      profileService.withdrawalRequest.mockRejectedValue(new Error('ADMIN_WITHDRAWAL_FORBIDDEN'));

      await expect(controller.withdrawalRequest(user, {})).rejects.toThrow('ADMIN_WITHDRAWAL_FORBIDDEN');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

describe('Profile withdrawal HTTP session contract', () => {
  let app: INestApplication;
  const withdrawalRequest = jest.fn();
  const user = {
    id: 'withdrawal-user',
    email: 'withdrawal@teameet.v1',
    accountStatus: 'active' as const,
    onboardingStatus: 'completed' as const,
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        { provide: ProfileService, useValue: { withdrawalRequest } },
        { provide: AppleTokenService, useValue: { revokeForUser: jest.fn().mockResolvedValue(undefined) } },
      ],
    })
      .overrideGuard(V1AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().v1User = user;
          return true;
        },
      })
      .overrideGuard(OptionalV1AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('expires the session cookie after a successful withdrawal HTTP request', async () => {
    withdrawalRequest.mockResolvedValue({ userId: user.id, accountStatus: 'withdrawal_pending' });

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/withdrawal-request')
      .set('Cookie', 'teameet_v1_session=existing-session')
      .send({ reason: '서비스를 더 이상 이용하지 않음' })
      .expect(201);

    const setCookieHeader: unknown = response.headers['set-cookie'];
    if (!isStringArray(setCookieHeader)) {
      throw new Error('Expected withdrawal response to contain Set-Cookie headers');
    }
    const clearedCookies = setCookieHeader;
    expect(clearedCookies).toHaveLength(3);
    for (const cookie of clearedCookies) {
      expect(cookie).toMatch(/^teameet_v1_session=;/);
      const expiresAt = cookie.match(/(?:^|;)\s*Expires=([^;]+)/i)?.[1];
      expect(Date.parse(expiresAt ?? '')).toBe(0);
    }
    expect(new Set(clearedCookies.map((cookie) => cookie.match(/(?:^|;)\s*Domain=([^;]+)/i)?.[1] ?? null)))
      .toEqual(new Set([null, '.teameet.co.kr', 'teameet.co.kr']));
    expect(response.body).toMatchObject({ userId: user.id, accountStatus: 'withdrawal_pending' });
  });

  it('preserves the session cookie when withdrawal fails over HTTP', async () => {
    withdrawalRequest.mockRejectedValue(new ForbiddenException('ADMIN_WITHDRAWAL_FORBIDDEN'));

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/withdrawal-request')
      .set('Cookie', 'teameet_v1_session=existing-session')
      .send({ reason: '서비스를 더 이상 이용하지 않음' })
      .expect(403);

    expect(response.headers['set-cookie']).toBeUndefined();
  });
});

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown): entry is string => typeof entry === 'string')
  );
}
