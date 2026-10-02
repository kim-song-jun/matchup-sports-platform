import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AppleIdentityService } from './apple-identity.service';

/**
 * The controller only forwards to this service; what it actually does is covered by
 * apple-identity-token.spec.ts and apple-nonce.spec.ts.
 */
const appleIdentityDouble = () => ({
  issueNonce: jest.fn().mockReturnValue({ nonce: 'a1.value.9999999999.signature' }),
  verifyIdentityToken: jest.fn(),
});
import { AuthService } from './auth.service';

describe('AuthController', () => {
  it('returns the current v1 user summary', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            me: jest.fn().mockResolvedValue({
              user: { id: 'user-1', email: 'host@teameet.v1' },
            }),
            kakaoLogin: jest.fn(),
            completeSocialTerms: jest.fn(),
            completeSocialProfile: jest.fn(),
            login: jest.fn(),
            register: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        { provide: AppleIdentityService, useValue: appleIdentityDouble() },
      ],
    }).compile();

    const controller = moduleRef.get(AuthController);

    await expect(
      controller.me({
        id: 'user-1',
        email: 'host@teameet.v1',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      }),
    ).resolves.toEqual({
      user: { id: 'user-1', email: 'host@teameet.v1' },
    });
  });

  it('starts a v1 email login session', async () => {
    const authService = {
      me: jest.fn(),
      kakaoLogin: jest.fn(),
      completeSocialTerms: jest.fn(),
      completeSocialProfile: jest.fn(),
      login: jest.fn().mockResolvedValue({
        session: { userId: 'user-1', userEmail: 'user@example.com' },
      }),
      register: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: {} },
        { provide: AppleIdentityService, useValue: appleIdentityDouble() },
      ],
    }).compile();

    const controller = moduleRef.get(AuthController);
    const dto = { email: 'user@example.com', password: 'password123' };

    await expect(controller.login(dto)).resolves.toEqual({
      session: { userId: 'user-1', userEmail: 'user@example.com' },
    });
    expect(authService.login).toHaveBeenCalledWith(dto);
  });

  it('mints a signed session for an already-guard-authenticated caller (dev-session)', async () => {
    const authService = {
      me: jest.fn(),
      kakaoLogin: jest.fn(),
      completeSocialTerms: jest.fn(),
      completeSocialProfile: jest.fn(),
      login: jest.fn(),
      register: jest.fn(),
      devSession: jest.fn().mockResolvedValue({
        session: { userId: 'user-1', userEmail: 'host@teameet.v1' },
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: {} },
        { provide: AppleIdentityService, useValue: appleIdentityDouble() },
      ],
    }).compile();

    const controller = moduleRef.get(AuthController);
    const user = {
      id: 'user-1',
      email: 'host@teameet.v1',
      accountStatus: 'active' as const,
      onboardingStatus: 'completed' as const,
    };

    await expect(controller.devSession(user)).resolves.toEqual({
      session: { userId: 'user-1', userEmail: 'host@teameet.v1' },
    });
    expect(authService.devSession).toHaveBeenCalledWith('user-1', 'host@teameet.v1');
  });

  it('registers a v1 email user session', async () => {
    const authService = {
      me: jest.fn(),
      kakaoLogin: jest.fn(),
      completeSocialTerms: jest.fn(),
      completeSocialProfile: jest.fn(),
      login: jest.fn(),
      register: jest.fn().mockResolvedValue({
        session: { userId: 'user-1', userEmail: 'user@example.com' },
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: {} },
        { provide: AppleIdentityService, useValue: appleIdentityDouble() },
      ],
    }).compile();

    const controller = moduleRef.get(AuthController);
    const dto = {
      nickname: '민수',
      email: 'user@example.com',
      password: 'password123',
      gender: 'male' as const,
      realName: '김민수',
      phone: '01012345678',
      birthDate: '19900102',
      profileImageUrl: 'data:image/png;base64,profile',
      requiredTermsAccepted: true,
      acceptedTermsDocumentIds: ['11111111-1111-4111-8111-111111111111'],
    };

    await expect(controller.register(dto)).resolves.toEqual({
      session: { userId: 'user-1', userEmail: 'user@example.com' },
    });
    expect(authService.register).toHaveBeenCalledWith(dto);
  });

  it('starts a v1 Kakao login session', async () => {
    const authService = {
      me: jest.fn(),
      kakaoLogin: jest.fn().mockResolvedValue({
        session: { userId: 'user-1', userEmail: 'user@example.com' },
      }),
      completeSocialTerms: jest.fn(),
      completeSocialProfile: jest.fn(),
      login: jest.fn(),
      register: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: {} },
        { provide: AppleIdentityService, useValue: appleIdentityDouble() },
      ],
    }).compile();

    const controller = moduleRef.get(AuthController);
    const dto = {
      code: 'kakao-code',
      redirectUri: 'https://teameet.co.kr/callback/kakao',
    };

    await expect(controller.kakaoLogin(dto)).resolves.toEqual({
      session: { userId: 'user-1', userEmail: 'user@example.com' },
    });
    expect(authService.kakaoLogin).toHaveBeenCalledWith(dto);
  });

  it('completes v1 social terms', async () => {
    const authService = {
      me: jest.fn(),
      kakaoLogin: jest.fn(),
      completeSocialTerms: jest.fn().mockResolvedValue({
        session: { userId: 'user-1', userEmail: null },
        next: { route: '/signup/social' },
      }),
      completeSocialProfile: jest.fn(),
      login: jest.fn(),
      register: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: {} },
        { provide: AppleIdentityService, useValue: appleIdentityDouble() },
      ],
    }).compile();

    const controller = moduleRef.get(AuthController);
    const user = {
      id: 'user-1',
      email: null,
      accountStatus: 'active' as const,
      onboardingStatus: 'social_terms_required' as const,
    };
    const dto = {
      requiredTermsAccepted: true,
      acceptedTermsDocumentIds: ['11111111-1111-4111-8111-111111111111'],
    };

    await expect(controller.completeSocialTerms(user, dto)).resolves.toEqual({
      session: { userId: 'user-1', userEmail: null },
      next: { route: '/signup/social' },
    });
    expect(authService.completeSocialTerms).toHaveBeenCalledWith('user-1', dto);
  });

  it('completes a v1 social profile', async () => {
    const authService = {
      me: jest.fn(),
      kakaoLogin: jest.fn(),
      completeSocialTerms: jest.fn(),
      completeSocialProfile: jest.fn().mockResolvedValue({
        session: { userId: 'user-1', userEmail: null },
        next: { route: '/onboarding/sport' },
      }),
      login: jest.fn(),
      register: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: {} },
        { provide: AppleIdentityService, useValue: appleIdentityDouble() },
      ],
    }).compile();

    const controller = moduleRef.get(AuthController);
    const user = {
      id: 'user-1',
      email: null,
      accountStatus: 'active' as const,
      onboardingStatus: 'social_profile_required' as const,
    };
    const dto = {
      nickname: '카카오러너',
      gender: 'female' as const,
      realName: '카카오 러너',
      phone: '01087654321',
      birthDate: '19950203',
      profileImageUrl: 'data:image/png;base64,social',
    };

    await expect(controller.completeSocialProfile(user, dto)).resolves.toEqual({
      session: { userId: 'user-1', userEmail: null },
      next: { route: '/onboarding/sport' },
    });
    expect(authService.completeSocialProfile).toHaveBeenCalledWith('user-1', dto);
  });

  describe('GET check-email / check-nickname query validation', () => {
    const buildApp = async () => {
      const authService = {
        checkEmail: jest.fn().mockResolvedValue({ available: true }),
        checkNickname: jest.fn().mockResolvedValue({ available: true }),
      };
      const moduleRef = await Test.createTestingModule({
        controllers: [AuthController],
        providers: [
          { provide: AuthService, useValue: authService },
          { provide: PrismaService, useValue: {} },
          { provide: AppleIdentityService, useValue: appleIdentityDouble() },
        ],
      }).compile();
      const app = moduleRef.createNestApplication();
      // Same options as the global pipe in main.ts.
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      await app.init();
      return { app, authService };
    };

    it.each(['/auth/check-email', '/auth/check-email?email='])(
      'rejects %s with 400 before reaching the service',
      async (url) => {
        const { app, authService } = await buildApp();
        await request(app.getHttpServer()).get(url).expect(400);
        expect(authService.checkEmail).not.toHaveBeenCalled();
        await app.close();
      },
    );

    it.each(['/auth/check-nickname', '/auth/check-nickname?nickname='])(
      'rejects %s with 400 before reaching the service',
      async (url) => {
        const { app, authService } = await buildApp();
        await request(app.getHttpServer()).get(url).expect(400);
        expect(authService.checkNickname).not.toHaveBeenCalled();
        await app.close();
      },
    );

    it('forwards the raw query values and returns the service result unchanged', async () => {
      const { app, authService } = await buildApp();
      await request(app.getHttpServer())
        .get('/auth/check-email?email=A%40Example.com')
        .expect(200, { available: true });
      await request(app.getHttpServer())
        .get('/auth/check-nickname?nickname=%EA%B0%80%EB%82%98')
        .expect(200, { available: true });
      expect(authService.checkEmail).toHaveBeenCalledWith('A@Example.com');
      expect(authService.checkNickname).toHaveBeenCalledWith('가나');
      await app.close();
    });
  });
});
