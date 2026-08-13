import type { ExecutionContext } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { PrismaService } from '../prisma/prisma.service';
import type { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { TournamentFixtureVideosController } from '../tournaments/videos/tournament-fixture-videos.controller';
import type { TournamentFixtureVideosService } from '../tournaments/videos/tournament-fixture-videos.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

const tournamentId = '00000000-0000-4000-8000-000000000001';
const fixtureId = '00000000-0000-4000-8000-000000000002';

const activeUser = {
  id: 'active-user',
  email: 'active@teameet.test',
  accountStatus: 'active',
  onboardingStatus: 'completed',
} satisfies V1AuthUser;

const withdrawalPendingUser = {
  id: 'withdrawal-pending-user',
  email: 'withdrawal@teameet.test',
  accountStatus: 'withdrawal_pending',
  onboardingStatus: 'completed',
} satisfies V1AuthUser;

describe('UploadsController active-account boundary', () => {
  const files: Express.Multer.File[] = [];
  const uploadsService = {
    storeFiles: jest.fn<
      ReturnType<UploadsService['storeFiles']>,
      Parameters<UploadsService['storeFiles']>
    >(),
  };
  const prisma = {
    v1User: {
      findFirst: jest.fn(),
    },
  };
  const managedTerms = {
    signupCompliance: jest.fn(),
  };
  // 영상 업로드는 이제 /uploads 가 아니라 대회 스태프 전용 경로에서만 받는다
  // (uploads.controller.ts 의 "영상 업로드는 여기 없다" 주석 참고). 계정 경계가 그 경로에도
  // 그대로 적용되는지 함께 확인한다 — 파일을 받는 유일한 창구가 그쪽이기 때문이다.
  const videosService = { uploadAndCreateVideo: jest.fn() };
  let controller: UploadsController;
  let videosController: TournamentFixtureVideosController;
  let authGuard: V1AuthGuard;

  beforeEach(() => {
    controller = new UploadsController(uploadsService as unknown as UploadsService);
    videosController = new TournamentFixtureVideosController(
      videosService as unknown as TournamentFixtureVideosService,
    );
    authGuard = new V1AuthGuard(
      prisma as unknown as PrismaService,
      managedTerms as unknown as ManagedTermsRuntimeService,
    );
    prisma.v1User.findFirst.mockImplementation(({ where }: { where: { id?: string } }) => {
      const user = where.id === activeUser.id
        ? activeUser
        : where.id === withdrawalPendingUser.id
          ? withdrawalPendingUser
          : null;
      return Promise.resolve(user ? { ...user, phoneVerifiedAt: new Date() } : null);
    });
    managedTerms.signupCompliance.mockResolvedValue({
      compliant: true,
      pendingRequiredDocumentIds: [],
      nextRoute: '/home',
    });
  });

  afterEach(() => jest.clearAllMocks());

  async function executeUpload(userId: string, kind: 'image' | 'video') {
    const request: {
      headers: Record<string, string>;
      header: (name: string) => string | undefined;
      method: string;
      originalUrl: string;
      url: string;
      v1User?: V1AuthUser;
    } = {
      headers: { 'x-v1-user-id': userId },
      header: (name) => name.toLowerCase() === 'x-v1-user-id' ? userId : undefined,
      method: 'POST',
      originalUrl:
        kind === 'image'
          ? '/api/v1/uploads'
          : `/api/v1/tournament-ops/tournaments/${tournamentId}/fixtures/${fixtureId}/videos/upload`,
      url:
        kind === 'image'
          ? '/api/v1/uploads'
          : `/api/v1/tournament-ops/tournaments/${tournamentId}/fixtures/${fixtureId}/videos/upload`,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    await authGuard.canActivate(context);
    if (!request.v1User) throw new Error('V1AuthGuard did not bind the authenticated user');
    return kind === 'image'
      ? controller.uploadFiles(request.v1User, files)
      : videosController.uploadVideo(request.v1User, tournamentId, fixtureId, files, {});
  }

  it('rejects image upload before storage when account withdrawal is pending', async () => {
    const result = executeUpload(withdrawalPendingUser.id, 'image');

    await expect(result).rejects.toMatchObject({
      status: 403,
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(uploadsService.storeFiles).not.toHaveBeenCalled();
  });

  it('rejects video upload before storage when account withdrawal is pending', async () => {
    const result = executeUpload(withdrawalPendingUser.id, 'video');

    await expect(result).rejects.toMatchObject({
      status: 403,
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(videosService.uploadAndCreateVideo).not.toHaveBeenCalled();
    expect(uploadsService.storeFiles).not.toHaveBeenCalled();
  });

  it('preserves active-account image upload behavior', async () => {
    const stored = { urls: ['/uploads/2026/07/profile-image.png'] };
    uploadsService.storeFiles.mockResolvedValue(stored);

    const result = executeUpload(activeUser.id, 'image');

    await expect(result).resolves.toEqual(stored);
    expect(uploadsService.storeFiles).toHaveBeenCalledWith(files, activeUser.id, '', 'image');
  });

  it('preserves active-account video upload behavior', async () => {
    const registered = { id: 'video-1', title: null, url: '/uploads/2026/07/fixture-video.mp4' };
    videosService.uploadAndCreateVideo.mockResolvedValue(registered);

    const result = executeUpload(activeUser.id, 'video');

    await expect(result).resolves.toEqual(registered);
    expect(videosService.uploadAndCreateVideo).toHaveBeenCalledWith(
      expect.objectContaining({ id: activeUser.id }),
      tournamentId,
      fixtureId,
      files,
      undefined,
    );
  });
});
