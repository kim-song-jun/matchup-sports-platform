import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { V1TeamMembershipRole } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { formatReviewWindow, reviewWindowClosed } from './review-deadline';
import { ReviewPolicySettingsService } from './review-policy-settings.service';
import { appearedUserIdsBySide } from './tournament-fixture-appearance';
import {
  fixtureTeams,
  fixtureTitle,
  isExistingReviewResult,
  isUniqueConstraintError,
  markExistingReviewResult,
  officialResultTimestamp,
  REVIEW_TAGS,
  reviewInclude,
  resolveReviewerTeamIds,
  rosterPlayerSelect,
  sourceSummary,
  teamReviewKey,
  TOURNAMENT_FIXTURE_SOURCE_TYPE,
  toIso,
  toReviewDetail,
  tournamentFixtureSelect,
  type ReviewWithIncludes,
  type RosterPlayer,
  type TournamentFixture,
  type TournamentFixtureReviewTagCode,
} from './tournament-fixture-review-mappers';
import { recalculateTournamentUserReputation } from './tournament-fixture-review-reputation';
import { recalculateTournamentFixtureTeamTrust } from './tournament-fixture-review-trust';

@Injectable()
export class TournamentFixtureReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewPolicySettings: ReviewPolicySettingsService,
  ) {}

  async pending(user: V1AuthUser, limit: number, tournamentId?: string) {
    const memberships = await this.participatingTeamMemberships(user.id);
    const teamIds = memberships.map((membership) => membership.teamId);
    if (!teamIds.length) return [];
    const roleByTeamId = new Map(memberships.map((membership) => [membership.teamId, membership.role]));

    const fixtures = (await this.prisma.v1TournamentFixture.findMany({
      where: {
        ...(tournamentId ? { tournamentId } : {}),
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
    })).filter((fixture) => officialResultTimestamp(fixture) !== null);
    const reviewed = await this.existingReviews(fixtures.map((fixture) => fixture.tournamentId), user.id);
    const seenKeys = new Set<string>();

    const entries = fixtures
      .flatMap((fixture) => {
        const teams = fixtureTeams(fixture);
        if (!teams) return [];
        // 양 팀 모두의 멤버면 두 방향이 각각 별도 항목이 된다.
        return resolveReviewerTeamIds(teamIds, teams.home.teamId, teams.away.teamId).map((reviewerTeamId) => {
          const reviewerRole = roleByTeamId.get(reviewerTeamId);
          if (!reviewerRole) return null;
          const isHome = reviewerTeamId === teams.home.teamId;
          const targetTeam = isHome ? teams.away : teams.home;
          // 키의 주체는 팀이 아니라 사람이다 — 팀 기준이면 팀장이 쓴 순간 나머지 팀원 전원의
          // 목록에서 이 경기가 완료 처리돼 사라진다.
          const key = teamReviewKey(fixture.tournamentId, user.id, targetTeam.teamId);
          if (seenKeys.has(key)) return null;
          seenKeys.add(key);
          const completedAt = officialResultTimestamp(fixture)!;
          return {
            fixture,
            reviewerTeamId,
            reviewerRole,
            targetTeam,
            teamReviewed: reviewed.teams.has(key),
            completedAt,
            reviewerTeamName: isHome ? teams.home.name : teams.away.name,
          };
        });
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    // 로스터는 중복 제거가 끝난 뒤에만 조회한다 — 위 findMany가 limit*4개를 읽어오므로
    // 매핑 전에 조회하면 실제로 보여줄 것보다 몇 배 많은 등록의 선수 행을 끌어온다.
    const rosters = await this.rostersByRegistration(entries.map((entry) => entry.targetTeam.registrationId));

    return entries
      .map((entry) => {
        const rosterUserIds = (rosters.get(entry.targetTeam.registrationId) ?? []).filter((userId) => userId !== user.id);
        const reviewedUserIds = reviewed.users.get(entry.fixture.tournamentId) ?? new Set<string>();
        const reviewedPlayerCount = rosterUserIds.filter((userId) => reviewedUserIds.has(userId)).length;
        // 대상 = 상대 팀 1 + 상대팀 등록 로스터 인원. 로스터가 비어 있으면(등록 전/전원 삭제) 팀 후기만 남는다.
        const canReviewTeam = canReviewOpponentTeam(entry.reviewerRole);
        const targetCount = (canReviewTeam ? 1 : 0) + rosterUserIds.length;
        const reviewedCount = (canReviewTeam && entry.teamReviewed ? 1 : 0) + reviewedPlayerCount;
        return {
          sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE,
          sourceId: entry.fixture.id,
          title: fixtureTitle(entry.fixture),
          completedAt: toIso(entry.completedAt),
          // 목록 카드의 대표 target도 실제 역할 계약을 따른다. member는 선수 target만 남으므로
          // team으로 표시하면 작성 화면과 목록 배지가 서로 모순된다.
          targetType: canReviewTeam ? 'team' as const : 'user' as const,
          targetCount,
          reviewedCount,
          remainingCount: Math.max(targetCount - reviewedCount, 0),
          reviewerTeam: { teamId: entry.reviewerTeamId, name: entry.reviewerTeamName },
          targetTeam: { teamId: entry.targetTeam.teamId, name: entry.targetTeam.name },
          state: reviewedCount >= targetCount ? 'done' as const : 'ready' as const,
          completedAtSort: entry.completedAt.getTime(),
        };
      })
      .filter((item) => item.remainingCount > 0);
  }

  async source(user: V1AuthUser, sourceId: string) {
    const contexts = await this.reviewContexts(user.id, sourceId);
    const [first] = contexts;

    return {
      source: sourceSummary(
        first.fixture.id,
        fixtureTitle(first.fixture),
        officialResultTimestamp(first.fixture),
      ),
      sportId: first.fixture.tournament.sportId,
      // 겸직이면 단일 값으로 좁힐 수 없으므로 null — 소비자는 target.reviewerTeam 을 봐야 한다.
      reviewerTeam: contexts.length === 1 ? first.reviewerTeam : null,
      targets: contexts.flatMap((context) => [
        ...(canReviewOpponentTeam(context.reviewerTeam.role) ? [teamTarget(context)] : []),
        ...context.roster.map((player) => playerTarget(player, context)),
      ]),
    };
  }

  async submit(user: V1AuthUser, dto: TournamentFixtureReviewSubmitInput, tagCodes: TournamentFixtureReviewTagCode[]) {
    const contexts = await this.reviewContexts(user.id, dto.sourceId);
    // 평가 대상이 어느 팀/로스터에 속하는지가 곧 작성자 팀을 결정한다 —
    // 겸직이어도 클라이언트가 별도로 팀을 지정할 필요가 없다.
    const context = dto.targetType === 'user'
      ? contexts.find((item) => item.roster.some((player) => player.userId === dto.targetUserId))
      : contexts.find((item) => item.targetTeam.teamId === dto.targetTeamId);
    if (!context) {
      throw forbidden('TARGET_NOT_REVIEWABLE', 'Target is not reviewable for this source');
    }
    return dto.targetType === 'user'
      ? this.submitPlayerReview(user, dto, tagCodes, context)
      : this.submitTeamReview(user, dto, tagCodes, context);
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

  private async submitTeamReview(
    user: V1AuthUser,
    dto: TournamentFixtureReviewSubmitInput,
    tagCodes: TournamentFixtureReviewTagCode[],
    context: ReviewContext,
  ) {
    if (!canReviewOpponentTeam(context.reviewerTeam.role)) {
      throw forbidden('TEAM_REVIEW_ROLE_REQUIRED', '상대팀 후기는 팀장·운영진만 작성할 수 있어요.');
    }
    if (!dto.targetTeamId) throw badRequest('TARGET_TEAM_REQUIRED', 'targetTeamId is required');
    const targetTeamId = dto.targetTeamId;
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
      return this.findExistingReview(user.id, context.fixture.tournamentId, { targetTeamId });
    });

    return { review: toReviewDetail(review), alreadySubmitted: isExistingReviewResult(review) };
  }

  /**
   * 상대팀 **등록 로스터** 선수 1명에 대한 개인 후기.
   *
   * 대상 명단의 근거가 경기 라인업이 아니라 로스터인 이유: 대회 경기 라인업(V1GameParticipant)에는
   * userId 컬럼이 없어서 "그 경기에 실제로 누가 뛰었는지"를 사용자 단위로 알 수 없다. 반면
   * V1TournamentPlayer는 (registrationId, userId) 로 대회 참가 선수를 정확히 가리킨다.
   * 같은 팀 동료가 대상에 들어오지 않는 것은 명단을 **상대팀 등록**에서만 뽑기 때문이며,
   * 이는 팀 내부 담합(서로 5점 몰아주기)을 구조적으로 막는다.
   */
  private async submitPlayerReview(
    user: V1AuthUser,
    dto: TournamentFixtureReviewSubmitInput,
    tagCodes: TournamentFixtureReviewTagCode[],
    context: ReviewContext,
  ) {
    if (!dto.targetUserId) throw badRequest('TARGET_USER_REQUIRED', 'targetUserId is required');
    const targetUserId = dto.targetUserId;
    if (!context.roster.some((player) => player.userId === targetUserId)) {
      throw forbidden('TARGET_NOT_REVIEWABLE', 'Target user is not reviewable for this source');
    }
    // 실출전 게이트(스펙 §5.4): 대상이 아니라 작성자 본인이 실제로 뛰었는지를 확인한다.
    // 대상 쪽 실출전 여부는 위 roster 검사가 이미 걸러낸다(reviewContexts()가 roster 자체를
    // appearedSideIds ∩ 등록 로스터로 좁혀 두었으므로) -- 그래서 여기서 다시 확인하면
    // 항상 통과해 이 검사가 죽은 코드가 된다. appearedReviewerSide가 null이면(폴백, §5.2)
    // 판정 근거가 없으므로 검사를 건너뛴다.
    if (context.appearedReviewerSide && !context.appearedReviewerSide.has(user.id)) {
      throw forbidden('NOT_ACTUAL_PARTICIPANT', '실제로 출전한 선수만 상대 선수를 평가할 수 있어요.');
    }
    const existing = context.existingByUserId.get(targetUserId);
    if (existing) return { review: toReviewDetail(existing), alreadySubmitted: true };

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1PostEventReview.create({
        data: {
          reviewerUserId: user.id,
          // 개인 대상 행에도 작성자가 서 있던 참가팀을 남긴다 — 평판 집계가 "대회 × 평가한 팀" 1표로
          // 접으려면 이 값이 필요하다(상대팀 15명이 한 사람에게 몰아쓰는 것을 15표로 세지 않기 위함).
          reviewerTeamId: context.reviewerTeam.teamId,
          sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE,
          sourceId: dto.sourceId,
          sourceGroupId: context.fixture.tournamentId,
          targetType: 'user',
          targetUserId,
          rating: dto.rating,
          sportId: context.fixture.tournament.sportId,
          tags: { create: tagCodes.map((tagCode) => ({ tagCode, labelSnapshot: REVIEW_TAGS[tagCode] })) },
        },
        include: reviewInclude(),
      });
      await recalculateTournamentUserReputation(tx, targetUserId);
      return created;
    }).catch(async (error: unknown) => {
      if (!isUniqueConstraintError(error)) throw error;
      return this.findExistingReview(user.id, context.fixture.tournamentId, { targetUserId });
    });

    return { review: toReviewDetail(review), alreadySubmitted: isExistingReviewResult(review) };
  }

  /**
   * 이 경기에서 내가 쓸 수 있는 후기 맥락 전부. 보통 1개이고, 양 팀 모두의 멤버면 2개다
   * (각 팀 입장에서 상대팀 + 상대팀 로스터를 평가).
   */
  private async reviewContexts(userId: string, sourceId: string): Promise<ReviewContext[]> {
    const fixture = await this.prisma.v1TournamentFixture.findUnique({
      where: { id: sourceId },
      select: tournamentFixtureSelect(),
    });
    if (!fixture) throw notFound('SOURCE_NOT_FOUND', 'Review source was not found');
    if (fixture.status !== 'completed' || !officialResultTimestamp(fixture)) {
      throw conflict('SOURCE_NOT_COMPLETED', 'Review source is not completed');
    }
    // 평가창(스펙 §6). 기간은 어드민 설정(V1ReviewPolicySettings)에서 읽고, 저장하지 않고 매
    // 조회 시점에 계산한다 -- 정정으로 officialAt이 갱신되면 마감도 그 시각 기준으로 자동
    // 연장되고, 어드민이 기간을 바꾸면 다음 요청부터 곧바로 반영된다.
    const windowHours = await this.reviewPolicySettings.getWindowHours();
    if (reviewWindowClosed(officialResultTimestamp(fixture), new Date(), windowHours)) {
      throw new GoneException({
        code: 'REVIEW_WINDOW_CLOSED',
        message: `평가 가능 기간(${formatReviewWindow(windowHours)})이 지났어요.`,
      });
    }

    const teams = fixtureTeams(fixture);
    if (!teams) throw conflict('TOURNAMENT_FIXTURE_NOT_READY', 'Tournament fixture does not have both teams');
    const reviewerTeams = await this.resolveReviewerTeams(userId, teams.home.teamId, teams.away.teamId);
    // 실출전 게이트(스펙 §5). null = 판정 근거 없음(Game 미백필/VOID) → 폴백(등록 로스터 전체
    // 유지), 빈 Set = 공식 결과는 있는데 출전자가 없음 → 폴백하지 않는다. 이 구분을 여기서
    // 무너뜨리면(예: `appeared ?? { home: new Set(), away: new Set() }`) 후자가 전자로
    // 오인되어 게이트가 조용히 무력화되거나, 반대로 아무도 평가하지 못하게 된다.
    const appeared = await appearedUserIdsBySide(this.prisma, fixture);

    return Promise.all(reviewerTeams.map(async (reviewerTeam) => {
      const isHome = reviewerTeam.teamId === teams.home.teamId;
      const targetTeam = isHome ? teams.away : teams.home;
      // 내가 홈이면 내가 평가할 상대는 원정 실출전 집합이다(반대가 아니다).
      const appearedTargetSideIds = appeared ? (isHome ? appeared.away : appeared.home) : null;
      const appearedReviewerSide = appeared ? (isHome ? appeared.home : appeared.away) : null;
      // 중복 판정은 사람 기준 — reviewerTeamId로 찾으면 같은 팀의 다른 멤버가 쓴 후기를
      // "내 기존 후기"로 집어 두 번째 작성자부터 alreadySubmitted로 막힌다.
      const [existing, fullRoster] = await Promise.all([
        this.prisma.v1PostEventReview.findFirst({
          where: {
            reviewerUserId: userId,
            targetTeamId: targetTeam.teamId,
            sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE,
            sourceGroupId: fixture.tournamentId,
          },
          include: reviewInclude(),
          orderBy: { submittedAt: 'asc' },
        }),
        this.opponentRoster(targetTeam.registrationId, userId),
      ]);
      const roster = appearedTargetSideIds
        ? fullRoster.filter((player) => appearedTargetSideIds.has(player.userId))
        : fullRoster; // 폴백: appeared가 null이면 현행(등록 로스터 전체) 유지 — §5.2
      const existingByUserId = await this.existingPlayerReviews(
        userId,
        fixture.tournamentId,
        roster.map((player) => player.userId),
      );

      return { fixture, reviewerTeam, targetTeam, existing, roster, existingByUserId, appearedReviewerSide };
    }));
  }

  /**
   * fixture source에는 참가팀 active 멤버 모두 들어올 수 있지만 대상은 역할별로 다르다.
   * owner/manager는 상대팀과 상대 선수를, member는 상대 선수만 평가한다. 상대팀 제출은
   * submitTeamReview에서도 다시 막아 클라이언트가 임의 payload를 보내도 권한이 넓어지지 않는다.
   *
   * 양 팀 모두의 멤버인 사용자는 예전에 `AMBIGUOUS_REVIEWER_TEAM`(409)으로 어느 쪽 후기도
   * 못 썼다. 이제 양쪽을 모두 돌려주고, 평가 대상이 어느 팀/로스터에 속하는지로 작성자 팀이
   * 자동으로 정해진다.
   */
  private async resolveReviewerTeams(userId: string, homeTeamId: string, awayTeamId: string) {
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
    // 홈 → 원정 순서를 고정해 겸직 시에도 화면 순서가 흔들리지 않게 한다.
    return [homeTeamId, awayTeamId].flatMap((teamId) => {
      const membership = memberships.find((row) => row.teamId === teamId);
      return membership
        ? [{ teamId: membership.teamId, name: membership.team.name, role: membership.role }]
        : [];
    });
  }

  private async participatingTeamMemberships(userId: string) {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId, status: 'active' },
      select: { teamId: true, role: true },
    });
    return memberships;
  }

  /**
   * 상대팀의 현재 등록 로스터. removedAt이 있는 행은 대회 도중 빠진 선수라 대상에서 제외한다.
   * 작성자 본인이 상대 등록에 올라 있는 경우(양 팀 이중 등록)에도 자기 자신은 빼낸다 —
   * 양 팀 겸직은 이제 정상 경로라 두 방향 맥락이 모두 생기고, 그때 상대 로스터에 내가
   * 들어 있으면 자기 자신을 평가하게 되기 때문이다.
   */
  private async opponentRoster(registrationId: string, reviewerUserId: string) {
    const players = await this.prisma.v1TournamentPlayer.findMany({
      where: { registrationId, removedAt: null },
      select: rosterPlayerSelect(),
      orderBy: { addedAt: 'asc' },
    });
    return players.filter((player) => player.userId !== reviewerUserId);
  }

  private async rostersByRegistration(registrationIds: string[]) {
    const grouped = new Map<string, string[]>();
    if (!registrationIds.length) return grouped;
    const players = await this.prisma.v1TournamentPlayer.findMany({
      where: { registrationId: { in: [...new Set(registrationIds)] }, removedAt: null },
      select: { registrationId: true, userId: true },
    });
    for (const player of players) {
      grouped.set(player.registrationId, [...(grouped.get(player.registrationId) ?? []), player.userId]);
    }
    return grouped;
  }

  private async existingPlayerReviews(reviewerUserId: string, sourceGroupId: string, targetUserIds: string[]) {
    const byUserId = new Map<string, ReviewWithIncludes>();
    if (!targetUserIds.length) return byUserId;
    const reviews = await this.prisma.v1PostEventReview.findMany({
      where: {
        reviewerUserId,
        sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE,
        sourceGroupId,
        targetUserId: { in: targetUserIds },
      },
      include: reviewInclude(),
    });
    for (const review of reviews) {
      if (review.targetUserId) byUserId.set(review.targetUserId, review);
    }
    return byUserId;
  }

  /** pending 목록의 "이미 썼음" 판정용 — 팀 대상 키 집합과 대회별 개인 대상 userId 집합을 함께 만든다. */
  private async existingReviews(sourceGroupIds: string[], reviewerUserId: string) {
    const teams = new Set<string>();
    const users = new Map<string, Set<string>>();
    if (!sourceGroupIds.length) return { teams, users };
    const reviews = await this.prisma.v1PostEventReview.findMany({
      where: {
        sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE,
        sourceGroupId: { in: [...new Set(sourceGroupIds)] },
        reviewerUserId,
      },
      select: { sourceGroupId: true, targetTeamId: true, targetUserId: true },
    });
    for (const review of reviews) {
      const sourceGroupId = review.sourceGroupId ?? '';
      if (review.targetTeamId) {
        teams.add(teamReviewKey(sourceGroupId, reviewerUserId, review.targetTeamId));
        continue;
      }
      if (!review.targetUserId) continue;
      const reviewedUserIds = users.get(sourceGroupId) ?? new Set<string>();
      reviewedUserIds.add(review.targetUserId);
      users.set(sourceGroupId, reviewedUserIds);
    }
    return { teams, users };
  }

  private async findExistingReview(
    reviewerUserId: string,
    sourceGroupId: string,
    target: { targetTeamId: string } | { targetUserId: string },
  ) {
    const review = await this.prisma.v1PostEventReview.findFirst({
      where: { reviewerUserId, sourceType: TOURNAMENT_FIXTURE_SOURCE_TYPE, sourceGroupId, ...target },
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
  readonly targetType?: 'user' | 'team';
  readonly targetUserId?: string | null;
  readonly targetTeamId?: string | null;
  readonly rating: number;
};

type ReviewContext = {
  readonly fixture: TournamentFixture;
  readonly reviewerTeam: { teamId: string; name: string; role: V1TeamMembershipRole };
  readonly targetTeam: { registrationId: string; teamId: string; name: string; imageUrl: string | null };
  readonly existing: ReviewWithIncludes | null;
  readonly roster: RosterPlayer[];
  readonly existingByUserId: Map<string, ReviewWithIncludes>;
  /** 작성자 본인이 속한 사이드의 실출전 userId 집합. null이면 판정 근거 없음(폴백, §5.2). */
  readonly appearedReviewerSide: Set<string> | null;
};

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

function teamTarget(context: ReviewContext) {
  return {
    targetType: 'team' as const,
    targetUserId: null,
    targetTeamId: context.targetTeam.teamId,
    reviewerTeam: context.reviewerTeam,
    name: context.targetTeam.name,
    imageUrl: context.targetTeam.imageUrl,
    subtitle: '대회 상대 팀',
    alreadySubmitted: Boolean(context.existing),
    review: context.existing ? toReviewDetail(context.existing) : null,
    locked: Boolean(context.existing),
    lockReason: context.existing ? 'ALREADY_SUBMITTED' : null,
  };
}

function playerTarget(player: RosterPlayer, context: ReviewContext) {
  const existing = context.existingByUserId.get(player.userId) ?? null;
  return {
    targetType: 'user' as const,
    targetUserId: player.userId,
    targetTeamId: null,
    reviewerTeam: context.reviewerTeam,
    // 실명(V1TournamentPlayer.realName)은 참가 자격 심사용 개인정보라 후기 화면에 노출하지 않는다.
    name: player.user.profile?.nickname ?? '선수',
    imageUrl: player.user.profile?.profileImageUrl ?? null,
    subtitle: '상대 팀 선수',
    alreadySubmitted: Boolean(existing),
    review: existing ? toReviewDetail(existing) : null,
    locked: Boolean(existing),
    lockReason: existing ? 'ALREADY_SUBMITTED' : null,
  };
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
