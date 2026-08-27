import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  V1GameSideKey,
  V1GameSourceType,
  V1TeamMatch,
  V1TeamMatchApplication,
} from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  canonicalGameCommandPayloadHash,
  GamesService,
} from '../games/games.service';
import type {
  GameCommandContext,
  GameSourceCreationInput,
} from '../games/games.types';
import { NotificationsService, type NotificationEventType } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  cascadeCancelTeamMatchSchedulesInTx,
  createTeamMatchScheduleInTx,
  syncTeamMatchScheduleInTx,
} from '../team-schedules/team-schedules.service';
import {
  judgeLeagueDisputeEligibility,
  type LeagueDisputeBlockedReason,
} from '../league-matches/league-result-dispute-eligibility';
import { resolveTeamMatchCompetitionConfig } from './resolve-team-match-competition-config';
import { assertCreatorProfileComplete } from '../profile/creator-profile.guard';
import { computeRevealedTeamTrustBatch } from '../reviews/team-trust-aggregation';
import { formatLevelRange, levelCodeWhere, parseLevelCodes, resolveSportLevelRange } from '../sports/level-range';
import {
  CancelTeamMatchDto,
  CloseTeamMatchDto,
  MutateTeamMatchDto,
  ReopenTeamMatchDto,
  UpdateTeamMatchDto,
} from './dto/mutate-team-match.dto';
import {
  ApproveTeamMatchApplicationDto,
  CreateTeamMatchApplicationDto,
  ListTeamMatchApplicationsQueryDto,
  RejectTeamMatchApplicationDto,
  WithdrawTeamMatchApplicationDto,
} from './dto/team-match-application.dto';
import { MyTeamMatchesQueryDto, TeamMatchEligibilityQueryDto, TeamMatchesQueryDto } from './dto/team-matches-query.dto';

type TeamMatchWithRelations = V1TeamMatch & {
  sport: { id: string; name: string };
  minSportLevel: { id: string; code: string; name: string; sortOrder: number; sportId: string } | null;
  maxSportLevel: { id: string; code: string; name: string; sortOrder: number; sportId: string } | null;
  region: { id: string; name: string };
  hostTeam: {
    id: string;
    name: string;
    ownerUserId: string;
    status: string;
    profile: { logoUrl: string | null } | null;
    trustScore: { trustState: 'verified' | 'estimated' | 'sample' | 'none' } | null;
    memberships: Array<{ id: string; userId: string; role: 'owner' | 'manager' | 'member'; status: string }>;
  };
  approvedApplicantTeam: {
    id: string;
    name: string;
    memberships: Array<{ userId: string; role: 'owner' | 'manager' | 'member'; status: string }>;
  } | null;
  applications: Array<V1TeamMatchApplication & { applicantTeam: { id: string; name: string } }>;
  game: { id: string } | null;
  // teamMatchInclude() 와 짝을 이루는 **손으로 쓴** 타입이라, include 를 넓혀도 여기를
  // 함께 고치지 않으면 컴파일이 깨진다(실제로 CI 가 TS2551 로 잡았다).
  league: { id: string; title: string } | null;
};

@Injectable()
export class TeamMatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly games: GamesService,
  ) {}

  async list(user: V1AuthUser | null, query: TeamMatchesQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const status = query.status ?? 'recruiting';
    const teamMatches = await this.prisma.v1TeamMatch.findMany({
      where: {
        deletedAt: null,
        hostTeam: { status: 'active', deletedAt: null },
        ...(status === 'expired' ? { startAt: { lt: new Date() } } : { status }),
        ...(query.sportId ? { sportId: query.sportId } : {}),
        ...(query.regionId ? { regionId: query.regionId } : {}),
        ...(query.teamId ? { hostTeamId: query.teamId } : {}),
        ...(query.genderRule ? { genderRule: getGenderRuleWhere(query.genderRule) } : {}),
        ...levelCodeWhere(parseLevelCodes(query.levelCodes)),
        // 검색창 placeholder 가 "지역, 팀 이름, 경기조건"을 약속하므로 그 셋을 모두 훑는다.
        // hostTeam·region 이 빠져 있어서 팀 이름이나 지역명으로 검색하면 실제로 존재하는
        // 경기가 0건으로 나왔다.
        ...(query.query
          ? {
              OR: [
                { title: { contains: query.query, mode: 'insensitive' } },
                { description: { contains: query.query, mode: 'insensitive' } },
                { placeName: { contains: query.query, mode: 'insensitive' } },
                { hostTeam: { name: { contains: query.query, mode: 'insensitive' } } },
                { region: { name: { contains: query.query, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: this.teamMatchInclude(user),
      orderBy: getOrderBy(query.sort),
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const pageItems = teamMatches.slice(0, limit);
    const hasNext = teamMatches.length > limit;

    // 캐시(V1TeamTrustScore)는 72시간 경과만으로는 안 갱신될 수 있으므로 이 페이지에 등장하는
    // hostTeam들의 신뢰점수를 배치 1회 호출로 live 재계산해 덮어쓴다 (N+1 방지, computeRevealedTeamTrustBatch 참조).
    const hostTeamIds = [...new Set(pageItems.map((teamMatch) => teamMatch.hostTeamId))];
    const trustByHostTeam = await computeRevealedTeamTrustBatch(this.prisma, hostTeamIds);
    for (const teamMatch of pageItems) {
      const trust = trustByHostTeam.get(teamMatch.hostTeamId);
      teamMatch.hostTeam.trustScore = trust ? { trustState: trust.trustState } : null;
    }

    return {
      items: pageItems.map((teamMatch) => this.toListItem(teamMatch, user)),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async detail(user: V1AuthUser | null, teamMatchId: string) {
    const teamMatch = await this.getPublicTeamMatch(teamMatchId, user, { includeTrust: true });
    const viewer = await this.getViewer(teamMatch, user);
    const approvedApplication = teamMatch.applications.find((item) => item.status === 'approved');
    // U3: 리그 대진일 때만 이의 제기 자격을 계산한다 -- 일반 팀 매치는 이 개념 자체가
    // 없고, 추가 쿼리 3개(공식 리비전·승강 확정·열린 이의)를 매번 낼 이유도 없다.
    const leagueDispute = teamMatch.league ? await this.getLeagueDisputeEligibility(teamMatch) : null;

    return {
      teamMatchId: teamMatch.id,
      // Task 17: null only if a pre-Task-6 row somehow lacks a Game (creation
      // always provisions one in the same transaction), never a legitimate
      // steady-state value.
      gameId: teamMatch.game?.id ?? null,
      title: teamMatch.title,
      description: teamMatch.description,
      imageUrl: teamMatch.imageUrl,
      sport: { sportId: teamMatch.sport.id, name: teamMatch.sport.name },
      region: { regionId: teamMatch.region.id, name: teamMatch.region.name },
      place: { name: teamMatch.placeName, addressText: teamMatch.placeAddress },
      startsAt: teamMatch.startAt,
      endsAt: teamMatch.endAt,
      deadlineAt: teamMatch.deadlineAt,
      status: this.getApiStatus(teamMatch),
      displayState: this.getDisplayState(teamMatch),
      costNote: teamMatch.costNote,
      // null 이면 일반 팀 매치, 값이 있으면 리그전이다. 프론트는 이 값의 유무로 배지를 건다.
      // U3: 리그전이면 이의 제기 자격(disputeDeadline/disputeBlockedReason/openDisputeExists)도
      // 함께 싣는다 -- 기존 leagueId/title 필드는 그대로 두고 추가만 한다.
      league:
        teamMatch.league && leagueDispute
          ? { leagueId: teamMatch.league.id, title: teamMatch.league.title, ...leagueDispute }
          : null,
      levelLabel: formatLevelRange(teamMatch.minSportLevel, teamMatch.maxSportLevel, teamMatch.formatNote),
      minLevel: teamMatch.minSportLevel ? { code: teamMatch.minSportLevel.code, name: teamMatch.minSportLevel.name } : null,
      maxLevel: teamMatch.maxSportLevel ? { code: teamMatch.maxSportLevel.code, name: teamMatch.maxSportLevel.name } : null,
      rulesText: this.formatMatchConditionsRulesText(teamMatch),
      genderRule: teamMatch.genderRule,
      matchFormat: teamMatch.matchFormat,
      matchStyle: teamMatch.matchStyle,
      uniformColor: teamMatch.uniformColor,
      paymentRequired: false,
      hostTeam: {
        teamId: teamMatch.hostTeam.id,
        name: teamMatch.hostTeam.name,
        logoUrl: teamMatch.hostTeam.profile?.logoUrl ?? null,
        trustState: teamMatch.hostTeam.trustScore?.trustState ?? 'none',
        ownerUserId: teamMatch.hostTeam.ownerUserId,
      },
      approvedOpponentTeam:
        approvedApplication && teamMatch.approvedApplicantTeam
          ? {
              teamId: teamMatch.approvedApplicantTeam.id,
              name: teamMatch.approvedApplicantTeam.name,
              applicationId: approvedApplication.id,
            }
          : null,
      viewer,
    };
  }

  /**
   * #3 1단계: 새 Venue 테이블 없이, 이 팀이 호스트로 과거에 실제로 입력했던 장소를
   * 최근 것부터 최대 5개 돌려준다. 위저드의 장소 입력창 포커스 시 칩으로
   * 노출해 탭 한 번으로 채울 수 있게 한다. 팀 관리자만 조회할 수 있게
   * assertCanManageTeam로 게이팅(생성 권한과 동일한 기준).
   *
   * Prisma `distinct`는 Postgres `DISTINCT ON`으로 컴파일되는데, 이때
   * `orderBy`가 distinct 필드로 시작해야 한다 — `distinct: ['placeName']` +
   * `orderBy: { createdAt: 'desc' }` 조합은 "최근순 distinct 장소"라는 의도와
   * 어긋난다(league-match-admin.service.ts의 loadRecentVenues와 동일한
   * 이유로, 넉넉히 가져온 뒤 애플리케이션에서 dedup한다).
   */
  async recentVenues(user: V1AuthUser, teamId: string) {
    await this.assertCanManageTeam(user.id, teamId);
    const rows = await this.prisma.v1TeamMatch.findMany({
      where: { hostTeamId: teamId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { placeName: true, placeAddress: true },
    });
    // 레거시 행에 앞뒤 공백이 섞여 있을 수 있어 trim 후 dedup한다(league-match-admin
    // .service.ts의 loadRecentVenues와 동일한 방어) — 안 하면 공백만 다른 "중복" 장소가
    // 서로 다른 칩으로 뜨거나, 공백뿐인 값이 빈 칩으로 렌더될 수 있다.
    const seen = new Set<string>();
    const items: { placeName: string; addressText: string | null }[] = [];
    for (const row of rows) {
      const placeName = row.placeName.trim();
      if (!placeName || seen.has(placeName)) continue;
      seen.add(placeName);
      items.push({ placeName, addressText: row.placeAddress });
      if (items.length >= 5) break;
    }
    return { items };
  }

  async applicationEligibility(
    user: V1AuthUser,
    teamMatchId: string,
    query: TeamMatchEligibilityQueryDto,
  ) {
    const teamMatch = await this.getPublicTeamMatch(teamMatchId, user);
    const manageableTeams = await this.getUserManageableTeams(user.id, query.teamId);
    // 자격 판정은 createApplication 의 가드와 **같은 사실**(신청 원장)을 봐야 한다.
    // 종전엔 화면용 include(teamMatchInclude)의 applications 로 판정했는데 그 목록은
    // `OR:[{status:'approved'},{appliedByUserId: 나}]` 로 걸러져 있어, 같은 팀의 **다른
    // 매니저**가 낸 requested 신청서가 아예 안 보였다 → 그 팀이 eligible:true 로 내려가
    // 화면에 '{팀}으로 신청' 버튼이 떴고, 누르면 createApplication 의 가드가 409
    // ALREADY_REQUESTED 를 던졌다(그 전에는 unique 제약에 걸려 raw 500). 눌러야만 알 수
    // 있고 몇 번을 눌러도 결과가 같은 막다른 길이었다.
    // 같은 원장 + 같은 판정 함수(judgeApplicationAttempt)를 쓰면 두 곳이 갈릴 수 없다.
    // 대가는 이 엔드포인트의 쿼리 1개(teamMatchId 인덱스 조회) 추가다.
    const ledger = await readTeamMatchApplicationLedger(this.prisma, teamMatch.id);

    return {
      teamMatchId: teamMatch.id,
      requiresApproval: true,
      requiresPayment: false,
      teams: manageableTeams.map((team) => {
        const { reasonCode, teamApplication } = judgeApplicationAttempt(teamMatch, ledger, user.id, team.id, team.sportId);
        return {
          teamId: team.id,
          name: team.name,
          role: team.memberships[0]?.role ?? 'member',
          eligible: reasonCode === 'OK',
          reasonCode,
          // 같은 팀의 신청서는 이 팀 매니저 누구나 철회할 수 있다(withdrawApplication 도
          // applicantTeamId 로 권한을 본다) — 그래서 동료가 낸 신청서의 id 를 그대로
          // 내려주는 것이 막다른 길의 출구다. 화면은 이 id 로 '신청 취소' CTA 를 만든다.
          applicationId: teamApplication?.id ?? null,
        };
      }),
    };
  }

  async myTeamMatches(user: V1AuthUser, query: MyTeamMatchesQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId: user.id, status: 'active', ...(query.teamId ? { teamId: query.teamId } : {}) },
      select: { teamId: true, role: true },
    });
    const teamIds = memberships.map((membership) => membership.teamId);
    if (teamIds.length === 0) return { items: [], pageInfo: { nextCursor: null, hasNext: false } };

    // status 는 두 계열이 섞여 있다: 매치 상태(recruiting~expired)는 teamMatch.status 로,
    // 신청 상태(requested~withdrawn)는 "내 신청"의 상태로 필터한다.
    const applicationStatusFilter =
      (['requested', 'approved', 'rejected', 'withdrawn'] as const).find((status) => status === query.status) ?? null;
    // 신청 상태를 제외한 나머지도 리터럴 배열로 좁힌다 — query.status 를 그대로 쓰면 타입이
    // 10개 값 union 이라 where.status(V1TeamMatchStatus)에 대입이 안 된다.
    const matchStatusFilter =
      (['recruiting', 'closed', 'matched', 'cancelled', 'completed', 'expired'] as const).find(
        (status) => status === query.status,
      ) ?? null;

    // 신청 상태는 호스트로 참여한 매치에는 성립하지 않으므로 hosted 분기를 제외한다
    // (scope=hosted + 신청 상태 조합은 OR: [] → 빈 결과).
    const includeHosted = (!query.scope || query.scope === 'all' || query.scope === 'hosted') && !applicationStatusFilter;
    const includeApplied = !query.scope || query.scope === 'all' || query.scope === 'applied';
    const teamMatches = await this.prisma.v1TeamMatch.findMany({
      where: {
        deletedAt: null,
        // 'expired'는 계산 상태(getApiStatus)라 DB status 로 존재하지 않는다 — list()와
        // 동일하게 startAt 과거 조건으로 매핑한다.
        ...(matchStatusFilter
          ? matchStatusFilter === 'expired'
            ? { startAt: { lt: new Date() } }
            : { status: matchStatusFilter }
          : {}),
        OR: [
          ...(includeHosted ? [{ hostTeamId: { in: teamIds } }] : []),
          ...(includeApplied
            ? [
                {
                  applications: {
                    some: {
                      applicantTeamId: { in: teamIds },
                      ...(applicationStatusFilter ? { status: applicationStatusFilter } : {}),
                    },
                  },
                },
              ]
            : []),
        ],
      },
      include: {
        sport: { select: { name: true } },
        hostTeam: { select: { id: true, name: true } },
        // 내 경기 목록도 리그전 배지를 단다(사용자 결정 3). 이 목록은 공용 include 를
        // 쓰지 않고 자체 select 라, 여기에 따로 실지 않으면 배지가 이 화면에서만 빠진다.
        league: { select: { id: true, title: true } },
        applications: {
          // 신청 상태로 필터 중이면 노출하는 신청도 그 상태와 일치해야 한다 — 아니면
          // 필터에 걸린 매치에 다른 상태의 최신 신청이 표시될 수 있다.
          where: {
            applicantTeamId: { in: teamIds },
            ...(applicationStatusFilter ? { status: applicationStatusFilter } : {}),
          },
          include: { applicantTeam: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      // { id } tie-breaker: getOrderBy 와 같은 이유(리그 일괄 생성 행의 동률 정렬 결정성).
      orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const pageItems = teamMatches.slice(0, limit);
    const hasNext = teamMatches.length > limit;

    return {
      items: pageItems.map((teamMatch) => {
        const application = teamMatch.applications[0] ?? null;
        const relation = teamIds.includes(teamMatch.hostTeamId)
          ? 'host_team'
          : application?.status === 'approved'
            ? 'approved'
            : application?.status ?? 'requested';
        const teamId = teamIds.includes(teamMatch.hostTeamId) ? teamMatch.hostTeamId : application?.applicantTeamId;
        return {
          teamMatchId: teamMatch.id,
          title: teamMatch.title,
          sportName: teamMatch.sport.name,
          startsAt: teamMatch.startAt,
          status: this.getApiStatus(teamMatch),
          relation,
          teamId,
          teamName: teamIds.includes(teamMatch.hostTeamId) ? teamMatch.hostTeam.name : application?.applicantTeam.name,
          applicationId: application?.id ?? null,
          league: teamMatch.league ? { leagueId: teamMatch.league.id, title: teamMatch.league.title } : null,
          manageRoute: relation === 'host_team' ? `/team-matches/${teamMatch.id}/manage` : null,
          detailRoute: `/team-matches/${teamMatch.id}`,
        };
      }),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  // Copilot 리뷰 finding(PR #295): matchFormat/matchStyle/uniformColor를 dto 값 그대로
  // (trim 없이) 저장하면 공백뿐인 문자열이 DB에 남을 수 있다 — 그러면
  // hasStructuredConditions(team-matches-create-client.tsx) 판정이 "구조화 필드가 채워져
  // 있다"고 잘못 보고, 정작 표시할 값은 없는 채로 레거시 formatNote 폴백이 영구히 막힌다.
  // create/update 양쪽에서 같은 정규화를 쓰도록 한 곳에 모은다.
  private normalizeMatchConditionFields(dto: MutateTeamMatchDto) {
    const matchFormat = dto.matchFormat?.trim() || null;
    const matchStyle = (dto.matchStyle ?? []).map((item) => item.trim()).filter(Boolean);
    const uniformColor = dto.uniformColor?.trim() || null;
    return { matchFormat, matchStyle, uniformColor };
  }

  async create(
    user: V1AuthUser,
    dto: MutateTeamMatchDto,
    durableCommandId?: string,
  ) {
    this.assertActiveAccount(user);
    await assertCreatorProfileComplete(this.prisma, user.id);
    const hostMembership = await this.assertCanManageTeam(user.id, dto.hostTeamId);
    if (hostMembership.team.sportId !== dto.sportId) {
      throw validationError('sportId must match the host team sport', 'sportId');
    }
    await this.validateMasterRefs(dto.sportId, dto.regionId);
    const dates = this.validateDates(dto);
    const payloadHash = canonicalGameCommandPayloadHash({
      actorUserId: user.id,
      dto,
    });
    const commandId = durableCommandId?.trim() || payloadHash;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`team-match-create:${user.id}:${commandId}`}, 0))`;
      const existingCommand = await tx.v1IdempotencyRecord.findFirst({
        where: {
          actorUserId: user.id,
          action: 'source_create',
          resourceType: V1GameSourceType.TEAM_MATCH,
          idempotencyKey: commandId,
        },
        select: { resourceId: true },
      });
      if (existingCommand !== null) {
        const existingTeamMatch = await tx.v1TeamMatch.findUniqueOrThrow({
          where: { id: existingCommand.resourceId },
        });
        const actorRole = await this.resolveTeamGameActorRole(
          tx,
          existingTeamMatch.hostTeamId,
          user.id,
        );
        const input = await this.loadPersistedGameSourceInput(tx, existingTeamMatch.id);
        const game = await this.games.createFromSourceInTransaction(
          tx,
          input,
          this.teamMatchGameContext(user, actorRole, commandId, payloadHash),
        );
        return { teamMatch: existingTeamMatch, game };
      }

      const source = await this.loadTeamMatchCreationSource(
        tx,
        dto.hostTeamId,
        dto.sportId,
        user.id,
      );
      const levelRange = await resolveSportLevelRange(tx, dto.sportId, dto.minLevelCode, dto.maxLevelCode);
      const conditionFields = this.normalizeMatchConditionFields(dto);
      const created = await tx.v1TeamMatch.create({
        data: {
          hostTeamId: dto.hostTeamId,
          createdByUserId: user.id,
          sportId: dto.sportId,
          regionId: dto.regionId,
          title: dto.title,
          description: dto.description ?? null,
          imageUrl: dto.imageUrl ?? null,
          placeName: dto.manualPlaceName,
          placeAddress: dto.addressText ?? null,
          startAt: dates.startsAt,
          endAt: dates.endsAt,
          deadlineAt: dates.deadlineAt,
          formatNote: dto.rulesText ?? null,
          matchFormat: conditionFields.matchFormat,
          matchStyle: conditionFields.matchStyle,
          uniformColor: conditionFields.uniformColor,
          minSportLevelId: levelRange.minSportLevelId,
          maxSportLevelId: levelRange.maxSportLevelId,
          genderRule: dto.genderRule ?? null,
          costNote: dto.costNote ?? null,
          status: 'recruiting',
          competitionConfigVersionId: source.competitionConfigVersionId,
        },
      });
      const game = await this.games.createFromSourceInTransaction(
        tx,
        this.teamMatchGameSourceInput(created.id, source),
        this.teamMatchGameContext(user, source.actorRole, commandId, payloadHash),
      );
      // 매치 ↔ 팀일정 연동(레인 schedule): "매치가 곧 팀일정" — 호스트는 장소·시간을 이미 확보한
      // 상태이므로 상대팀 확정 여부와 무관하게 캘린더에 존재해야 한다. 같은 트랜잭션 안에서 호스트
      // 팀에 가확정(SCHEDULED, 상대팀 모집 중) 스케줄 1건을 만든다. idempotency replay 분기(위
      // existingCommand !== null 케이스)는 이 블록을 지나지 않으므로 재시도가 스케줄을 중복 생성하지
      // 않는다 — @@unique([teamId, teamMatchId])가 그래도 마지막 방어선이다.
      await createTeamMatchScheduleInTx(tx, dto.hostTeamId, created.id, dto.title, dates.startsAt, dates.endsAt);
      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'team_match',
          targetId: created.id,
          fromStatus: null,
          toStatus: 'recruiting',
          actorType: 'user',
          actorUserId: user.id,
          reason: 'team_match_created',
        },
      });
      return { teamMatch: created, game };
    });

    return {
      teamMatchId: result.teamMatch.id,
      gameId: result.game.gameId,
      status: result.teamMatch.status,
      hostTeamId: result.teamMatch.hostTeamId,
      detailRoute: `/team-matches/${result.teamMatch.id}`,
      manageRoute: `/team-matches/${result.teamMatch.id}/manage`,
    };
  }

  async edit(user: V1AuthUser, teamMatchId: string) {
    const teamMatch = await this.getManageableTeamMatch(user, teamMatchId);
    const apiStatus = this.getApiStatus(teamMatch);
    const editable = teamMatch.status === 'recruiting' && apiStatus !== 'expired';
    return {
      teamMatchId: teamMatch.id,
      editable,
      lockedReason: editable ? null : apiStatus === 'expired' ? 'expired' : 'terminal_or_matched_status',
      form: {
        hostTeamId: teamMatch.hostTeamId,
        sportId: teamMatch.sportId,
        regionId: teamMatch.regionId,
        title: teamMatch.title,
        description: teamMatch.description,
        imageUrl: teamMatch.imageUrl,
        startsAt: teamMatch.startAt,
        endsAt: teamMatch.endAt,
        deadlineAt: teamMatch.deadlineAt,
        manualPlaceName: teamMatch.placeName,
        addressText: teamMatch.placeAddress,
        costNote: teamMatch.costNote,
        rulesText: teamMatch.formatNote,
        minLevelCode: teamMatch.minSportLevel?.code ?? null,
        maxLevelCode: teamMatch.maxSportLevel?.code ?? null,
        genderRule: teamMatch.genderRule,
        matchFormat: teamMatch.matchFormat,
        matchStyle: teamMatch.matchStyle,
        uniformColor: teamMatch.uniformColor,
      },
      status: apiStatus,
      version: teamMatch.updatedAt.toISOString(),
    };
  }

  async update(user: V1AuthUser, teamMatchId: string, dto: UpdateTeamMatchDto) {
    this.assertActiveAccount(user);
    const teamMatch = await this.getManageableTeamMatch(user, teamMatchId);
    if (teamMatch.updatedAt.toISOString() !== dto.version) throw stateConflict('Team match version is stale', 'VERSION_CONFLICT');
    if (teamMatch.status !== 'recruiting' || this.getApiStatus(teamMatch) === 'expired') throw stateConflict('Team match cannot be updated in current status');
    if (dto.hostTeamId !== teamMatch.hostTeamId) throw stateConflict('Host team cannot be changed');
    if (dto.sportId !== teamMatch.hostTeam.sportId) {
      throw validationError('sportId must match the host team sport', 'sportId');
    }
    if (dto.sportId !== teamMatch.sportId) {
      throw stateConflict(
        'The sport cannot change after the Game competition config is pinned',
        'COMPETITION_CONFIG_IMMUTABLE',
      );
    }
    await this.validateMasterRefs(dto.sportId, dto.regionId);
    const levelRange = await resolveSportLevelRange(this.prisma, dto.sportId, dto.minLevelCode, dto.maxLevelCode);
    const dates = this.validateDates(dto);

    // 매치 ↔ 팀일정 연동(레인 schedule): 매치 제목/시간이 바뀌면 호스트 스케줄도 같은 트랜잭션 안에서
    // 동기화해야 캘린더가 실제와 어긋나지 않는다 — 이 메서드를 트랜잭션으로 승격한다(다른 4개
    // 메서드와 달리 여기만 단일 update() 호출이었다). 경기조건 구조화 필드(matchFormat/matchStyle/
    // uniformColor)는 이 트랜잭션 승격과 별개로 함께 저장해야 한다 — 둘 중 하나만 반영하면
    // 일정 동기화가 빠지거나 새 경기조건 저장이 무효화된다.
    const conditionFields = this.normalizeMatchConditionFields(dto);
    const updated = await this.prisma.$transaction(async (tx) => {
      const teamMatchUpdated = await tx.v1TeamMatch.update({
        where: { id: teamMatch.id },
        data: {
          sportId: dto.sportId,
          regionId: dto.regionId,
          title: dto.title,
          description: dto.description ?? null,
          imageUrl: dto.imageUrl ?? null,
          placeName: dto.manualPlaceName,
          placeAddress: dto.addressText ?? null,
          startAt: dates.startsAt,
          endAt: dates.endsAt,
          deadlineAt: dates.deadlineAt,
          formatNote: dto.rulesText ?? null,
          matchFormat: conditionFields.matchFormat,
          matchStyle: conditionFields.matchStyle,
          uniformColor: conditionFields.uniformColor,
          minSportLevelId: levelRange.minSportLevelId,
          maxSportLevelId: levelRange.maxSportLevelId,
          genderRule: dto.genderRule ?? null,
          costNote: dto.costNote ?? null,
        },
      });
      await syncTeamMatchScheduleInTx(tx, teamMatch.id, dto.title, dates.startsAt, dates.endsAt);
      return teamMatchUpdated;
    });

    return {
      teamMatchId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt,
      version: updated.updatedAt.toISOString(),
      detailRoute: `/team-matches/${updated.id}`,
    };
  }

  async cancel(user: V1AuthUser, teamMatchId: string, dto: CancelTeamMatchDto) {
    this.assertActiveAccount(user);
    const teamMatch = await this.getManageableTeamMatch(user, teamMatchId);
    // 리그 대진(leagueId 有)은 어드민이 일정을 관리한다 — 호스트 팀의 일방 취소를 허용하면
    // 리그 순위표·잔여 라운드가 조용히 깨진다. 어드민 경로(POST /admin/team-matches/:id/status)만 유효.
    if (teamMatch.leagueId !== null) {
      throw stateConflict(
        '리그 경기는 팀에서 직접 취소할 수 없어요. 리그 운영자에게 문의해주세요.',
        'LEAGUE_FIXTURE_HOST_CANCEL_FORBIDDEN',
      );
    }
    if (teamMatch.status === 'cancelled') {
      throw new ConflictException({ code: 'ALREADY_PROCESSED', message: 'Team match is already cancelled' });
    }
    if (teamMatch.status === 'completed' || this.getApiStatus(teamMatch) === 'expired') {
      throw stateConflict('Team match cannot be cancelled in current status');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.v1TeamMatch.update({
        where: { id: teamMatch.id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      const applications = await tx.v1TeamMatchApplication.updateMany({
        where: { teamMatchId: teamMatch.id, status: 'requested' },
        data: { status: 'rejected', reviewedByUserId: user.id, reviewedAt: new Date() },
      });
      // 매치 ↔ 팀일정 연동(레인 schedule): teamMatchId로 연결된 SCHEDULED 스케줄(호스트/상대 최대
      // 2건)을 같은 트랜잭션 안에서 CANCELLED로 cascade한다 — row는 삭제하지 않는다.
      await cascadeCancelTeamMatchSchedulesInTx(tx, teamMatch.id, dto.reason ?? 'host_cancelled');
      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'team_match',
          targetId: teamMatch.id,
          fromStatus: teamMatch.status,
          toStatus: 'cancelled',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.reason ?? 'host_cancelled',
        },
      });
      return { applications };
    });

    // 알림: 승인된 상대팀 manager+에게 취소 안내 (fire-and-forget — 수신자 조회 실패도 본 요청을 깨지 않음)
    if (teamMatch.approvedApplicantTeamId) {
      const opponentTeamId = teamMatch.approvedApplicantTeamId;
      this.notifications.emitToManyDeferred(
        async () =>
          (
            await this.prisma.v1TeamMembership.findMany({
              where: { teamId: opponentTeamId, status: 'active', role: { in: ['owner', 'manager'] } },
              select: { userId: true },
            })
          ).map((m) => m.userId),
        'team_match_cancelled',
        teamMatch.id,
        `"${teamMatch.title}" 팀매치가 취소됐어요.`,
      );
    }

    return {
      teamMatchId: teamMatch.id,
      status: 'cancelled',
      cancelledApplications: result.applications.count,
      detailRoute: `/team-matches/${teamMatch.id}`,
    };
  }

  async close(user: V1AuthUser, teamMatchId: string, dto: CloseTeamMatchDto) {
    this.assertActiveAccount(user);
    const teamMatch = await this.getManageableTeamMatch(user, teamMatchId);
    if (teamMatch.status === 'closed') {
      throw new ConflictException({ code: 'ALREADY_PROCESSED', message: 'Team match is already closed' });
    }
    if (teamMatch.status !== 'recruiting' || this.getApiStatus(teamMatch) === 'expired') {
      throw stateConflict('Only active recruiting team matches can be closed');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TeamMatch.update({
        where: { id: teamMatch.id },
        data: { status: 'closed' },
      });
      const applications = await tx.v1TeamMatchApplication.updateMany({
        where: { teamMatchId: teamMatch.id, status: 'requested' },
        data: { status: 'expired', reviewedByUserId: user.id, reviewedAt: new Date() },
      });
      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'team_match',
          targetId: teamMatch.id,
          fromStatus: teamMatch.status,
          toStatus: 'closed',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.reason ?? 'team_match_closed',
        },
      });
      return { updated, applications };
    });

    this.emitTeamMatchNotificationToApplicantManagers(
      teamMatch.id,
      'team_match_closed',
      `"${teamMatch.title}" 팀매치 모집이 마감되어 대기 중인 신청이 종료됐어요.`,
    );

    return {
      teamMatchId: result.updated.id,
      status: result.updated.status,
      expiredApplications: result.applications.count,
      detailRoute: `/team-matches/${teamMatch.id}`,
    };
  }

  async reopen(user: V1AuthUser, teamMatchId: string, dto: ReopenTeamMatchDto) {
    this.assertActiveAccount(user);
    const teamMatch = await this.getManageableTeamMatch(user, teamMatchId);
    if (teamMatch.status !== 'closed') {
      throw stateConflict('Only closed team matches can be reopened');
    }
    if (teamMatch.startAt < new Date()) {
      throw stateConflict('Expired team matches cannot be reopened');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextTeamMatch = await tx.v1TeamMatch.update({
        where: { id: teamMatch.id },
        data: { status: 'recruiting' },
      });
      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'team_match',
          targetId: teamMatch.id,
          fromStatus: teamMatch.status,
          toStatus: 'recruiting',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.reason ?? 'team_match_reopened',
        },
      });
      return nextTeamMatch;
    });

    return {
      teamMatchId: updated.id,
      status: updated.status,
      detailRoute: `/team-matches/${teamMatch.id}`,
    };
  }

  async createApplication(
    user: V1AuthUser,
    teamMatchId: string,
    dto: CreateTeamMatchApplicationDto,
  ) {
    this.assertActiveAccount(user);
    const applicantMembership = await this.assertCanManageTeam(user.id, dto.applicantTeamId);
    const applicantTeamSportId = applicantMembership.team.sportId;
    const teamMatch = await this.getPublicTeamMatch(teamMatchId, user);
    // 중복 판정은 화면용 include(teamMatchInclude)가 아니라 신청 원장을 직접 읽는다 — 그
    // include 의 applications 는 `appliedByUserId = 나`로 걸러져 있어 같은 팀의 다른 매니저가
    // 낸 신청서가 아예 안 보인다. 그 필터된 목록으로 판정하면 아래 create()가
    // @@unique([teamMatchId, applicantTeamId])에 걸려 raw 500 이 된다(이 저장소엔 전역
    // P2002 필터가 없다 — 12곳 전부 서비스 로컬 처리).
    const reason = judgeApplicationAttempt(
      teamMatch,
      await readTeamMatchApplicationLedger(this.prisma, teamMatch.id),
      user.id,
      dto.applicantTeamId,
      applicantTeamSportId,
    ).reasonCode;
    if (reason !== 'OK') {
      throw stateConflict(getEligibilityReasonMessage(reason), reason);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 조회 → 생성 사이의 경합 창을 닫는다. **사용자 단위 중복(한 사람이 두 팀으로 2건)은
      // DB 가 막아주지 못한다** — unique 제약이 팀 단위라서다. 그래서 같은 팀매치에 대한
      // 신청을 직렬화하는 것이 유일한 방어다. approveApplication 이 이미 잡는 것과 **같은
      // 행(v1_team_matches)을 같은 순서로** 잠그므로 두 경로가 교차 교착에 빠지지 않는다.
      await tx.$queryRaw`SELECT id FROM "v1_team_matches" WHERE id = ${teamMatch.id} FOR UPDATE`;
      const currentTeamMatch = await tx.v1TeamMatch.findFirst({
        where: { id: teamMatch.id, deletedAt: null },
        select: { hostTeamId: true, status: true, startAt: true, deadlineAt: true, sportId: true },
      });
      if (!currentTeamMatch) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team match was not found' });
      }
      // 잠금을 잡은 뒤 원장을 다시 읽어 같은 규칙으로 재판정한다 — 잠금 대기 중에 다른
      // 요청이 신청서를 만들거나 호스트가 승인을 끝냈을 수 있다.
      const judged = judgeApplicationAttempt(
        currentTeamMatch,
        await readTeamMatchApplicationLedger(tx, teamMatch.id),
        user.id,
        dto.applicantTeamId,
        applicantTeamSportId,
      );
      if (judged.reasonCode !== 'OK') {
        throw stateConflict(getEligibilityReasonMessage(judged.reasonCode), judged.reasonCode);
      }
      const application = judged.teamApplication;
      const nextApplication = application
        ? await (async () => {
            const transition = await tx.v1TeamMatchApplication.updateMany({
              where: { id: application.id, status: application.status },
              data: {
                status: 'requested',
                appliedByUserId: user.id,
                message: dto.message ?? null,
                reviewedByUserId: null,
                reviewedAt: null,
                withdrawnAt: null,
              },
            });
            if (transition.count !== 1) {
              throw stateConflict('Team match application state changed before it could be resubmitted');
            }
            return {
              ...application,
              status: 'requested' as const,
              appliedByUserId: user.id,
              message: dto.message ?? null,
            };
          })()
        : await tx.v1TeamMatchApplication.create({
            data: {
              teamMatchId: teamMatch.id,
              applicantTeamId: dto.applicantTeamId,
              appliedByUserId: user.id,
              status: 'requested',
              message: dto.message ?? null,
            },
          });

      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'team_match_application',
          targetId: nextApplication.id,
          fromStatus: application?.status ?? null,
          toStatus: 'requested',
          actorType: 'user',
          actorUserId: user.id,
          reason: application ? 'team_match_application_resubmitted' : 'team_match_application_created',
        },
      });

      return nextApplication;
    },
    {
      // 이 트랜잭션은 위 FOR UPDATE 에서 **다른 요청이 끝날 때까지 기다릴 수 있다** — 종전엔
      // 없던 대기다(그 대신 유령 신청서가 생겼다). Prisma 의 기본 timeout 5초는 그 대기까지
      // 포함해 재는데, 이 행을 잡는 다른 경로(approveApplication: 쿼리 12개)도 같은 5초를
      // 쓰므로 최악의 정당한 점유가 5초다 → 기본값이면 정상적인 순서 대기가 그대로 실패로
      // 뒤집힌다. 최악 점유의 3배로 잡아 "기다리면 되는 것"이 실패하지 않게 한다.
      // 잠금 자체는 줄이지 않는다: 사용자 단위 중복(한 사람이 두 팀으로 2건)은 unique 제약이
      // 팀 단위라 DB 가 못 막고, 이 직렬화가 유일한 방어다. 잠금 구간은 이미 최소다
      // (조회 2 + 쓰기 2). 알림 발송은 이미 트랜잭션 밖이다.
      timeout: 15_000,
      // maxWait 는 일부러 기본값(2초)을 둔다 — 이건 **커넥션 풀에서 커넥션을 받는** 시간이지
      // 위 행 잠금 대기가 아니다. 풀이 포화된 상태에서 이 값을 늘리면 줄만 길어진다. 그때 나는
      // P2028 은 전역 필터(common/filters/http-exception.filter.ts)가 이미 503
      // SERVICE_TEMPORARILY_BUSY + 해요체 안내로 번역하므로 여기서 또 의미를 붙이지 않는다.
    });

    // 알림: 호스트팀 manager+에게 신청 접수 안내 (fire-and-forget — 수신자 조회 실패도 본 요청을 깨지 않음)
    this.notifications.emitToManyDeferred(
      async () =>
        (
          await this.prisma.v1TeamMembership.findMany({
            where: { teamId: teamMatch.hostTeamId, status: 'active', role: { in: ['owner', 'manager'] } },
            select: { userId: true },
          })
        ).map((m) => m.userId),
      'team_match_application_received',
      teamMatch.id,
      `"${teamMatch.title}" 팀매치 신청을 확인해 주세요.`,
    );

    return {
      applicationId: result.id,
      teamMatchId: result.teamMatchId,
      applicantTeamId: result.applicantTeamId,
      status: result.status,
      requiresApproval: true,
      requiresPayment: false,
    };
  }

  async applications(
    user: V1AuthUser,
    teamMatchId: string,
    query: ListTeamMatchApplicationsQueryDto,
  ) {
    const teamMatch = await this.getManageableTeamMatch(user, teamMatchId);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const applications = await this.prisma.v1TeamMatchApplication.findMany({
      where: {
        teamMatchId: teamMatch.id,
        ...(query.status ? { status: query.status } : { status: 'requested' }),
      },
      include: {
        applicantTeam: {
          select: {
            id: true,
            name: true,
            profile: { select: { logoUrl: true } },
            trustScore: { select: { matchCount: true } },
          },
        },
        appliedByUser: {
          select: {
            id: true,
            profile: { select: { nickname: true, displayName: true, profileImageUrl: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const pageItems = applications.slice(0, limit);
    const hasNext = applications.length > limit;

    // 캐시(V1TeamTrustScore)는 72시간 경과만으로는 안 갱신될 수 있으므로 이 페이지의 applicantTeam들의
    // 신뢰점수를 배치 1회 호출로 live 재계산한다. matchCount는 이번 스코프 밖(리뷰 reveal과 무관한 별개
    // 집계)이라 기존 캐시값을 그대로 쓴다.
    const applicantTeamIds = [...new Set(pageItems.map((application) => application.applicantTeamId))];
    const trustByApplicantTeam = await computeRevealedTeamTrustBatch(this.prisma, applicantTeamIds);

    return {
      teamMatchId: teamMatch.id,
      items: pageItems.map((application) => {
        const trust = trustByApplicantTeam.get(application.applicantTeamId);
        return {
          applicationId: application.id,
          status: application.status,
          message: application.message,
          createdAt: application.createdAt,
          reviewedAt: application.reviewedAt,
          applicantTeam: {
            teamId: application.applicantTeam.id,
            name: application.applicantTeam.name,
            logoUrl: application.applicantTeam.profile?.logoUrl ?? null,
            trustState: trust?.trustState ?? 'none',
            score: trust?.mannerScore ?? null,
            matchCount: application.applicantTeam.trustScore?.matchCount ?? 0,
          },
          appliedBy: {
            userId: application.appliedByUser.id,
            displayName:
              application.appliedByUser.profile?.nickname ?? application.appliedByUser.profile?.displayName ??
              '신청자',
            profileImageUrl: application.appliedByUser.profile?.profileImageUrl ?? null,
          },
          canApprove: application.status === 'requested' && teamMatch.status === 'recruiting',
          canReject: application.status === 'requested',
        };
      }),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async withdrawApplication(
    user: V1AuthUser,
    applicationId: string,
    dto: WithdrawTeamMatchApplicationDto,
  ) {
    this.assertActiveAccount(user);
    const application = await this.getApplicationWithTeamMatch(applicationId);
    await this.assertCanManageTeam(user.id, application.applicantTeamId);

    if (application.status !== 'requested') {
      throw new ConflictException({
        code: 'ALREADY_PROCESSED',
        message: 'Only requested team match applications can be withdrawn',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.v1TeamMatchApplication.updateMany({
        where: { id: application.id, status: 'requested' },
        data: { status: 'withdrawn', withdrawnAt: new Date() },
      });
      if (transition.count !== 1) {
        throw new ConflictException({
          code: 'ALREADY_PROCESSED',
          message: 'Only requested team match applications can be withdrawn',
        });
      }
      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'team_match_application',
          targetId: application.id,
          fromStatus: application.status,
          toStatus: 'withdrawn',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.reason ?? 'applicant_team_withdrawn',
        },
      });
      return { ...application, status: 'withdrawn' as const };
    });

    this.emitNotificationToTeamManagers(
      [application.teamMatch.hostTeamId],
      'team_match_application_withdrawn',
      application.teamMatchId,
      `"${application.teamMatch.title}" 팀매치 상대팀 신청이 취소됐어요.`,
    );

    return {
      applicationId: updated.id,
      teamMatchId: updated.teamMatchId,
      applicantTeamId: updated.applicantTeamId,
      status: updated.status,
    };
  }

  async approveApplication(
    user: V1AuthUser,
    applicationId: string,
    dto: ApproveTeamMatchApplicationDto,
  ) {
    this.assertActiveAccount(user);
    const application = await this.getApplicationWithTeamMatch(applicationId);
    await this.assertCanManageTeam(user.id, application.teamMatch.hostTeamId);

    if (application.status !== 'requested') {
      throw stateConflict('Only requested team match applications can be approved');
    }
    if (
      application.teamMatch.status !== 'recruiting' ||
      application.teamMatch.startAt < new Date() ||
      (application.teamMatch.deadlineAt && application.teamMatch.deadlineAt < new Date())
    ) {
      throw stateConflict('Team match is not recruiting');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "v1_team_matches" WHERE id = ${application.teamMatchId} FOR UPDATE`;
      const currentTeamMatch = await tx.v1TeamMatch.findFirst({
        where: { id: application.teamMatchId, deletedAt: null },
        select: { status: true, startAt: true, deadlineAt: true, approvedApplicantTeamId: true },
      });
      if (
        !currentTeamMatch ||
        currentTeamMatch.status !== 'recruiting' ||
        currentTeamMatch.startAt < new Date() ||
        (currentTeamMatch.deadlineAt && currentTeamMatch.deadlineAt < new Date()) ||
        currentTeamMatch.approvedApplicantTeamId
      ) {
        throw stateConflict('Team match is not recruiting');
      }

      const otherRequestedApplications = await tx.v1TeamMatchApplication.findMany({
        where: {
          teamMatchId: application.teamMatchId,
          status: 'requested',
          id: { not: application.id },
        },
        select: { id: true, applicantTeamId: true },
      });

      const transition = await tx.v1TeamMatchApplication.updateMany({
        where: { id: application.id, status: 'requested' },
        data: { status: 'approved', reviewedByUserId: user.id, reviewedAt: new Date() },
      });
      if (transition.count !== 1) {
        throw stateConflict('Only requested team match applications can be approved');
      }
      const updatedTeamMatch = await tx.v1TeamMatch.update({
        where: { id: application.teamMatchId },
        data: {
          status: 'matched',
          approvedApplicantTeamId: application.applicantTeamId,
        },
      });
      await this.hydrateApprovedAwaySnapshot(
        tx,
        application.teamMatchId,
        application.applicantTeamId,
      );
      // 매치 ↔ 팀일정 연동(레인 schedule): 승인된 상대팀에게도 같은 트랜잭션 안에서 스케줄을
      // 만든다 — approveApplication은 "승인된 팀은 정확히 1개"를 이미 보장하므로(바로 아래 나머지
      // requested 신청 자동 rejected 처리) 이 지점에서만 만들면 확정된 팀에게만 정확히 1건이
      // 자동으로 보장된다. 이 시점엔 이미 확정 상태라 상대팀은 '가확정' 단계를 볼 일이 없다.
      await createTeamMatchScheduleInTx(
        tx,
        application.applicantTeamId,
        application.teamMatchId,
        application.teamMatch.title,
        application.teamMatch.startAt,
        application.teamMatch.endAt,
      );
      await tx.v1TeamMatchApplication.updateMany({
        where: {
          teamMatchId: application.teamMatchId,
          status: 'requested',
          id: { not: application.id },
        },
        data: { status: 'rejected', reviewedByUserId: user.id, reviewedAt: new Date() },
      });
      await tx.v1StatusChangeLog.createMany({
        data: [
          {
            targetType: 'team_match_application',
            targetId: application.id,
            fromStatus: application.status,
            toStatus: 'approved',
            actorType: 'user',
            actorUserId: user.id,
            reason: dto.note ?? 'team_match_application_approved',
          },
          {
            targetType: 'team_match',
            targetId: application.teamMatchId,
            fromStatus: application.teamMatch.status,
            toStatus: 'matched',
            actorType: 'user',
            actorUserId: user.id,
            reason: 'team_match_application_approved',
          },
          ...otherRequestedApplications.map((otherApplication) => ({
            targetType: 'team_match_application' as const,
            targetId: otherApplication.id,
            fromStatus: 'requested' as const,
            toStatus: 'rejected' as const,
            actorType: 'user' as const,
            actorUserId: user.id,
            reason: 'another_team_match_application_approved',
          })),
        ],
      });
      return {
        updatedApplication: {
          id: application.id,
          teamMatchId: application.teamMatchId,
          applicantTeamId: application.applicantTeamId,
          status: 'approved' as const,
        },
        updatedTeamMatch,
        autoRejectedApplicantTeamIds: otherRequestedApplications.map((item) => item.applicantTeamId),
      };
    });

    // 알림: 신청팀 owner/manager에게 승인 안내 (fire-and-forget)
    this.emitNotificationToTeamManagers(
      [application.applicantTeamId],
      'team_match_application_approved',
      application.teamMatchId,
      `"${application.teamMatch.title}" 팀매치 신청이 승인됐어요.`,
    );
    this.emitNotificationToTeamManagers(
      result.autoRejectedApplicantTeamIds,
      'team_match_application_rejected',
      application.teamMatchId,
      `"${application.teamMatch.title}" 팀매치의 상대팀이 확정되어 신청이 종료됐어요.`,
    );

    return {
      applicationId: result.updatedApplication.id,
      teamMatchId: result.updatedApplication.teamMatchId,
      applicantTeamId: result.updatedApplication.applicantTeamId,
      status: result.updatedApplication.status,
      teamMatchStatus: result.updatedTeamMatch.status,
      approvedApplicantTeamId: result.updatedTeamMatch.approvedApplicantTeamId,
    };
  }

  async rejectApplication(
    user: V1AuthUser,
    applicationId: string,
    dto: RejectTeamMatchApplicationDto,
  ) {
    this.assertActiveAccount(user);
    const application = await this.getApplicationWithTeamMatch(applicationId);
    await this.assertCanManageTeam(user.id, application.teamMatch.hostTeamId);

    if (application.status !== 'requested') {
      throw stateConflict('Only requested team match applications can be rejected');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.v1TeamMatchApplication.updateMany({
        where: { id: application.id, status: 'requested' },
        data: { status: 'rejected', reviewedByUserId: user.id, reviewedAt: new Date() },
      });
      if (transition.count !== 1) {
        throw stateConflict('Only requested team match applications can be rejected');
      }
      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'team_match_application',
          targetId: application.id,
          fromStatus: application.status,
          toStatus: 'rejected',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.reason ?? 'team_match_application_rejected',
        },
      });
      return { ...application, status: 'rejected' as const };
    });

    // 알림: 신청팀 owner/manager에게 거절 안내 (fire-and-forget)
    this.emitNotificationToTeamManagers(
      [application.applicantTeamId],
      'team_match_application_rejected',
      application.teamMatchId,
      `"${application.teamMatch.title}" 팀매치 신청이 거절됐어요.`,
    );

    return {
      applicationId: updated.id,
      teamMatchId: updated.teamMatchId,
      applicantTeamId: updated.applicantTeamId,
      status: updated.status,
    };
  }

  private emitNotificationToTeamManagers(
    teamIds: Array<string | null | undefined>,
    type: NotificationEventType,
    targetId: string | null,
    body?: string,
  ) {
    const uniqueTeamIds = [...new Set(teamIds.filter((teamId): teamId is string => Boolean(teamId)))];
    if (uniqueTeamIds.length === 0) return;

    this.notifications.emitToManyDeferred(
      async () =>
        [
          ...new Set(
            (
              await this.prisma.v1TeamMembership.findMany({
                where: { teamId: { in: uniqueTeamIds }, status: 'active', role: { in: ['owner', 'manager'] } },
                select: { userId: true },
              })
            ).map((membership) => membership.userId),
          ),
        ],
      type,
      targetId,
      body,
    );
  }

  private emitTeamMatchNotificationToApplicantManagers(
    teamMatchId: string,
    type: NotificationEventType,
    body?: string,
  ) {
    this.notifications.emitToManyDeferred(
      async () =>
        [
          ...new Set(
            (
              await this.prisma.v1TeamMatchApplication.findMany({
                where: {
                  teamMatchId,
                  status: { in: ['requested', 'approved', 'expired'] },
                },
                select: {
                  applicantTeam: {
                    select: {
                      memberships: {
                        where: { status: 'active', role: { in: ['owner', 'manager'] } },
                        select: { userId: true },
                      },
                    },
                  },
                },
              })
            ).flatMap((application) => application.applicantTeam.memberships.map((membership) => membership.userId)),
          ),
        ],
      type,
      teamMatchId,
      body,
    );
  }

  private teamMatchInclude(user: V1AuthUser | null) {
    return {
      sport: { select: { id: true, name: true } },
      minSportLevel: { select: { id: true, code: true, name: true, sortOrder: true, sportId: true } },
      maxSportLevel: { select: { id: true, code: true, name: true, sortOrder: true, sportId: true } },
      region: { select: { id: true, name: true } },
      hostTeam: {
        select: {
          id: true,
          name: true,
          ownerUserId: true,
          status: true,
          profile: { select: { logoUrl: true } },
          trustScore: { select: { trustState: true } },
          memberships: user
            ? { where: { userId: user.id, status: 'active' }, select: { id: true, userId: true, role: true, status: true } }
            : false,
        },
      },
      approvedApplicantTeam: {
        select: {
          id: true,
          name: true,
          // 후기 자격은 "참가팀의 active 멤버"다(reviews.service.ts resolveReviewerTeams) —
          // 역할을 안 가린다. hostTeam 과 똑같이 현재 유저의 멤버십만 실어서, 화면이 그
          // 자격을 서버와 같은 기준으로 판정할 수 있게 한다.
          memberships: user
            ? { where: { userId: user.id, status: 'active' }, select: { userId: true, role: true, status: true } }
            : false,
        },
      },
      applications: {
        where: user ? { OR: [{ status: 'approved' }, { appliedByUserId: user.id }] } : { status: 'approved' },
        include: { applicantTeam: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      // Task 17: the result-entry/approval screens need the underlying Game id
      // to call `/api/v1/games/:gameId/result-revisions*` — detail() is the
      // only route the v1 web client already fetches for a team match, so we
      // surface the 1:1 Game relation here instead of adding a new endpoint.
      game: { select: { id: true } },
      // 리그전 표시(2026-08-18). 이 관계가 없으면 응답에 리그 소속이 실리지 않아
      // 화면에서 "이 경기가 리그전인지" 알 방법이 아예 없다 -- 배지의 유일한 근거다.
      // 확장 단계라 league(신규)만 읽는다. 구 series 관계는 롤링 배포 창을 위해
      // 스키마에 남아 있지만 새 코드는 읽지 않는다.
      league: { select: { id: true, title: true } },
    } satisfies Prisma.V1TeamMatchInclude;
  }

  private toListItem(teamMatch: TeamMatchWithRelations, user: V1AuthUser | null) {
    return {
      teamMatchId: teamMatch.id,
      title: teamMatch.title,
      descriptionPreview: teamMatch.description ? teamMatch.description.slice(0, 120) : null,
      imageUrl: teamMatch.imageUrl,
      sport: { sportId: teamMatch.sport.id, name: teamMatch.sport.name },
      region: { regionId: teamMatch.region.id, name: teamMatch.region.name },
      place: { name: teamMatch.placeName, addressText: teamMatch.placeAddress },
      startsAt: teamMatch.startAt,
      deadlineAt: teamMatch.deadlineAt,
      status: this.getApiStatus(teamMatch),
      displayState: this.getDisplayState(teamMatch),
      hostTeam: {
        teamId: teamMatch.hostTeam.id,
        name: teamMatch.hostTeam.name,
        logoUrl: teamMatch.hostTeam.profile?.logoUrl ?? null,
        trustState: teamMatch.hostTeam.trustScore?.trustState ?? 'none',
      },
      costNote: teamMatch.costNote,
      league: teamMatch.league ? { leagueId: teamMatch.league.id, title: teamMatch.league.title } : null,
      levelLabel: formatLevelRange(teamMatch.minSportLevel, teamMatch.maxSportLevel, teamMatch.formatNote),
      minLevel: teamMatch.minSportLevel ? { code: teamMatch.minSportLevel.code, name: teamMatch.minSportLevel.name } : null,
      maxLevel: teamMatch.maxSportLevel ? { code: teamMatch.maxSportLevel.code, name: teamMatch.maxSportLevel.name } : null,
      rulesText: this.formatMatchConditionsRulesText(teamMatch),
      genderRule: teamMatch.genderRule,
      matchFormat: teamMatch.matchFormat,
      matchStyle: teamMatch.matchStyle,
      uniformColor: teamMatch.uniformColor,
      paymentRequired: false,
      viewerState: this.getViewerState(teamMatch, user),
    };
  }

  private async getPublicTeamMatch(
    teamMatchId: string,
    user: V1AuthUser | null,
    options: { includeTrust?: boolean } = {},
  ) {
    const teamMatch = await this.prisma.v1TeamMatch.findFirst({
      where: { id: teamMatchId, deletedAt: null, hostTeam: { status: 'active', deletedAt: null } },
      include: this.teamMatchInclude(user),
    });
    if (!teamMatch) throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team match was not found' });

    // hostTeam 신뢰점수는 detail() 응답에만 노출된다. applicationEligibility()/createApplication()은
    // hostTeam.trustScore를 전혀 참조하지 않으므로 불필요한 live 재계산(추가 쿼리)을 건너뛴다.
    if (options.includeTrust) {
      const trustByHostTeam = await computeRevealedTeamTrustBatch(this.prisma, [teamMatch.hostTeamId]);
      const trust = trustByHostTeam.get(teamMatch.hostTeamId);
      teamMatch.hostTeam.trustScore = trust ? { trustState: trust.trustState } : null;
    } else {
      teamMatch.hostTeam.trustScore = null;
    }

    return teamMatch;
  }

  /**
   * U3: 리그 대진 상세에 이의 제기 자격을 실어 보낸다 -- 화면이 서버 재요청 없이
   * "지금 이의를 제기할 수 있는지"를 바로 판정할 수 있게 한다.
   *
   * 판정(기간 만료·승강 확정)은 `LeagueMatchDisputeService.fileDispute`가 실제로
   * 이의를 거부하는 것과 **같은 순수 함수**(`judgeLeagueDisputeEligibility`)를
   * 그대로 재사용한다 -- 여기서 새로 로직을 만들면 화면이 "제기 가능"이라고
   * 보여주는데 서버는 거부하는(또는 그 반대) 드리프트가 생길 수 있다.
   */
  private async getLeagueDisputeEligibility(
    teamMatch: Pick<TeamMatchWithRelations, 'id' | 'game'> & { league: { id: string; title: string } | null },
  ): Promise<{
    disputeDeadline: string | null;
    disputeBlockedReason: LeagueDisputeBlockedReason;
    openDisputeExists: boolean;
  }> {
    const leagueId = teamMatch.league!.id;
    const [officialRevision, promotionCommitted, openDispute] = await Promise.all([
      teamMatch.game
        ? this.prisma.v1Game.findUnique({
            where: { id: teamMatch.game.id },
            select: { currentOfficialRevision: { select: { officialAt: true } } },
          })
        : Promise.resolve(null),
      // E3: commitPromotions가 만드는 V1LeaguePromotion 행 존재 여부가 승강 확정 판정 근거다
      // (league-series-admin.service.ts, LeagueMatchDisputeService.fileDispute와 동일).
      this.prisma.v1LeaguePromotion.findFirst({ where: { fromLeagueId: leagueId }, select: { id: true } }),
      this.prisma.v1LeagueMatchDispute.findFirst({
        where: { teamMatchId: teamMatch.id, status: 'open' },
        select: { id: true },
      }),
    ]);

    const { disputeDeadline, blockedReason } = judgeLeagueDisputeEligibility({
      officialAt: officialRevision?.currentOfficialRevision?.officialAt ?? null,
      now: new Date(),
      promotionCommitted: promotionCommitted !== null,
    });

    return {
      disputeDeadline: disputeDeadline ? disputeDeadline.toISOString() : null,
      disputeBlockedReason: blockedReason,
      openDisputeExists: openDispute !== null,
    };
  }

  private async getViewer(teamMatch: TeamMatchWithRelations, user: V1AuthUser | null) {
    if (!user) {
      return {
        state: 'guest',
        manageableHostTeam: false,
        manageableOpponentTeam: false,
        participantMember: false,
        eligibleTeams: [],
        manageRoute: null,
      };
    }
    const hostMembership = teamMatch.hostTeam.memberships[0];
    const manageableHostTeam = hostMembership?.role === 'owner' || hostMembership?.role === 'manager';
    // 결과 승인 게이트용 — "상대팀(승인된 신청팀)의 owner/manager 인가".
    // `state === 'approved'` 로는 이 판정을 할 수 없다: 그건 **신청서를 낸 사람 한 명**만
    // 통과하는데, 리그 대진의 신청서는 운영자가 자동 생성하면서 appliedByUserId 가
    // 운영자로 남는다(league-match-admin.service.ts) -- 그래서 리그에서는 상대팀의
    // 누구도 결과를 승인할 수 없었다(alpha 실측: 원정팀 owner 의 state 가 'none').
    // 서버의 실제 권한 판정(games.service.ts resolveActor 의 opponent_result_decide)은
    // 이미 팀 멤버십 기준이므로, 화면도 같은 기준을 쓰게 맞춘다.
    const opponentMembership = teamMatch.approvedApplicantTeam?.memberships?.[0];
    const manageableOpponentTeam =
      opponentMembership?.role === 'owner' || opponentMembership?.role === 'manager';
    // 후기 자격 판정용 — 역할을 가리지 않는 "참가팀 소속" 여부.
    // `state` 는 이 목적에 못 쓴다: 'host_team' 은 host 팀 owner/manager 만, 'approved' 는
    // 신청서를 낸 사람 한 명만 받는다. 그 둘로 화면을 게이팅하면 양 팀 일반 팀원은 물론
    // (매니저가 신청한 경우) 신청팀 owner 까지 후기 진입점을 잃는데, 서버
    // (reviews.service.ts resolveReviewerTeams)는 두 팀의 active 멤버 전원을 허용한다.
    // 상대가 확정되지 않았으면 후기 대상 자체가 없으므로 false 다.
    const participantMember =
      teamMatch.approvedApplicantTeamId !== null &&
      (teamMatch.hostTeam.memberships.length > 0 || (teamMatch.approvedApplicantTeam?.memberships.length ?? 0) > 0);
    const eligibleTeams = await this.getUserManageableTeams(user.id);
    // 상세 응답에도 같은 자격 목록이 실린다 — applicationEligibility 와 **같은 근거**로
    // 판정해야 한다. 한쪽만 원장을 보게 두면 같은 팀이 두 응답에서 다른 자격으로 내려가고,
    // 그 갈림이 다시 "누를 수 있는데 반드시 실패하는 버튼"이 된다.
    const ledger = await readTeamMatchApplicationLedger(this.prisma, teamMatch.id);
    return {
      state: this.getViewerState(teamMatch, user),
      manageableHostTeam,
      manageableOpponentTeam,
      participantMember,
      eligibleTeams: eligibleTeams.map((team) => {
        const { reasonCode } = judgeApplicationAttempt(teamMatch, ledger, user.id, team.id, team.sportId);
        return { teamId: team.id, name: team.name, role: team.memberships[0]?.role ?? 'member', eligible: reasonCode === 'OK', reasonCode };
      }),
      manageRoute: manageableHostTeam ? `/team-matches/${teamMatch.id}/manage` : null,
    };
  }

  private getViewerState(teamMatch: TeamMatchWithRelations, user: V1AuthUser | null) {
    if (!user) return 'none';
    if (
      teamMatch.hostTeam.memberships.some(
        (membership) =>
          membership.userId === user.id &&
          (membership.role === 'owner' || membership.role === 'manager'),
      )
    ) {
      return 'host_team';
    }
    const application = teamMatch.applications.find((item) => item.appliedByUserId === user.id);
    if (application?.status === 'approved') return 'approved';
    if (application?.status) return application.status;
    return 'none';
  }

  private async getManageableTeamMatch(user: V1AuthUser, teamMatchId: string) {
    const teamMatch = await this.prisma.v1TeamMatch.findFirst({
      where: { id: teamMatchId, deletedAt: null },
      include: {
        minSportLevel: { select: { code: true } },
        maxSportLevel: { select: { code: true } },
        hostTeam: { select: { sportId: true } },
      },
    });
    if (!teamMatch) throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team match was not found' });
    await this.assertCanManageTeam(user.id, teamMatch.hostTeamId);
    return teamMatch;
  }

  private async getApplicationWithTeamMatch(applicationId: string) {
    const application = await this.prisma.v1TeamMatchApplication.findFirst({
      where: {
        id: applicationId,
        teamMatch: { deletedAt: null },
      },
      include: { teamMatch: true },
    });

    if (!application) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Team match application was not found',
      });
    }

    return application;
  }

  private async getUserManageableTeams(userId: string, teamId?: string) {
    return this.prisma.v1Team.findMany({
      where: {
        status: 'active',
        deletedAt: null,
        ...(teamId ? { id: teamId } : {}),
        memberships: { some: { userId, status: 'active', role: { in: ['owner', 'manager'] } } },
      },
      include: { memberships: { where: { userId, status: 'active' }, select: { role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async assertCanManageTeam(userId: string, teamId: string) {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: { teamId, userId, status: 'active', role: { in: ['owner', 'manager'] }, team: { status: 'active', deletedAt: null } },
      select: { id: true, team: { select: { sportId: true } } },
    });
    if (!membership) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Only team owners or managers can manage team matches' });
    return membership;
  }

  private teamMatchGameContext(
    user: V1AuthUser,
    role: 'team_owner' | 'team_manager',
    durableCommandId: string,
    payloadHash: string,
  ): GameCommandContext {
    return {
      actor: {
        actorType: 'USER',
        actorUserId: user.id,
        role,
      },
      expectedVersion: 0,
      durableCommandId,
      payloadHash,
    };
  }

  private async loadTeamMatchCreationSource(
    tx: Prisma.TransactionClient,
    hostTeamId: string,
    sportId: string,
    actorUserId: string,
  ) {
    const [competitionConfig, hostTeam] = await Promise.all([
      resolveTeamMatchCompetitionConfig(tx, sportId),
      tx.v1Team.findFirst({
        where: { id: hostTeamId, status: 'active', deletedAt: null },
        select: {
          id: true,
          name: true,
          memberships: {
            where: { status: 'active' },
            orderBy: { id: 'asc' },
            select: {
              id: true,
              userId: true,
              role: true,
              user: {
                select: {
                  profile: { select: { nickname: true, displayName: true } },
                },
              },
            },
          },
        },
      }),
    ]);
    if (competitionConfig === null || hostTeam === null) {
      throw new ConflictException({
        code: 'COMPETITION_CONFIG_REQUIRED',
        message: 'Team match creation requires an active competition config preset',
      });
    }
    const actorMembership = hostTeam.memberships.find(
      (membership) => membership.userId === actorUserId,
    );
    if (
      actorMembership === undefined ||
      (actorMembership.role !== 'owner' && actorMembership.role !== 'manager')
    ) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only team owners or managers can create a team match game',
      });
    }
    return {
      hostTeam,
      competitionConfigVersionId: competitionConfig.id,
      actorRole:
        actorMembership.role === 'owner'
          ? ('team_owner' as const)
          : ('team_manager' as const),
    };
  }

  private async resolveTeamGameActorRole(
    tx: Prisma.TransactionClient,
    teamId: string,
    actorUserId: string,
  ): Promise<'team_owner' | 'team_manager'> {
    const membership = await tx.v1TeamMembership.findFirst({
      where: {
        teamId,
        userId: actorUserId,
        status: 'active',
        role: { in: ['owner', 'manager'] },
      },
      select: { role: true },
    });
    if (membership === null) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only team owners or managers can replay a team match command',
      });
    }
    return membership.role === 'owner' ? 'team_owner' : 'team_manager';
  }

  private teamMatchGameSourceInput(
    teamMatchId: string,
    source: Awaited<ReturnType<TeamMatchesService['loadTeamMatchCreationSource']>>,
  ): GameSourceCreationInput {
    return {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: teamMatchId,
      competitionConfigVersionId: source.competitionConfigVersionId,
      sides: [
        {
          sideKey: V1GameSideKey.HOME,
          teamId: source.hostTeam.id,
          displayNameSnapshot: source.hostTeam.name,
        },
        {
          sideKey: V1GameSideKey.AWAY,
          teamId: null,
          displayNameSnapshot: '상대 팀 미정',
        },
      ],
      participants: source.hostTeam.memberships.map((membership) => ({
        sourceParticipantId: membership.id,
        sideKey: V1GameSideKey.HOME,
        displayNameSnapshot:
          membership.user.profile?.nickname ??
          membership.user.profile?.displayName ??
          '팀원',
      })),
    };
  }

  private async loadPersistedGameSourceInput(
    tx: Prisma.TransactionClient,
    teamMatchId: string,
  ): Promise<GameSourceCreationInput> {
    const game = await tx.v1Game.findUnique({
      where: { teamMatchId },
      include: {
        sides: { orderBy: { sideKey: 'asc' } },
        participants: true,
      },
    });
    if (game === null) {
      throw new ConflictException({
        code: 'TEAM_MATCH_GAME_REQUIRED',
        message: 'The durable TeamMatch command has no committed Game',
      });
    }
    const sideKeyById = new Map(game.sides.map((side) => [side.id, side.sideKey]));
    const participants = game.participants.map((participant) => {
      const sideKey = sideKeyById.get(participant.sideId);
      if (sideKey === undefined) {
        throw new ConflictException({
          code: 'TEAM_MATCH_GAME_REQUIRED',
          message: 'A persisted Game participant has no source side',
        });
      }
      return {
        sourceParticipantId: participant.id,
        sideKey,
        displayNameSnapshot: participant.displayNameSnapshot,
        ...(participant.jerseyNumber === null
          ? {}
          : { jerseyNumber: participant.jerseyNumber }),
        ...(participant.position === null ? {} : { position: participant.position }),
      };
    });
    return {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: teamMatchId,
      competitionConfigVersionId: game.competitionConfigVersionId,
      sides: game.sides.map((side) => ({
        sideKey: side.sideKey,
        teamId: side.teamId,
        displayNameSnapshot: side.displayNameSnapshot,
      })),
      participants,
    };
  }

  private async hydrateApprovedAwaySnapshot(
    tx: Prisma.TransactionClient,
    teamMatchId: string,
    awayTeamId: string,
  ) {
    const [game, awayTeam] = await Promise.all([
      tx.v1Game.findUnique({
        where: { teamMatchId },
        include: {
          sides: true,
          lineups: { where: { revision: 1 } },
        },
      }),
      tx.v1Team.findFirst({
        where: { id: awayTeamId, status: 'active', deletedAt: null },
        select: {
          id: true,
          name: true,
          memberships: {
            where: { status: 'active' },
            orderBy: { id: 'asc' },
            select: {
              user: {
                select: {
                  profile: { select: { nickname: true, displayName: true } },
                },
              },
            },
          },
        },
      }),
    ]);
    if (game === null || awayTeam === null) {
      throw new ConflictException({
        code: 'TEAM_MATCH_GAME_REQUIRED',
        message: 'Approved TeamMatch requires its atomically created Game',
      });
    }
    const awaySide = game.sides.find((side) => side.sideKey === V1GameSideKey.AWAY);
    const awayLineup = game.lineups.find((lineup) => lineup.sideId === awaySide?.id);
    if (awaySide === undefined || awayLineup === undefined) {
      throw new ConflictException({
        code: 'TEAM_MATCH_GAME_REQUIRED',
        message: 'Approved TeamMatch requires an AWAY side and lineup',
      });
    }
    if (awaySide.teamId !== null && awaySide.teamId !== awayTeam.id) {
      throw new ConflictException({
        code: 'TEAM_MATCH_GAME_REQUIRED',
        message: 'The AWAY side is already pinned to another team',
      });
    }
    await tx.v1GameSide.update({
      where: { id: awaySide.id },
      data: { teamId: awayTeam.id, displayNameSnapshot: awayTeam.name },
    });
    await tx.v1GameParticipant.createMany({
      data: awayTeam.memberships.map((membership) => ({
        gameId: game.id,
        sideId: awaySide.id,
        lineupId: awayLineup.id,
        displayNameSnapshot:
          membership.user.profile?.nickname ??
          membership.user.profile?.displayName ??
          '팀원',
      })),
    });
  }

  private assertActiveAccount(user: V1AuthUser) {
    if (user.accountStatus !== 'active') throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Account cannot mutate team matches' });
  }

  private validateDates(dto: Pick<MutateTeamMatchDto, 'startsAt' | 'endsAt' | 'deadlineAt'>) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    const deadlineAt = dto.deadlineAt ? new Date(dto.deadlineAt) : null;
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) throw validationError('startsAt must be a future datetime', 'startsAt');
    if (endsAt && endsAt <= startsAt) throw validationError('endsAt must be after startsAt', 'endsAt');
    if (deadlineAt && deadlineAt >= startsAt) throw validationError('deadlineAt must be before startsAt', 'deadlineAt');
    return { startsAt, endsAt, deadlineAt };
  }

  private async validateMasterRefs(sportId: string, regionId: string) {
    const sport = await this.prisma.v1Sport.findFirst({ where: { id: sportId, isActive: true }, select: { id: true } });
    if (!sport) throw validationError('sportId is invalid or inactive', 'sportId');
    const region = await this.prisma.v1Region.findFirst({ where: { id: regionId, isActive: true, level: 2 }, select: { id: true } });
    if (!region) throw validationError('regionId must be an active district region', 'regionId');
  }

  /**
   * 표시용 rulesText 파생값. 구조화 필드(matchFormat/matchStyle/uniformColor)가 진실이고
   * rulesText는 그 값들을 이어붙인 표시 전용 문자열일 뿐, 다시 파싱되지 않는다.
   * formatNote로의 폴백은 구조화 컬럼 3종이 전부 비어 있는 미백필 row(백필 CLI 실행 전
   * 레거시 데이터)만을 위한 것 — 백필 완료 후에는 이 분기를 타지 않는다.
   */
  private formatMatchConditionsRulesText(teamMatch: {
    formatNote: string | null;
    matchFormat: string | null;
    matchStyle: string[];
    uniformColor: string | null;
    genderRule: string | null;
    minSportLevel: { name: string } | null;
    maxSportLevel: { name: string } | null;
  }) {
    const levelLabel = formatLevelRange(teamMatch.minSportLevel, teamMatch.maxSportLevel, null);
    const hasStructuredConditions =
      Boolean(teamMatch.matchFormat) || teamMatch.matchStyle.length > 0 || Boolean(teamMatch.uniformColor);
    const conditionText = hasStructuredConditions
      ? [teamMatch.matchFormat, teamMatch.matchStyle.join(' · ') || null, teamMatch.uniformColor].filter(Boolean).join(' · ') || null
      : teamMatch.formatNote;
    return [levelLabel, conditionText, teamMatch.genderRule].filter(Boolean).join(' · ') || null;
  }

  private getApiStatus(teamMatch: V1TeamMatch) {
    if (teamMatch.status === 'recruiting' && teamMatch.startAt < new Date()) return 'expired';
    return teamMatch.status;
  }

  private getDisplayState(teamMatch: V1TeamMatch) {
    return this.getApiStatus(teamMatch);
  }
}

// 리그 일괄 생성 행은 startAt·createdAt이 전부 동일할 수 있어, 유일 tie-breaker(id)가
// 없으면 cursor 페이지네이션 경계에서 행이 누락/중복된다.
function getOrderBy(sort: TeamMatchesQueryDto['sort']): Prisma.V1TeamMatchOrderByWithRelationInput[] {
  if (sort === 'latest') return [{ createdAt: 'desc' }, { id: 'desc' }];
  return [{ startAt: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }];
}

function getGenderRuleWhere(genderRule: NonNullable<TeamMatchesQueryDto['genderRule']>) {
  return genderRule === '무관' || genderRule === '성별 무관'
    ? { in: ['성별 무관', '무관'] }
    : genderRule;
}

type TeamMatchApplicationLedgerRow = Pick<
  V1TeamMatchApplication,
  'id' | 'teamMatchId' | 'applicantTeamId' | 'appliedByUserId' | 'status'
>;

/** 이 팀매치의 신청서를 사용자 필터 없이 전부 읽는다 — 중복 판정의 유일한 근거다. */
function readTeamMatchApplicationLedger(
  client: PrismaService | Prisma.TransactionClient,
  teamMatchId: string,
): Promise<TeamMatchApplicationLedgerRow[]> {
  return client.v1TeamMatchApplication.findMany({
    where: { teamMatchId },
    select: { id: true, teamMatchId: true, applicantTeamId: true, appliedByUserId: true, status: true },
  });
}

/** "살아 있는" 신청서 — 철회·거절·만료는 아무 자리도 차지하지 않으므로 재신청을 막지 않는다. */
function isLiveApplication(status: V1TeamMatchApplication['status']) {
  return status === 'requested' || status === 'approved';
}

/**
 * 팀매치 신청 중복 판정.
 *
 * **신청 주체는 팀이다.** DB 제약(@@unique([teamMatchId, applicantTeamId]))도, 신청·철회
 * 권한(assertCanManageTeam)도 팀 단위이고, 승인은 나머지 requested 를 전부 자동 거절해
 * 상대팀을 정확히 하나로 만든다. 그래서 판정도 두 층이다:
 *
 *  ① **같은 팀**에 살아 있는 신청서가 있으면 그건 새 신청이 아니라 "그 팀의 신청서"다.
 *     같은 팀의 다른 매니저가 눌렀어도 마찬가지다 — 그 매니저는 이미 같은 신청서를 철회할
 *     수 있다(withdrawApplication 도 applicantTeamId 로 권한을 본다). 그래서 기존 어휘인
 *     ALREADY_REQUESTED / ALREADY_APPROVED 로 수렴시킨다(화면이 이미 처리하는 코드다).
 *     종전엔 이 조합이 사용자 필터 때문에 안 보여 create() 가 unique 제약에 걸렸다.
 *  ② **같은 사용자**가 다른 팀으로 살아 있는 신청서를 갖고 있으면 새 신청을 막는다. unique
 *     가 팀 단위라 DB 로는 못 막는 조합이고, C2 결함이 만들던 유령 신청서(한 사람이 한
 *     팀매치에 2건)가 정확히 이 모양이다 — 호스트가 유령 쪽을 승인하면 approveApplication
 *     이 나머지 requested 를 자동 거절해 **신청한 적 없는 팀이 상대팀으로 확정**된다.
 *     다른 사람이 자기 팀으로 내는 신청은 정상 경쟁이므로 막지 않는다.
 */
function judgeApplicationAttempt(
  teamMatch: Pick<V1TeamMatch, 'hostTeamId' | 'status' | 'startAt' | 'deadlineAt' | 'sportId'>,
  ledger: TeamMatchApplicationLedgerRow[],
  userId: string,
  applicantTeamId: string,
  applicantTeamSportId: string,
): { reasonCode: string; teamApplication?: TeamMatchApplicationLedgerRow } {
  const teamApplication = ledger.find((row) => row.applicantTeamId === applicantTeamId);
  const reasonCode = getEligibilityReason(teamMatch, applicantTeamId, applicantTeamSportId, teamApplication);
  if (reasonCode !== 'OK') return { reasonCode, teamApplication };
  const liveOnAnotherTeam = ledger.some(
    (row) =>
      row.appliedByUserId === userId &&
      row.applicantTeamId !== applicantTeamId &&
      isLiveApplication(row.status),
  );
  if (liveOnAnotherTeam) return { reasonCode: 'ALREADY_REQUESTED_WITH_ANOTHER_TEAM', teamApplication };
  return { reasonCode: 'OK', teamApplication };
}

function getEligibilityReason(
  teamMatch: Pick<V1TeamMatch, 'hostTeamId' | 'status' | 'startAt' | 'deadlineAt' | 'sportId'>,
  applicantTeamId: string,
  applicantTeamSportId: string,
  application?: Pick<V1TeamMatchApplication, 'status'>,
) {
  if (teamMatch.hostTeamId === applicantTeamId) return 'HOST_TEAM_CANNOT_APPLY';
  // create()/update() 는 호스트 팀의 종목이 팀매치 종목과 같아야 한다는 불변식을 이미
  // 강제한다(this.create:390, this.update:538) — 신청 쪽에도 같은 불변식을 지켜야
  // approveApplication 이 다른 종목 팀을 AWAY 로 확정하는(hydrateApprovedAwaySnapshot)
  // 되돌릴 수 없는 사고를 막는다. 기존 신청 상태보다 먼저 검사해, 종목이 다르면
  // ALREADY_REQUESTED 같은 오해의 소지가 있는 사유로 가려지지 않게 한다.
  if (teamMatch.sportId !== applicantTeamSportId) return 'SPORT_MISMATCH';
  if (application?.status === 'requested') return 'ALREADY_REQUESTED';
  if (application?.status === 'approved') return 'ALREADY_APPROVED';
  if (teamMatch.status === 'matched') return 'MATCHED_ALREADY';
  if (
    teamMatch.status !== 'recruiting' ||
    teamMatch.startAt < new Date() ||
    (teamMatch.deadlineAt && teamMatch.deadlineAt < new Date())
  ) return 'NOT_RECRUITING';
  return 'OK';
}

function getEligibilityReasonMessage(reasonCode: string) {
  const messages: Record<string, string> = {
    OK: '신청할 수 있어요.',
    HOST_TEAM_CANNOT_APPLY: '호스트 팀은 자기 팀매치에 신청할 수 없어요.',
    SPORT_MISMATCH: '팀매치 종목과 같은 종목의 팀만 신청할 수 있어요.',
    ALREADY_REQUESTED: '이미 신청해서 승인을 기다리고 있어요.',
    ALREADY_REQUESTED_WITH_ANOTHER_TEAM: '이미 다른 팀으로 신청 중이에요. 그 신청을 먼저 취소해주세요.',
    ALREADY_APPROVED: '이미 승인된 신청이에요.',
    MATCHED_ALREADY: '이미 매칭이 완료됐어요.',
    NOT_RECRUITING: '지금은 모집 중인 팀매치가 아니에요.',
  };

  return messages[reasonCode] ?? '신청할 수 없어요.';
}

function validationError(message: string, field: string) {
  return new BadRequestException({ code: 'VALIDATION_FAILED', message, details: { field } });
}

function stateConflict(message: string, code = 'STATE_CONFLICT') {
  return new ConflictException({ code, message });
}
