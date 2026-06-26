import { Prisma } from '@prisma/client';
import { teamTrustData } from './tournament-fixture-review-mappers';

export async function recalculateTournamentFixtureTeamTrust(
  tx: Prisma.TransactionClient,
  targetTeamId: string,
) {
  const [aggregate, teamMatchCount, tournamentFixtureCount] = await Promise.all([
    tx.v1PostEventReview.aggregate({
      where: { targetTeamId, targetType: 'team', status: 'submitted' },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    tx.v1TeamMatch.count({
      where: {
        OR: [{ hostTeamId: targetTeamId }, { approvedApplicantTeamId: targetTeamId }],
        AND: [{ OR: [{ status: 'completed' }, { completedAt: { not: null } }] }],
      },
    }),
    tx.v1TournamentFixture.count({
      where: {
        status: 'completed',
        OR: [
          { homeRegistration: { is: { teamId: targetTeamId } } },
          { awayRegistration: { is: { teamId: targetTeamId } } },
        ],
      },
    }),
  ]);
  const reviewCount = aggregate._count._all;
  const trustData = teamTrustData(reviewCount, aggregate._avg.rating, teamMatchCount + tournamentFixtureCount);
  await tx.v1TeamTrustScore.upsert({
    where: { teamId: targetTeamId },
    update: trustData,
    create: { teamId: targetTeamId, ...trustData },
  });
}
