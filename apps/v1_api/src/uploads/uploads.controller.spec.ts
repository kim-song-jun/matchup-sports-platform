import { Test } from '@nestjs/testing';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

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
  let controller: UploadsController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: UploadsService, useValue: uploadsService }],
    }).compile();

    controller = moduleRef.get(UploadsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('rejects image upload before storage when account withdrawal is pending', async () => {
    // Given: the auth guard supplied the current withdrawal-pending account.
    // When: the user attempts an image upload.
    const result = controller.uploadFiles(withdrawalPendingUser, files);

    // Then: the controller blocks the request before the storage sink.
    await expect(result).rejects.toMatchObject({
      status: 403,
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(uploadsService.storeFiles).not.toHaveBeenCalled();
  });

  it('rejects video upload before storage when account withdrawal is pending', async () => {
    // Given: the auth guard supplied the current withdrawal-pending account.
    // When: the user attempts a video upload.
    const result = controller.uploadVideo(withdrawalPendingUser, files);

    // Then: the controller blocks the request before the storage sink.
    await expect(result).rejects.toMatchObject({
      status: 403,
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(uploadsService.storeFiles).not.toHaveBeenCalled();
  });

  it('preserves active-account image upload behavior', async () => {
    // Given: storage accepts an image from an active account.
    const stored = { urls: ['/uploads/2026/07/profile-image.png'] };
    uploadsService.storeFiles.mockResolvedValue(stored);

    // When: the active user uploads an image.
    const result = controller.uploadFiles(activeUser, files);

    // Then: the existing service result and image media type are preserved.
    await expect(result).resolves.toEqual(stored);
    expect(uploadsService.storeFiles).toHaveBeenCalledWith(files, activeUser.id, '', 'image');
  });

  it('preserves active-account video upload behavior', async () => {
    // Given: storage accepts a video from an active account.
    const stored = { urls: ['/uploads/2026/07/fixture-video.mp4'] };
    uploadsService.storeFiles.mockResolvedValue(stored);

    // When: the active user uploads a video.
    const result = controller.uploadVideo(activeUser, files);

    // Then: the existing service result and video media type are preserved.
    await expect(result).resolves.toEqual(stored);
    expect(uploadsService.storeFiles).toHaveBeenCalledWith(files, activeUser.id, '', 'video');
  });
});
