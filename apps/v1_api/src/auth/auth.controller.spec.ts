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
            devLogin: jest.fn().mockResolvedValue({
              session: { userId: 'user-1', userEmail: 'host@teameet.v1' },
            }),
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

  it('starts a v1 dev session for a seed user', async () => {
    const authService = {
      me: jest.fn(),
      devLogin: jest.fn().mockResolvedValue({
        session: { userId: 'user-1', userEmail: 'host@teameet.v1' },
      }),
      login: jest.fn(),
      register: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    const controller = moduleRef.get(AuthController);

    await expect(controller.devLogin({ email: 'host@teameet.v1' })).resolves.toEqual({
      session: { userId: 'user-1', userEmail: 'host@teameet.v1' },
    });
    expect(authService.devLogin).toHaveBeenCalledWith('host@teameet.v1');
  });

  it('starts a v1 email login session', async () => {
    const authService = {
      me: jest.fn(),
      devLogin: jest.fn(),
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
      devLogin: jest.fn(),
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
      requiredTermsAccepted: true,
    };

    await expect(controller.register(dto)).resolves.toEqual({
      session: { userId: 'user-1', userEmail: 'user@example.com' },
    });
    expect(authService.register).toHaveBeenCalledWith(dto);
  });
});
