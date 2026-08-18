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
import { AdminContextService } from '../common/admin-context.service';
import { HidePostEventReviewDto } from './dto/moderate-review.dto';
import { recalculateTournamentUserReputation } from './tournament-fixture-review-reputation';
import { recalculateTournamentFixtureTeamTrust } from './tournament-fixture-review-trust';

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

/**
 * 개인 매너 점수(V1UserReputationSummary)에 합산하는 소스. 대회 개인 후기는 여기 없다 —
 * tournament_* 컬럼으로 따로 집계한다(한 대회에서 수십 건이 한꺼번에 들어와 점수가 급변한다).
 */
const PERSONAL_REPUTATION_SOURCES: V1PostEventReviewSourceType[] = ['match', 'team_match'];

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
    private readonly adminContext: AdminContextService,
  ) {}

  /**
   * 어드민 후기 숨김 — 경기 후기(V1PostEventReview)에는 지금까지 숨김 경로가 아예 없었다.
   * 스키마의 V1PostEventReviewStatus 에 hidden/removed 가 정의돼 있는데도 그 값을 쓰는 코드가
   * 0건이라, 악의적 후기가 들어와도 어드민조차 내릴 수 없었다(대회 후기에만 hide 가 있었다).
   *
   * 집계는 전부 status='submitted' 로 좁혀 읽으므로 숨기는 순간 조회에서 빠지지만, 미리 계산해
   * 저장해 둔 평판·신뢰점수는 그대로 남는다 — 그래서 숨김/복구 뒤 해당 대상만 다시 계산한다.
   */
  async hideReview(user: V1AuthUser, reviewId: string, dto: HidePostEventReviewDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const review = await this.prisma.v1PostEventReview.findUnique({ where: { id: reviewId } });
    if (!review) throw notFound('REVIEW_NOT_FOUND', '리뷰를 찾을 수 없어요.');
    if (review.status === 'hidden') return { alreadyHidden: true };

    const reason = dto.reason?.trim() || null;
    await this.prisma.$transaction(async (tx) => {
      await tx.v1PostEventReview.update({ where: { id: reviewId }, data: { status: 'hidden', hiddenAt: new Date() } });
      await this.recalculateForReview(tx, review);
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'review.hide',
          targetType: 'post_event_review',
          targetId: reviewId,
          reason,
          beforeJson: { status: review.status },
          afterJson: { status: 'hidden' },
        },
        tx,
      );
    });
    return { alreadyHidden: false };
  }

  async unhideReview(user: V1AuthUser, reviewId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const review = await this.prisma.v1PostEventReview.findUnique({ where: { id: reviewId } });
    if (!review) throw notFound('REVIEW_NOT_FOUND', '리뷰를 찾을 수 없어요.');
    // removed 는 숨김과 다른 종착 상태다 — 복구 대상은 hidden 뿐이다.
    if (review.status !== 'hidden') return { alreadyVisible: true };

    await this.prisma.$transaction(async (tx) => {
      await tx.v1PostEventReview.update({ where: { id: reviewId }, data: { status: 'submitted', hiddenAt: null } });
      await this.recalculateForReview(tx, review);
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'review.unhide',
          targetType: 'post_event_review',
          targetId: reviewId,
          reason: null,
          beforeJson: { status: 'hidden' },
          afterJson: { status: 'submitted' },
        },
        tx,
      );
    });
    return { alreadyVisible: false };
  }

  /** 후기 한 건이 기여하던 집계만 골라 다시 계산한다. 소스·대상 조합마다 쌓이는 컬럼이 다르다. */
  private async recalculateForReview(
    tx: PrismaTx,
    review: { sourceType: V1PostEventReviewSourceType; targetType: V1PostEventReviewTargetType; targetUserId: string | null; targetTeamId: string | null },
  ) {
    if (review.targetType === 'user' && review.targetUserId) {
      if (review.sourceType === 'tournament_fixture') {
        await recalculateTournamentUserReputation(tx, review.targetUserId);
      } else {
        await this.recalculateUserReputation(tx, review.targetUserId);
      }
      return;
    }
    if (review.targetTeamId) {
      if (review.sourceType === 'tournament_fixture') {
        await recalculateTournamentFixtureTeamTrust(tx, review.targetTeamId);
      } else {
        await this.recalculateTeamTrust(tx, review.targetTeamId);
      }
    }
  }

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
        // 신규 후기는 익명 개별 항목으로 공개하되, 아래 reveal gate를 통과하기 전에는 응답에
        // 넣지 않는다. 팀매치가 여기 빠져 있었다: 팀매치 후기를 쓸 수는 있는데 받은 사람은
        // 내용을 영영 못 보고 매너 점수 집계로만 반영됐다 — 같은 성격의 대회 경기 후기는
        // 익명으로라도 보이던 것과 어긋난다. 개인 매치(match)는 sportId=null 레거시 행과
        // 구분이 안 되는 게 아니라, 아래 sportId === null 분기가 "작성자까지 공개"라는
        // 다른 정책을 쓰므로 sourceType 으로 명시해 둘을 갈라 놓는다.
        OR: [{ sportId: null }, { sourceType: { in: ['tournament_fixture', 'team_match', 'match'] } }],
        AND: [{ OR: receivedFilters }],
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      include: reviewInclude(),
    });
    // reveal 짝 판정 대상은 "sportId 가 있는 신규 후기" 전부다 — 예전엔 대회 후기만 모아서,
    // 팀매치는 서로 평가해도 짝이 성립하지 않아 72시간 폴백만 남았다.
    const revealableReviews = reviews.filter((review) => review.sportId !== null);
    const userRevealable = revealableReviews.filter((review) => review.targetType === 'user');
    const teamRevealable = revealableReviews.filter((review) => review.targetType === 'team');
    const [reverseUserReviews, reverseTeamReviews] = await Promise.all([
      this.reverseUserReviews(user.id, userRevealable),
      this.reverseTeamReviews(teamRevealable),
    ]);
    const now = new Date();
    const visibleReviews = reviews.filter((review) => {
      if (review.sportId === null) return true;
      const teamTarget = review.targetType === 'team';
      return isReviewRevealed(
        {
          sourceId: reviewRevealScope(review),
          reviewerUserId: teamTarget ? review.reviewerTeamId ?? '' : review.reviewerUserId,
          targetUserId: teamTarget ? review.targetTeamId : review.targetUserId,
          submittedAt: review.submittedAt,
        },
        teamTarget ? reverseTeamReviews : reverseUserReviews,
        now,
      );
    });
    const cursorIndex = query.cursor ? visibleReviews.findIndex((review) => review.id === query.cursor) : -1;
    const pageStart = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    const pageItems = visibleReviews.slice(pageStart, pageStart + limit);
    const sourceSummaries = await this.reviewSourceSummaries(pageItems);

    return {
      items: pageItems.map((review) => ({
        ...this.toReviewDetail(review),
        // 작성자 닉네임을 공개한다(2026-08-18 정책). 예전에는 보복 우려로 가렸는데, 그 탓에
        // "누가 언제 어느 경기에서" 남긴 평가인지 전혀 알 수 없어 받은 사람이 맥락을 못 잡았다.
        anonymous: false as const,
        // 어느 경기에서 받은 후기인지 — 예전엔 카드 제목이 "팀매치"처럼 종류만 나왔다.
        source: sourceSummaries.get(`${review.sourceType}:${review.sourceId}`) ?? null,
      })),
      pageInfo: {
        nextCursor: visibleReviews.length > pageStart + limit ? pageItems.at(-1)?.id ?? null : null,
        hasNext: visibleReviews.length > pageStart + limit,
      },
    };
  }

  async receivedSummary(user: V1AuthUser, query: { targetType: 'user' | 'team'; period?: string }) {
    const now = new Date();
    const targetFilter = query.targetType === 'team'
      ? { targetTeamId: { in: await this.participatingTeamIds(user.id) }, targetType: 'team' as const }
      // 개인 대상 요약은 매너 점수와 같은 소스만 센다(PERSONAL_REPUTATION_SOURCES) — 두 곳이
      // 갈리면 화면이 모순된다. 실제로 팀매치가 여기서만 빠져 있던 동안, 개별 목록엔 팀매치
      // 후기가 보이는데 집계는 "아직 없어요"로 떴다.
      // 대회 개인 후기는 계속 제외한다: V1UserReputationSummary의 tournament_* 컬럼으로 따로
      // 집계되고, 한 대회에서 상대 로스터 전원에게 수십 건이 들어와 평균이 급변하기 때문이다.
      : { targetUserId: user.id, targetType: 'user' as const, sourceType: { in: PERSONAL_REPUTATION_SOURCES } };

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

    // 프론트의 종목 배지·색상은 v1Sport.code 로 매핑한다(SPORT_ACCENT_MAP). sportId(UUID)만
    // 내려주면 어떤 종목이든 "기타"로 떨어지므로 코드를 함께 실어 보낸다.
    const bySport = summarizeBySport(filtered);
    const sports = bySport.length
      ? await this.prisma.v1Sport.findMany({
          where: { id: { in: bySport.map((entry) => entry.sportId) } },
          select: { id: true, code: true },
        })
      : [];
    const codeById = new Map(sports.map((sport) => [sport.id, sport.code]));
    return {
      bySport: bySport.map((entry) => ({ ...entry, sportCode: codeById.get(entry.sportId) ?? null })),
      availableMonths,
    };
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
      return dto.targetType === 'user'
        ? this.submitTeamMatchPlayerReview(user, dto, tagCodes)
        : this.submitTeamReview(user, dto, tagCodes);
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
      where: { userId: user.id, status: 'active' },
      select: { teamId: true, role: true },
    });
    const teamIds = memberships.map((membership) => membership.teamId);
    const roleByTeamId = new Map(memberships.map((membership) => [membership.teamId, membership.role]));
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
    const teamMatchIds = teamMatches.map((match) => match.id);
    const [reviewKeys, rostersBySource] = await Promise.all([
      this.existingTeamReviewKeys(teamMatchIds, user.id),
      this.teamMatchRostersBySource(teamMatchIds),
    ]);

    return teamMatches
      .flatMap((match) => {
        if (!match.approvedApplicantTeamId) return [];
        // 양 팀 모두의 멤버면 두 방향이 각각 별도의 후기 항목이 된다.
        return resolveReviewerTeamIds(teamIds, match.hostTeamId, match.approvedApplicantTeamId).map((reviewerTeamId) => {
          const isHost = reviewerTeamId === match.hostTeamId;
          const targetTeam = isHost ? match.approvedApplicantTeam : match.hostTeam;
          const key = teamReviewKey(match.id, targetTeam?.id ?? '');
          const role = roleByTeamId.get(reviewerTeamId);
          // 팀 후기는 팀장·운영진만 — 목록의 남은 개수도 실제로 쓸 수 있는 대상만 세야
          // "1건 남음"을 눌렀는데 쓸 게 없는 화면이 나오지 않는다.
          const canReviewTeam = role ? canReviewOpponentTeam(role) : false;
          const rosterUserIds = (rostersBySource.get(match.id)?.get(targetTeam?.id ?? '') ?? [])
            .filter((userId) => userId !== user.id);
          const reviewedUserIds = reviewKeys.users.get(match.id) ?? new Set<string>();
          const teamReviewed = reviewKeys.teams.has(key);
          const targetCount = (canReviewTeam ? 1 : 0) + rosterUserIds.length;
          const reviewedCount =
            (canReviewTeam && teamReviewed ? 1 : 0) +
            rosterUserIds.filter((userId) => reviewedUserIds.has(userId)).length;
          return {
            sourceType: 'team_match' as const,
            sourceId: match.id,
            title: match.title,
            completedAt: toIso(match.completedAt ?? match.startAt),
            // 목록 배지가 작성 화면과 어긋나지 않도록 실제 대표 대상 종류를 따른다.
            targetType: canReviewTeam ? ('team' as const) : ('user' as const),
            targetCount,
            reviewedCount,
            remainingCount: Math.max(targetCount - reviewedCount, 0),
            reviewerTeam: { teamId: reviewerTeamId, name: isHost ? match.hostTeam.name : match.approvedApplicantTeam?.name ?? '' },
            targetTeam: targetTeam ? { teamId: targetTeam.id, name: targetTeam.name } : null,
            state: reviewedCount >= targetCount ? 'done' : 'ready',
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
    const { payload } = await this.teamMatchSourceContext(user, sourceId);
    return payload;
  }

  /**
   * 작성 화면 payload와, 그 payload를 만들 때 이미 판정한 "내 참가팀 + 역할"을 함께 돌려준다.
   * 제출 경로가 역할을 다시 조회하지 않도록 하기 위한 것 — 같은 판정을 두 번 하면 그 사이에
   * 멤버십이 바뀌었을 때 화면과 저장 결과가 어긋난다.
   */
  private async teamMatchSourceContext(user: V1AuthUser, sourceId: string) {
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
    const opponentTeamIds = reviewerTeams.map((team) => opponentOf(team.teamId).id);
    const rosterByTeamId = await this.teamMatchOpponentRosters(teamMatch.id, opponentTeamIds);
    const rosterUserIds = [...rosterByTeamId.values()].flat().map((player) => player.userId);

    // 기존 후기 조회도 사람 기준 — 팀 기준으로 조회하면 같은 팀 다른 사람의 후기를 "내 후기"로 잘못 잠근다.
    const existingReviews = await this.prisma.v1PostEventReview.findMany({
      where: {
        reviewerUserId: user.id,
        sourceType: 'team_match',
        sourceId: teamMatch.id,
        OR: [
          { targetTeamId: { in: opponentTeamIds } },
          ...(rosterUserIds.length ? [{ targetUserId: { in: rosterUserIds } }] : []),
        ],
      },
      include: reviewInclude(),
    });
    const existingByTargetTeam = new Map(
      existingReviews.filter((review) => review.targetType === 'team').map((review) => [review.targetTeamId, review]),
    );
    const existingByTargetUser = new Map(
      existingReviews.filter((review) => review.targetType === 'user').map((review) => [review.targetUserId, review]),
    );

    const payload = {
      source: sourceSummary('team_match', teamMatch.id, teamMatch.title, teamMatch.completedAt ?? teamMatch.startAt),
      sportId: teamMatch.sportId,
      // 겸직이면 단일 값으로 좁힐 수 없으므로 null — 소비자는 target.reviewerTeam 을 봐야 한다.
      reviewerTeam: reviewerTeams.length === 1 ? reviewerTeams[0] : null,
      targets: reviewerTeams.flatMap((reviewerTeam) => {
        const targetTeam = opponentOf(reviewerTeam.teamId);
        const existing = existingByTargetTeam.get(targetTeam.id) ?? null;
        // 상대 팀 후기는 팀장·운영진만 — 대회 경기(tournament-fixture-reviews.service.ts)와 같은 규칙이다.
        const teamTargets = canReviewOpponentTeam(reviewerTeam.role)
          ? [{
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
            }]
          : [];
        // 상대 선수 후기는 역할 무관 — 팀원도 자기가 상대한 사람을 평가한다.
        const playerTargets = (rosterByTeamId.get(targetTeam.id) ?? []).map((player) => {
          const existingPlayerReview = existingByTargetUser.get(player.userId) ?? null;
          return {
            targetType: 'user' as const,
            targetUserId: player.userId,
            targetTeamId: null,
            reviewerTeam,
            name: player.name,
            imageUrl: player.imageUrl,
            subtitle: `${targetTeam.name} 선수`,
            alreadySubmitted: Boolean(existingPlayerReview),
            review: existingPlayerReview ? this.toReviewDetail(existingPlayerReview) : null,
            locked: Boolean(existingPlayerReview),
            lockReason: existingPlayerReview ? 'ALREADY_SUBMITTED' : null,
          };
        });
        return [...teamTargets, ...playerTargets];
      }),
    };
    return { payload, reviewerTeams, opponentOf };
  }

  /**
   * 팀 매치에서 "그 경기에 실제로 뛴 상대 선수" 명단.
   *
   * 근거는 제출된 라인업 하나뿐이다 — V1Game.teamMatchId 로 연결된 경기의, 상대 팀 사이드에 속한
   * V1GameParticipant 중 userId 가 채워진 행(연동 팀원)만 센다. 게스트(userId=null)는 플랫폼 계정이
   * 없어 평가 대상이 될 수 없고, 라인업을 제출하지 않은 팀 매치는 명단 자체가 없으므로 선수 후기도
   * 없다(팀 후기만 남는다). 팀 멤버십 전원으로 대체하지 않는 이유: 그 경기에 안 뛴 사람까지
   * 평가 대상이 되어 "상대했던 팀원"이라는 전제가 깨진다.
   */
  private async teamMatchOpponentRosters(teamMatchId: string, opponentTeamIds: string[]) {
    const rosterByTeamId = new Map<string, Array<{ userId: string; name: string; imageUrl: string | null }>>();
    if (!opponentTeamIds.length) return rosterByTeamId;

    const game = await this.prisma.v1Game.findUnique({
      where: { teamMatchId },
      select: { id: true, sides: { select: { id: true, teamId: true } } },
    });
    if (!game) return rosterByTeamId;

    const sideIdsByTeamId = new Map<string, string[]>();
    for (const side of game.sides) {
      if (!side.teamId || !opponentTeamIds.includes(side.teamId)) continue;
      sideIdsByTeamId.set(side.teamId, [...(sideIdsByTeamId.get(side.teamId) ?? []), side.id]);
    }
    const sideIds = [...sideIdsByTeamId.values()].flat();
    if (!sideIds.length) return rosterByTeamId;

    const participants = await this.prisma.v1GameParticipant.findMany({
      where: { gameId: game.id, sideId: { in: sideIds }, userId: { not: null } },
      select: { sideId: true, userId: true, displayNameSnapshot: true },
    });
    // V1GameParticipant.userId 는 FK 가 아니라 nullable 컬럼이라(스키마 주석 참조) relation include 가
    // 불가능하다 — 프로필은 id 로 따로 모아 온다.
    const profiles = await this.prisma.v1User.findMany({
      where: { id: { in: [...new Set(participants.map((participant) => participant.userId!))] } },
      select: { id: true, profile: { select: { nickname: true, profileImageUrl: true } } },
    });
    const profileById = new Map(profiles.map((profile) => [profile.id, profile.profile]));

    for (const [teamId, teamSideIds] of sideIdsByTeamId) {
      const seen = new Set<string>();
      const roster: Array<{ userId: string; name: string; imageUrl: string | null }> = [];
      for (const participant of participants) {
        if (!participant.userId || !teamSideIds.includes(participant.sideId)) continue;
        // 라인업 개정(revision)이 여러 벌 남아 있으면 같은 사람이 여러 번 잡힌다.
        if (seen.has(participant.userId)) continue;
        seen.add(participant.userId);
        const profile = profileById.get(participant.userId);
        roster.push({
          userId: participant.userId,
          name: profile?.nickname ?? participant.displayNameSnapshot,
          imageUrl: profile?.profileImageUrl ?? null,
        });
      }
      rosterByTeamId.set(teamId, roster);
    }
    return rosterByTeamId;
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

  private async submitTeamMatchPlayerReview(user: V1AuthUser, dto: SubmitReviewDto, tagCodes: ReviewTagCode[]) {
    if (!dto.targetUserId) throw badRequest('TARGET_USER_REQUIRED', 'targetUserId is required');
    const targetUserId = dto.targetUserId;
    const { payload: source } = await this.teamMatchSourceContext(user, dto.sourceId);
    const target = source.targets.find((item) => item.targetType === 'user' && item.targetUserId === targetUserId);
    if (!target) throw forbidden('TARGET_NOT_REVIEWABLE', 'Target user is not reviewable for this source');
    const existing = target.review;
    if (existing) return { review: existing, alreadySubmitted: true };

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1PostEventReview.create({
        data: {
          reviewerUserId: user.id,
          reviewerTeamId: target.reviewerTeam.teamId,
          sourceType: 'team_match',
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
      return this.findExistingTeamMatchPlayerReview(user.id, dto.sourceId, targetUserId);
    });

    return { review: this.toReviewDetail(review), alreadySubmitted: isExistingReviewResult(review) };
  }

  private async findExistingTeamMatchPlayerReview(reviewerUserId: string, sourceId: string, targetUserId: string) {
    const review = await this.prisma.v1PostEventReview.findFirst({
      where: { reviewerUserId, sourceType: 'team_match', sourceId, targetUserId },
      include: reviewInclude(),
    });
    if (!review) throw conflict('DUPLICATE_REVIEW_RETRY', 'Duplicate review was detected but existing review was not found');
    return markExistingReviewResult(review);
  }

  private async submitTeamReview(user: V1AuthUser, dto: SubmitReviewDto, tagCodes: ReviewTagCode[]) {
    if (!dto.targetTeamId) throw badRequest('TARGET_TEAM_REQUIRED', 'targetTeamId is required');
    const targetTeamId = dto.targetTeamId;
    const { payload: source, reviewerTeams, opponentOf } = await this.teamMatchSourceContext(user, dto.sourceId);
    const target = source.targets.find((item) => item.targetType === 'team' && item.targetTeamId === targetTeamId);
    if (!target) {
      // 역할 미달이면 위에서 팀 target 자체가 빠진다. "대상이 없다"로만 응답하면 화면이 안내
      // 문구를 만들 수 없으므로, 상대 팀은 맞는데 역할이 모자란 경우를 따로 구분해 돌려준다.
      const blockedByRole = reviewerTeams.some(
        (reviewerTeam) => opponentOf(reviewerTeam.teamId).id === targetTeamId && !canReviewOpponentTeam(reviewerTeam.role),
      );
      if (blockedByRole) {
        throw forbidden('TEAM_REVIEW_ROLE_REQUIRED', '상대팀 후기는 팀장·운영진만 작성할 수 있어요.');
      }
      throw forbidden('TARGET_NOT_REVIEWABLE', 'Target team is not reviewable for this source');
    }
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
      // 빈 배열까지 위임하면 호출부가 대회 픽스처를 하나도 안 보는 경우에도 왕복이 생긴다.
      tournamentFixtureIds.length
        ? this.tournamentFixtureReviews.sourceSummaries(tournamentFixtureIds)
        : new Map<string, ReturnType<typeof sourceSummary>>(),
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
    if (!sourceIds.length) return { teams: new Set<string>(), users: new Map<string, Set<string>>() };
    const reviews = await this.prisma.v1PostEventReview.findMany({
      where: {
        sourceType: 'team_match',
        sourceId: { in: sourceIds },
        reviewerUserId,
      },
      select: { sourceId: true, targetType: true, targetTeamId: true, targetUserId: true },
    });
    const teams = new Set<string>();
    const users = new Map<string, Set<string>>();
    for (const review of reviews) {
      if (review.targetType === 'team') {
        teams.add(teamReviewKey(review.sourceId, review.targetTeamId ?? ''));
      } else if (review.targetUserId) {
        users.set(review.sourceId, (users.get(review.sourceId) ?? new Set<string>()).add(review.targetUserId));
      }
    }
    return { teams, users };
  }

  /** 여러 팀 매치의 상대팀 로스터를 한 번에 — 목록 화면이 매치마다 왕복하지 않도록 배치 조회한다. */
  private async teamMatchRostersBySource(teamMatchIds: string[]) {
    const empty = new Map<string, Map<string, string[]>>();
    if (!teamMatchIds.length) return empty;

    const games = await this.prisma.v1Game.findMany({
      where: { teamMatchId: { in: teamMatchIds } },
      select: { id: true, teamMatchId: true, sides: { select: { id: true, teamId: true } } },
    });
    if (!games.length) return empty;

    const participants = await this.prisma.v1GameParticipant.findMany({
      where: { gameId: { in: games.map((game) => game.id) }, userId: { not: null } },
      select: { gameId: true, sideId: true, userId: true },
    });

    for (const game of games) {
      if (!game.teamMatchId) continue;
      const byTeamId = new Map<string, string[]>();
      for (const side of game.sides) {
        if (!side.teamId) continue;
        const userIds = [
          ...new Set(
            participants
              .filter((participant) => participant.gameId === game.id && participant.sideId === side.id)
              .map((participant) => participant.userId!)
          ),
        ];
        byTeamId.set(side.teamId, [...(byTeamId.get(side.teamId) ?? []), ...userIds]);
      }
      empty.set(game.teamMatchId, byTeamId);
    }
    return empty;
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
      // 개인 매치와 팀매치를 함께 센다. 둘 다 "함께 뛴 상대가 나를 평가한 것"이라 성격이 같다 —
      // 팀매치가 빠져 있던 동안은 후기를 받아도 매너 점수가 그대로여서, 받은 후기 화면에
      // "아직 집계된 리뷰가 없어요"가 뜨는데 바로 아래 개별 목록엔 팀매치 후기가 보이는
      // 모순이 있었다. 대회 개인 후기(tournament_fixture)는 여전히 제외한다 — 한 대회에서
      // 상대 로스터 전원에게 수십 건이 들어와 점수가 급변하므로 tournament_* 컬럼에 따로 쌓는다.
      where: { targetUserId, targetType: 'user', status: 'submitted', sourceType: { in: PERSONAL_REPUTATION_SOURCES } },
      select: { sourceId: true, reviewerUserId: true, targetUserId: true, rating: true, submittedAt: true },
    });
    const reverseReviews = candidates.length
      ? await tx.v1PostEventReview.findMany({
          where: { reviewerUserId: targetUserId, sourceType: { in: PERSONAL_REPUTATION_SOURCES }, sourceId: { in: [...new Set(candidates.map((review) => review.sourceId))] }, status: 'submitted' },
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
    // team_match도 대회 경기와 같은 두 대상을 받는다. 개인 대상 명단의 근거는 그 경기에 제출된
    // 라인업(V1GameParticipant.userId)이다 — 팀 매치 라인업은 연동 팀원의 userId를 그대로 저장하고
    // (team-matches/team-match-lineup.service.ts resolveEntry) 게스트만 null로 남긴다. 예전 주석은
    // "team_match는 참가자 명단을 기록하는 모델이 없다"고 적고 있었으나 라인업 도입으로 더는 사실이 아니다.
    if (dto.sourceType === 'team_match' || dto.sourceType === 'tournament_fixture') {
      const teamShape = dto.targetType === 'team' && dto.targetTeamId && !dto.targetUserId;
      const userShape = dto.targetType === 'user' && dto.targetUserId && !dto.targetTeamId;
      if (!teamShape && !userShape) {
        throw badRequest(
          dto.sourceType === 'team_match'
            ? 'INVALID_TEAM_MATCH_REVIEW_TARGET'
            : 'INVALID_TOURNAMENT_FIXTURE_REVIEW_TARGET',
          'Reviews require either targetType=team with targetTeamId or targetType=user with targetUserId',
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
      // 한 경기에서 여러 사람에게 쓴 리뷰는 sourceId 가 같아서, 대상자를 안 실으면 목록에서
      // 서로 구분되지 않는다("누구에게 쓴 건지" 알 수 없음). targetUser 는 이미 조인돼 있다.
      targetUser: review.targetUser
        ? { userId: review.targetUser.id, nickname: review.targetUser.profile?.nickname ?? '참가자' }
        : null,
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
/**
 * 상대 "팀" 후기를 쓸 수 있는 역할.
 *
 * 2026-08-18 사용자 결정으로 **모든 참가 멤버**에게 열었다. 그 전에는 owner/manager 만
 * 쓸 수 있었는데(2026-08-14 역할 규칙), 후기 화면을 "상대 팀 평가가 기본, 선수는 선택"으로
 * 바꾸면서 팀원에게는 기본 대상이 하나도 없는 화면이 남기 때문이다.
 *
 * 팀 평점이 인원 많은 팀 쪽으로 기우는 문제는 생기지 않는다 — 팀 후기는 사람 기준으로
 * 1인 1건이고(같은 경기에 같은 사람이 두 번 못 씀), 평점은 팀 단위 평균이 아니라 개별
 * 항목으로 노출된다.
 *
 * 대회 경기 경로(tournament-fixture-reviews.service.ts)와 **같은 규칙**을 유지해야 한다 —
 * 두 곳이 갈리면 같은 사용자가 대회에서는 되고 팀매치에서는 안 되는 모순이 생긴다.
 */
function canReviewOpponentTeam(_role: V1TeamMembershipRole) {
  return true;
}

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
