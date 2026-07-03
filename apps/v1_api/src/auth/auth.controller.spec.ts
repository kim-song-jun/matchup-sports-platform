import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
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
      ],
    }).compile();

    const controller = moduleRef.get(AuthController);
    const dto = { email: 'user@example.com', password: 'password123' };

    await expect(controller.login(dto)).resolves.toEqual({
      session: { userId: 'user-1', userEmail: 'user@example.com' },
    });
    expect(authService.login).toHaveBeenCalledWith(dto);
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
      ],
    }).compile();

    const controller = moduleRef.get(AuthController);
    const dto = {
      nickname: '민수',
      email: 'user@example.com',
      password: 'password123',
      gender: 'male' as const,
      displayName: '김민수',
      phone: '01012345678',
      birthDate: '19900102',
      profileImageUrl: 'data:image/png;base64,profile',
      bio: '주말 대회를 선호합니다.',
      visibilityStatus: 'members_only' as const,
      requiredTermsAccepted: true,
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
      ],
    }).compile();

    const controller = moduleRef.get(AuthController);
    const dto = {
      code: 'kakao-code',
      redirectUri: 'https://teameet.co.kr/v1/callback/kakao',
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
      ],
    }).compile();

    const controller = moduleRef.get(AuthController);
    const user = {
      id: 'user-1',
      email: null,
      accountStatus: 'active' as const,
      onboardingStatus: 'social_terms_required' as const,
    };
    const dto = { requiredTermsAccepted: true };

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
      displayName: '카카오 러너',
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
});
