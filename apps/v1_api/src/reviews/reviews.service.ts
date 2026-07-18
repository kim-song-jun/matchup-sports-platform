import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  V1MatchParticipantStatus,
  V1PostEventReviewSourceType,
  V1PostEventReviewTargetType,
  V1TeamMembershipRole,
} from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ListReviewsQueryDto } from './dto/list-reviews.dto';
import { ReviewSourceParamsDto } from './dto/review-source.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { TournamentFixtureReviewsService } from './tournament-fixture-reviews.service';

const REVIEW_TAGS = {
  punctual: '시간 약속을 잘 지켜요',
  manner: '매너가 좋아요',
  teamwork: '팀워크가 좋아요',
  communication: '소통이 원활해요',
  active: '운동에 적극적으로 참여해요',
  considerate: '배려심이 있어요',
  passionate: '열정적으로 운동해요',
  play_again: '또 같이 운동하고 싶어요',
} as const;

type ReviewTagCode = keyof typeof REVIEW_TAGS;

const ELIGIBLE_PARTICIPANT_STATUSES: V1MatchParticipantStatus[] = ['active', 'completed'];
const TEAM_REVIEW_ROLES: V1TeamMembershipRole[] = ['owner', 'manager'];

type SourceType = 'match' | 'team_match' | 'tournament_fixture';
type TargetType = 'user' | 'team';
type PrismaTx = Omit<
  PrismaService,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends' | 'onModuleInit' | 'onModuleDestroy'
>;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentFixtureReviews: TournamentFixtureReviewsService,
  ) {}

  async list(user: V1AuthUser, query: ListReviewsQueryDto) {
    const tab = query.tab ?? 'pending';
    if (tab === 'written') return this.written(user, query);

    const limit = normalizeLimit(query.limit);
    const [personalItems, teamItems, tournamentFixtureItems] = await Promise.all([
      this.pendingPersonalReviews(user, limit),
      this.pendingTeamReviews(user, limit),
      this.tournamentFixtureReviews.pending(user, limit),
    ]);
    const items = [...personalItems, ...teamItems, ...tournamentFixtureItems]
      .sort((a, b) => b.completedAtSort - a.completedAtSort)
      .slice(0, limit)
      .map(({ completedAtSort: _completedAtSort, ...item }) => item);

    return { items, pageInfo: { nextCursor: null, hasNext: false } };
  }

  async received(user: V1AuthUser, query: ListReviewsQueryDto) {
    const limit = normalizeLimit(query.limit);
    const managedTeamIds = await this.managedTeamIds(user.id);
    const receivedFilters: Prisma.V1PostEventReviewWhereInput[] = [{ targetUserId: user.id }];
    if (managedTeamIds.length) receivedFilters.push({ targetTeamId: { in: managedTeamIds } });
    const reviews = await this.prisma.v1PostEventReview.findMany({
      where: {
        status: 'submitted',
        OR: receivedFilters,
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: reviewInclude(),
    });
    const pageItems = reviews.slice(0, limit);

    return {
      items: pageItems.map((review) => this.toReviewDetail(review)),
      pageInfo: { nextCursor: reviews.length > limit ? pageItems.at(-1)?.id ?? null : null, hasNext: reviews.length > limit },
    };
  }

  async source(user: V1AuthUser, params: ReviewSourceParamsDto) {
    if (params.sourceType === 'match') return this.matchSource(user, params.sourceId);
    if (params.sourceType === 'team_match') return this.teamMatchSource(user, params.sourceId);
    return this.tournamentFixtureReviews.source(user, params.sourceId);
  }

  async submit(user: V1AuthUser, dto: SubmitReviewDto) {
    this.assertSubmitShape(dto);
    const tagCodes = uniqueTagCodes(dto.tagCodes);

    if (dto.sourceType === 'match') {
      return this.submitPersonalReview(user, dto, tagCodes);
    }
    if (dto.sourceType === 'team_match') {
      return this.submitTeamReview(user, dto, tagCodes);
    }
    return this.tournamentFixtureReviews.submit(user, dto, tagCodes);
  }

  private async written(user: V1AuthUser, query: ListReviewsQueryDto) {
    const limit = normalizeLimit(query.limit);
    const reviews = await this.prisma.v1PostEventReview.findMany({
      where: { reviewerUserId: user.id },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: reviewInclude(),
    });
    const pageItems = reviews.slice(0, limit);
    const sourceSummaries = await this.reviewSourceSummaries(pageItems);

    return {
      items: pageItems.map((review) => this.toWrittenListItem(review, sourceSummaries)),
      pageInfo: { nextCursor: reviews.length > limit ? pageItems.at(-1)?.id ?? null : null, hasNext: reviews.length > limit },
    };
  }

  private async pendingPersonalReviews(user: V1AuthUser, limit: number) {
    const matches = await this.prisma.v1Match.findMany({
      where: {
        deletedAt: null,
        OR: [{ status: 'completed' }, { completedAt: { not: null } }],
        participants: {
          some: { userId: user.id, status: { in: ELIGIBLE_PARTICIPANT_STATUSES } },
        },
      },
      orderBy: [{ completedAt: 'desc' }, { startAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        completedAt: true,
        startAt: true,
        participants: {
          where: { status: { in: ELIGIBLE_PARTICIPANT_STATUSES } },
          select: { userId: true },
        },
      },
    });
    const matchIds = matches.map((match) => match.id);
    const reviews = matchIds.length
      ? await this.prisma.v1PostEventReview.findMany({
          where: { reviewerUserId: user.id, sourceType: 'match', sourceId: { in: matchIds } },
          select: { sourceId: true, targetUserId: true },
        })
      : [];
    const reviewedBySource = groupReviewedTargets(reviews);

    return matches
      .map((match) => {
        const targetCount = match.participants.filter((participant) => participant.userId !== user.id).length;
        const reviewedCount = reviewedBySource.get(match.id)?.size ?? 0;
        return {
          sourceType: 'match' as const,
          sourceId: match.id,
          title: match.title,
          completedAt: toIso(match.completedAt ?? match.startAt),
          targetType: 'user' as const,
          targetCount,
          reviewedCount,
          remainingCount: Math.max(targetCount - reviewedCount, 0),
          state: reviewedCount >= targetCount ? 'done' : 'ready',
          completedAtSort: (match.completedAt ?? match.startAt).getTime(),
        };
      })
      .filter((item) => item.remainingCount > 0);
  }

  private async pendingTeamReviews(user: V1AuthUser, limit: number) {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId: user.id, status: 'active', role: { in: TEAM_REVIEW_ROLES } },
      select: { teamId: true },
    });
    const teamIds = memberships.map((membership) => membership.teamId);
    if (!teamIds.length) return [];

    const teamMatches = await this.prisma.v1TeamMatch.findMany({
      where: {
        deletedAt: null,
        approvedApplicantTeamId: { not: null },
        OR: [
          { status: 'completed' },
          { completedAt: { not: null } },
        ],
        AND: [
          {
            OR: [
              { hostTeamId: { in: teamIds } },
              { approvedApplicantTeamId: { in: teamIds } },
            ],
          },
        ],
      },
      orderBy: [{ completedAt: 'desc' }, { startAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        hostTeamId: true,
        approvedApplicantTeamId: true,
        completedAt: true,
        startAt: true,
        hostTeam: { select: { id: true, name: true } },
        approvedApplicantTeam: { select: { id: true, name: true } },
      },
    });
    const reviewKeys = await this.existingTeamReviewKeys(teamMatches.map((match) => match.id), teamIds);

    return teamMatches
      .map((match) => {
        const reviewerTeamId = resolveReviewerTeamId(teamIds, match.hostTeamId, match.approvedApplicantTeamId);
        if (!reviewerTeamId || !match.approvedApplicantTeamId) return null;
        const targetTeam = reviewerTeamId === match.hostTeamId ? match.approvedApplicantTeam : match.hostTeam;
        const key = teamReviewKey(match.id, reviewerTeamId, targetTeam?.id ?? '');
        return {
          sourceType: 'team_match' as const,
          sourceId: match.id,
          title: match.title,
          completedAt: toIso(match.completedAt ?? match.startAt),
          targetType: 'team' as const,
          targetCount: 1,
          reviewedCount: reviewKeys.has(key) ? 1 : 0,
          remainingCount: reviewKeys.has(key) ? 0 : 1,
          reviewerTeam: { teamId: reviewerTeamId, name: reviewerTeamId === match.hostTeamId ? match.hostTeam.name : match.approvedApplicantTeam?.name ?? '' },
          targetTeam: targetTeam ? { teamId: targetTeam.id, name: targetTeam.name } : null,
          state: reviewKeys.has(key) ? 'done' : 'ready',
          completedAtSort: (match.completedAt ?? match.startAt).getTime(),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item && item.remainingCount > 0));
  }

  private async matchSource(user: V1AuthUser, sourceId: string) {
    const match = await this.prisma.v1Match.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        title: true,
        status: true,
        completedAt: true,
        startAt: true,
        sportId: true,
        participants: {
          where: { status: { in: ELIGIBLE_PARTICIPANT_STATUSES } },
          select: {
            userId: true,
            user: {
              select: { id: true, profile: { select: { nickname: true, profileImageUrl: true } } },
            },
          },
        },
      },
    });
    if (!match) throw notFound('SOURCE_NOT_FOUND', 'Review source was not found');
    if (!isCompleted(match)) throw conflict('SOURCE_NOT_COMPLETED', 'Review source is not completed');
    if (!match.participants.some((participant) => participant.userId === user.id)) {
      throw forbidden('NOT_SOURCE_PARTICIPANT', 'Only participants can review this match');
    }

    const targetUserIds = match.participants.map((participant) => participant.userId).filter((userId) => userId !== user.id);
    const existingReviews = targetUserIds.length
      ? await this.prisma.v1PostEventReview.findMany({
          where: { reviewerUserId: user.id, sourceType: 'match', sourceId: match.id, targetUserId: { in: targetUserIds } },
          include: reviewInclude(),
        })
      : [];
    const existingByTarget = new Map(existingReviews.map((review) => [review.targetUserId, review]));

    return {
      source: sourceSummary('match', match.id, match.title, match.completedAt ?? match.startAt),
      sportId: match.sportId,
      reviewerTeam: null,
      targets: match.participants
        .filter((participant) => participant.userId !== user.id)
        .map((participant) => {
          const existing = existingByTarget.get(participant.userId);
          return {
            targetType: 'user' as const,
            targetUserId: participant.userId,
            targetTeamId: null,
            name: participant.user.profile?.nickname ?? '참가자',
            imageUrl: participant.user.profile?.profileImageUrl ?? null,
            subtitle: '개인 매치 참가자',
            alreadySubmitted: Boolean(existing),
            review: existing ? this.toReviewDetail(existing) : null,
            locked: Boolean(existing),
            lockReason: existing ? 'ALREADY_SUBMITTED' : null,
          };
        }),
    };
  }

  private async teamMatchSource(user: V1AuthUser, sourceId: string) {
    const teamMatch = await this.prisma.v1TeamMatch.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        title: true,
        status: true,
        completedAt: true,
        startAt: true,
        sportId: true,
        hostTeamId: true,
        approvedApplicantTeamId: true,
        hostTeam: { select: teamSelect() },
        approvedApplicantTeam: { select: teamSelect() },
      },
    });
    if (!teamMatch) throw notFound('SOURCE_NOT_FOUND', 'Review source was not found');
    if (!isCompleted(teamMatch)) throw conflict('SOURCE_NOT_COMPLETED', 'Review source is not completed');
    if (!teamMatch.approvedApplicantTeamId || !teamMatch.approvedApplicantTeam) {
      throw conflict('TEAM_MATCH_NOT_READY', 'Team match does not have an approved opponent');
    }

    const reviewerTeam = await this.resolveReviewerTeam(user.id, teamMatch.hostTeamId, teamMatch.approvedApplicantTeamId);
    const targetTeam = reviewerTeam.teamId === teamMatch.hostTeamId ? teamMatch.approvedApplicantTeam : teamMatch.hostTeam;
    const existing = await this.prisma.v1PostEventReview.findFirst({
      where: {
        reviewerTeamId: reviewerTeam.teamId,
        targetTeamId: targetTeam.id,
        sourceType: 'team_match',
        sourceId: teamMatch.id,
      },
      include: reviewInclude(),
    });

    return {
      source: sourceSummary('team_match', teamMatch.id, teamMatch.title, teamMatch.completedAt ?? teamMatch.startAt),
      sportId: teamMatch.sportId,
      reviewerTeam,
      targets: [{
        targetType: 'team' as const,
        targetUserId: null,
        targetTeamId: targetTeam.id,
        name: targetTeam.name,
        imageUrl: targetTeam.profile?.logoUrl ?? null,
        subtitle: '상대 팀',
        alreadySubmitted: Boolean(existing),
        review: existing ? this.toReviewDetail(existing) : null,
        locked: Boolean(existing),
        lockReason: existing ? 'ALREADY_SUBMITTED' : null,
      }],
    };
  }

  private async submitPersonalReview(user: V1AuthUser, dto: SubmitReviewDto, tagCodes: ReviewTagCode[]) {
    if (!dto.targetUserId) throw badRequest('TARGET_USER_REQUIRED', 'targetUserId is required');
    const targetUserId = dto.targetUserId;
    const source = await this.matchSource(user, dto.sourceId);
    const target = source.targets.find((item) => item.targetUserId === targetUserId);
    if (!target) throw forbidden('TARGET_NOT_REVIEWABLE', 'Target user is not reviewable for this source');
    const existing = target.review;
    if (existing) return { review: existing, alreadySubmitted: true };

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1PostEventReview.create({
        data: {
          reviewerUserId: user.id,
          sourceType: 'match',
          sourceId: dto.sourceId,
          targetType: 'user',
          targetUserId,
          rating: dto.rating,
          sportId: source.sportId,
          tags: { create: tagCodes.map((tagCode) => ({ tagCode, labelSnapshot: REVIEW_TAGS[tagCode] })) },
        },
        include: reviewInclude(),
      });
      await this.recalculateUserReputation(tx, targetUserId);
      return created;
    }).catch(async (error: unknown) => {
      if (!isUniqueConstraintError(error)) throw error;
      return this.findExistingPersonalReview(user.id, dto.sourceId, targetUserId);
    });

    return { review: this.toReviewDetail(review), alreadySubmitted: isExistingReviewResult(review) };
  }

  private async submitTeamReview(user: V1AuthUser, dto: SubmitReviewDto, tagCodes: ReviewTagCode[]) {
    if (!dto.targetTeamId) throw badRequest('TARGET_TEAM_REQUIRED', 'targetTeamId is required');
    const targetTeamId = dto.targetTeamId;
    const source = await this.teamMatchSource(user, dto.sourceId);
    const target = source.targets.find((item) => item.targetTeamId === targetTeamId);
    if (!target || !source.reviewerTeam) throw forbidden('TARGET_NOT_REVIEWABLE', 'Target team is not reviewable for this source');
    const existing = target.review;
    if (existing) return { review: existing, alreadySubmitted: true };

    const reviewerTeamId = source.reviewerTeam.teamId;
    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1PostEventReview.create({
        data: {
          reviewerUserId: user.id,
          reviewerTeamId,
          sourceType: 'team_match',
          sourceId: dto.sourceId,
          targetType: 'team',
          targetTeamId,
          rating: dto.rating,
          sportId: source.sportId,
          tags: { create: tagCodes.map((tagCode) => ({ tagCode, labelSnapshot: REVIEW_TAGS[tagCode] })) },
        },
        include: reviewInclude(),
      });
      await this.recalculateTeamTrust(tx, targetTeamId);
      return created;
    }).catch(async (error: unknown) => {
      if (!isUniqueConstraintError(error)) throw error;
      return this.findExistingTeamReview(reviewerTeamId, dto.sourceId, targetTeamId);
    });

    return { review: this.toReviewDetail(review), alreadySubmitted: isExistingReviewResult(review) };
  }

  private async findExistingPersonalReview(reviewerUserId: string, sourceId: string, targetUserId: string) {
    const review = await this.prisma.v1PostEventReview.findFirst({
      where: { reviewerUserId, sourceType: 'match', sourceId, targetUserId },
      include: reviewInclude(),
    });
    if (!review) throw conflict('DUPLICATE_REVIEW_RETRY', 'Duplicate review was detected but existing review was not found');
    return markExistingReviewResult(review);
  }

  private async findExistingTeamReview(reviewerTeamId: string, sourceId: string, targetTeamId: string) {
    const review = await this.prisma.v1PostEventReview.findFirst({
      where: { reviewerTeamId, sourceType: 'team_match', sourceId, targetTeamId },
      include: reviewInclude(),
    });
    if (!review) throw conflict('DUPLICATE_REVIEW_RETRY', 'Duplicate review was detected but existing review was not found');
    return markExistingReviewResult(review);
  }

  private async reviewSourceSummaries(reviews: ReviewWithIncludes[]) {
    const matchIds = reviews.filter((review) => review.sourceType === 'match').map((review) => review.sourceId);
    const teamMatchIds = reviews.filter((review) => review.sourceType === 'team_match').map((review) => review.sourceId);
    const tournamentFixtureIds = reviews.filter((review) => review.sourceType === 'tournament_fixture').map((review) => review.sourceId);
    const [matches, teamMatches, tournamentFixtures] = await Promise.all([
      matchIds.length
        ? this.prisma.v1Match.findMany({
            where: { id: { in: matchIds } },
            select: { id: true, title: true, completedAt: true, startAt: true },
          })
        : [],
      teamMatchIds.length
        ? this.prisma.v1TeamMatch.findMany({
            where: { id: { in: teamMatchIds } },
            select: { id: true, title: true, completedAt: true, startAt: true },
          })
        : [],
      this.tournamentFixtureReviews.sourceSummaries(tournamentFixtureIds),
    ]);

    return new Map([
      ...matches.map((match) => [`match:${match.id}`, sourceSummary('match', match.id, match.title, match.completedAt ?? match.startAt)] as const),
      ...teamMatches.map((match) => [`team_match:${match.id}`, sourceSummary('team_match', match.id, match.title, match.completedAt ?? match.startAt)] as const),
      ...tournamentFixtures,
    ]);
  }

  private async resolveReviewerTeam(userId: string, hostTeamId: string, approvedApplicantTeamId: string) {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: {
        userId,
        status: 'active',
        role: { in: TEAM_REVIEW_ROLES },
        teamId: { in: [hostTeamId, approvedApplicantTeamId] },
      },
      select: { teamId: true, role: true, team: { select: { name: true } } },
    });
    if (memberships.length === 0) {
      throw forbidden('NOT_TEAM_REVIEW_MANAGER', 'Only participating team owner or manager can submit team reviews');
    }
    if (memberships.length > 1) {
      throw conflict('AMBIGUOUS_REVIEWER_TEAM', 'Reviewer manages both participating teams');
    }
    const membership = memberships[0];
    return { teamId: membership.teamId, name: membership.team.name, role: membership.role as 'owner' | 'manager' };
  }

  private async managedTeamIds(userId: string) {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId, status: 'active', role: { in: TEAM_REVIEW_ROLES } },
      select: { teamId: true },
    });
    return memberships.map((membership) => membership.teamId);
  }

  private async existingTeamReviewKeys(sourceIds: string[], reviewerTeamIds: string[]) {
    if (!sourceIds.length || !reviewerTeamIds.length) return new Set<string>();
    const reviews = await this.prisma.v1PostEventReview.findMany({
      where: {
        sourceType: 'team_match',
        sourceId: { in: sourceIds },
        reviewerTeamId: { in: reviewerTeamIds },
      },
      select: { sourceId: true, reviewerTeamId: true, targetTeamId: true },
    });
    return new Set(reviews.map((review) => teamReviewKey(review.sourceId, review.reviewerTeamId ?? '', review.targetTeamId ?? '')));
  }

  private async recalculateUserReputation(tx: PrismaTx, targetUserId: string) {
    const aggregate = await tx.v1PostEventReview.aggregate({
      where: { targetUserId, targetType: 'user', status: 'submitted' },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const reviewCount = aggregate._count._all;
    await tx.v1UserReputationSummary.upsert({
      where: { userId: targetUserId },
      update: reputationData(reviewCount, aggregate._avg.rating, '완료 경기 리뷰 기반'),
      create: { userId: targetUserId, ...reputationData(reviewCount, aggregate._avg.rating, '완료 경기 리뷰 기반') },
    });
  }

  private async recalculateTeamTrust(tx: PrismaTx, targetTeamId: string) {
    const [aggregate, completedMatchCount] = await Promise.all([
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
    ]);
    const reviewCount = aggregate._count._all;
    await tx.v1TeamTrustScore.upsert({
      where: { teamId: targetTeamId },
      update: {
        trustState: trustStateForReviewCount(reviewCount),
        mannerScore: decimalScore(aggregate._avg.rating),
        matchCount: completedMatchCount,
        sourceLabel: '완료 팀매치 리뷰 기반',
        calculatedAt: new Date(),
      },
      create: {
        teamId: targetTeamId,
        trustState: trustStateForReviewCount(reviewCount),
        mannerScore: decimalScore(aggregate._avg.rating),
        matchCount: completedMatchCount,
        sourceLabel: '완료 팀매치 리뷰 기반',
        calculatedAt: new Date(),
      },
    });
  }

  private assertSubmitShape(dto: SubmitReviewDto) {
    if (dto.sourceType === 'match' && (dto.targetType !== 'user' || !dto.targetUserId || dto.targetTeamId)) {
      throw badRequest('INVALID_MATCH_REVIEW_TARGET', 'Match reviews require targetType=user and targetUserId only');
    }
    if (dto.sourceType === 'team_match' && (dto.targetType !== 'team' || !dto.targetTeamId || dto.targetUserId)) {
      throw badRequest('INVALID_TEAM_MATCH_REVIEW_TARGET', 'Team match reviews require targetType=team and targetTeamId only');
    }
    if (dto.sourceType === 'tournament_fixture' && (dto.targetType !== 'team' || !dto.targetTeamId || dto.targetUserId)) {
      throw badRequest('INVALID_TOURNAMENT_FIXTURE_REVIEW_TARGET', 'Tournament fixture reviews require targetType=team and targetTeamId only');
    }
  }

  private toReviewDetail(review: ReviewWithIncludes) {
    return {
      reviewId: review.id,
      sourceType: review.sourceType,
      sourceId: review.sourceId,
      targetType: review.targetType,
      targetUser: review.targetUser ? {
        userId: review.targetUser.id,
        name: review.targetUser.profile?.nickname ?? '사용자',
        imageUrl: review.targetUser.profile?.profileImageUrl ?? null,
      } : null,
      targetTeam: review.targetTeam ? {
        teamId: review.targetTeam.id,
        name: review.targetTeam.name,
        imageUrl: review.targetTeam.profile?.logoUrl ?? null,
      } : null,
      reviewerUser: {
        userId: review.reviewerUser.id,
        name: review.reviewerUser.profile?.nickname ?? '사용자',
        imageUrl: review.reviewerUser.profile?.profileImageUrl ?? null,
      },
      reviewerTeam: review.reviewerTeam ? {
        teamId: review.reviewerTeam.id,
        name: review.reviewerTeam.name,
        imageUrl: review.reviewerTeam.profile?.logoUrl ?? null,
      } : null,
      rating: review.rating,
      tags: review.tags.map((tag) => ({ tagCode: tag.tagCode, label: tag.labelSnapshot })),
      status: review.status,
      submittedAt: toIso(review.submittedAt),
    };
  }

  private toWrittenListItem(review: ReviewWithIncludes, sources: Map<string, ReturnType<typeof sourceSummary>>) {
    const source = sources.get(`${review.sourceType}:${review.sourceId}`);
    const targetName = review.targetType === 'team'
      ? review.targetTeam?.name ?? '상대 팀'
      : review.targetUser?.profile?.nickname ?? '참가자';

    return {
      sourceType: review.sourceType,
      sourceId: review.sourceId,
      title: source?.title ?? `${targetName}에게 보낸 리뷰`,
      completedAt: source?.completedAt ?? toIso(review.submittedAt),
      targetType: review.targetType,
      targetCount: 1,
      reviewedCount: 1,
      remainingCount: 0,
      state: 'done' as const,
      reviewerTeam: review.reviewerTeam ? { teamId: review.reviewerTeam.id, name: review.reviewerTeam.name } : null,
      targetTeam: review.targetTeam ? { teamId: review.targetTeam.id, name: review.targetTeam.name } : null,
    };
  }
}

type ReviewWithIncludes = Prisma.V1PostEventReviewGetPayload<{
  include: ReturnType<typeof reviewInclude>;
}>;
type ExistingReviewWithIncludes = ReviewWithIncludes & { __alreadySubmitted: true };

function markExistingReviewResult(review: ReviewWithIncludes): ExistingReviewWithIncludes {
  return Object.assign(review, { __alreadySubmitted: true as const });
}

function isExistingReviewResult(review: ReviewWithIncludes): review is ExistingReviewWithIncludes {
  return '__alreadySubmitted' in review;
}

function reviewInclude() {
  return {
    tags: { orderBy: { createdAt: 'asc' as const } },
    reviewerUser: { select: userSelect() },
    reviewerTeam: { select: teamSelect() },
    targetUser: { select: userSelect() },
    targetTeam: { select: teamSelect() },
  };
}

function userSelect() {
  return { id: true, profile: { select: { nickname: true, profileImageUrl: true } } };
}

function teamSelect() {
  return { id: true, name: true, profile: { select: { logoUrl: true } } };
}

function sourceSummary(sourceType: SourceType, sourceId: string, title: string, completedAt: Date | null) {
  return { sourceType, sourceId, title, completedAt: completedAt ? toIso(completedAt) : null };
}

function normalizeLimit(limit?: number) {
  return Math.min(Math.max(limit ?? 20, 1), 50);
}

function toIso(value: Date) {
  return value.toISOString();
}

function isCompleted(source: { status: string; completedAt: Date | null }) {
  return source.status === 'completed' || Boolean(source.completedAt);
}

function uniqueTagCodes(tagCodes: string[]): ReviewTagCode[] {
  return [...new Set(tagCodes)].filter((tagCode): tagCode is ReviewTagCode => tagCode in REVIEW_TAGS);
}

function reputationData(reviewCount: number, avgRating: number | null, sourceLabel: string) {
  return {
    trustState: trustStateForReviewCount(reviewCount),
    mannerScore: decimalScore(avgRating),
    reviewCount,
    sourceLabel,
    calculatedAt: new Date(),
  };
}

function trustStateForReviewCount(reviewCount: number) {
  if (reviewCount >= 3) return 'verified' as const;
  if (reviewCount >= 1) return 'estimated' as const;
  return 'none' as const;
}

function decimalScore(avgRating: number | null) {
  return avgRating === null ? null : new Prisma.Decimal(avgRating.toFixed(2));
}

function groupReviewedTargets(reviews: Array<{ sourceId: string; targetUserId: string | null }>) {
  const grouped = new Map<string, Set<string>>();
  for (const review of reviews) {
    if (!review.targetUserId) continue;
    const current = grouped.get(review.sourceId) ?? new Set<string>();
    current.add(review.targetUserId);
    grouped.set(review.sourceId, current);
  }
  return grouped;
}

function resolveReviewerTeamId(teamIds: string[], hostTeamId: string, approvedApplicantTeamId: string | null) {
  const matches = teamIds.filter((teamId) => teamId === hostTeamId || teamId === approvedApplicantTeamId);
  return matches.length === 1 ? matches[0] : null;
}

function teamReviewKey(sourceId: string, reviewerTeamId: string, targetTeamId: string) {
  return `${sourceId}:${reviewerTeamId}:${targetTeamId}`;
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

function badRequest(code: string, message: string) {
  return new BadRequestException({ code, message });
}

function forbidden(code: string, message: string) {
  return new ForbiddenException({ code, message });
}

function notFound(code: string, message: string) {
  return new NotFoundException({ code, message });
}

function conflict(code: string, message: string) {
  return new ConflictException({ code, message });
}
