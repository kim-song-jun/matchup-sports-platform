import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  fixtureTeams,
  fixtureTitle,
  isExistingReviewResult,
  isUniqueConstraintError,
  markExistingReviewResult,
  officialResultTimestamp,
  REVIEW_TAGS,
  reviewInclude,
  resolveReviewerTeamId,
  sourceSummary,
  teamReviewKey,
  TOURNAMENT_FIXTURE_SOURCE_TYPE,
  toIso,
  toReviewDetail,
  tournamentFixtureSelect,
  type TournamentFixtureReviewTagCode,
} from './tournament-fixture-review-mappers';
import { recalculateTournamentFixtureTeamTrust } from './tournament-fixture-review-trust';

@Injectable()
export class TournamentFixtureReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async pending(user: V1AuthUser, limit: number) {
    const teamIds = await this.participatingTeamIds(user.id);
    if (!teamIds.length) return [];

    const fixtures = await this.prisma.v1TournamentFixture.findMany({
      where: {
        status: 'completed',
        homeRegistrationId: { not: null },
        awayRegistrationId: { not: null },
        OR: [
          { homeRegistration: { is: { teamId: { in: teamIds } } } },
          { awayRegistration: { is: { teamId: { in: teamIds } } } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { fixtureNumber: 'desc' }],
      take: limit * 4,
      select: tournamentFixtureSelect(),
    });
    const reviewKeys = await this.existingReviewKeys(fixtures.map((fixture) => fixture.tournamentId), user.id);
    const seenKeys = new Set<string>();

    return fixtures
      .map((fixture) => {
        const teams = fixtureTeams(fixture);
        if (!teams) return null;
        const reviewerTeamId = resolveReviewerTeamId(teamIds, teams.home.teamId, teams.away.teamId);
        if (!reviewerTeamId) return null;
        const targetTeam = reviewerTeamId === teams.home.teamId ? teams.away : teams.home;
        // 키의 주체는 팀이 아니라 사람이다 — 팀 기준이면 팀장이 쓴 순간 나머지 팀원 전원의
        // 목록에서 이 경기가 완료 처리돼 사라진다.
        const key = teamReviewKey(fixture.tournamentId, user.id, targetTeam.teamId);
        if (seenKeys.has(key)) return null;
        seenKeys.add(key);
        return {
          sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE,
          sourceId: fixture.id,
          title: fixtureTitle(fixture),
          completedAt: toIso(officialResultTimestamp(fixture) ?? fixture.scheduledAt ?? fixture.updatedAt),
          targetType: 'team' as const,
          targetCount: 1,
          reviewedCount: reviewKeys.has(key) ? 1 : 0,
          remainingCount: reviewKeys.has(key) ? 0 : 1,
          reviewerTeam: {
            teamId: reviewerTeamId,
            name: reviewerTeamId === teams.home.teamId ? teams.home.name : teams.away.name,
          },
          targetTeam: { teamId: targetTeam.teamId, name: targetTeam.name },
          state: reviewKeys.has(key) ? 'done' as const : 'ready' as const,
          completedAtSort: (officialResultTimestamp(fixture) ?? fixture.scheduledAt ?? fixture.updatedAt).getTime(),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item && item.remainingCount > 0));
  }

  async source(user: V1AuthUser, sourceId: string) {
    const context = await this.reviewContext(user.id, sourceId);
    const existing = context.existing;

    return {
      source: sourceSummary(
        context.fixture.id,
        fixtureTitle(context.fixture),
        officialResultTimestamp(context.fixture),
      ),
      reviewerTeam: context.reviewerTeam,
      targets: [{
        targetType: 'team' as const,
        targetUserId: null,
        targetTeamId: context.targetTeam.teamId,
        name: context.targetTeam.name,
        imageUrl: context.targetTeam.imageUrl,
        subtitle: '대회 상대 팀',
        alreadySubmitted: Boolean(existing),
        review: existing ? toReviewDetail(existing) : null,
        locked: Boolean(existing),
        lockReason: existing ? 'ALREADY_SUBMITTED' : null,
      }],
    };
  }

  async submit(user: V1AuthUser, dto: TournamentFixtureReviewSubmitInput, tagCodes: TournamentFixtureReviewTagCode[]) {
    if (!dto.targetTeamId) throw conflict('TARGET_TEAM_REQUIRED', 'targetTeamId is required');
    const targetTeamId = dto.targetTeamId;
    const context = await this.reviewContext(user.id, dto.sourceId);
    if (context.targetTeam.teamId !== targetTeamId) {
      throw forbidden('TARGET_NOT_REVIEWABLE', 'Target team is not reviewable for this source');
    }
    if (context.existing) return { review: toReviewDetail(context.existing), alreadySubmitted: true };

    const reviewerTeamId = context.reviewerTeam.teamId;
    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1PostEventReview.create({
        data: {
          reviewerUserId: user.id,
          reviewerTeamId,
          sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE,
          sourceId: dto.sourceId,
          sourceGroupId: context.fixture.tournamentId,
          targetType: 'team',
          targetTeamId,
          rating: dto.rating,
          tags: { create: tagCodes.map((tagCode) => ({ tagCode, labelSnapshot: REVIEW_TAGS[tagCode] })) },
        },
        include: reviewInclude(),
      });
      await recalculateTournamentFixtureTeamTrust(tx, targetTeamId);
      return created;
    }).catch(async (error: unknown) => {
      if (!isUniqueConstraintError(error)) throw error;
      return this.findExistingReview(user.id, context.fixture.tournamentId, targetTeamId);
    });

    return { review: toReviewDetail(review), alreadySubmitted: isExistingReviewResult(review) };
  }

  async sourceSummaries(sourceIds: string[]) {
    if (!sourceIds.length) return new Map<string, ReturnType<typeof sourceSummary>>();
    const fixtures = await this.prisma.v1TournamentFixture.findMany({
      where: { id: { in: sourceIds } },
      select: tournamentFixtureSelect(),
    });
    return new Map(fixtures.map((fixture) => [
      `${TOURNAMENT_FIXTURE_SOURCE_TYPE}:${fixture.id}`,
      sourceSummary(
        fixture.id,
        fixtureTitle(fixture),
        officialResultTimestamp(fixture) ?? fixture.scheduledAt ?? fixture.updatedAt,
      ),
    ] as const));
  }

  private async reviewContext(userId: string, sourceId: string) {
    const fixture = await this.prisma.v1TournamentFixture.findUnique({
      where: { id: sourceId },
      select: tournamentFixtureSelect(),
    });
    if (!fixture) throw notFound('SOURCE_NOT_FOUND', 'Review source was not found');
    if (fixture.status !== 'completed' || !officialResultTimestamp(fixture)) {
      throw conflict('SOURCE_NOT_COMPLETED', 'Review source is not completed');
    }

    const teams = fixtureTeams(fixture);
    if (!teams) throw conflict('TOURNAMENT_FIXTURE_NOT_READY', 'Tournament fixture does not have both teams');
    const reviewerTeam = await this.resolveReviewerTeam(userId, teams.home.teamId, teams.away.teamId);
    const targetTeam = reviewerTeam.teamId === teams.home.teamId ? teams.away : teams.home;
    // 중복 판정은 사람 기준 — reviewerTeamId로 찾으면 같은 팀의 다른 멤버가 쓴 후기를
    // "내 기존 후기"로 집어 두 번째 작성자부터 alreadySubmitted로 막힌다.
    const existing = await this.prisma.v1PostEventReview.findFirst({
      where: {
        reviewerUserId: userId,
        targetTeamId: targetTeam.teamId,
        sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE,
        sourceGroupId: fixture.tournamentId,
      },
      include: reviewInclude(),
      orderBy: { submittedAt: 'asc' },
    });

    return { fixture, reviewerTeam, targetTeam, existing };
  }

  // 참가팀의 active 멤버면 역할과 무관하게 상대팀 후기를 쓸 수 있다. 경기에 뛴 사람은 팀
  // 전체인데 평가를 팀장 한 명의 인상으로 결정하면 표본이 1이라 개인 편향이 그대로 팀
  // 신뢰도가 된다. 인원 수에 따른 영향력 차이는 집계 쪽에서 "팀 평균 1표"로 흡수한다.
  private async resolveReviewerTeam(userId: string, homeTeamId: string, awayTeamId: string) {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: {
        userId,
        status: 'active',
        teamId: { in: [homeTeamId, awayTeamId] },
      },
      select: { teamId: true, role: true, team: { select: { name: true } } },
    });
    if (memberships.length === 0) {
      throw forbidden('NOT_TEAM_MEMBER', '참가팀 소속만 후기를 쓸 수 있어요.');
    }
    // 양 팀 모두에 소속된 사용자는 어느 팀 입장으로 쓰는지 서버가 임의로 정할 수 없다.
    if (memberships.length > 1) {
      throw conflict('AMBIGUOUS_REVIEWER_TEAM', 'Reviewer belongs to both participating teams');
    }
    const membership = memberships[0];
    return { teamId: membership.teamId, name: membership.team.name, role: membership.role };
  }

  private async participatingTeamIds(userId: string) {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId, status: 'active' },
      select: { teamId: true },
    });
    return memberships.map((membership) => membership.teamId);
  }

  private async existingReviewKeys(sourceGroupIds: string[], reviewerUserId: string) {
    if (!sourceGroupIds.length) return new Set<string>();
    const reviews = await this.prisma.v1PostEventReview.findMany({
      where: {
        sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE,
        sourceGroupId: { in: sourceGroupIds },
        reviewerUserId,
      },
      select: { sourceGroupId: true, targetTeamId: true },
    });
    return new Set(reviews.map((review) => (
      teamReviewKey(review.sourceGroupId ?? '', reviewerUserId, review.targetTeamId ?? '')
    )));
  }

  private async findExistingReview(reviewerUserId: string, sourceGroupId: string, targetTeamId: string) {
    const review = await this.prisma.v1PostEventReview.findFirst({
      where: { reviewerUserId, sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE, sourceGroupId, targetTeamId },
      include: reviewInclude(),
      orderBy: { submittedAt: 'asc' },
    });
    if (!review) {
      throw conflict('DUPLICATE_REVIEW_RETRY', 'Duplicate review was detected but existing review was not found');
    }
    return markExistingReviewResult(review);
  }
}

export type TournamentFixtureReviewSubmitInput = {
  readonly sourceId: string;
  readonly targetTeamId?: string | null;
  readonly rating: number;
};

function forbidden(code: string, message: string) {
  return new ForbiddenException({ code, message });
}

function notFound(code: string, message: string) {
  return new NotFoundException({ code, message });
}

function conflict(code: string, message: string) {
  return new ConflictException({ code, message });
}
