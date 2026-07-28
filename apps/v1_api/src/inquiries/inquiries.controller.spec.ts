import { Test } from '@nestjs/testing';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { InquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';

const user = {
  id: 'user-1',
  email: 'user@teameet.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('InquiriesController', () => {
  const inquiriesService = {
    list: jest.fn(),
    create: jest.fn(),
    detail: jest.fn(),
  };
  let controller: InquiriesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [InquiriesController],
      providers: [
        { provide: InquiriesService, useValue: inquiriesService },
      ],
    })
      .overrideGuard(V1AuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(OptionalV1AuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();
    controller = moduleRef.get(InquiriesController);
  });

  it('lists inquiries', async () => {
    inquiriesService.list.mockResolvedValue({ items: [] });
    await expect(controller.list(user, {})).resolves.toEqual({ items: [] });
  });

  it('creates an inquiry', async () => {
    inquiriesService.create.mockResolvedValue({ inquiryId: 'inquiry-1' });
    await expect(controller.create(user, {
      category: 'account',
      title: 'Title',
      body: 'Body',
    })).resolves.toEqual({ inquiryId: 'inquiry-1' });
  });

  it('creates a guest inquiry without a current user', async () => {
    inquiriesService.create.mockResolvedValue({ inquiryId: 'inquiry-guest-1' });
    await expect(controller.create(undefined, {
      category: 'tournament',
      title: 'Guest question',
      body: 'Guest body',
      guestEmail: 'guest@example.com',
    })).resolves.toEqual({ inquiryId: 'inquiry-guest-1' });
    expect(inquiriesService.create).toHaveBeenCalledWith(undefined, expect.objectContaining({
      guestEmail: 'guest@example.com',
    }));
  });

  it('returns detail', async () => {
    inquiriesService.detail.mockResolvedValue({ inquiryId: 'inquiry-1' });
    await expect(controller.detail(user, 'inquiry-1')).resolves.toEqual({ inquiryId: 'inquiry-1' });
  });
});
