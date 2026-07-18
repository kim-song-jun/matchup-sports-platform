import { Test } from '@nestjs/testing';
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

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        { provide: ProfileService, useValue: profileService },
        { provide: PrismaService, useValue: {} },
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

  it('logs out', async () => {
    profileService.logout.mockReturnValue({ ok: true });
    expect(controller.logout()).toEqual({ ok: true });
    expect(profileService.logout).toHaveBeenCalledWith();
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
});
