import { TournamentFixtureReviewsService } from './tournament-fixture-reviews.service';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'captain@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const fixtureId = '00000000-0000-4000-8000-000000000101';
const secondFixtureId = '00000000-0000-4000-8000-000000000102';
const tournamentId = '00000000-0000-4000-8000-000000000301';
const reviewerTeamId = '00000000-0000-4000-8000-000000000201';
const targetTeamId = '00000000-0000-4000-8000-000000000202';
const recordedAt = new Date('2026-06-20T12:00:00.000Z');

describe('TournamentFixtureReviewsService', () => {
  it('returns the opponent team target for a completed tournament fixture', async () => {
    const prisma = {
      v1TournamentFixture: {
        findUnique: jest.fn().mockResolvedValue({
          id: fixtureId,
          tournamentId,
          tournament: { title: 'TeamMeet Cup' },
          round: '결승',
          fixtureNumber: 7,
          status: 'completed',
          scheduledAt: recordedAt,
          updatedAt: recordedAt,
          game: { currentOfficialRevision: { state: 'OFFICIAL', officialAt: recordedAt } },
          homeRegistration: {
            teamId: reviewerTeamId,
            team: { id: reviewerTeamId, name: '성수 FC', profile: { logoUrl: null } },
          },
          awayRegistration: {
            teamId: targetTeamId,
            team: { id: targetTeamId, name: '마포 러너스', profile: { logoUrl: null } },
          },
        }),
      },
      v1TeamMembership: {
        findMany: jest.fn().mockResolvedValue([
          { teamId: reviewerTeamId, role: 'owner', team: { name: '성수 FC' } },
        ]),
      },
      v1PostEventReview: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(service.source(user, fixtureId)).resolves.toMatchObject({
      source: {
        sourceType: 'tournament_fixture',
        sourceId: fixtureId,
        title: 'TeamMeet Cup · 결승 7경기',
        completedAt: recordedAt.toISOString(),
      },
      reviewerTeam: { teamId: reviewerTeamId, name: '성수 FC', role: 'owner' },
      targets: [
        {
          targetType: 'team',
          targetTeamId,
          name: '마포 러너스',
          subtitle: '대회 상대 팀',
          alreadySubmitted: false,
        },
      ],
    });
  });

  it('deduplicates pending reviews when the same teams meet twice in one tournament', async () => {
    const prisma = {
      v1TeamMembership: {
        findMany: jest.fn().mockResolvedValue([{ teamId: reviewerTeamId }]),
      },
      v1TournamentFixture: {
        findMany: jest.fn().mockResolvedValue([
          fixture({ id: fixtureId, fixtureNumber: 1 }),
          fixture({ id: secondFixtureId, fixtureNumber: 2 }),
        ]),
      },
      v1PostEventReview: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(service.pending(user, 20)).resolves.toMatchObject([
      {
        sourceType: 'tournament_fixture',
        sourceId: fixtureId,
        targetTeam: { teamId: targetTeamId, name: '마포 러너스' },
        remainingCount: 1,
      },
    ]);
  });

  it('locks a repeated opponent team review after another fixture in the same tournament was reviewed', async () => {
    const existingReview = {
      id: '00000000-0000-4000-8000-000000000501',
      sourceType: 'tournament_fixture',
      sourceId: fixtureId,
      targetType: 'team',
      targetUser: null,
      targetTeam: { id: targetTeamId, name: '마포 러너스', profile: { logoUrl: null } },
      reviewerUser: { id: user.id, profile: { nickname: '성수 캡틴', profileImageUrl: null } },
      reviewerTeam: { id: reviewerTeamId, name: '성수 FC', profile: { logoUrl: null } },
      rating: 5,
      tags: [],
      status: 'submitted',
      submittedAt: recordedAt,
    };
    const prisma = {
      v1TournamentFixture: {
        findUnique: jest.fn().mockResolvedValue(fixture({ id: secondFixtureId, fixtureNumber: 2 })),
      },
      v1TeamMembership: {
        findMany: jest.fn().mockResolvedValue([
          { teamId: reviewerTeamId, role: 'owner', team: { name: '성수 FC' } },
        ]),
      },
      v1PostEventReview: {
        findFirst: jest.fn(({ where }) => (
          where.sourceGroupId === tournamentId && where.targetTeamId === targetTeamId ? existingReview : null
        )),
      },
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(service.source(user, secondFixtureId)).resolves.toMatchObject({
      targets: [
        {
          targetTeamId,
          alreadySubmitted: true,
          locked: true,
          lockReason: 'ALREADY_SUBMITTED',
          review: { sourceId: fixtureId, targetTeam: { teamId: targetTeamId } },
        },
      ],
    });
  });

  // R3 §4-3단계: 결과 존재 게이트를 신규 경로(V1Game.currentOfficialRevision)로 옮겼다.
  // currentOfficialRevisionId는 VOID 이후 VOID 리비전을 가리키도록 다시 옮겨가므로
  // (tournament-result-review.service.ts voidResult), state까지 확인하지 않으면 무효화된
  // 결과를 "리뷰 가능"으로 오판한다.
  it('무효화(VOID)된 결과는 완료로 취급하지 않고 SOURCE_NOT_COMPLETED로 막는다', async () => {
    const prisma = {
      v1TournamentFixture: {
        findUnique: jest.fn().mockResolvedValue({
          ...fixture({ id: fixtureId, fixtureNumber: 1 }),
          game: { currentOfficialRevision: { state: 'VOID', officialAt: null } },
        }),
      },
      v1TeamMembership: { findMany: jest.fn() },
      v1PostEventReview: { findFirst: jest.fn() },
    };
    const service = new TournamentFixtureReviewsService(prisma as never);

    await expect(service.source(user, fixtureId)).rejects.toMatchObject({
      response: { code: 'SOURCE_NOT_COMPLETED' },
    });
  });
});

function fixture(input: { readonly id: string; readonly fixtureNumber: number }) {
  return {
    id: input.id,
    tournamentId,
    tournament: { title: 'TeamMeet Cup' },
    round: '예선',
    fixtureNumber: input.fixtureNumber,
    status: 'completed',
    scheduledAt: recordedAt,
    updatedAt: recordedAt,
    game: { currentOfficialRevision: { state: 'OFFICIAL', officialAt: recordedAt } },
    homeRegistration: {
      teamId: reviewerTeamId,
      team: { id: reviewerTeamId, name: '성수 FC', profile: { logoUrl: null } },
    },
    awayRegistration: {
      teamId: targetTeamId,
      team: { id: targetTeamId, name: '마포 러너스', profile: { logoUrl: null } },
    },
  };
}
