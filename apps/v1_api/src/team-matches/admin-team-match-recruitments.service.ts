import { canConfirmTeamMatch, validateTeamMatchDates } from './team-match-dates';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveSportLevelRange } from '../sports/level-range';
import { createTeamMatchScheduleInTx } from '../team-schedules/team-schedules.service';
import {
  ApproveAdminTeamMatchApplicationDto,
  CreateAdminTeamMatchRecruitmentDto,
  RejectAdminTeamMatchApplicationDto,
  UpdateAdminTeamMatchRecruitmentDto,
} from './dto/admin-team-match-recruitment.dto';
import { resolveTeamMatchCompetitionConfig } from './resolve-team-match-competition-config';

const CREATE_ACTION = 'admin_team_match_recruitment_create';
const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;

type AssignableTeam = {
  id: string;
  name: string;
  sportId: string;
  memberships: Array<{
    id: string;
    userId: string;
    role: string;
    user: { profile: { nickname: string | null; displayName: string | null } | null };
  }>;
};

@Injectable()
export class AdminTeamMatchRecruitmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: V1AuthUser, dto: CreateAdminTeamMatchRecruitmentDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const dates = validateTeamMatchDates(dto);
    if (!dto.title.trim() || !dto.manualPlaceName.trim()) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '매치 제목과 경기 장소를 입력해 주세요.' });
    }

    const [sport, region, competitionConfig] = await Promise.all([
      this.prisma.v1Sport.findFirst({ where: { id: dto.sportId, isActive: true }, select: { id: true } }),
      this.prisma.v1Region.findFirst({ where: { id: dto.regionId, isActive: true, level: 2 }, select: { id: true } }),
      resolveTeamMatchCompetitionConfig(this.prisma, dto.sportId),
    ]);
    if (!sport) throw this.validationError('활성화된 종목을 선택해 주세요.', 'sportId');
    if (!region) throw this.validationError('활성화된 시·군·구 지역을 선택해 주세요.', 'regionId');
    if (!competitionConfig) {
      throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '이 종목에 활성 경기 설정이 없어 모집을 만들 수 없어요.' });
    }

    const payloadHash = canonicalGameCommandPayloadHash({ actorUserId: user.id, dto });
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin-team-match-recruitment:${user.id}:${dto.clientCommandId}`}, 0))`;
      const existing = await tx.v1IdempotencyRecord.findFirst({
        where: {
          actorUserId: user.id,
          action: CREATE_ACTION,
          resourceType: V1GameSourceType.TEAM_MATCH,
          idempotencyKey: dto.clientCommandId,
        },
        select: { resourceId: true, payloadHash: true },
      });
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: '같은 요청 키로 다른 모집 정보를 제출할 수 없어요.' });
        }
        const teamMatch = await tx.v1TeamMatch.findUniqueOrThrow({ where: { id: existing.resourceId } });
        return this.createResponse(teamMatch.id, teamMatch.status, true);
      }

      const levelRange = await resolveSportLevelRange(
        tx,
        dto.sportId,
        dto.minLevelCode,
        dto.maxLevelCode,
      );
      const matchFormat = dto.matchFormat?.trim() || null;
      const matchStyle = (dto.matchStyle ?? []).map((item) => item.trim()).filter(Boolean);
      const uniformColor = dto.uniformColor?.trim() || null;
      const teamMatch = await tx.v1TeamMatch.create({
        data: {
          hostTeamId: null,
          platformManaged: true,
          approvedApplicantTeamId: null,
          createdByUserId: admin.userId,
          sportId: dto.sportId,
          regionId: dto.regionId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          imageUrl: dto.imageUrl?.trim() || null,
          placeName: dto.manualPlaceName.trim(),
          placeAddress: dto.addressText?.trim() || null,
          startAt: dates.startsAt,
          endAt: dates.endsAt,
          deadlineAt: dates.deadlineAt,
          formatNote: dto.rulesText?.trim() || null,
          costNote: dto.costNote?.trim() || null,
          minSportLevelId: levelRange.minSportLevelId,
          maxSportLevelId: levelRange.maxSportLevelId,
          genderRule: dto.genderRule?.trim() || null,
          matchFormat,
          matchStyle,
          uniformColor,
          status: 'recruiting',
          competitionConfigVersionId: competitionConfig.id,
        },
      });
      const response = this.createResponse(teamMatch.id, teamMatch.status, false);
      await tx.v1IdempotencyRecord.create({
        data: {
          actorUserId: user.id,
          action: CREATE_ACTION,
          resourceType: V1GameSourceType.TEAM_MATCH,
          resourceId: teamMatch.id,
          idempotencyKey: dto.clientCommandId,
          payloadHash,
          responseStatus: 201,
          responseBody: response as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_RETENTION_MS),
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'team_match.recruitment.create',
          targetType: 'team_match',
          targetId: teamMatch.id,
          reason: '플랫폼 운영자 팀 모집 개설',
          afterJson: { sportId: dto.sportId, deadlineAt: dates.deadlineAt?.toISOString() ?? null } as Prisma.InputJsonValue,
          fromStatus: null,
          toStatus: 'recruiting',
        },
        tx,
      );
      return response;
    });
  }

  async approveApplication(
    user: V1AuthUser,
    teamMatchId: string,
    applicationId: string,
    dto: ApproveAdminTeamMatchApplicationDto,
  ) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const payloadHash = canonicalGameCommandPayloadHash({ actorUserId: user.id, teamMatchId, applicationId, dto });
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "v1_team_matches" WHERE id = ${teamMatchId} FOR UPDATE`;
      const teamMatch = await tx.v1TeamMatch.findFirst({
        where: { id: teamMatchId, deletedAt: null },
        select: {
          id: true,
          title: true,
          sportId: true,
          status: true,
          hostTeamId: true,
          platformManaged: true,
          approvedApplicantTeamId: true,
          startAt: true,
          endAt: true,
          deadlineAt: true,
          leagueId: true,
          tournamentId: true,
          competitionConfigVersionId: true,
          game: { select: { id: true } },
          applications: {
            where: { OR: [{ id: applicationId }, { status: 'approved' }] },
            orderBy: [{ reviewedAt: 'asc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              status: true,
              applicantTeam: {
                select: {
                  id: true,
                  name: true,
                  sportId: true,
                  status: true,
                  deletedAt: true,
                  memberships: {
                    where: { status: 'active' },
                    orderBy: { id: 'asc' },
                    select: {
                      id: true,
                      userId: true,
                      role: true,
                      user: { select: { profile: { select: { nickname: true, displayName: true } } } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!teamMatch) throw new NotFoundException({ code: 'NOT_FOUND', message: '팀매치 모집을 찾을 수 없어요.' });
      if (!teamMatch.platformManaged) {
        throw new ConflictException({ code: 'TEAM_MATCH_NOT_PLATFORM_RECRUITING', message: '신청을 받는 플랫폼 팀매치만 승인할 수 있어요.' });
      }

      const targetApplication = teamMatch.applications.find((application) => application.id === applicationId);
      if (!targetApplication) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: '팀매치 신청을 찾을 수 없어요.' });
      }
      if (
        teamMatch.status === 'matched' &&
        teamMatch.game &&
        teamMatch.hostTeamId !== null &&
        teamMatch.approvedApplicantTeamId !== null &&
        targetApplication.status === 'approved'
      ) {
        return {
          applicationId,
          applicantTeamId: targetApplication.applicantTeam.id,
          applicationStatus: 'approved' as const,
          teamMatchId,
          gameId: teamMatch.game.id,
          teamMatchStatus: 'matched' as const,
          approvedCount: 2 as const,
          homeTeamId: teamMatch.hostTeamId,
          awayTeamId: teamMatch.approvedApplicantTeamId,
          replayed: true,
          rejectedTeamIds: [] as string[],
        };
      }
      if (
        teamMatch.leagueId !== null ||
        teamMatch.tournamentId !== null ||
        teamMatch.status !== 'recruiting'
      ) {
        throw new ConflictException({ code: 'TEAM_MATCH_NOT_PLATFORM_RECRUITING', message: '신청을 받는 플랫폼 팀매치만 승인할 수 있어요.' });
      }
      if (!canConfirmTeamMatch(teamMatch)) {
        throw new ConflictException({ code: 'TEAM_MATCH_ASSIGNMENT_NOT_READY', message: '경기 시작 전에 참가팀을 승인해 주세요.' });
      }
      if (!teamMatch.competitionConfigVersionId) {
        throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '경기 설정이 없어 팀을 확정할 수 없어요.' });
      }
      const approvedApplications = teamMatch.applications.filter((application) => application.status === 'approved');
      if (targetApplication.status === 'approved' && approvedApplications.length === 1) {
        return {
          applicationId,
          applicantTeamId: targetApplication.applicantTeam.id,
          applicationStatus: 'approved' as const,
          teamMatchId,
          gameId: null,
          teamMatchStatus: 'recruiting' as const,
          approvedCount: 1 as const,
          homeTeamId: null,
          awayTeamId: null,
          replayed: true,
          rejectedTeamIds: [] as string[],
        };
      }
      if (targetApplication.status !== 'requested' || approvedApplications.length > 1) {
        throw new ConflictException({
          code: 'TEAM_MATCH_APPLICATIONS_CHANGED',
          message: '신청 상태가 변경됐어요. 신청 목록을 새로고침한 뒤 다시 확인해 주세요.',
        });
      }

      const targetTeam = targetApplication.applicantTeam as AssignableTeam & { status: string; deletedAt: Date | null };
      if (
        targetTeam.status !== 'active' ||
        targetTeam.deletedAt !== null ||
        targetTeam.sportId !== teamMatch.sportId
      ) {
        throw new UnprocessableEntityException({ code: 'TEAM_MATCH_TEAMS_INVALID', message: '활성 상태의 동일 종목 팀만 승인할 수 있어요.' });
      }

      if (approvedApplications.length === 0) {
        const approved = await tx.v1TeamMatchApplication.updateMany({
          where: { id: applicationId, teamMatchId, status: 'requested' },
          data: { status: 'approved', reviewedByUserId: admin.userId, reviewedAt: new Date() },
        });
        if (approved.count !== 1) {
          throw new ConflictException({
            code: 'TEAM_MATCH_APPLICATIONS_CHANGED',
            message: '신청 상태가 변경됐어요. 신청 목록을 새로고침한 뒤 다시 확인해 주세요.',
          });
        }
        await this.adminContext.logAdminAction(
          admin,
          {
            action: 'team_match.application.approve',
            targetType: 'team_match_application',
            targetId: applicationId,
            reason: '플랫폼 운영자 첫 참가팀 승인',
            afterJson: { teamMatchId, applicantTeamId: targetTeam.id, approvedCount: 1 } as Prisma.InputJsonValue,
            fromStatus: 'requested',
            toStatus: 'approved',
          },
          tx,
        );
        return {
          applicationId,
          applicantTeamId: targetTeam.id,
          applicationStatus: 'approved' as const,
          teamMatchId,
          gameId: null,
          teamMatchStatus: 'recruiting' as const,
          approvedCount: 1 as const,
          homeTeamId: null,
          awayTeamId: null,
          replayed: false,
          rejectedTeamIds: [] as string[],
        };
      }

      const homeApplication = approvedApplications[0];
      const home = homeApplication.applicantTeam as AssignableTeam & { status: string; deletedAt: Date | null };
      const away = targetTeam;
      if (
        home.id === away.id ||
        home.status !== 'active' ||
        home.deletedAt !== null ||
        home.sportId !== teamMatch.sportId
      ) {
        throw new UnprocessableEntityException({ code: 'TEAM_MATCH_TEAMS_INVALID', message: '먼저 승인한 팀의 상태를 확인해 주세요.' });
      }
      const game = await this.games.createFromSourceInTransaction(
        tx,
        {
          sourceType: V1GameSourceType.TEAM_MATCH,
          sourceId: teamMatch.id,
          competitionConfigVersionId: teamMatch.competitionConfigVersionId,
          sides: [
            { sideKey: V1GameSideKey.HOME, teamId: home.id, displayNameSnapshot: home.name },
            { sideKey: V1GameSideKey.AWAY, teamId: away.id, displayNameSnapshot: away.name },
          ],
          participants: [
            ...this.toParticipants(home, V1GameSideKey.HOME),
            ...this.toParticipants(away, V1GameSideKey.AWAY),
          ],
        },
        {
          actor: { actorType: 'USER', actorUserId: admin.userId, role: 'platform_ops' },
          expectedVersion: 0,
          durableCommandId: dto.clientCommandId,
          payloadHash,
        },
      );
      await tx.v1TeamMatch.update({
        where: { id: teamMatch.id },
        data: { hostTeamId: home.id, approvedApplicantTeamId: away.id, status: 'matched' },
      });
      const approved = await tx.v1TeamMatchApplication.updateMany({
        where: { id: applicationId, teamMatchId, status: 'requested' },
        data: { status: 'approved', reviewedByUserId: admin.userId, reviewedAt: new Date() },
      });
      if (approved.count !== 1) {
        throw new ConflictException({
          code: 'TEAM_MATCH_APPLICATIONS_CHANGED',
          message: '신청 상태가 변경됐어요. 신청 목록을 새로고침한 뒤 다시 확인해 주세요.',
        });
      }
      const rejected = await tx.v1TeamMatchApplication.findMany({
        where: { teamMatchId, status: 'requested', id: { not: applicationId } },
        select: { id: true, applicantTeamId: true },
      });
      await tx.v1TeamMatchApplication.updateMany({
        where: { id: { in: rejected.map((application) => application.id) } },
        data: { status: 'rejected', reviewedByUserId: admin.userId, reviewedAt: new Date() },
      });
      await createTeamMatchScheduleInTx(tx, home.id, teamMatch.id, teamMatch.title, teamMatch.startAt, teamMatch.endAt);
      await createTeamMatchScheduleInTx(tx, away.id, teamMatch.id, teamMatch.title, teamMatch.startAt, teamMatch.endAt);
      await tx.v1StatusChangeLog.createMany({
        data: [
          {
            targetType: 'team_match_application',
            targetId: applicationId,
            fromStatus: 'requested',
            toStatus: 'approved',
            actorType: 'admin' as const,
            adminUserId: admin.id,
            reason: 'platform_team_match_assignment',
          },
          ...rejected.map((application) => ({
            targetType: 'team_match_application',
            targetId: application.id,
            fromStatus: 'requested',
            toStatus: 'rejected',
            actorType: 'admin' as const,
            adminUserId: admin.id,
            reason: 'platform_team_match_other_team_selected',
          })),
        ],
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'team_match.applications.assign',
          targetType: 'team_match',
          targetId: teamMatch.id,
          reason: '플랫폼 운영자 신청팀 확정',
          afterJson: { homeTeamId: home.id, awayTeamId: away.id } as Prisma.InputJsonValue,
          fromStatus: 'recruiting',
          toStatus: 'matched',
        },
        tx,
      );
      return {
        applicationId,
        applicantTeamId: away.id,
        applicationStatus: 'approved' as const,
        teamMatchId,
        gameId: game.gameId,
        teamMatchStatus: 'matched' as const,
        approvedCount: 2 as const,
        homeTeamId: home.id,
        awayTeamId: away.id,
        replayed: false,
        rejectedTeamIds: rejected.map((application) => application.applicantTeamId),
      };
    });

    if (!result.replayed && result.teamMatchStatus === 'recruiting') {
      this.emitTeamNotifications(
        [result.applicantTeamId],
        'team_match_application_approved',
        teamMatchId,
        '신청한 팀매치의 참가가 승인됐어요. 상대팀 확정을 기다리고 있어요.',
      );
    }
    if (!result.replayed && result.teamMatchStatus === 'matched') {
      const confirmedTeamIds = [result.homeTeamId, result.awayTeamId].filter(
        (teamId): teamId is string => teamId !== null,
      );
      this.emitTeamNotifications(
        confirmedTeamIds,
        'team_match_application_approved',
        teamMatchId,
        '신청한 팀매치의 대진이 확정됐어요.',
      );
      this.emitTeamNotifications(
        result.rejectedTeamIds,
        'team_match_application_rejected',
        teamMatchId,
        '신청한 팀매치의 참가팀이 확정되어 모집이 종료됐어요.',
      );
    }
    return { ...result, detailRoute: `/admin/team-matches/${teamMatchId}` };
  }

  async rejectApplication(
    user: V1AuthUser,
    teamMatchId: string,
    applicationId: string,
    dto: RejectAdminTeamMatchApplicationDto,
  ) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '거절 사유를 입력해 주세요.', details: { field: 'reason' } });
    }
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "v1_team_matches" WHERE id = ${teamMatchId} FOR UPDATE`;
      const teamMatch = await tx.v1TeamMatch.findFirst({
        where: { id: teamMatchId, deletedAt: null },
        select: {
          id: true,
          title: true,
          status: true,
          platformManaged: true,
          leagueId: true,
          tournamentId: true,
          applications: {
            where: { id: applicationId },
            select: { id: true, status: true, applicantTeamId: true },
          },
        },
      });
      if (!teamMatch) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: '팀매치 모집을 찾을 수 없어요.' });
      }
      if (
        !teamMatch.platformManaged ||
        teamMatch.leagueId !== null ||
        teamMatch.tournamentId !== null ||
        teamMatch.status !== 'recruiting'
      ) {
        throw new ConflictException({
          code: 'TEAM_MATCH_NOT_PLATFORM_RECRUITING',
          message: '신청을 받는 플랫폼 팀매치만 거절할 수 있어요.',
        });
      }
      const application = teamMatch.applications[0];
      if (!application) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: '팀매치 신청을 찾을 수 없어요.' });
      }
      if (application.status === 'rejected') {
        return { application, title: teamMatch.title, replayed: true };
      }
      if (application.status !== 'requested') {
        throw new ConflictException({
          code: 'TEAM_MATCH_APPLICATIONS_CHANGED',
          message: '대기 중인 신청만 거절할 수 있어요. 신청 목록을 새로고침해 주세요.',
        });
      }
      const transition = await tx.v1TeamMatchApplication.updateMany({
        where: { id: applicationId, teamMatchId, status: 'requested' },
        data: { status: 'rejected', reviewedByUserId: admin.userId, reviewedAt: new Date() },
      });
      if (transition.count !== 1) {
        throw new ConflictException({
          code: 'TEAM_MATCH_APPLICATIONS_CHANGED',
          message: '신청 상태가 변경됐어요. 신청 목록을 새로고침해 주세요.',
        });
      }
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'team_match.application.reject',
          targetType: 'team_match_application',
          targetId: applicationId,
          reason,
          beforeJson: { teamMatchId, applicantTeamId: application.applicantTeamId, status: 'requested' } as Prisma.InputJsonValue,
          afterJson: { teamMatchId, applicantTeamId: application.applicantTeamId, status: 'rejected' } as Prisma.InputJsonValue,
          fromStatus: 'requested',
          toStatus: 'rejected',
        },
        tx,
      );
      return { application, title: teamMatch.title, replayed: false };
    });

    if (!result.replayed) {
      this.emitTeamNotifications(
        [result.application.applicantTeamId],
        'team_match_application_rejected',
        teamMatchId,
        `"${result.title}" 팀매치 신청이 거절됐어요. 사유: ${reason}`,
      );
    }
    return {
      applicationId,
      applicantTeamId: result.application.applicantTeamId,
      applicationStatus: 'rejected' as const,
      teamMatchId,
      teamMatchStatus: 'recruiting' as const,
      detailRoute: `/admin/team-matches/${teamMatchId}`,
      replayed: result.replayed,
    };
  }

  async update(user: V1AuthUser, teamMatchId: string, dto: UpdateAdminTeamMatchRecruitmentDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    if (!dto.title.trim() || !dto.manualPlaceName.trim()) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '매치 제목과 경기 장소를 입력해 주세요.' });
    }
    const existing = await this.prisma.v1TeamMatch.findFirst({
      where: { id: teamMatchId, deletedAt: null },
      select: {
        id: true,
        sportId: true,
        status: true,
        platformManaged: true,
        leagueId: true,
        tournamentId: true,
        updatedAt: true,
        deadlineAt: true,
        title: true,
      },
    });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: '팀매치 모집을 찾을 수 없어요.' });
    if (!existing.platformManaged || existing.leagueId !== null || existing.tournamentId !== null || existing.status !== 'recruiting') {
      throw new ConflictException({ code: 'TEAM_MATCH_NOT_PLATFORM_RECRUITING', message: '모집 중인 플랫폼 팀매치만 수정할 수 있어요.' });
    }
    if (existing.updatedAt.toISOString() !== dto.version) {
      throw new ConflictException({ code: 'VERSION_CONFLICT', message: '다른 관리자가 먼저 수정했어요. 최신 내용을 다시 불러와 주세요.' });
    }
    if (dto.sportId !== existing.sportId) {
      throw new ConflictException({ code: 'TEAM_MATCH_SPORT_IMMUTABLE', message: '모집을 만든 뒤에는 종목을 변경할 수 없어요.' });
    }
    const dates = validateTeamMatchDates(dto, existing.deadlineAt);
    const [region, levelRange] = await Promise.all([
      this.prisma.v1Region.findFirst({ where: { id: dto.regionId, isActive: true, level: 2 }, select: { id: true } }),
      resolveSportLevelRange(this.prisma, dto.sportId, dto.minLevelCode, dto.maxLevelCode),
    ]);
    if (!region) throw this.validationError('활성화된 시·군·구 지역을 선택해 주세요.', 'regionId');
    const matchStyle = (dto.matchStyle ?? []).map((item) => item.trim()).filter(Boolean);
    const updated = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.v1TeamMatch.updateMany({
        where: { id: teamMatchId, updatedAt: existing.updatedAt, status: 'recruiting', platformManaged: true },
        data: {
          regionId: dto.regionId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          imageUrl: dto.imageUrl?.trim() || null,
          placeName: dto.manualPlaceName.trim(),
          placeAddress: dto.addressText?.trim() || null,
          startAt: dates.startsAt,
          endAt: dates.endsAt,
          deadlineAt: dates.deadlineAt,
          formatNote: dto.rulesText?.trim() || null,
          costNote: dto.costNote?.trim() || null,
          minSportLevelId: levelRange.minSportLevelId,
          maxSportLevelId: levelRange.maxSportLevelId,
          genderRule: dto.genderRule?.trim() || null,
          matchFormat: dto.matchFormat?.trim() || null,
          matchStyle,
          uniformColor: dto.uniformColor?.trim() || null,
        },
      });
      if (transition.count !== 1) {
        throw new ConflictException({ code: 'VERSION_CONFLICT', message: '다른 관리자가 먼저 수정했어요. 최신 내용을 다시 불러와 주세요.' });
      }
      const row = await tx.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId }, select: { updatedAt: true } });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'team_match.recruitment.update',
          targetType: 'team_match',
          targetId: teamMatchId,
          reason: '플랫폼 운영자 팀 모집 수정',
          beforeJson: { title: existing.title, version: dto.version } as Prisma.InputJsonValue,
          afterJson: { title: dto.title.trim(), version: row.updatedAt.toISOString() } as Prisma.InputJsonValue,
        },
        tx,
      );
      return row;
    });
    return {
      teamMatchId,
      status: 'recruiting' as const,
      version: updated.updatedAt.toISOString(),
      detailRoute: `/admin/team-matches/${teamMatchId}`,
    };
  }

  private validationError(message: string, field: string) {
    return new BadRequestException({ code: 'VALIDATION_FAILED', message, details: { field } });
  }

  private createResponse(teamMatchId: string, status: string, replayed: boolean) {
    return { teamMatchId, status, detailRoute: `/admin/team-matches/${teamMatchId}`, replayed };
  }

  private toParticipants(team: AssignableTeam, sideKey: V1GameSideKey) {
    return team.memberships.map((membership) => ({
      sourceParticipantId: membership.id,
      userId: membership.userId,
      sideKey,
      displayNameSnapshot: membership.user.profile?.nickname ?? membership.user.profile?.displayName ?? '팀원',
    }));
  }

  private emitTeamNotifications(teamIds: string[], type: 'team_match_application_approved' | 'team_match_application_rejected', teamMatchId: string, body: string) {
    if (teamIds.length === 0) return;
    this.notifications.emitToManyDeferred(
      async () => (
        await this.prisma.v1TeamMembership.findMany({
          where: { teamId: { in: teamIds }, status: 'active', role: { in: ['owner', 'manager'] } },
          select: { userId: true },
        })
      ).map((membership) => membership.userId),
      type,
      teamMatchId,
      body,
    );
  }
}
