import { Test } from '@nestjs/testing';
import type { V1OnboardingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingService } from './onboarding.service';

const userId = '00000000-0000-4000-8000-000000000001';

const blockedStatuses = [
  {
    status: 'social_terms_required',
    requiredRoute: '/terms?mode=social',
  },
  {
    status: 'social_profile_required',
    requiredRoute: '/signup/social',
  },
] as const;

const normalStatuses = [
  'not_started',
  'terms_done',
  'signup_done',
  'sport_done',
  'level_done',
  'region_done',
  'completed',
  'deferred',
] as const satisfies readonly V1OnboardingStatus[];

type MutationCase = {
  readonly mutation: string;
  readonly invoke: (service: OnboardingService) => Promise<unknown>;
};

const mutationCases = [
  {
    mutation: 'PATCH /onboarding/preferences',
    invoke: (service) => service.updatePreferences(userId, {
      sports: [],
      regions: [],
      currentStep: 'sport',
    }),
  },
  {
    mutation: 'POST /onboarding/complete',
    invoke: (service) => service.complete(userId),
  },
  {
    mutation: 'POST /onboarding/defer',
    invoke: (service) => service.defer(userId, 'later'),
  },
] as const satisfies readonly MutationCase[];

const blockedMutationCases = blockedStatuses.flatMap((statusCase) =>
  mutationCases.map((mutationCase) => ({ ...statusCase, ...mutationCase })),
);

async function createHarness(onboardingStatus: V1OnboardingStatus) {
  const transactionClient = {
    v1UserSportPreference: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    v1UserRegion: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    v1User: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ onboardingStatus }),
      update: jest.fn().mockResolvedValue({ id: userId }),
    },
    v1UserOnboardingProgress: {
      upsert: jest.fn().mockResolvedValue({ userId }),
    },
    v1StatusChangeLog: {
      create: jest.fn().mockResolvedValue({ id: 'status-log-1' }),
    },
  };
  const userSnapshot = {
    id: userId,
    accountStatus: 'active',
    onboardingStatus,
    onboardingProgress: { currentStep: 'confirm' },
    sportPreferences: [
      {
        isPrimary: true,
        sport: { id: 'sport-1', name: '축구' },
        sportLevel: { id: 'level-1', name: '중급' },
      },
    ],
    regions: [],
    profile: { nickname: '테스트사용자' },
    termsConsents: [{ id: 'terms-consent-1' }],
  };
  const transaction = jest.fn(
    async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient),
  );
  const prisma = {
    v1User: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ accountStatus: 'active', onboardingStatus })
        .mockResolvedValue(userSnapshot),
    },
    v1Sport: {
      findFirst: jest.fn(),
    },
    v1SportLevel: {
      findFirst: jest.fn(),
    },
    v1Region: {
      count: jest.fn(),
    },
    $transaction: transaction,
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      OnboardingService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();

  return {
    moduleRef,
    service: moduleRef.get(OnboardingService),
    transaction,
    writeMocks: [
      transactionClient.v1UserSportPreference.deleteMany,
      transactionClient.v1UserSportPreference.createMany,
      transactionClient.v1UserRegion.deleteMany,
      transactionClient.v1UserRegion.createMany,
      transactionClient.v1User.update,
      transactionClient.v1UserOnboardingProgress.upsert,
      transactionClient.v1StatusChangeLog.create,
    ],
  };
}

describe('OnboardingService required social signup barrier', () => {
  it.each(blockedMutationCases)(
    'rejects $mutation for $status before writes',
    async ({ status, requiredRoute, invoke }) => {
      // Given
      const { moduleRef, service, transaction, writeMocks } = await createHarness(status);

      // When / Then
      try {
        await expect(invoke(service)).rejects.toMatchObject({
          status: 409,
          response: {
            code: 'ONBOARDING_STEP_REQUIRED',
            message: 'Complete the required signup step before continuing onboarding',
            details: { requiredRoute },
          },
        });
        expect(transaction).not.toHaveBeenCalled();
        for (const writeMock of writeMocks) {
          expect(writeMock).not.toHaveBeenCalled();
        }
      } finally {
        await moduleRef.close();
      }
    },
  );

  it.each(normalStatuses)(
    'keeps onboarding mutations available for $status',
    async (status) => {
      // Given
      const { moduleRef, service, transaction } = await createHarness(status);

      // When
      try {
        const result = await service.defer(userId, 'later');

        // Then
        expect(result.status).toBe(status === 'completed' ? 'completed' : 'deferred');
        expect(transaction).toHaveBeenCalledTimes(1);
      } finally {
        await moduleRef.close();
      }
    },
  );
});
