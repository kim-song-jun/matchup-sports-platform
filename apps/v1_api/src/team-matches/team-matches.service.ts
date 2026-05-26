import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, V1TeamMatch, V1TeamMatchApplication } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CancelTeamMatchDto, MutateTeamMatchDto, UpdateTeamMatchDto } from './dto/mutate-team-match.dto';
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
  approvedApplicantTeam: { id: string; name: string } | null;
  applications: Array<V1TeamMatchApplication & { applicantTeam: { id: string; name: string } }>;
};

@Injectable()
export class TeamMatchesService {
  constructor(private readonly prisma: PrismaService) {}

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
        ...(query.genderRule ? { genderRule: getGenderRuleWhere(query.genderRule) } : {}),
        ...(query.query
          ? {
              OR: [
                { title: { contains: query.query, mode: 'insensitive' } },
                { description: { contains: query.query, mode: 'insensitive' } },
                { placeName: { contains: query.query, mode: 'insensitive' } },
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

    return {
      items: pageItems.map((teamMatch) => this.toListItem(teamMatch, user)),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async detail(user: V1AuthUser | null, teamMatchId: string) {
    const teamMatch = await this.getPublicTeamMatch(teamMatchId, user);
    const viewer = await this.getViewer(teamMatch, user);
    const approvedApplication = teamMatch.applications.find((item) => item.status === 'approved');

    return {
      teamMatchId: teamMatch.id,
      title: teamMatch.title,
      description: teamMatch.description,
      imageUrl: teamMatch.imageUrl,
      sport: { sportId: teamMatch.sport.id, name: teamMatch.sport.name },
      region: { regionId: teamMatch.region.id, name: teamMatch.region.name },
      place: { name: teamMatch.placeName, addressText: teamMatch.placeAddress },
      startsAt: teamMatch.startAt,
      endsAt: teamMatch.endAt,
      deadlineAt: null,
      status: this.getApiStatus(teamMatch),
      displayState: this.getDisplayState(teamMatch),
      costNote: teamMatch.costNote,
      rulesText: [teamMatch.formatNote, teamMatch.genderRule].filter(Boolean).join(' · ') || null,
      genderRule: teamMatch.genderRule,
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

  async applicationEligibility(
    user: V1AuthUser,
    teamMatchId: string,
    query: TeamMatchEligibilityQueryDto,
  ) {
    const teamMatch = await this.getPublicTeamMatch(teamMatchId, user);
    const manageableTeams = await this.getUserManageableTeams(user.id, query.teamId);

    return {
      teamMatchId: teamMatch.id,
      requiresApproval: true,
      requiresPayment: false,
      teams: manageableTeams.map((team) => {
        const application = teamMatch.applications.find((item) => item.applicantTeamId === team.id);
        const reasonCode = getEligibilityReason(teamMatch, team.id, application);
        return {
          teamId: team.id,
          name: team.name,
          role: team.memberships[0]?.role ?? 'member',
          eligible: reasonCode === 'OK',
          reasonCode,
          applicationId: application?.id ?? null,
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

    const includeHosted = !query.scope || query.scope === 'all' || query.scope === 'hosted';
    const includeApplied = !query.scope || query.scope === 'all' || query.scope === 'applied';
    const teamMatches = await this.prisma.v1TeamMatch.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...(includeHosted ? [{ hostTeamId: { in: teamIds } }] : []),
          ...(includeApplied ? [{ applications: { some: { applicantTeamId: { in: teamIds } } } }] : []),
        ],
      },
      include: {
        sport: { select: { name: true } },
        hostTeam: { select: { id: true, name: true } },
        applications: {
          where: { applicantTeamId: { in: teamIds } },
          include: { applicantTeam: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
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
          manageRoute: relation === 'host_team' ? `/team-matches/${teamMatch.id}/manage` : null,
          detailRoute: `/team-matches/${teamMatch.id}`,
        };
      }),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async create(user: V1AuthUser, dto: MutateTeamMatchDto) {
    this.assertActiveAccount(user);
    await this.assertCanManageTeam(user.id, dto.hostTeamId);
    await this.validateMasterRefs(dto.sportId, dto.regionId);
    const dates = this.validateDates(dto);

    const teamMatch = await this.prisma.$transaction(async (tx) => {
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
          formatNote: dto.rulesText ?? null,
          genderRule: dto.genderRule ?? null,
          costNote: dto.costNote ?? null,
          status: 'recruiting',
        },
      });
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
      return created;
    });

    return {
      teamMatchId: teamMatch.id,
      status: teamMatch.status,
      hostTeamId: teamMatch.hostTeamId,
      detailRoute: `/team-matches/${teamMatch.id}`,
      manageRoute: `/team-matches/${teamMatch.id}/manage`,
    };
  }

  async edit(user: V1AuthUser, teamMatchId: string) {
    const teamMatch = await this.getManageableTeamMatch(user, teamMatchId);
    const editable = teamMatch.status === 'recruiting';
    return {
      teamMatchId: teamMatch.id,
      editable,
      lockedReason: editable ? null : 'terminal_or_matched_status',
      form: {
        hostTeamId: teamMatch.hostTeamId,
        sportId: teamMatch.sportId,
        regionId: teamMatch.regionId,
        title: teamMatch.title,
        description: teamMatch.description,
        imageUrl: teamMatch.imageUrl,
        startsAt: teamMatch.startAt,
        endsAt: teamMatch.endAt,
        deadlineAt: null,
        manualPlaceName: teamMatch.placeName,
        addressText: teamMatch.placeAddress,
        costNote: teamMatch.costNote,
        rulesText: teamMatch.formatNote,
        genderRule: teamMatch.genderRule,
      },
      status: this.getApiStatus(teamMatch),
      version: teamMatch.updatedAt.toISOString(),
    };
  }

  async update(user: V1AuthUser, teamMatchId: string, dto: UpdateTeamMatchDto) {
    this.assertActiveAccount(user);
    const teamMatch = await this.getManageableTeamMatch(user, teamMatchId);
    if (teamMatch.updatedAt.toISOString() !== dto.version) throw stateConflict('Team match version is stale', 'VERSION_CONFLICT');
    if (teamMatch.status !== 'recruiting' || this.getApiStatus(teamMatch) === 'expired') throw stateConflict('Team match cannot be updated in current status');
    if (dto.hostTeamId !== teamMatch.hostTeamId) throw stateConflict('Host team cannot be changed');
    await this.validateMasterRefs(dto.sportId, dto.regionId);
    const dates = this.validateDates(dto);

    const updated = await this.prisma.v1TeamMatch.update({
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
        formatNote: dto.rulesText ?? null,
        genderRule: dto.genderRule ?? null,
        costNote: dto.costNote ?? null,
      },
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

    return {
      teamMatchId: teamMatch.id,
      status: 'cancelled',
      cancelledApplications: result.applications.count,
      detailRoute: `/team-matches/${teamMatch.id}`,
    };
  }

  async createApplication(
    user: V1AuthUser,
    teamMatchId: string,
    dto: CreateTeamMatchApplicationDto,
  ) {
    this.assertActiveAccount(user);
    await this.assertCanManageTeam(user.id, dto.applicantTeamId);
    const teamMatch = await this.getPublicTeamMatch(teamMatchId, user);
    const application = teamMatch.applications.find((item) => item.applicantTeamId === dto.applicantTeamId);
    const reasonCode = getEligibilityReason(teamMatch, dto.applicantTeamId, application);
    if (reasonCode !== 'OK') {
      throw stateConflict(getEligibilityReasonMessage(reasonCode), reasonCode);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const nextApplication = application
        ? await tx.v1TeamMatchApplication.update({
            where: { id: application.id },
            data: {
              status: 'requested',
              appliedByUserId: user.id,
              message: dto.message ?? null,
              reviewedByUserId: null,
              reviewedAt: null,
              withdrawnAt: null,
            },
          })
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
    });

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
            trustScore: { select: { trustState: true, mannerScore: true, matchCount: true } },
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

    return {
      teamMatchId: teamMatch.id,
      items: pageItems.map((application) => ({
        applicationId: application.id,
        status: application.status,
        message: application.message,
        createdAt: application.createdAt,
        reviewedAt: application.reviewedAt,
        applicantTeam: {
          teamId: application.applicantTeam.id,
          name: application.applicantTeam.name,
          logoUrl: application.applicantTeam.profile?.logoUrl ?? null,
          trustState: application.applicantTeam.trustScore?.trustState ?? 'none',
          score: application.applicantTeam.trustScore?.mannerScore
            ? Number(application.applicantTeam.trustScore.mannerScore)
            : null,
          matchCount: application.applicantTeam.trustScore?.matchCount ?? 0,
        },
        appliedBy: {
          userId: application.appliedByUser.id,
          displayName:
            application.appliedByUser.profile?.displayName ??
            application.appliedByUser.profile?.nickname ??
            '신청자',
          profileImageUrl: application.appliedByUser.profile?.profileImageUrl ?? null,
        },
        canApprove: application.status === 'requested' && teamMatch.status === 'recruiting',
        canReject: application.status === 'requested',
      })),
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
      const nextApplication = await tx.v1TeamMatchApplication.update({
        where: { id: application.id },
        data: { status: 'withdrawn', withdrawnAt: new Date() },
      });
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
      return nextApplication;
    });

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
    if (application.teamMatch.status !== 'recruiting' || application.teamMatch.startAt < new Date()) {
      throw stateConflict('Team match is not recruiting');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedApplication = await tx.v1TeamMatchApplication.update({
        where: { id: application.id },
        data: { status: 'approved', reviewedByUserId: user.id, reviewedAt: new Date() },
      });
      const updatedTeamMatch = await tx.v1TeamMatch.update({
        where: { id: application.teamMatchId },
        data: {
          status: 'matched',
          approvedApplicantTeamId: application.applicantTeamId,
        },
      });
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
        ],
      });
      return { updatedApplication, updatedTeamMatch };
    });

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
      const nextApplication = await tx.v1TeamMatchApplication.update({
        where: { id: application.id },
        data: { status: 'rejected', reviewedByUserId: user.id, reviewedAt: new Date() },
      });
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
      return nextApplication;
    });

    return {
      applicationId: updated.id,
      teamMatchId: updated.teamMatchId,
      applicantTeamId: updated.applicantTeamId,
      status: updated.status,
    };
  }

  private teamMatchInclude(user: V1AuthUser | null) {
    return {
      sport: { select: { id: true, name: true } },
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
      approvedApplicantTeam: { select: { id: true, name: true } },
      applications: {
        where: user ? { OR: [{ status: 'approved' }, { appliedByUserId: user.id }] } : { status: 'approved' },
        include: { applicantTeam: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
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
      deadlineAt: null,
      status: this.getApiStatus(teamMatch),
      displayState: this.getDisplayState(teamMatch),
      hostTeam: {
        teamId: teamMatch.hostTeam.id,
        name: teamMatch.hostTeam.name,
        logoUrl: teamMatch.hostTeam.profile?.logoUrl ?? null,
        trustState: teamMatch.hostTeam.trustScore?.trustState ?? 'none',
      },
      costNote: teamMatch.costNote,
      rulesText: [teamMatch.formatNote, teamMatch.genderRule].filter(Boolean).join(' · ') || null,
      genderRule: teamMatch.genderRule,
      paymentRequired: false,
      viewerState: this.getViewerState(teamMatch, user),
    };
  }

  private async getPublicTeamMatch(teamMatchId: string, user: V1AuthUser | null) {
    const teamMatch = await this.prisma.v1TeamMatch.findFirst({
      where: { id: teamMatchId, deletedAt: null, hostTeam: { status: 'active', deletedAt: null } },
      include: this.teamMatchInclude(user),
    });
    if (!teamMatch) throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team match was not found' });
    return teamMatch;
  }

  private async getViewer(teamMatch: TeamMatchWithRelations, user: V1AuthUser | null) {
    if (!user) {
      return { state: 'guest', manageableHostTeam: false, eligibleTeams: [], manageRoute: null };
    }
    const hostMembership = teamMatch.hostTeam.memberships[0];
    const manageableHostTeam = hostMembership?.role === 'owner' || hostMembership?.role === 'manager';
    const eligibleTeams = await this.getUserManageableTeams(user.id);
    return {
      state: this.getViewerState(teamMatch, user),
      manageableHostTeam,
      eligibleTeams: eligibleTeams.map((team) => {
        const application = teamMatch.applications.find((item) => item.applicantTeamId === team.id);
        const reasonCode = getEligibilityReason(teamMatch, team.id, application);
        return { teamId: team.id, name: team.name, role: team.memberships[0]?.role ?? 'member', eligible: reasonCode === 'OK', reasonCode };
      }),
      manageRoute: manageableHostTeam ? `/team-matches/${teamMatch.id}/manage` : null,
    };
  }

  private getViewerState(teamMatch: TeamMatchWithRelations, user: V1AuthUser | null) {
    if (!user) return 'none';
    if (teamMatch.hostTeam.memberships.some((membership) => membership.userId === user.id)) return 'host_team';
    const application = teamMatch.applications.find((item) => item.appliedByUserId === user.id);
    if (application?.status === 'approved') return 'approved';
    if (application?.status) return application.status;
    return 'none';
  }

  private async getManageableTeamMatch(user: V1AuthUser, teamMatchId: string) {
    const teamMatch = await this.prisma.v1TeamMatch.findFirst({ where: { id: teamMatchId, deletedAt: null } });
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
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Only team owners or managers can manage team matches' });
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

  private getApiStatus(teamMatch: V1TeamMatch) {
    if (teamMatch.status === 'recruiting' && teamMatch.startAt < new Date()) return 'expired';
    return teamMatch.status;
  }

  private getDisplayState(teamMatch: V1TeamMatch) {
    return this.getApiStatus(teamMatch);
  }
}

function getOrderBy(sort: TeamMatchesQueryDto['sort']): Prisma.V1TeamMatchOrderByWithRelationInput[] {
  if (sort === 'latest') return [{ createdAt: 'desc' }];
  return [{ startAt: 'asc' }, { createdAt: 'desc' }];
}

function getGenderRuleWhere(genderRule: NonNullable<TeamMatchesQueryDto['genderRule']>) {
  return genderRule === '무관' || genderRule === '성별 무관'
    ? { in: ['성별 무관', '무관'] }
    : genderRule;
}

function getEligibilityReason(
  teamMatch: V1TeamMatch,
  applicantTeamId: string,
  application?: V1TeamMatchApplication,
) {
  if (teamMatch.hostTeamId === applicantTeamId) return 'HOST_TEAM_CANNOT_APPLY';
  if (application?.status === 'requested') return 'ALREADY_REQUESTED';
  if (application?.status === 'approved') return 'ALREADY_APPROVED';
  if (teamMatch.status === 'matched') return 'MATCHED_ALREADY';
  if (teamMatch.status !== 'recruiting' || teamMatch.startAt < new Date()) return 'NOT_RECRUITING';
  return 'OK';
}

function getEligibilityReasonMessage(reasonCode: string) {
  const messages: Record<string, string> = {
    OK: '신청할 수 있습니다.',
    HOST_TEAM_CANNOT_APPLY: '호스트 팀은 자기 팀매치에 신청할 수 없습니다.',
    ALREADY_REQUESTED: '이미 신청했고 승인 대기 중입니다.',
    ALREADY_APPROVED: '이미 승인된 신청입니다.',
    MATCHED_ALREADY: '이미 매칭이 완료되었습니다.',
    NOT_RECRUITING: '모집 중인 팀매치가 아닙니다.',
  };

  return messages[reasonCode] ?? '신청할 수 없습니다.';
}

function validationError(message: string, field: string) {
  return new BadRequestException({ code: 'VALIDATION_FAILED', message, details: { field } });
}

function stateConflict(message: string, code = 'STATE_CONFLICT') {
  return new ConflictException({ code, message });
}
