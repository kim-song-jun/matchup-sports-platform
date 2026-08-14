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
import { isReviewRevealed, reviewRevealScope } from './review-visibility';
import { average, revealGroupKey, trustStateForReviewCount } from './team-trust-aggregation';
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

type SourceType = 'match' | 'team_match' | 'tournament_fixture';
type TargetType = 'user' | 'team';
type RevealScopeCandidate = { sourceType: V1PostEventReviewSourceType; sourceId: string; sourceGroupId: string | null };
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
    if (tab === 'written') {
      if (query.tournamentId) {
        throw new BadRequestException({
          code: 'TOURNAMENT_FILTER_PENDING_ONLY',
          message: 'tournamentId filter is only available for pending reviews',
        });
      }
      return this.written(user, query);
    }

    const limit = normalizeLimit(query.limit);
    if (query.tournamentId) {
      const tournamentFixtureItems = await this.tournamentFixtureReviews.pending(user, limit, query.tournamentId);
      return {
        items: tournamentFixtureItems
          .slice(0, limit)
          .map(({ completedAtSort: _completedAtSort, ...item }) => item),
        pageInfo: { nextCursor: null, hasNext: false },
      };
    }
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
    const participatingTeamIds = await this.participatingTeamIds(user.id);
    const receivedFilters: Prisma.V1PostEventReviewWhereInput[] = [{ targetUserId: user.id }];
    if (participatingTeamIds.length) receivedFilters.push({ targetTeamId: { in: participatingTeamIds } });
    const reviews = await this.prisma.v1PostEventReview.findMany({
      where: {
        status: 'submitted',
        sportId: null, // 레거시(이 기능 출시 이전) 리뷰만 — 개별 노출은 소급 마스킹하지 않는다는 스펙에 따름
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

  async receivedSummary(user: V1AuthUser, query: { targetType: 'user' | 'team'; period?: string }) {
    const now = new Date();
    const targetFilter = query.targetType === 'team'
      ? { targetTeamId: { in: await this.participatingTeamIds(user.id) }, targetType: 'team' as const }
      // 개인 대상 요약은 개인 매치(sourceType='match') 후기만 센다.
      // 대회 개인 후기는 V1UserReputationSummary의 tournament_* 컬럼으로 따로 집계되는데
      // (recalculateUserReputation도 sourceType='match'로 좁혀 같은 분리를 지킨다), 여기만
      // 필터가 없으면 그 후기들이 종목별 평균에 원시 건수 그대로 합산돼 분리가 절반만 이뤄진다.
      // 대회에서 상대팀 로스터 전원에게 평가받으면 며칠 만에 수십 건이 들어와 점수가 급변한다.
      : { targetUserId: user.id, targetType: 'user' as const, sourceType: 'match' as const };

    const candidates = await this.prisma.v1PostEventReview.findMany({
      where: { status: 'submitted', sportId: { not: null }, ...targetFilter },
      select: { sourceType: true, sourceId: true, sourceGroupId: true, reviewerUserId: true, reviewerTeamId: true, targetUserId: true, targetTeamId: true, rating: true, sportId: true, submittedAt: true, tags: { select: { tagCode: true, labelSnapshot: true } } },
    });

    const reverseReviews = query.targetType === 'team'
      ? await this.reverseTeamReviews(candidates)
      : await this.reverseUserReviews(user.id, candidates);

    const revealed = candidates.filter((review) =>
      isReviewRevealed(
        {
          // 짝을 맞추는 단위는 경기가 아니라 reviewRevealScope() — 대회 후기는 중복 방지 스코프가
          // 대회 단위라, 서로 다른 경기에서 평가한 짝이 픽스처 기준으로는 절대 맞지 않는다.
          sourceId: reviewRevealScope(review),
          reviewerUserId: query.targetType === 'team' ? review.reviewerTeamId ?? '' : review.reviewerUserId,
          targetUserId: query.targetType === 'team' ? review.targetTeamId : review.targetUserId,
          submittedAt: review.submittedAt,
        },
        reverseReviews,
        now,
      ),
    );

    const availableMonths = [...new Set(revealed.map((review) => review.submittedAt.toISOString().slice(0, 7)))].sort().reverse();
    const filtered = query.period
      ? revealed.filter((review) => review.submittedAt.toISOString().slice(0, 7) === query.period)
      : revealed;

    return { bySport: summarizeBySport(filtered), availableMonths };
  }

  private async reverseUserReviews(targetUserId: string, candidates: RevealScopeCandidate[]) {
    if (!candidates.length) return [];
    const reverse = await this.prisma.v1PostEventReview.findMany({
      where: { reviewerUserId: targetUserId, status: 'submitted', OR: revealScopeFilters(candidates) },
      select: { sourceType: true, sourceId: true, sourceGroupId: true, reviewerUserId: true, targetUserId: true },
    });
    return reverse.map((review) => ({
      sourceId: reviewRevealScope(review),
      reviewerUserId: review.reviewerUserId,
      targetUserId: review.targetUserId,
    }));
  }

  private async reverseTeamReviews(candidates: Array<RevealScopeCandidate & { targetTeamId: string | null }>) {
    if (!candidates.length) return [];
    const teamIds = [...new Set(candidates.map((review) => review.targetTeamId).filter((id): id is string => Boolean(id)))];
    if (!teamIds.length) return [];
    const reverse = await this.prisma.v1PostEventReview.findMany({
      where: { reviewerTeamId: { in: teamIds }, status: 'submitted', OR: revealScopeFilters(candidates) },
      select: { sourceType: true, sourceId: true, sourceGroupId: true, reviewerTeamId: true, targetTeamId: true },
    });
    return reverse.map((review) => ({ sourceId: reviewRevealScope(review), reviewerUserId: review.reviewerTeamId ?? '', targetUserId: review.targetTeamId }));
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
    const teamIds = await this.participatingTeamIds(user.id);
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
    // "이미 썼음" 판정은 사람 기준 — 팀 기준으로 두면 팀장이 쓴 순간 나머지 팀원 전원에게 완료로 표시된다.
    const reviewKeys = await this.existingTeamReviewKeys(teamMatches.map((match) => match.id), user.id);

    return teamMatches
      .flatMap((match) => {
        if (!match.approvedApplicantTeamId) return [];
        // 양 팀 모두의 멤버면 두 방향이 각각 별도의 후기 항목이 된다.
        return resolveReviewerTeamIds(teamIds, match.hostTeamId, match.approvedApplicantTeamId).map((reviewerTeamId) => {
          const isHost = reviewerTeamId === match.hostTeamId;
          const targetTeam = isHost ? match.approvedApplicantTeam : match.hostTeam;
          const key = teamReviewKey(match.id, targetTeam?.id ?? '');
          return {
            sourceType: 'team_match' as const,
            sourceId: match.id,
            title: match.title,
            completedAt: toIso(match.completedAt ?? match.startAt),
            targetType: 'team' as const,
            targetCount: 1,
            reviewedCount: reviewKeys.has(key) ? 1 : 0,
            remainingCount: reviewKeys.has(key) ? 0 : 1,
            reviewerTeam: { teamId: reviewerTeamId, name: isHost ? match.hostTeam.name : match.approvedApplicantTeam?.name ?? '' },
            targetTeam: targetTeam ? { teamId: targetTeam.id, name: targetTeam.name } : null,
            state: reviewKeys.has(key) ? 'done' : 'ready',
            completedAtSort: (match.completedAt ?? match.startAt).getTime(),
          };
        });
      })
      .filter((item) => item.remainingCount > 0);
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
            // 개인 매치는 팀을 대표해 쓰는 후기가 아니다 — 팀 대상 후기와 target 모양만 맞춘다.
            reviewerTeam: null,
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

    // 양 팀 모두의 멤버면 두 방향 모두 대상이 된다 — 어느 팀 입장인지는 target 마다 실어 보낸다.
    const reviewerTeams = await this.resolveReviewerTeams(user.id, teamMatch.hostTeamId, teamMatch.approvedApplicantTeamId);
    const opponentOf = (reviewerTeamId: string) =>
      reviewerTeamId === teamMatch.hostTeamId ? teamMatch.approvedApplicantTeam! : teamMatch.hostTeam;
    // 기존 후기 조회도 사람 기준 — 팀 기준으로 조회하면 같은 팀 다른 사람의 후기를 "내 후기"로 잘못 잠근다.
    const existingReviews = await this.prisma.v1PostEventReview.findMany({
      where: {
        reviewerUserId: user.id,
        targetTeamId: { in: reviewerTeams.map((team) => opponentOf(team.teamId).id) },
        sourceType: 'team_match',
        sourceId: teamMatch.id,
      },
      include: reviewInclude(),
    });
    const existingByTargetTeam = new Map(existingReviews.map((review) => [review.targetTeamId, review]));

    return {
      source: sourceSummary('team_match', teamMatch.id, teamMatch.title, teamMatch.completedAt ?? teamMatch.startAt),
      sportId: teamMatch.sportId,
      // 겸직이면 단일 값으로 좁힐 수 없으므로 null — 소비자는 target.reviewerTeam 을 봐야 한다.
      reviewerTeam: reviewerTeams.length === 1 ? reviewerTeams[0] : null,
      targets: reviewerTeams.map((reviewerTeam) => {
        const targetTeam = opponentOf(reviewerTeam.teamId);
        const existing = existingByTargetTeam.get(targetTeam.id) ?? null;
        return {
          targetType: 'team' as const,
          targetUserId: null,
          targetTeamId: targetTeam.id,
          reviewerTeam,
          name: targetTeam.name,
          imageUrl: targetTeam.profile?.logoUrl ?? null,
          subtitle: '상대 팀',
          alreadySubmitted: Boolean(existing),
          review: existing ? this.toReviewDetail(existing) : null,
          locked: Boolean(existing),
          lockReason: existing ? 'ALREADY_SUBMITTED' : null,
        };
      }),
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
    if (!target) throw forbidden('TARGET_NOT_REVIEWABLE', 'Target team is not reviewable for this source');
    // 2팀 경기에서는 대상 팀이 곧 작성자 팀을 결정한다(B를 평가하면 나는 A 입장) —
    // 겸직이어도 별도의 reviewerTeamId 를 받을 필요가 없다.
    const existing = target.review;
    if (existing) return { review: existing, alreadySubmitted: true };

    const reviewerTeamId = target.reviewerTeam.teamId;
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
      return this.findExistingTeamReview(user.id, dto.sourceId, targetTeamId);
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

  private async findExistingTeamReview(reviewerUserId: string, sourceId: string, targetTeamId: string) {
    const review = await this.prisma.v1PostEventReview.findFirst({
      where: { reviewerUserId, sourceType: 'team_match', sourceId, targetTeamId },
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

  /**
   * 내가 이 경기에서 후기를 쓸 수 있는 참가팀 전부.
   *
   * 양 팀 모두의 active 멤버인 사용자는 예전에 `AMBIGUOUS_REVIEWER_TEAM`(409)으로 아예 막혀
   * 어느 쪽 후기도 못 썼다. "서버가 임의로 한 팀을 고를 수 없다"는 판단 자체는 맞았지만,
   * 애초에 고를 필요가 없었다 — 2팀 경기에서는 평가 대상 팀이 곧 작성자 팀을 결정한다
   * (B를 평가하면 나는 A 입장). 그래서 양쪽을 모두 돌려주기만 하면 되고, 클라이언트가
   * 별도로 팀을 지정할 필요도 없다.
   */
  private async resolveReviewerTeams(
    userId: string,
    hostTeamId: string,
    approvedApplicantTeamId: string,
  ): Promise<Array<{ teamId: string; name: string; role: V1TeamMembershipRole }>> {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: {
        userId,
        status: 'active',
        teamId: { in: [hostTeamId, approvedApplicantTeamId] },
      },
      select: { teamId: true, role: true, team: { select: { name: true } } },
    });
    if (memberships.length === 0) {
      throw forbidden('NOT_TEAM_MEMBER', '참가팀 소속만 후기를 쓸 수 있어요.');
    }
    // 홈 → 원정 순서를 고정해 겸직 시에도 목록/화면 순서가 흔들리지 않게 한다.
    return [hostTeamId, approvedApplicantTeamId].flatMap((teamId) => {
      const membership = memberships.find((row) => row.teamId === teamId);
      return membership
        ? [{ teamId: membership.teamId, name: membership.team.name, role: membership.role }]
        : [];
    });
  }

  /**
   * 후기 맥락에서 "내가 참가팀으로 서 있는 팀들". 역할(owner/manager/member)을 가리지 않는다.
   *
   * 쓰기 경로(resolveReviewerTeam)뿐 아니라 읽기 경로(received / receivedSummary)도 이 헬퍼를 쓴다 —
   * 즉 "우리 팀이 받은 후기"도 active 멤버 전원이 본다. 2026-08-12 정책 변경에서 의도적으로 내린
   * 결정이다(팀이 받은 평가는 팀원이 보는 게 자연스럽다는 판단). 전에는 owner/manager만 볼 수 있었고,
   * received는 레거시 행(sportId=null)에 한해 reveal 게이트 없이 작성자까지 내려주므로 그 범위가
   * 함께 넓어진다는 점을 확인한 뒤 유지하기로 했다. 읽기만 좁히려면 여기가 아니라 호출부에서
   * 역할 필터를 건 별도 헬퍼를 써야 한다.
   */
  private async participatingTeamIds(userId: string) {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId, status: 'active' },
      select: { teamId: true },
    });
    return memberships.map((membership) => membership.teamId);
  }

  private async existingTeamReviewKeys(sourceIds: string[], reviewerUserId: string) {
    if (!sourceIds.length) return new Set<string>();
    const reviews = await this.prisma.v1PostEventReview.findMany({
      where: {
        sourceType: 'team_match',
        sourceId: { in: sourceIds },
        reviewerUserId,
      },
      select: { sourceId: true, targetTeamId: true },
    });
    return new Set(reviews.map((review) => teamReviewKey(review.sourceId, review.targetTeamId ?? '')));
  }

  /**
   * 개인 매치(sourceType=match) 후기만 모아 mannerScore/reviewCount/trustState를 갱신한다.
   *
   * sourceType 필터는 장식이 아니다 — 대회 개인 후기(tournament_fixture · targetType=user)는
   * `recalculateTournamentUserReputation()`이 `tournament_*` 컬럼에 따로 쌓는다. 한 대회에서
   * 상대팀 로스터 전원에게 며칠 만에 수십 건을 받을 수 있어서, 두 소스를 같은 컬럼에 합산하면
   * 개인 매치로 쌓아온 평점이 대회 한 번에 통째로 덮인다(V1TeamTrustScore의 소스 분리와 같은 선례).
   */
  private async recalculateUserReputation(tx: PrismaTx, targetUserId: string) {
    const now = new Date();
    const candidates = await tx.v1PostEventReview.findMany({
      where: { targetUserId, targetType: 'user', status: 'submitted', sourceType: 'match' },
      select: { sourceId: true, reviewerUserId: true, targetUserId: true, rating: true, submittedAt: true },
    });
    const reverseReviews = candidates.length
      ? await tx.v1PostEventReview.findMany({
          where: { reviewerUserId: targetUserId, sourceType: 'match', sourceId: { in: [...new Set(candidates.map((review) => review.sourceId))] }, status: 'submitted' },
          select: { sourceId: true, reviewerUserId: true, targetUserId: true },
        })
      : [];
    const revealed = candidates.filter((review) => isReviewRevealed(review, reverseReviews, now));
    const reviewCount = revealed.length;
    const avgRating = reviewCount ? revealed.reduce((sum, review) => sum + review.rating, 0) / reviewCount : null;

    await tx.v1UserReputationSummary.upsert({
      where: { userId: targetUserId },
      update: reputationData(reviewCount, avgRating, '완료 경기 리뷰 기반'),
      create: { userId: targetUserId, ...reputationData(reviewCount, avgRating, '완료 경기 리뷰 기반') },
    });
  }

  private async recalculateTeamTrust(tx: PrismaTx, targetTeamId: string) {
    const now = new Date();
    const [candidates, completedMatchCount] = await Promise.all([
      tx.v1PostEventReview.findMany({
        // sourceType 필터 추가 — team_match 리뷰만 팀신뢰점수에 반영(대회후기는 별도 경로에서 집계)
        where: {
          targetTeamId,
          targetType: 'team',
          status: 'submitted',
          sourceType: 'team_match',
          // 팀 후기는 항상 reviewerTeamId를 기록하지만 컬럼이 nullable이라, null 그룹이 "이름 없는 한 팀"으로
          // 집계에 섞여 유령 1표를 만들지 않도록 쿼리 단계에서 제외한다. reveal 판정에서도 null 그룹은
          // reverse 매칭이 절대 성립하지 않아 72시간 폴백으로만 열리므로 애초에 후보에서 빼는 편이 맞다.
          // (recalculateTournamentFixtureTeamTrust / computeRevealedTeamTrustBatch와 동일한 처리)
          reviewerTeamId: { not: null },
        },
        select: { sourceId: true, reviewerTeamId: true, targetTeamId: true, rating: true, submittedAt: true },
      }),
      tx.v1TeamMatch.count({
        where: {
          OR: [{ hostTeamId: targetTeamId }, { approvedApplicantTeamId: targetTeamId }],
          AND: [{ OR: [{ status: 'completed' }, { completedAt: { not: null } }] }],
        },
      }),
    ]);
    // reverse-lookup 대상은 상대팀(review.reviewerTeamId)이 아니라 targetTeamId 자기 자신 —
    // candidates는 이미 targetTeamId로 필터링되어 있으므로, "targetTeamId가 상대에게 보낸 리뷰"를 찾으려면
    // reviewerTeamId=targetTeamId로 조회해야 한다 (reverseTeamReviews()의 review.targetTeamId 패턴과 동일)
    const teamIds = [...new Set(candidates.map((review) => review.targetTeamId).filter((id): id is string => Boolean(id)))];
    const reverseReviews = teamIds.length
      ? (
          await tx.v1PostEventReview.findMany({
            where: { reviewerTeamId: { in: teamIds }, sourceId: { in: [...new Set(candidates.map((review) => review.sourceId))] }, sourceType: 'team_match', status: 'submitted' },
            select: { sourceId: true, reviewerTeamId: true, targetTeamId: true },
          })
        ).map((review) => ({ sourceId: review.sourceId, reviewerUserId: review.reviewerTeamId ?? '', targetUserId: review.targetTeamId }))
      : [];
    // reveal 판정은 "경기 × 평가한 팀" 단위로 접는다. 한 팀에서 여러 팀원이 각자 후기를 쓰면 제출 시각이
    // 제각각이라 72시간 폴백이 행마다 따로 만료되고, 같은 팀의 기여분이 부분적으로만 공개돼 팀 평균이
    // 흔들린다. 그룹당 한 번만 판정하고 그 그룹의 최초 제출 시각을 기준으로 삼아 팀 기여분이 통째로
    // 공개/비공개되게 한다. (사람 단위 판정은 쓸 수 없다 — 상대팀에서 "나를" 평가한 사람이 있어야만
    // 공개되는 셈이라 사실상 열리지 않는다.)
    const revealGroups = new Map<string, { sourceId: string; reviewerTeamId: string; earliestSubmittedAt: Date }>();
    for (const review of candidates) {
      const key = revealGroupKey(review.sourceId, review.reviewerTeamId ?? '');
      const group = revealGroups.get(key);
      if (!group) {
        revealGroups.set(key, { sourceId: review.sourceId, reviewerTeamId: review.reviewerTeamId ?? '', earliestSubmittedAt: review.submittedAt });
        continue;
      }
      if (review.submittedAt < group.earliestSubmittedAt) group.earliestSubmittedAt = review.submittedAt;
    }
    const revealedGroupKeys = new Set(
      [...revealGroups.entries()]
        .filter(([, group]) =>
          isReviewRevealed(
            { sourceId: group.sourceId, reviewerUserId: group.reviewerTeamId, targetUserId: targetTeamId, submittedAt: group.earliestSubmittedAt },
            reverseReviews,
            now,
          ),
        )
        .map(([key]) => key),
    );

    // 집계 그룹은 reviewerTeamId "만"으로 묶는다 — reveal 그룹 키(sourceId 포함)와 다르다.
    // 같은 두 팀이 여러 경기를 치러도 "팀 평균 1표"이므로 경기 수만큼 표가 늘어나면 안 되고,
    // 반대로 reveal 키에서 sourceId를 빼면 A경기의 되평가가 B경기 후기를 열어버린다.
    const ratingsByReviewerTeam = new Map<string, number[]>();
    for (const review of candidates) {
      const reviewerTeamId = review.reviewerTeamId ?? '';
      if (!revealedGroupKeys.has(revealGroupKey(review.sourceId, reviewerTeamId))) continue;
      const ratings = ratingsByReviewerTeam.get(reviewerTeamId) ?? [];
      ratings.push(review.rating);
      ratingsByReviewerTeam.set(reviewerTeamId, ratings);
    }
    // 팀별 평균을 먼저 낸 뒤 그 평균들의 평균 — 인원 많은 팀의 목소리가 커지지 않도록 팀당 1표로 환산한다.
    const teamAverages = [...ratingsByReviewerTeam.values()].map(average);
    const reviewCount = teamAverages.length; // 평가에 참여한 "팀 수"
    const avgRating = teamAverages.length ? average(teamAverages) : null;

    await tx.v1TeamTrustScore.upsert({
      where: { teamId: targetTeamId },
      update: {
        trustState: trustStateForReviewCount(reviewCount),
        mannerScore: decimalScore(avgRating),
        matchCount: completedMatchCount,
        sourceLabel: '완료 팀매치 리뷰 기반',
        calculatedAt: new Date(),
      },
      create: {
        teamId: targetTeamId,
        trustState: trustStateForReviewCount(reviewCount),
        mannerScore: decimalScore(avgRating),
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
    // 대회 후기만 팀·개인 두 대상을 모두 받는다. 개인 대상 명단의 근거는 상대팀 등록 로스터
    // (V1TournamentPlayer)이며, 이 근거가 있는 소스는 대회뿐이다 — team_match는 참가자 명단을
    // 기록하는 모델이 없어서(신청·승인은 팀 단위) "그 경기의 상대 선수"를 특정할 수 없다.
    // 그래서 team_match는 위 규칙대로 targetType=team만 계속 받는다.
    if (dto.sourceType === 'tournament_fixture') {
      const teamShape = dto.targetType === 'team' && dto.targetTeamId && !dto.targetUserId;
      const userShape = dto.targetType === 'user' && dto.targetUserId && !dto.targetTeamId;
      if (!teamShape && !userShape) {
        throw badRequest(
          'INVALID_TOURNAMENT_FIXTURE_REVIEW_TARGET',
          'Tournament fixture reviews require either targetType=team with targetTeamId or targetType=user with targetUserId',
        );
      }
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

/**
 * reverse(되평가) 조회 범위. 경기 단위 후기는 sourceId로, 대회 후기는 sourceGroupId로 찾아야 한다 —
 * 대회 후기의 짝은 같은 대회의 **다른 경기**에 달려 있을 수 있어서 sourceId만으로는 영영 못 만난다.
 */
function revealScopeFilters(candidates: RevealScopeCandidate[]): Prisma.V1PostEventReviewWhereInput[] {
  const sourceIds = [...new Set(candidates.map((review) => review.sourceId))];
  const sourceGroupIds = [...new Set(candidates.map((review) => review.sourceGroupId).filter((id): id is string => Boolean(id)))];
  const filters: Prisma.V1PostEventReviewWhereInput[] = [{ sourceId: { in: sourceIds } }];
  if (sourceGroupIds.length) filters.push({ sourceGroupId: { in: sourceGroupIds } });
  return filters;
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

// trustStateForReviewCount / average / revealGroupKey 는 team-trust-aggregation.ts에서 import한다.
// 이 세 개는 원래 여기와 그쪽에 각각 복제돼 있었고, 그 복제 때문에 "DB는 팀 평균 1표로 저장하는데
// 화면에 보이는 live 재계산은 원시 평균·원시 건수"로 두 경로가 갈라지는 사고가 났다. 단일 정의로 합친다.
// decimalScore만 여기 남는다 — 이쪽은 Prisma 컬럼에 쓰려고 Prisma.Decimal을 반환하고,
// 배치 헬퍼 쪽은 API 응답용 number를 반환해서 서로 다른 함수다.
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

/**
 * 내가 참가팀으로 서 있는 팀 중 이 경기에 나온 팀 전부(홈 → 원정 순).
 * 양 팀 모두의 멤버면 두 방향 후기를 각각 남길 수 있으므로 하나로 좁히지 않는다.
 */
function resolveReviewerTeamIds(teamIds: string[], hostTeamId: string, approvedApplicantTeamId: string) {
  return [hostTeamId, approvedApplicantTeamId].filter((teamId) => teamIds.includes(teamId));
}

// 작성 주체가 사람이므로 키에는 팀이 들어가지 않는다 — 조회 자체가 reviewerUserId로 좁혀져 있다.
function teamReviewKey(sourceId: string, targetTeamId: string) {
  return `${sourceId}:${targetTeamId}`;
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

function summarizeBySport(
  reviews: Array<{ sportId: string | null; rating: number; tags: Array<{ tagCode: string; labelSnapshot: string }> }>,
) {
  type SportBucket = { ratings: number[]; tagCounts: Map<string, { label: string; count: number }> };
  const bySport = new Map<string, SportBucket>();
  for (const review of reviews) {
    if (!review.sportId) continue;
    const bucket: SportBucket = bySport.get(review.sportId) ?? { ratings: [], tagCounts: new Map() };
    bucket.ratings.push(review.rating);
    for (const tag of review.tags) {
      const current = bucket.tagCounts.get(tag.tagCode) ?? { label: tag.labelSnapshot, count: 0 };
      current.count += 1;
      bucket.tagCounts.set(tag.tagCode, current);
    }
    bySport.set(review.sportId, bucket);
  }

  return [...bySport.entries()].map(([sportId, bucket]) => ({
    sportId,
    ratingAvg: bucket.ratings.length ? Number((bucket.ratings.reduce((sum, value) => sum + value, 0) / bucket.ratings.length).toFixed(2)) : null,
    ratingCount: bucket.ratings.length,
    tagRates: [...bucket.tagCounts.entries()].map(([tagCode, { label, count }]) => ({
      tagCode,
      label,
      rate: Number((count / bucket.ratings.length).toFixed(2)),
      count,
    })),
  }));
}
