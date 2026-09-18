import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { createTeamMatchScheduleInTx } from '../team-schedules/team-schedules.service';
import { CreateAdminAssignedTeamMatchDto } from './dto/create-admin-assigned-team-match.dto';
import { resolveTeamMatchCompetitionConfig } from './resolve-team-match-competition-config';

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
export class AdminAssignedTeamMatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: V1AuthUser, dto: CreateAdminAssignedTeamMatchDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    if (!dto.title.trim() || !dto.manualPlaceName.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '매치 제목과 경기 장소를 입력해 주세요.',
      });
    }
    if (dto.homeTeamId === dto.awayTeamId) {
      throw new UnprocessableEntityException({
        code: 'TEAM_MATCH_TEAMS_INVALID',
        message: '홈팀과 상대팀은 서로 다른 팀이어야 해요.',
      });
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt <= new Date()) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '경기 시작 시간은 현재보다 이후여야 해요.',
        details: { field: 'startsAt' },
      });
    }
    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '경기 종료 시간은 시작 시간보다 이후여야 해요.',
        details: { field: 'endsAt' },
      });
    }

    const [region, teams] = await Promise.all([
      this.prisma.v1Region.findFirst({
        where: { id: dto.regionId, isActive: true, level: 2 },
        select: { id: true },
      }),
      this.prisma.v1Team.findMany({
        where: {
          id: { in: [dto.homeTeamId, dto.awayTeamId] },
          status: 'active',
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          sportId: true,
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
      }),
    ]);
    if (!region) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '활성화된 시·군·구 지역을 선택해 주세요.',
        details: { field: 'regionId' },
      });
    }
    if (teams.length !== 2) {
      throw new UnprocessableEntityException({
        code: 'TEAM_MATCH_TEAMS_INVALID',
        message: '활성 상태인 두 팀만 매치에 지정할 수 있어요.',
      });
    }
    const teamsById = new Map(teams.map((team) => [team.id, team as AssignableTeam]));
    const home = teamsById.get(dto.homeTeamId)!;
    const away = teamsById.get(dto.awayTeamId)!;
    if (home.sportId !== away.sportId) {
      throw new UnprocessableEntityException({
        code: 'TEAM_MATCH_SPORT_MISMATCH',
        message: '같은 종목의 팀끼리만 매치를 만들 수 있어요.',
      });
    }

    const competitionConfig = await resolveTeamMatchCompetitionConfig(this.prisma, home.sportId);
    if (!competitionConfig) {
      throw new ConflictException({
        code: 'COMPETITION_CONFIG_REQUIRED',
        message: '이 종목에 활성 경기 설정이 없어 팀매치를 만들 수 없어요.',
      });
    }

    const payloadHash = canonicalGameCommandPayloadHash({ actorUserId: user.id, dto });
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin-team-match-create:${user.id}:${dto.clientCommandId}`}, 0))`;
      const existing = await tx.v1IdempotencyRecord.findFirst({
        where: {
          actorUserId: user.id,
          action: 'source_create',
          resourceType: V1GameSourceType.TEAM_MATCH,
          idempotencyKey: dto.clientCommandId,
        },
        select: { resourceId: true, payloadHash: true },
      });
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: '같은 요청 키로 다른 팀매치 정보를 제출할 수 없어요.',
          });
        }
        const teamMatch = await tx.v1TeamMatch.findUniqueOrThrow({ where: { id: existing.resourceId } });
        const game = await tx.v1Game.findUniqueOrThrow({ where: { teamMatchId: teamMatch.id } });
        return { teamMatch, gameId: game.id, replayed: true };
      }

      const teamMatch = await tx.v1TeamMatch.create({
        data: {
          hostTeamId: home.id,
          approvedApplicantTeamId: away.id,
          createdByUserId: admin.userId,
          sportId: home.sportId,
          regionId: dto.regionId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          placeName: dto.manualPlaceName.trim(),
          placeAddress: dto.addressText?.trim() || null,
          startAt: startsAt,
          endAt: endsAt,
          formatNote: dto.rulesText?.trim() || null,
          costNote: dto.costNote?.trim() || null,
          status: 'matched',
          competitionConfigVersionId: competitionConfig.id,
        },
      });
      const game = await this.games.createFromSourceInTransaction(
        tx,
        {
          sourceType: V1GameSourceType.TEAM_MATCH,
          sourceId: teamMatch.id,
          competitionConfigVersionId: competitionConfig.id,
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
      await tx.v1TeamMatchApplication.create({
        data: {
          teamMatchId: teamMatch.id,
          applicantTeamId: away.id,
          appliedByUserId: admin.userId,
          status: 'approved',
          reviewedByUserId: admin.userId,
          reviewedAt: new Date(),
          message: '플랫폼 운영자 직접 매칭',
        },
      });
      await createTeamMatchScheduleInTx(tx, home.id, teamMatch.id, teamMatch.title, startsAt, endsAt);
      await createTeamMatchScheduleInTx(tx, away.id, teamMatch.id, teamMatch.title, startsAt, endsAt);
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'team_match.assigned.create',
          targetType: 'team_match',
          targetId: teamMatch.id,
          reason: '플랫폼 운영자 직접 매칭',
          afterJson: {
            homeTeamId: home.id,
            awayTeamId: away.id,
            sportId: home.sportId,
            startAt: startsAt.toISOString(),
          } as Prisma.InputJsonValue,
          fromStatus: null,
          toStatus: 'matched',
        },
        tx,
      );
      return { teamMatch, gameId: game.gameId, replayed: false };
    });

    if (!created.replayed) {
      this.notifications.emitToManyDeferred(
        async () => [
          ...new Set(
            [...home.memberships, ...away.memberships]
              .filter((membership) => membership.role === 'owner' || membership.role === 'manager')
              .map((membership) => membership.userId),
          ),
        ],
        'team_match_application_approved',
        created.teamMatch.id,
        `운영자가 "${created.teamMatch.title}" 팀매치를 확정했어요.`,
      );
    }

    return {
      teamMatchId: created.teamMatch.id,
      gameId: created.gameId,
      status: created.teamMatch.status,
      homeTeamId: home.id,
      awayTeamId: away.id,
      detailRoute: `/team-matches/${created.teamMatch.id}`,
      replayed: created.replayed,
    };
  }

  private toParticipants(team: AssignableTeam, sideKey: V1GameSideKey) {
    return team.memberships.map((membership) => ({
      sourceParticipantId: membership.id,
      userId: membership.userId,
      sideKey,
      displayNameSnapshot:
        membership.user.profile?.nickname ?? membership.user.profile?.displayName ?? '팀원',
    }));
  }
}
