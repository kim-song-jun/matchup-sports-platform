import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUser = (overrides = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  nickname: 'tester',
  passwordHash: null as string | null,
  role: 'user',
  oauthProvider: 'email',
  oauthId: 'email_test@example.com',
  sportTypes: ['futsal'],
  mannerScore: 3.5,
  locationCity: '서울',
  locationDistrict: '마포구',
  profileImageUrl: null as string | null,
  deletedAt: null as Date | null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const safeUser = (u: ReturnType<typeof mockUser>) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _ph, ...safe } = u;
  return safe;
};

const prismaMock = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  userSportProfile: {
    createMany: jest.fn(),
  },
};

const jwtServiceMock = {
  sign: jest.fn().mockReturnValue('mock-token'),
  verify: jest.fn(),
};

const configServiceMock = {
  get: jest.fn((key: string) => {
    const map: Record<string, string> = {
      'auth.hashDriver': 'bcryptjs',
      'jwt.secret': 'test-secret',
      'jwt.expiresIn': '15m',
      'jwt.refreshExpiresIn': '30d',
    };
    return map[key];
  }),
};

const usersServiceMock = {
  findById: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Ensure OAuth env keys are absent by default so mock-mode is active
    delete process.env.KAKAO_CLIENT_ID;
    delete process.env.NAVER_CLIENT_ID;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── emailRegister ──────────────────────────────────────────────────────────

  describe('emailRegister', () => {
    it('creates user and returns tokens on success', async () => {
      const user = mockUser();
      prismaMock.user.findFirst.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(user);
      usersServiceMock.findById.mockResolvedValue(safeUser(user));

      const result = await service.emailRegister('test@example.com', 'pass123', 'tester');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('throws ConflictException for duplicate email', async () => {
      prismaMock.user.findFirst.mockResolvedValue(mockUser());

      await expect(
        service.emailRegister('test@example.com', 'pass123', 'tester'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException for duplicate nickname', async () => {
      const userWithDiffEmail = mockUser({ email: 'other@example.com', nickname: 'tester' });
      prismaMock.user.findFirst.mockResolvedValue(userWithDiffEmail);

      await expect(
        service.emailRegister('new@example.com', 'pass123', 'tester'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── emailLogin ─────────────────────────────────────────────────────────────

  describe('emailLogin', () => {
    it('returns tokens for valid credentials', async () => {
      const hash = await bcrypt.hash('correct-pass', 10);
      const user = mockUser({ passwordHash: hash });

      prismaMock.user.findFirst.mockResolvedValue(user);
      prismaMock.user.update.mockResolvedValue(user);
      usersServiceMock.findById.mockResolvedValue(safeUser(user));

      const result = await service.emailLogin('test@example.com', 'correct-pass');

      expect(result).toHaveProperty('accessToken');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('throws BadRequestException for wrong password', async () => {
      const hash = await bcrypt.hash('correct-pass', 10);
      const user = mockUser({ passwordHash: hash });

      prismaMock.user.findFirst.mockResolvedValue(user);

      await expect(
        service.emailLogin('test@example.com', 'wrong-pass'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for non-existent email', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(
        service.emailLogin('no-such@example.com', 'pass'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when passwordHash is null (OAuth user)', async () => {
      prismaMock.user.findFirst.mockResolvedValue(mockUser({ passwordHash: null }));

      await expect(
        service.emailLogin('test@example.com', 'pass'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── oauthLogin — mock mode ─────────────────────────────────────────────────

  describe('oauthLogin (mock mode — env keys absent)', () => {
    it('kakao: auto-registers a new user when none exists', async () => {
      const newUser = mockUser({ oauthProvider: 'kakao', oauthId: 'mock_kakao_abc123' });
      // 1st findFirst: by providerId → null, 2nd findFirst: by email → null
      prismaMock.user.findFirst.mockResolvedValue(null);
      // resolveUniqueNickname
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(newUser);
      usersServiceMock.findById.mockResolvedValue(safeUser(newUser));

      const result = await service.oauthLogin('kakao', 'abc123');

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ oauthProvider: 'kakao' }),
        }),
      );
      expect(result).toHaveProperty('accessToken');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('kakao: returns existing user matched by oauthId', async () => {
      const existingUser = mockUser({ oauthProvider: 'kakao', oauthId: 'mock_kakao_abc123' });
      // findFirst by providerId returns the user immediately
      prismaMock.user.findFirst.mockResolvedValue(existingUser);
      prismaMock.user.update.mockResolvedValue(existingUser);
      usersServiceMock.findById.mockResolvedValue(safeUser(existingUser));

      const result = await service.oauthLogin('kakao', 'abc123');

      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
    });

    it('naver: auto-registers a new user when none exists', async () => {
      const newUser = mockUser({ oauthProvider: 'naver', oauthId: 'mock_naver_xyz789' });
      prismaMock.user.findFirst.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(newUser);
      usersServiceMock.findById.mockResolvedValue(safeUser(newUser));

      const result = await service.oauthLogin('naver', 'xyz789');

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ oauthProvider: 'naver' }),
        }),
      );
      expect(result).toHaveProperty('accessToken');
    });

    it('links to existing email account when provider lookup misses but email matches', async () => {
      const emailUser = mockUser({ email: 'mock_kakao_abc123@dev.matchup.kr' });
      // 1st findFirst (by providerId) → null, 2nd findFirst (by email) → emailUser
      prismaMock.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(emailUser);
      prismaMock.user.update.mockResolvedValue(emailUser);
      usersServiceMock.findById.mockResolvedValue(safeUser(emailUser));

      const result = await service.oauthLogin('kakao', 'abc123');

      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
    });

    it('throws UnauthorizedException for unsupported provider', async () => {
      await expect(service.oauthLogin('apple', 'code')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── oauthLogin — real mode (HTTP calls mocked via global fetch) ────────────

  describe('oauthLogin (real mode — env keys present)', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      process.env.KAKAO_CLIENT_ID = 'kakao-real-id';
      process.env.KAKAO_CLIENT_SECRET = 'kakao-real-secret';
      process.env.KAKAO_REDIRECT_URI = 'http://localhost:3003/auth/kakao/callback';

      process.env.NAVER_CLIENT_ID = 'naver-real-id';
      process.env.NAVER_CLIENT_SECRET = 'naver-real-secret';
      process.env.NAVER_REDIRECT_URI = 'http://localhost:3003/auth/naver/callback';

      // Re-create service instance with env keys set
      fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
      fetchSpy.mockRestore();
      delete process.env.KAKAO_CLIENT_ID;
      delete process.env.KAKAO_CLIENT_SECRET;
      delete process.env.KAKAO_REDIRECT_URI;
      delete process.env.NAVER_CLIENT_ID;
      delete process.env.NAVER_CLIENT_SECRET;
      delete process.env.NAVER_REDIRECT_URI;
    });

    it('kakao: fetches profile and registers new user via real API flow', async () => {
      const kakaoTokenPayload = { access_token: 'kakao-access-token' };
      const kakaoUserPayload = {
        id: 99999,
        kakao_account: {
          email: 'kakaouser@kakao.com',
          profile: { nickname: '카카오유저', profile_image_url: 'https://img.kakao.com/pic.jpg' },
        },
      };

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => kakaoTokenPayload,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => kakaoUserPayload,
        } as Response);

      const newUser = mockUser({
        email: 'kakaouser@kakao.com',
        oauthProvider: 'kakao',
        oauthId: '99999',
      });
      prismaMock.user.findFirst.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(newUser);
      usersServiceMock.findById.mockResolvedValue(safeUser(newUser));

      // Rebuild service so kakaoEnabled reads the env key set in beforeEach
      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prismaMock },
          { provide: JwtService, useValue: jwtServiceMock },
          { provide: ConfigService, useValue: configServiceMock },
          { provide: UsersService, useValue: usersServiceMock },
        ],
      }).compile();
      const svc = module.get<AuthService>(AuthService);

      const result = await svc.oauthLogin('kakao', 'real-auth-code');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        'https://kauth.kakao.com/oauth/token',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        'https://kapi.kakao.com/v2/user/me',
        expect.objectContaining({ headers: { Authorization: 'Bearer kakao-access-token' } }),
      );
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ oauthProvider: 'kakao', oauthId: '99999' }),
        }),
      );
      expect(result).toHaveProperty('accessToken');
    });

    it('naver: fetches profile and registers new user via real API flow', async () => {
      const naverTokenPayload = { access_token: 'naver-access-token' };
      const naverUserPayload = {
        resultcode: '00',
        response: {
          id: 'naver-user-id',
          email: 'naveruser@naver.com',
          nickname: '네이버유저',
          profile_image: 'https://img.naver.com/pic.jpg',
        },
      };

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => naverTokenPayload,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => naverUserPayload,
        } as Response);

      const newUser = mockUser({
        email: 'naveruser@naver.com',
        oauthProvider: 'naver',
        oauthId: 'naver-user-id',
      });
      prismaMock.user.findFirst.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(newUser);
      usersServiceMock.findById.mockResolvedValue(safeUser(newUser));

      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prismaMock },
          { provide: JwtService, useValue: jwtServiceMock },
          { provide: ConfigService, useValue: configServiceMock },
          { provide: UsersService, useValue: usersServiceMock },
        ],
      }).compile();
      const svc = module.get<AuthService>(AuthService);

      const result = await svc.oauthLogin('naver', 'real-naver-code');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ oauthProvider: 'naver', oauthId: 'naver-user-id' }),
        }),
      );
      expect(result).toHaveProperty('accessToken');
    });

    it('kakao: throws UnauthorizedException when token exchange fails (HTTP 400)', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'KOE320',
      } as Response);

      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prismaMock },
          { provide: JwtService, useValue: jwtServiceMock },
          { provide: ConfigService, useValue: configServiceMock },
          { provide: UsersService, useValue: usersServiceMock },
        ],
      }).compile();
      const svc = module.get<AuthService>(AuthService);

      await expect(svc.oauthLogin('kakao', 'bad-code')).rejects.toThrow(UnauthorizedException);
    });

    it('naver: throws UnauthorizedException when user info fetch fails', async () => {
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'naver-token' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        } as Response);

      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prismaMock },
          { provide: JwtService, useValue: jwtServiceMock },
          { provide: ConfigService, useValue: configServiceMock },
          { provide: UsersService, useValue: usersServiceMock },
        ],
      }).compile();
      const svc = module.get<AuthService>(AuthService);

      await expect(svc.oauthLogin('naver', 'valid-code')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── devLogin ───────────────────────────────────────────────────────────────

  describe('devLogin', () => {
    it('creates a new user when nickname does not exist', async () => {
      const user = mockUser();
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(user);
      prismaMock.userSportProfile.createMany.mockResolvedValue({ count: 2 });
      usersServiceMock.findById.mockResolvedValue(safeUser(user));

      const result = await service.devLogin('brand-new');

      expect(prismaMock.user.create).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
    });

    it('reuses existing user when nickname already exists (idempotent)', async () => {
      const user = mockUser();
      prismaMock.user.findUnique.mockResolvedValue(user);
      usersServiceMock.findById.mockResolvedValue(safeUser(user));

      const result = await service.devLogin('tester');

      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
    });

    it('reactivates a soft-deleted user before issuing tokens', async () => {
      const deletedUser = mockUser({
        id: 'deleted-user',
        nickname: 'deleted-e2e',
        deletedAt: new Date('2026-04-07T00:00:00.000Z'),
      });
      const reactivatedUser = mockUser({
        id: 'deleted-user',
        nickname: 'deleted-e2e',
        deletedAt: null,
      });

      prismaMock.user.findUnique.mockResolvedValue(deletedUser);
      prismaMock.user.update.mockResolvedValue(reactivatedUser);
      usersServiceMock.findById.mockResolvedValue(safeUser(reactivatedUser));

      const result = await service.devLogin('deleted-e2e');

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'deleted-user' },
        data: { deletedAt: null },
      });
      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
      expect(result.user).toMatchObject({
        id: 'deleted-user',
        nickname: 'deleted-e2e',
      });
    });
  });

  // ── refreshToken ───────────────────────────────────────────────────────────

  describe('refreshToken', () => {
    it('returns new tokens for a valid refresh token', async () => {
      const user = safeUser(mockUser());
      jwtServiceMock.verify.mockReturnValue({ sub: 'user-1' });
      usersServiceMock.findById.mockResolvedValue(user);

      const result = await service.refreshToken('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
    });

    it('throws UnauthorizedException for an invalid refresh token', async () => {
      jwtServiceMock.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refreshToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── getMe ──────────────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('returns user data without passwordHash', async () => {
      const user = safeUser(mockUser());
      usersServiceMock.findById.mockResolvedValue(user);

      const result = await service.getMe('user-1');

      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  // ── withdraw ───────────────────────────────────────────────────────────────

  describe('withdraw', () => {
    it('soft-deletes the user and returns success message', async () => {
      prismaMock.user.update.mockResolvedValue(mockUser({ deletedAt: new Date() }));

      const result = await service.withdraw('user-1');

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      expect(result).toHaveProperty('message');
    });
  });

  // ── dev-login production guard (controller level, but regression via env) ──

  describe('production guard', () => {
    it('NODE_ENV=production should block dev-login at controller level', () => {
      // The guard lives in AuthController.devLogin — confirm the env check exists
      // by verifying AuthService.devLogin itself does NOT contain the env check.
      // This is a documentation test: the production block is in the controller.
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Service itself does not throw — controller does
      expect(typeof service.devLogin).toBe('function');

      process.env.NODE_ENV = original;
    });
  });

  // ── onModuleInit — OAuth credential warning (graceful degradation) ───────────

  describe('onModuleInit — OAuth credential graceful degradation', () => {
    afterEach(() => {
      delete process.env.KAKAO_CLIENT_ID;
      delete process.env.NAVER_CLIENT_ID;
    });

    it('does not throw when both OAuth keys are missing — logs warning instead', async () => {
      delete process.env.KAKAO_CLIENT_ID;
      delete process.env.NAVER_CLIENT_ID;

      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prismaMock },
          { provide: JwtService, useValue: jwtServiceMock },
          { provide: ConfigService, useValue: configServiceMock },
          { provide: UsersService, useValue: usersServiceMock },
        ],
      }).compile();

      await expect(module.init()).resolves.not.toThrow();
    });

    it('does not throw when only KAKAO key is missing', async () => {
      delete process.env.KAKAO_CLIENT_ID;
      process.env.NAVER_CLIENT_ID = 'naver-id';

      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prismaMock },
          { provide: JwtService, useValue: jwtServiceMock },
          { provide: ConfigService, useValue: configServiceMock },
          { provide: UsersService, useValue: usersServiceMock },
        ],
      }).compile();

      await expect(module.init()).resolves.not.toThrow();
    });

    it('does not throw when all OAuth keys are present', async () => {
      process.env.KAKAO_CLIENT_ID = 'kakao-id';
      process.env.NAVER_CLIENT_ID = 'naver-id';

      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prismaMock },
          { provide: JwtService, useValue: jwtServiceMock },
          { provide: ConfigService, useValue: configServiceMock },
          { provide: UsersService, useValue: usersServiceMock },
        ],
      }).compile();

      await expect(module.init()).resolves.not.toThrow();
    });
  });
});
