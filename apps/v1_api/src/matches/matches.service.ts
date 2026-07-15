import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, V1Match, V1MatchApplication, V1MatchParticipant } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { formatLevelRange, levelCodeWhere, parseLevelCodes, resolveSportLevelRange } from '../sports/level-range';
import {
  ApproveMatchApplicationDto,
  CreateMatchApplicationDto,
  ListMatchApplicationsQueryDto,
  RejectMatchApplicationDto,
  WithdrawMatchApplicationDto,
} from './dto/match-application.dto';
import { MatchesQueryDto, MyMatchesQueryDto } from './dto/matches-query.dto';
import { CancelMatchDto, MutateMatchDto, UpdateMatchDto } from './dto/mutate-match.dto';

type MatchWithRelations = V1Match & {
  sport: { id: string; name: string };
  minSportLevel: { id: string; code: string; name: string; sortOrder: number; sportId: string } | null;
  maxSportLevel: { id: string; code: string; name: string; sortOrder: number; sportId: string } | null;
  region: { id: string; name: string } | null;
  participants: Array<
    V1MatchParticipant & {
      user: { profile: { nickname: string; displayName: string | null; profileImageUrl: string | null } | null };
    }
  >;
  applications: V1MatchApplication[];
  hostUser: {
    id: string;
    profile: { nickname: string; displayName: string | null; profileImageUrl: string | null } | null;
    reputationSummary: { trustState: 'verified' | 'estimated' | 'sample' | 'none' } | null;
  };
};

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: V1AuthUser | null, query: MatchesQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const status = query.status ?? 'recruiting';
    const where: Prisma.V1MatchWhereInput = {
      deletedAt: null,
      ...(status === 'expired' ? { startAt: { lt: new Date() } } : { status }),
      ...(query.sportId ? { sportId: query.sportId } : {}),
      ...(query.regionId ? { regionId: query.regionId } : {}),
      ...(query.genderRule ? { genderRule: getGenderRuleWhere(query.genderRule) } : {}),
      ...levelCodeWhere(parseLevelCodes(query.levelCodes)),
      ...(query.query
        ? {
            OR: [
              { title: { contains: query.query, mode: 'insensitive' } },
              { description: { contains: query.query, mode: 'insensitive' } },
              { placeName: { contains: query.query, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const matches = await this.prisma.v1Match.findMany({
      where,
      orderBy: getOrderBy(query.sort),
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.matchInclude(user),
    });

    const pageItems = matches.slice(0, limit);
    const hasNext = matches.length > limit;

    return {
      items: pageItems.map((match) => this.toListItem(match, user)),
      pageInfo: {
        nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null,
        hasNext,
      },
    };
  }

  async myMatches(user: V1AuthUser, query: MyMatchesQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const relationWhere: Prisma.V1MatchWhereInput =
      query.mode === 'created'
        ? { hostUserId: user.id }
        : {
            OR: [
              {
                participants: {
                  some: {
                    userId: user.id,
                    role: 'participant',
                    status: { in: ['active', 'completed'] },
                  },
                },
              },
              {
                applications: {
                  some: {
                    applicantUserId: user.id,
                    status: { in: ['requested', 'approved'] },
                  },
                },
              },
            ],
          };
    const matches = await this.prisma.v1Match.findMany({
      where: {
        deletedAt: null,
        ...relationWhere,
      },
      orderBy: [{ startAt: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.matchInclude(user),
    });
    const pageItems = matches.slice(0, limit);
    const hasNext = matches.length > limit;

    return {
      items: pageItems.map((match) => this.toListItem(match, user)),
      pageInfo: {
        nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null,
        hasNext,
      },
    };
  }

  async detail(user: V1AuthUser | null, matchId: string) {
    const match = await this.prisma.v1Match.findFirst({
      where: {
        id: matchId,
        deletedAt: null,
      },
      include: this.matchInclude(user),
    });

    if (!match) {
      throw new NotFoundException({
        code: 'NOT_FOUND_OR_ARCHIVED',
        message: 'Match was not found',
      });
    }

    const viewer = this.getViewer(match, user);
    const participantsPreview = match.participants.filter((participant) => participant.role === 'host').slice(0, 1).map((participant) => ({
      participantId: participant.id,
      userId: participant.userId,
      displayName:
        participant.user.profile?.displayName ?? participant.user.profile?.nickname ?? '참가자',
      role: participant.role,
      status: participant.status === 'active' ? 'confirmed' : participant.status,
    }));

    return {
      matchId: match.id,
      title: match.title,
      description: match.description,
      imageUrl: match.imageUrl,
      sport: { sportId: match.sport.id, name: match.sport.name },
      region: match.region ? { regionId: match.region.id, name: match.region.name } : null,
      place: { name: match.placeName, addressText: match.placeAddress },
      startsAt: match.startAt,
      endsAt: match.endAt,
      deadlineAt: match.deadlineAt,
      capacity: match.maxParticipants,
      participantCount: this.getParticipantCount(match),
      status: this.getApiStatus(match),
      displayState: this.getDisplayState(match),
      levelLabel: formatLevelRange(match.minSportLevel, match.maxSportLevel, match.levelNote),
      minLevel: match.minSportLevel ? { code: match.minSportLevel.code, name: match.minSportLevel.name } : null,
      maxLevel: match.maxSportLevel ? { code: match.maxSportLevel.code, name: match.maxSportLevel.name } : null,
      rulesText: [match.levelNote, match.genderRule, match.costNote].filter(Boolean).join(' · ') || null,
      genderRule: match.genderRule,
      approvalRequired: true,
      paymentRequired: false,
      host: {
        userId: match.hostUser.id,
        displayName:
          match.hostUser.profile?.displayName ?? match.hostUser.profile?.nickname ?? '호스트',
        profileImageUrl: match.hostUser.profile?.profileImageUrl ?? null,
        trustState: match.hostUser.reputationSummary?.trustState ?? 'none',
      },
      participantsPreview,
      viewer,
    };
  }

  async applicationEligibility(user: V1AuthUser, matchId: string) {
    const match = await this.prisma.v1Match.findFirst({
      where: { id: matchId, deletedAt: null },
      include: this.matchInclude(user),
    });

    if (!match) {
      throw new NotFoundException({
        code: 'NOT_FOUND_OR_ARCHIVED',
        message: 'Match was not found',
      });
    }

    const viewer = this.getViewer(match, user);
    const reasonCode = this.getEligibilityReason(match, viewer.state);

    return {
      matchId: match.id,
      eligible: reasonCode === 'OK',
      reasonCode,
      message: getReasonMessage(reasonCode),
      viewerState: viewer.state === 'guest' ? 'none' : viewer.state,
      applicationId: viewer.applicationId,
      participantId: viewer.participantId,
      requiresApproval: true,
      requiresPayment: false,
    };
  }

  async create(user: V1AuthUser, dto: MutateMatchDto) {
    this.assertActiveAccount(user);
    const dates = this.validateMatchDates(dto);
    await this.validateMasterRefs(dto.sportId, dto.regionId);

    const result = await this.prisma.$transaction(async (tx) => {
      const levelRange = await resolveSportLevelRange(tx, dto.sportId, dto.minLevelCode, dto.maxLevelCode);
      const match = await tx.v1Match.create({
        data: {
          hostUserId: user.id,
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
          maxParticipants: dto.capacity,
          levelNote: dto.rulesText ?? null,
          minSportLevelId: levelRange.minSportLevelId,
          maxSportLevelId: levelRange.maxSportLevelId,
          genderRule: dto.genderRule ?? null,
          status: 'recruiting',
        },
      });

      const participant = await tx.v1MatchParticipant.create({
        data: {
          matchId: match.id,
          userId: user.id,
          role: 'host',
          status: 'active',
          approvedAt: new Date(),
        },
      });

      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'match',
          targetId: match.id,
          fromStatus: null,
          toStatus: 'recruiting',
          actorType: 'user',
          actorUserId: user.id,
          reason: 'match_created',
        },
      });

      return { match, participant };
    });

    return {
      matchId: result.match.id,
      status: result.match.status,
      hostParticipantId: result.participant.id,
      detailRoute: `/matches/${result.match.id}`,
      manageRoute: `/matches/${result.match.id}/manage`,
    };
  }

  async edit(user: V1AuthUser, matchId: string) {
    const match = await this.getHostMatch(user, matchId);
    const participantCount = await this.getActiveParticipantCount(match.id);
    const editable = match.status === 'recruiting' || match.status === 'closed';

    return {
      matchId: match.id,
      editable,
      lockedReason: editable ? null : 'terminal_status',
      form: {
        sportId: match.sportId,
        regionId: match.regionId,
        title: match.title,
        description: match.description,
        imageUrl: match.imageUrl,
        startsAt: match.startAt,
        endsAt: match.endAt,
        deadlineAt: match.deadlineAt,
        capacity: match.maxParticipants,
        manualPlaceName: match.placeName,
        addressText: match.placeAddress,
        rulesText: match.levelNote,
        minLevelCode: match.minSportLevel?.code ?? null,
        maxLevelCode: match.maxSportLevel?.code ?? null,
        genderRule: match.genderRule,
      },
      status: this.getApiStatus(match),
      participantCount,
      version: match.updatedAt.toISOString(),
    };
  }

  async update(user: V1AuthUser, matchId: string, dto: UpdateMatchDto) {
    this.assertActiveAccount(user);
    const match = await this.getHostMatch(user, matchId);

    if (match.status === 'cancelled' || match.status === 'completed' || this.getApiStatus(match) === 'expired') {
      throw stateConflict('Terminal match cannot be updated');
    }
    if (match.updatedAt.toISOString() !== dto.version) {
      throw stateConflict('Match version is stale', 'VERSION_CONFLICT');
    }

    const dates = this.validateMatchDates(dto);
    await this.validateMasterRefs(dto.sportId, dto.regionId);
    const levelRange = await resolveSportLevelRange(this.prisma, dto.sportId, dto.minLevelCode, dto.maxLevelCode);
    const participantCount = await this.getActiveParticipantCount(match.id);

    if (dto.capacity < participantCount) {
      throw stateConflict('Capacity cannot be lower than active participants');
    }

    const updated = await this.prisma.v1Match.update({
      where: { id: match.id },
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
        maxParticipants: dto.capacity,
        levelNote: dto.rulesText ?? null,
        minSportLevelId: levelRange.minSportLevelId,
        maxSportLevelId: levelRange.maxSportLevelId,
        genderRule: dto.genderRule ?? null,
      },
    });

    return {
      matchId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt,
      detailRoute: `/matches/${updated.id}`,
      version: updated.updatedAt.toISOString(),
    };
  }

  async cancel(user: V1AuthUser, matchId: string, dto: CancelMatchDto) {
    this.assertActiveAccount(user);
    const match = await this.getHostMatch(user, matchId);

    if (match.status === 'cancelled') {
      throw new ConflictException({
        code: 'ALREADY_PROCESSED',
        message: 'Match is already cancelled',
      });
    }
    if (match.status === 'completed' || this.getApiStatus(match) === 'expired') {
      throw stateConflict('Match cannot be cancelled in current status');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.v1Match.update({
        where: { id: match.id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      });

      const applications = await tx.v1MatchApplication.updateMany({
        where: { matchId: match.id, status: 'requested' },
        data: {
          status: 'cancelled_by_host',
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
        },
      });

      // Capture active participants BEFORE the update so we notify exactly those
      // cancelled by this host-cancel (not participants already cancelled earlier).
      const activeParticipants = await tx.v1MatchParticipant.findMany({
        where: { matchId: match.id, status: 'active', role: 'participant' },
        select: { userId: true },
      });
      const participants = await tx.v1MatchParticipant.updateMany({
        where: { matchId: match.id, status: 'active', role: 'participant' },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      });

      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'match',
          targetId: match.id,
          fromStatus: match.status,
          toStatus: 'cancelled',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.reason ?? 'host_cancelled',
        },
      });

      return { applications, participants, notifyUserIds: activeParticipants.map((p) => p.userId) };
    });

    // 알림: 취소 시점에 active였던 참가자 전원에게 안내 (호스트 제외, fire-and-forget)
    void this.notifications.emitNotificationToMany(
      result.notifyUserIds,
      'match_cancelled',
      match.id,
    );

    return {
      matchId: match.id,
      status: 'cancelled',
      cancelledApplications: result.applications.count,
      cancelledParticipants: result.participants.count,
      detailRoute: `/matches/${match.id}`,
    };
  }

  async createApplication(user: V1AuthUser, matchId: string, dto: CreateMatchApplicationDto) {
    this.assertActiveAccount(user);
    const match = await this.prisma.v1Match.findFirst({
      where: { id: matchId, deletedAt: null },
      include: this.matchInclude(user),
    });

    if (!match) {
      throw new NotFoundException({
        code: 'NOT_FOUND_OR_ARCHIVED',
        message: 'Match was not found',
      });
    }

    const viewer = this.getViewer(match, user);
    const reasonCode = this.getEligibilityReason(match, viewer.state);
    if (reasonCode !== 'OK') {
      throw stateConflict(getReasonMessage(reasonCode), reasonCode);
    }

    const existing = match.applications[0] ?? null;
    const application = await this.prisma.$transaction(async (tx) => {
      const nextApplication = existing
        ? await tx.v1MatchApplication.update({
            where: { id: existing.id },
            data: {
              status: 'requested',
              message: dto.message ?? null,
              reviewedByUserId: null,
              reviewedAt: null,
              withdrawnAt: null,
            },
          })
        : await tx.v1MatchApplication.create({
            data: {
              matchId: match.id,
              applicantUserId: user.id,
              status: 'requested',
              message: dto.message ?? null,
            },
          });

      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'match_application',
          targetId: nextApplication.id,
          fromStatus: existing?.status ?? null,
          toStatus: 'requested',
          actorType: 'user',
          actorUserId: user.id,
          reason: existing ? 'match_application_resubmitted' : 'match_application_created',
        },
      });

      return nextApplication;
    });

    // 알림: 호스트에게 신청 접수 안내 (fire-and-forget)
    void this.notifications.emitNotification(
      match.hostUserId,
      'match_application_received',
      match.id,
    );

    return {
      applicationId: application.id,
      matchId: match.id,
      status: application.status,
      viewerState: 'requested',
      detailRoute: `/matches/${match.id}`,
    };
  }

  async listApplications(user: V1AuthUser, matchId: string, query: ListMatchApplicationsQueryDto) {
    const match = await this.getHostMatch(user, matchId);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const applications = await this.prisma.v1MatchApplication.findMany({
      where: {
        matchId: match.id,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        applicantUser: {
          select: {
            id: true,
            profile: { select: { nickname: true, displayName: true, profileImageUrl: true } },
            reputationSummary: { select: { trustState: true, mannerScore: true, reviewCount: true } },
          },
        },
      },
    });

    const pageItems = applications.slice(0, limit);
    const hasNext = applications.length > limit;

    return {
      matchId: match.id,
      items: pageItems.map((application) => ({
        applicationId: application.id,
        applicantUserId: application.applicantUserId,
        displayName:
          application.applicantUser.profile?.displayName ??
          application.applicantUser.profile?.nickname ??
          '신청자',
        profileImageUrl: application.applicantUser.profile?.profileImageUrl ?? null,
        trustState: application.applicantUser.reputationSummary?.trustState ?? 'none',
        mannerScore: application.applicantUser.reputationSummary?.mannerScore
          ? Number(application.applicantUser.reputationSummary.mannerScore)
          : null,
        reviewCount: application.applicantUser.reputationSummary?.reviewCount ?? 0,
        status: application.status,
        message: application.message,
        createdAt: application.createdAt,
        reviewedAt: application.reviewedAt,
      })),
      pageInfo: {
        nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null,
        hasNext,
      },
    };
  }

  async withdrawApplication(
    user: V1AuthUser,
    applicationId: string,
    dto: WithdrawMatchApplicationDto,
  ) {
    this.assertActiveAccount(user);
    const application = await this.getApplicationWithMatch(applicationId);

    if (application.applicantUserId !== user.id) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only the applicant can withdraw this application',
      });
    }
    if (application.status !== 'requested') {
      throw stateConflict('Only requested applications can be withdrawn');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.v1MatchApplication.updateMany({
        where: { id: application.id, applicantUserId: user.id, status: 'requested' },
        data: {
          status: 'withdrawn',
          withdrawnAt: new Date(),
        },
      });
      if (transition.count !== 1) {
        throw stateConflict('Only requested applications can be withdrawn');
      }

      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'match_application',
          targetId: application.id,
          fromStatus: application.status,
          toStatus: 'withdrawn',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.reason ?? 'applicant_withdrawn',
        },
      });

      return { id: application.id, matchId: application.matchId, status: 'withdrawn' as const };
    });

    return {
      applicationId: updated.id,
      matchId: updated.matchId,
      status: updated.status,
      detailRoute: `/matches/${updated.matchId}`,
    };
  }

  async approveApplication(
    user: V1AuthUser,
    applicationId: string,
    dto: ApproveMatchApplicationDto,
  ) {
    this.assertActiveAccount(user);
    const application = await this.getApplicationWithMatch(applicationId);
    this.assertApplicationHost(user, application);

    if (application.status !== 'requested') {
      throw stateConflict('Only requested applications can be approved');
    }
    if (
      application.match.status !== 'recruiting' ||
      application.match.startAt < new Date() ||
      (application.match.deadlineAt && application.match.deadlineAt < new Date())
    ) {
      throw stateConflict('Match is not recruiting');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 동시 승인 레이스 방지: match 행을 잠가 정원 체크~참가자 upsert 를 직렬화한다.
      await tx.$queryRaw`SELECT id FROM "v1_matches" WHERE id = ${application.matchId} FOR UPDATE`;

      const currentMatch = await tx.v1Match.findFirst({
        where: { id: application.matchId, deletedAt: null },
        select: { status: true, startAt: true, deadlineAt: true, maxParticipants: true },
      });
      const now = new Date();
      if (
        !currentMatch ||
        currentMatch.status !== 'recruiting' ||
        currentMatch.startAt < now ||
        (currentMatch.deadlineAt && currentMatch.deadlineAt < now)
      ) {
        throw stateConflict('Match is not recruiting');
      }

      const activeParticipantCount = await this.getActiveParticipantCount(application.matchId, tx);
      if (activeParticipantCount >= currentMatch.maxParticipants) {
        throw stateConflict('Match is full', 'FULL');
      }

      const transition = await tx.v1MatchApplication.updateMany({
        where: { id: application.id, status: 'requested' },
        data: {
          status: 'approved',
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
        },
      });
      if (transition.count !== 1) {
        throw stateConflict('Only requested applications can be approved');
      }

      const participant = await tx.v1MatchParticipant.upsert({
        where: {
          matchId_userId: {
            matchId: application.matchId,
            userId: application.applicantUserId,
          },
        },
        update: {
          applicationId: application.id,
          role: 'participant',
          status: 'active',
          approvedAt: new Date(),
          cancelledAt: null,
        },
        create: {
          matchId: application.matchId,
          userId: application.applicantUserId,
          applicationId: application.id,
          role: 'participant',
          status: 'active',
          approvedAt: new Date(),
        },
      });

      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'match_application',
          targetId: application.id,
          fromStatus: application.status,
          toStatus: 'approved',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.note ?? 'host_approved',
        },
      });

      return {
        updated: { id: application.id, matchId: application.matchId, status: 'approved' as const },
        participant,
      };
    });

    // 알림: 신청자에게 승인 안내 (fire-and-forget)
    void this.notifications.emitNotification(
      application.applicantUserId,
      'match_application_approved',
      application.matchId,
    );

    return {
      applicationId: result.updated.id,
      matchId: result.updated.matchId,
      status: result.updated.status,
      participantId: result.participant.id,
      detailRoute: `/matches/${result.updated.matchId}`,
    };
  }

  async rejectApplication(user: V1AuthUser, applicationId: string, dto: RejectMatchApplicationDto) {
    this.assertActiveAccount(user);
    const application = await this.getApplicationWithMatch(applicationId);
    this.assertApplicationHost(user, application);

    if (application.status !== 'requested') {
      throw stateConflict('Only requested applications can be rejected');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextApplication = await tx.v1MatchApplication.update({
        where: { id: application.id },
        data: {
          status: 'rejected',
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
        },
      });

      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'match_application',
          targetId: application.id,
          fromStatus: application.status,
          toStatus: 'rejected',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.reason ?? 'host_rejected',
        },
      });

      return nextApplication;
    });

    // 알림: 신청자에게 거절 안내 (fire-and-forget)
    void this.notifications.emitNotification(
      application.applicantUserId,
      'match_application_rejected',
      application.matchId,
    );

    return {
      applicationId: updated.id,
      matchId: updated.matchId,
      status: updated.status,
      detailRoute: `/matches/${updated.matchId}`,
    };
  }

  private matchInclude(user: V1AuthUser | null) {
    return {
      sport: { select: { id: true, name: true } },
      minSportLevel: { select: { id: true, code: true, name: true, sortOrder: true, sportId: true } },
      maxSportLevel: { select: { id: true, code: true, name: true, sortOrder: true, sportId: true } },
      region: { select: { id: true, name: true } },
      participants: {
        where: { status: { in: ['active', 'completed'] } },
        include: {
          user: {
            select: {
              profile: { select: { nickname: true, displayName: true, profileImageUrl: true } },
            },
          },
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      },
      applications: user
        ? {
            where: { applicantUserId: user.id },
            orderBy: { createdAt: 'desc' },
            take: 1,
          }
        : false,
      hostUser: {
        select: {
          id: true,
          profile: { select: { nickname: true, displayName: true, profileImageUrl: true } },
          reputationSummary: { select: { trustState: true } },
        },
      },
    } satisfies Prisma.V1MatchInclude;
  }

  private toListItem(match: MatchWithRelations, user: V1AuthUser | null) {
    return {
      matchId: match.id,
      title: match.title,
      descriptionPreview: match.description ? match.description.slice(0, 120) : null,
      imageUrl: match.imageUrl,
      sport: { sportId: match.sport.id, name: match.sport.name },
      region: match.region ? { regionId: match.region.id, name: match.region.name } : null,
      place: { name: match.placeName, addressText: match.placeAddress },
      startsAt: match.startAt,
      endsAt: match.endAt,
      deadlineAt: match.deadlineAt,
      capacity: match.maxParticipants,
      participantCount: this.getParticipantCount(match),
      status: this.getApiStatus(match),
      displayState: this.getDisplayState(match),
      levelLabel: formatLevelRange(match.minSportLevel, match.maxSportLevel, match.levelNote),
      minLevel: match.minSportLevel ? { code: match.minSportLevel.code, name: match.minSportLevel.name } : null,
      maxLevel: match.maxSportLevel ? { code: match.maxSportLevel.code, name: match.maxSportLevel.name } : null,
      rulesText: [match.levelNote, match.genderRule, match.costNote].filter(Boolean).join(' · ') || null,
      genderRule: match.genderRule,
      approvalRequired: true,
      paymentRequired: false,
      viewerState: this.getViewer(match, user).state === 'guest' ? 'none' : this.getViewer(match, user).state,
    };
  }

  private getViewer(match: MatchWithRelations, user: V1AuthUser | null) {
    if (!user) {
      return {
        state: 'guest',
        applicationId: null,
        participantId: null,
        canApply: false,
        ctaLabel: '로그인 후 신청',
        disabledReason: 'LOGIN_REQUIRED',
        manageRoute: null,
      };
    }

    if (match.hostUserId === user.id) {
      return {
        state: 'host',
        applicationId: null,
        participantId: null,
        canApply: false,
        ctaLabel: '신청자 관리',
        disabledReason: null,
        manageRoute: `/matches/${match.id}/applications`,
      };
    }

    const participant = match.participants.find((item) => item.userId === user.id);
    if (participant) {
      return {
        state: participant.role === 'host' ? 'host' : 'participant',
        applicationId: participant.applicationId,
        participantId: participant.id,
        canApply: false,
        ctaLabel: '참여 확정',
        disabledReason: null,
        manageRoute: null,
      };
    }

    const application = match.applications[0];
    if (application) {
      return {
        state: application.status === 'approved' ? 'approved' : application.status,
        applicationId: application.id,
        participantId: null,
        canApply: false,
        ctaLabel: application.status === 'requested' ? '승인 대기' : '다시 신청',
        disabledReason: application.status === 'requested' ? 'ALREADY_REQUESTED' : null,
        manageRoute: null,
      };
    }

    const reasonCode = this.getEligibilityReason(match, 'none');
    return {
      state: 'none',
      applicationId: null,
      participantId: null,
      canApply: reasonCode === 'OK',
      ctaLabel: reasonCode === 'OK' ? '참가 신청' : getReasonMessage(reasonCode),
      disabledReason: reasonCode === 'OK' ? null : reasonCode,
      manageRoute: null,
    };
  }

  private getEligibilityReason(match: MatchWithRelations, viewerState: string) {
    if (viewerState === 'host') return 'HOST_CANNOT_APPLY';
    if (viewerState === 'requested') return 'ALREADY_REQUESTED';
    if (viewerState === 'approved' || viewerState === 'participant') return 'ALREADY_PARTICIPANT';
    if (this.getParticipantCount(match) >= match.maxParticipants) return 'FULL';
    if (match.deadlineAt && match.deadlineAt < new Date()) return 'DEADLINE_PASSED';
    if (match.status !== 'recruiting') return 'NOT_RECRUITING';
    return 'OK';
  }

  private getParticipantCount(match: Pick<MatchWithRelations, 'participants'>) {
    return match.participants.filter((participant) => participant.status === 'active').length;
  }

  private getApiStatus(match: V1Match) {
    if (match.status === 'recruiting' && match.startAt < new Date()) {
      return 'expired';
    }
    return match.status;
  }

  private getDisplayState(match: MatchWithRelations) {
    if (match.status === 'recruiting' && match.startAt < new Date()) return 'expired';
    if (match.status === 'recruiting' && this.getParticipantCount(match) >= match.maxParticipants) return 'full';
    if (match.status === 'recruiting' && match.deadlineAt && match.deadlineAt < new Date()) return 'closed';
    return match.status;
  }

  private assertActiveAccount(user: V1AuthUser) {
    if (user.accountStatus !== 'active') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Account cannot mutate matches',
      });
    }
  }

  private validateMatchDates(dto: MutateMatchDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    const deadlineAt = dto.deadlineAt ? new Date(dto.deadlineAt) : null;

    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
      throw validationError('startsAt must be a future datetime', 'startsAt');
    }
    if (endsAt && endsAt <= startsAt) {
      throw validationError('endsAt must be after startsAt', 'endsAt');
    }
    if (deadlineAt && deadlineAt >= startsAt) {
      throw validationError('deadlineAt must be before startsAt', 'deadlineAt');
    }

    return { startsAt, endsAt, deadlineAt };
  }

  private async validateMasterRefs(sportId: string, regionId: string) {
    const sport = await this.prisma.v1Sport.findFirst({
      where: { id: sportId, isActive: true },
      select: { id: true },
    });
    if (!sport) {
      throw validationError('sportId is invalid or inactive', 'sportId');
    }

    const region = await this.prisma.v1Region.findFirst({
      where: { id: regionId, isActive: true, level: 2 },
      select: { id: true },
    });
    if (!region) {
      throw validationError('regionId must be an active district region', 'regionId');
    }
  }

  private async getHostMatch(user: V1AuthUser, matchId: string) {
    const match = await this.prisma.v1Match.findFirst({
      where: { id: matchId, deletedAt: null },
      include: {
        minSportLevel: { select: { code: true } },
        maxSportLevel: { select: { code: true } },
      },
    });

    if (!match) {
      throw new NotFoundException({
        code: 'NOT_FOUND_OR_ARCHIVED',
        message: 'Match was not found',
      });
    }
    if (match.hostUserId !== user.id) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only the match host can mutate this match',
      });
    }

    return match;
  }

  private async getApplicationWithMatch(applicationId: string) {
    const application = await this.prisma.v1MatchApplication.findFirst({
      where: {
        id: applicationId,
        match: { deletedAt: null },
      },
      include: {
        match: true,
      },
    });

    if (!application) {
      throw new NotFoundException({
        code: 'NOT_FOUND_OR_ARCHIVED',
        message: 'Match application was not found',
      });
    }

    return application;
  }

  private assertApplicationHost(
    user: V1AuthUser,
    application: V1MatchApplication & { match: V1Match },
  ) {
    if (application.match.hostUserId !== user.id) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only the match host can review this application',
      });
    }
  }

  private getActiveParticipantCount(
    matchId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return client.v1MatchParticipant.count({
      where: { matchId, status: 'active' },
    });
  }
}

function getOrderBy(sort: MatchesQueryDto['sort']): Prisma.V1MatchOrderByWithRelationInput[] {
  if (sort === 'latest') return [{ createdAt: 'desc' }];
  if (sort === 'deadline' || sort === 'starts_at') return [{ startAt: 'asc' }, { createdAt: 'desc' }];
  return [{ startAt: 'asc' }, { createdAt: 'desc' }];
}

function getGenderRuleWhere(genderRule: NonNullable<MatchesQueryDto['genderRule']>) {
  return genderRule === '무관' || genderRule === '성별 무관'
    ? { in: ['성별 무관', '무관'] }
    : genderRule;
}

function getReasonMessage(reasonCode: string) {
  const messages: Record<string, string> = {
    OK: '신청할 수 있어요.',
    LOGIN_REQUIRED: '로그인이 필요해요.',
    HOST_CANNOT_APPLY: '내가 만든 매치에는 신청할 수 없어요.',
    ALREADY_REQUESTED: '이미 신청해서 승인을 기다리고 있어요.',
    ALREADY_PARTICIPANT: '이미 참여가 확정된 매치예요.',
    FULL: '정원이 모두 찼어요.',
    DEADLINE_PASSED: '신청 가능 시간이 지났어요.',
    NOT_RECRUITING: '지금은 모집 중인 매치가 아니에요.',
    BLOCKED_USER: '신청할 수 없는 계정 상태예요.',
  };

  return messages[reasonCode] ?? '신청할 수 없어요.';
}

function validationError(message: string, field: string) {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message,
    details: { field },
  });
}

function stateConflict(message: string, code = 'STATE_CONFLICT') {
  return new ConflictException({
    code,
    message,
  });
}
