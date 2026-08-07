import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  V1GameSideKey,
  V1GameSourceType,
  V1TournamentFixture,
  V1TournamentFixtureGoal,
  V1TournamentFixtureResult,
  V1TournamentFixtureVideo,
  V1TournamentGroup,
  V1TournamentGroupTeam,
  V1TournamentStanding,
} from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  CreateFixtureDto,
  CreateGroupDto,
  CreateGroupTeamDto,
  RecordResultDto,
  UpdateFixtureDto,
  UpdateGroupDto,
} from './dto/admin-bracket.dto';
import {
  ChangeTournamentCompetitionConfigDto,
  CompetitionConfigListQueryDto,
  CreateCompetitionConfigDto,
  CreateCompetitionConfigVersionDto,
} from './competition-config/competition-config.dto';
import {
  calculateCompetitionStandings,
  validateCompetitionConfig,
} from './competition-config/competition-config';
import { CompetitionConfigRegistry } from './competition-config/competition-config-registry';
import { TournamentCompetitionConfig } from './competition-config/tournament-competition-config';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';

@Injectable()
export class TournamentBracketService {
  private readonly competitionConfigs: CompetitionConfigRegistry;
  private readonly tournamentCompetitionConfig: TournamentCompetitionConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
  ) {
    this.competitionConfigs = new CompetitionConfigRegistry(prisma, adminContext);
    this.tournamentCompetitionConfig = new TournamentCompetitionConfig(prisma, adminContext);
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async loadTournament(tournamentId: string) {
    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    return tournament;
  }

  private async loadFixture(fixtureId: string): Promise<V1TournamentFixture> {
    const fixture = await this.prisma.v1TournamentFixture.findUnique({
      where: { id: fixtureId },
    });
    if (!fixture) {
      throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
    }
    return fixture;
  }

  async listCompetitionConfigs(user: V1AuthUser, query: CompetitionConfigListQueryDto) {
    return this.competitionConfigs.list(user, query);
  }

  async listCompetitionConfigVersions(user: V1AuthUser, configId: string) {
    return this.competitionConfigs.listVersions(user, configId);
  }

  async createCompetitionConfig(user: V1AuthUser, dto: CreateCompetitionConfigDto) {
    return this.competitionConfigs.create(user, dto);
  }

  async createCompetitionConfigVersion(
    user: V1AuthUser,
    configId: string,
    dto: CreateCompetitionConfigVersionDto,
  ) {
    return this.competitionConfigs.createVersion(user, configId, dto);
  }

  async changeTournamentCompetitionConfig(
    user: V1AuthUser,
    tournamentId: string,
    dto: ChangeTournamentCompetitionConfigDto,
  ) {
    return this.tournamentCompetitionConfig.change(user, tournamentId, dto);
  }

  // ─── group ────────────────────────────────────────────────────────────────

  async createGroup(user: V1AuthUser, tournamentId: string, dto: CreateGroupDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.loadTournament(tournamentId);

    const created = await this.prisma.$transaction(async (tx) => {
      const group = await tx.v1TournamentGroup.create({
        data: {
          tournamentId,
          name: dto.name,
          phase: dto.phase ?? 'group',
          sortOrder: dto.sortOrder ?? 0,
          advanceCount: dto.advanceCount ?? null,
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.group.create',
          targetType: 'tournament_group',
          targetId: group.id,
          afterJson: { tournamentId, name: group.name, phase: group.phase },
        },
        tx,
      );
      return group;
    });

    return this.serializeGroup(created);
  }

  // ─── group-team ───────────────────────────────────────────────────────────

  async createGroupTeam(user: V1AuthUser, tournamentId: string, dto: CreateGroupTeamDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.loadTournament(tournamentId);

    // 그룹이 해당 대회 소속인지 확인
    const group = await this.prisma.v1TournamentGroup.findFirst({
      where: { id: dto.groupId, tournamentId },
    });
    if (!group) {
      throw new NotFoundException({
        code: 'GROUP_NOT_FOUND',
        message: '해당 대회의 조를 찾을 수 없어요.',
      });
    }

    // 등록이 해당 대회 소속 + confirmed 상태인지 확인
    const registration = await this.prisma.v1TournamentRegistration.findFirst({
      where: { id: dto.registrationId, tournamentId },
    });
    if (!registration) {
      throw new NotFoundException({
        code: 'REGISTRATION_NOT_FOUND',
        message: '해당 대회의 신청을 찾을 수 없어요.',
      });
    }
    if (registration.status !== 'confirmed') {
      throw new ConflictException({
        code: 'REGISTRATION_NOT_CONFIRMED',
        message: '확정된 신청만 조에 배정할 수 있어요.',
      });
    }

    // 같은 group에 중복 배정 방지 (@@unique([groupId, registrationId]))
    const existing = await this.prisma.v1TournamentGroupTeam.findUnique({
      where: { groupId_registrationId: { groupId: dto.groupId, registrationId: dto.registrationId } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'TEAM_ALREADY_IN_GROUP',
        message: '이미 해당 조에 배정된 팀이에요.',
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const groupTeam = await tx.v1TournamentGroupTeam.create({
        data: {
          groupId: dto.groupId,
          registrationId: dto.registrationId,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.group_team.create',
          targetType: 'tournament_group_team',
          targetId: groupTeam.id,
          afterJson: { groupId: dto.groupId, registrationId: dto.registrationId },
        },
        tx,
      );
      return groupTeam;
    });

    return this.serializeGroupTeam(created);
  }

  // ─── fixture ──────────────────────────────────────────────────────────────

  async createFixture(user: V1AuthUser, tournamentId: string, dto: CreateFixtureDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.loadTournament(tournamentId);

    // groupId가 주어지면 해당 대회 소속인지 확인
    if (dto.groupId) {
      const group = await this.prisma.v1TournamentGroup.findFirst({
        where: { id: dto.groupId, tournamentId },
      });
      if (!group) {
        throw new NotFoundException({
          code: 'GROUP_NOT_FOUND',
          message: '해당 대회의 조를 찾을 수 없어요.',
        });
      }
    }

    // AGF-3: homeRegistrationId / awayRegistrationId 유효성 검증
    if (dto.homeRegistrationId !== undefined && dto.homeRegistrationId !== null) {
      const homeReg = await this.prisma.v1TournamentRegistration.findFirst({
        where: { id: dto.homeRegistrationId, tournamentId, status: 'confirmed' },
      });
      if (!homeReg) {
        throw new BadRequestException({
          code: 'HOME_REGISTRATION_INVALID',
          message: '홈 팀 신청이 해당 대회에 존재하지 않거나 확정되지 않았어요.',
        });
      }
    }
    if (dto.awayRegistrationId !== undefined && dto.awayRegistrationId !== null) {
      const awayReg = await this.prisma.v1TournamentRegistration.findFirst({
        where: { id: dto.awayRegistrationId, tournamentId, status: 'confirmed' },
      });
      if (!awayReg) {
        throw new BadRequestException({
          code: 'AWAY_REGISTRATION_INVALID',
          message: '어웨이 팀 신청이 해당 대회에 존재하지 않거나 확정되지 않았어요.',
        });
      }
    }
    if (
      dto.homeRegistrationId &&
      dto.awayRegistrationId &&
      dto.homeRegistrationId === dto.awayRegistrationId
    ) {
      throw new BadRequestException({
        code: 'FIXTURE_SAME_TEAM',
        message: '같은 팀끼리 경기를 만들 수 없어요.',
      });
    }

    const legNumber = dto.legNumber ?? 1;
    const commandPayload = {
      tournamentId,
      groupId: dto.groupId ?? null,
      round: dto.round,
      fixtureNumber: dto.fixtureNumber,
      legNumber,
      parentFixtureId: dto.parentFixtureId ?? null,
      homeRegistrationId: dto.homeRegistrationId ?? null,
      awayRegistrationId: dto.awayRegistrationId ?? null,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt).toISOString() : null,
      venue: dto.venue ?? null,
    };
    const durableCommandId = `tournament-fixture:${tournamentId}:${dto.round}:${dto.fixtureNumber}:${legNumber}`;
    const payloadHash = canonicalGameCommandPayloadHash(commandPayload);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${durableCommandId}, 0))`;
      const pinnedTournament = await tx.v1Tournament.findFirst({
        where: { id: tournamentId, deletedAt: null },
        select: { competitionConfigVersionId: true },
      });
      if (!pinnedTournament?.competitionConfigVersionId) {
        throw new ConflictException({
          code: 'COMPETITION_CONFIG_REQUIRED',
          message: '대회 경기에는 활성 경기 규칙 버전이 필요해요.',
        });
      }

      const existing = await tx.v1TournamentFixture.findFirst({
        where: { tournamentId, round: dto.round, fixtureNumber: dto.fixtureNumber, legNumber },
      });
      if (existing) {
        const existingPayload = {
          tournamentId: existing.tournamentId,
          groupId: existing.groupId,
          round: existing.round,
          fixtureNumber: existing.fixtureNumber,
          legNumber: existing.legNumber,
          parentFixtureId: existing.parentFixtureId,
          homeRegistrationId: existing.homeRegistrationId,
          awayRegistrationId: existing.awayRegistrationId,
          scheduledAt: existing.scheduledAt?.toISOString() ?? null,
          venue: existing.venue,
        };
        if (canonicalGameCommandPayloadHash(existingPayload) !== payloadHash) {
          throw new ConflictException({
            code: 'COMMAND_IDEMPOTENCY_PAYLOAD_REUSE',
            message: '같은 경기 생성 키를 다른 내용으로 다시 사용할 수 없어요.',
          });
        }
      }

      const fixture =
        existing ??
        (await tx.v1TournamentFixture.create({
          data: {
            tournamentId,
            groupId: dto.groupId ?? null,
            round: dto.round,
            fixtureNumber: dto.fixtureNumber,
            legNumber,
            parentFixtureId: dto.parentFixtureId ?? null,
            homeRegistrationId: dto.homeRegistrationId ?? null,
            awayRegistrationId: dto.awayRegistrationId ?? null,
            scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
            venue: dto.venue ?? null,
            status: 'scheduled',
            competitionConfigVersionId: pinnedTournament.competitionConfigVersionId,
          },
        }));

      const registrationIds = [fixture.homeRegistrationId, fixture.awayRegistrationId].filter(
        (registrationId): registrationId is string => registrationId !== null,
      );
      const registrations = await tx.v1TournamentRegistration.findMany({
        where: { id: { in: registrationIds }, tournamentId, status: 'confirmed' },
        include: {
          team: { select: { id: true, name: true } },
          players: {
            where: { removedAt: null },
            select: { id: true, realName: true, registrationId: true },
            orderBy: { id: 'asc' },
          },
        },
      });
      const registrationById = new Map(registrations.map((registration) => [registration.id, registration]));
      const home = fixture.homeRegistrationId
        ? registrationById.get(fixture.homeRegistrationId)
        : undefined;
      const away = fixture.awayRegistrationId
        ? registrationById.get(fixture.awayRegistrationId)
        : undefined;
      if (fixture.homeRegistrationId && !home) {
        throw new BadRequestException({
          code: 'HOME_REGISTRATION_INVALID',
          message: '홈 팀 신청이 해당 대회에 존재하지 않거나 확정되지 않았어요.',
        });
      }
      if (fixture.awayRegistrationId && !away) {
        throw new BadRequestException({
          code: 'AWAY_REGISTRATION_INVALID',
          message: '어웨이 팀 신청이 해당 대회에 존재하지 않거나 확정되지 않았어요.',
        });
      }

      await this.games.createFromSourceInTransaction(
        tx,
        {
          sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
          sourceId: fixture.id,
          competitionConfigVersionId: fixture.competitionConfigVersionId,
          sides: [
            {
              sideKey: V1GameSideKey.HOME,
              teamId: home?.team.id ?? null,
              displayNameSnapshot: home?.team.name ?? '홈 팀 미정',
            },
            {
              sideKey: V1GameSideKey.AWAY,
              teamId: away?.team.id ?? null,
              displayNameSnapshot: away?.team.name ?? '어웨이 팀 미정',
            },
          ],
          participants: [
            ...(home?.players ?? []).map((player) => ({
              sourceParticipantId: player.id,
              sideKey: V1GameSideKey.HOME,
              displayNameSnapshot: player.realName,
            })),
            ...(away?.players ?? []).map((player) => ({
              sourceParticipantId: player.id,
              sideKey: V1GameSideKey.AWAY,
              displayNameSnapshot: player.realName,
            })),
          ],
        },
        {
          actor: {
            actorType: 'USER',
            actorUserId: user.id,
            role: 'platform_ops',
            tournamentId,
            fixtureId: fixture.id,
          },
          expectedVersion: 0,
          durableCommandId,
          payloadHash,
        },
      );
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.fixture.create',
          targetType: 'tournament_fixture',
          targetId: fixture.id,
          afterJson: {
            tournamentId,
            round: fixture.round,
            fixtureNumber: fixture.fixtureNumber,
            status: fixture.status,
          },
        },
        tx,
      );
      return fixture;
    });

    return this.serializeFixture(created);
  }

  /** 경기 일정·장소·대진(홈/어웨이) 수정. 결과가 기록된 경기는 팀 변경 불가(409). */
  async updateFixture(user: V1AuthUser, fixtureId: string, dto: UpdateFixtureDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const fixture = await this.prisma.v1TournamentFixture.findUnique({
      where: { id: fixtureId },
      include: { result: true },
    });
    if (!fixture) {
      throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
    }

    const changesTeams = dto.homeRegistrationId !== undefined || dto.awayRegistrationId !== undefined;
    if (changesTeams && fixture.result) {
      throw new ConflictException({
        code: 'FIXTURE_HAS_RESULT',
        message: '결과가 기록된 경기는 팀을 바꿀 수 없어요. 결과를 먼저 삭제해 주세요.',
      });
    }
    const nextHome = dto.homeRegistrationId ?? fixture.homeRegistrationId;
    const nextAway = dto.awayRegistrationId ?? fixture.awayRegistrationId;
    if (nextHome && nextAway && nextHome === nextAway) {
      throw new BadRequestException({ code: 'FIXTURE_SAME_TEAM', message: '같은 팀끼리 경기를 만들 수 없어요.' });
    }
    for (const [side, regId] of [['홈', dto.homeRegistrationId], ['어웨이', dto.awayRegistrationId]] as const) {
      if (regId === undefined) continue;
      const reg = await this.prisma.v1TournamentRegistration.findFirst({
        where: { id: regId, tournamentId: fixture.tournamentId, status: 'confirmed' },
      });
      if (!reg) {
        throw new BadRequestException({
          code: side === '홈' ? 'HOME_REGISTRATION_INVALID' : 'AWAY_REGISTRATION_INVALID',
          message: `${side} 팀 신청이 해당 대회에 존재하지 않거나 확정되지 않았어요.`,
        });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.v1TournamentFixture.update({
        where: { id: fixtureId },
        data: {
          ...(dto.scheduledAt !== undefined ? { scheduledAt: new Date(dto.scheduledAt) } : {}),
          ...(dto.venue !== undefined ? { venue: dto.venue.trim() || null } : {}),
          ...(dto.homeRegistrationId !== undefined ? { homeRegistrationId: dto.homeRegistrationId } : {}),
          ...(dto.awayRegistrationId !== undefined ? { awayRegistrationId: dto.awayRegistrationId } : {}),
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.fixture.update',
          targetType: 'tournament_fixture',
          targetId: fixtureId,
          beforeJson: {
            scheduledAt: fixture.scheduledAt?.toISOString() ?? null,
            venue: fixture.venue,
            homeRegistrationId: fixture.homeRegistrationId,
            awayRegistrationId: fixture.awayRegistrationId,
          },
          afterJson: {
            scheduledAt: row.scheduledAt?.toISOString() ?? null,
            venue: row.venue,
            homeRegistrationId: row.homeRegistrationId,
            awayRegistrationId: row.awayRegistrationId,
          },
        },
        tx,
      );
      return row;
    });
    return this.serializeFixture(updated);
  }

  /** 경기 삭제. 결과가 있으면 먼저 결과 삭제를 요구한다(409). 영상은 경기와 함께 삭제(cascade). */
  async deleteFixture(user: V1AuthUser, fixtureId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const fixture = await this.prisma.v1TournamentFixture.findUnique({
      where: { id: fixtureId },
      include: { result: true },
    });
    if (!fixture) {
      throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
    }
    if (fixture.result) {
      throw new ConflictException({
        code: 'FIXTURE_HAS_RESULT',
        message: '결과가 기록된 경기예요. 결과를 먼저 삭제해 주세요.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.v1TournamentFixture.delete({ where: { id: fixtureId } });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.fixture.delete',
          targetType: 'tournament_fixture',
          targetId: fixtureId,
          beforeJson: { round: fixture.round, fixtureNumber: fixture.fixtureNumber, legNumber: fixture.legNumber },
        },
        tx,
      );
    });
    return { deleted: true };
  }

  async deleteFixtureResult(user: V1AuthUser, _fixtureId: string) {
    await this.adminContext.getMutationAdmin(user.id);
    throw new ConflictException({
      code: 'TOURNAMENT_RESULT_DERIVED_ONLY',
      message: '대회 결과는 삭제할 수 없고 Game 결과 리비전으로만 정정할 수 있어요.',
    });
  }

  /** 조 이름·진출 팀 수 수정. */
  async updateGroup(user: V1AuthUser, groupId: string, dto: UpdateGroupDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const group = await this.prisma.v1TournamentGroup.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '조를 찾을 수 없어요.' });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.v1TournamentGroup.update({
        where: { id: groupId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.advanceCount !== undefined ? { advanceCount: dto.advanceCount } : {}),
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.group.update',
          targetType: 'tournament_group',
          targetId: groupId,
          beforeJson: { name: group.name, advanceCount: group.advanceCount },
          afterJson: { name: row.name, advanceCount: row.advanceCount },
        },
        tx,
      );
      return row;
    });
    return this.serializeGroup(updated);
  }

  /** 조 삭제. 팀 배정·경기가 남아 있으면 실수 방지를 위해 409로 막는다. */
  async deleteGroup(user: V1AuthUser, groupId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const group = await this.prisma.v1TournamentGroup.findUnique({
      where: { id: groupId },
      include: { _count: { select: { groupTeams: true, fixtures: true } } },
    });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '조를 찾을 수 없어요.' });
    }
    if (group._count.groupTeams > 0) {
      throw new ConflictException({
        code: 'GROUP_HAS_TEAMS',
        message: '조에 배정된 팀이 있어요. 팀 배정을 먼저 해제해 주세요.',
      });
    }
    if (group._count.fixtures > 0) {
      throw new ConflictException({
        code: 'GROUP_HAS_FIXTURES',
        message: '조에 연결된 경기가 있어요. 경기를 먼저 삭제해 주세요.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.v1TournamentGroup.delete({ where: { id: groupId } });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.group.delete',
          targetType: 'tournament_group',
          targetId: groupId,
          beforeJson: { name: group.name, phase: group.phase },
        },
        tx,
      );
    });
    return { deleted: true };
  }

  /** 조 팀 배정 해제 — 해당 팀의 조 순위 행도 함께 정리한다. */
  async removeGroupTeam(user: V1AuthUser, groupTeamId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const groupTeam = await this.prisma.v1TournamentGroupTeam.findUnique({ where: { id: groupTeamId } });
    if (!groupTeam) {
      throw new NotFoundException({ code: 'GROUP_TEAM_NOT_FOUND', message: '조 팀 배정을 찾을 수 없어요.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.v1TournamentGroupTeam.delete({ where: { id: groupTeamId } });
      await tx.v1TournamentStanding.deleteMany({
        where: { groupId: groupTeam.groupId, registrationId: groupTeam.registrationId },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.group_team.remove',
          targetType: 'tournament_group_team',
          targetId: groupTeamId,
          beforeJson: { groupId: groupTeam.groupId, registrationId: groupTeam.registrationId },
        },
        tx,
      );
    });
    return { deleted: true };
  }

  // ─── result ───────────────────────────────────────────────────────────────

  async recordResult(user: V1AuthUser, _fixtureId: string, _dto: RecordResultDto) {
    await this.adminContext.getMutationAdmin(user.id);
    throw new ConflictException({
      code: 'TOURNAMENT_RESULT_DERIVED_ONLY',
      message: '대회 결과는 Game 종료 명령과 결과 리비전으로만 기록할 수 있어요.',
    });
  }
  async recalculateStandings(user: V1AuthUser, tournamentId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      include: { competitionConfig: true },
    });
    if (!tournament) {
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: '대회를 찾을 수 없어요.',
      });
    }
    const config = validateCompetitionConfig(tournament.competitionConfig);

    const groups = await this.prisma.v1TournamentGroup.findMany({
      where: { tournamentId, phase: 'group' },
      include: {
        groupTeams: {
          orderBy: { registrationId: 'asc' },
        },
        fixtures: {
          where: { status: 'completed' },
          include: { result: true },
        },
      },
    });
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const group of groups) {
        const standings = calculateCompetitionStandings({
          tournamentId,
          configVersionId: tournament.competitionConfigVersionId,
          registrationIds: group.groupTeams.map((team) => team.registrationId),
          fixtures: group.fixtures.flatMap((fixture) => {
            if (!fixture.result || !fixture.homeRegistrationId || !fixture.awayRegistrationId) {
              return [];
            }
            return [
              {
                homeRegistrationId: fixture.homeRegistrationId,
                awayRegistrationId: fixture.awayRegistrationId,
                homeScore: fixture.result.homeScore,
                awayScore: fixture.result.awayScore,
              },
            ];
          }),
          config,
        });

        for (const standing of standings) {
          await tx.v1TournamentStanding.upsert({
            where: {
              groupId_registrationId: {
                groupId: group.id,
                registrationId: standing.registrationId,
              },
            },
            create: {
              groupId: group.id,
              registrationId: standing.registrationId,
              points: standing.points,
              wins: standing.wins,
              draws: standing.draws,
              losses: standing.losses,
              goalsFor: standing.goalsFor,
              goalsAgainst: standing.goalsAgainst,
              position: standing.position,
              recalculatedAt: now,
            },
            update: {
              points: standing.points,
              wins: standing.wins,
              draws: standing.draws,
              losses: standing.losses,
              goalsFor: standing.goalsFor,
              goalsAgainst: standing.goalsAgainst,
              position: standing.position,
              recalculatedAt: now,
            },
          });
        }
      }

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.standings.recalculate',
          targetType: 'tournament',
          targetId: tournamentId,
          afterJson: {
            groupCount: groups.length,
            recalculatedAt: now.toISOString(),
            competitionConfigVersionId: tournament.competitionConfigVersionId,
          },
        },
        tx,
      );
    });

    return {
      tournamentId,
      groupCount: groups.length,
      competitionConfigVersionId: tournament.competitionConfigVersionId,
      recalculatedAt: now.toISOString(),
    };
  }

  // ─── bracket view ─────────────────────────────────────────────────────────

  async getBracket(user: V1AuthUser, tournamentId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    await this.loadTournament(tournamentId);

    const [groups, fixtures, standings] = await Promise.all([
      this.prisma.v1TournamentGroup.findMany({
        where: { tournamentId },
        include: {
          groupTeams: {
            include: {
              registration: {
                include: { team: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.v1TournamentFixture.findMany({
        where: { tournamentId },
        include: {
          result: { include: { goals: { orderBy: { createdAt: 'asc' } } } },
          videos: { orderBy: { sortOrder: 'asc' } },
          homeRegistration: {
            include: { team: { select: { name: true } } },
          },
          awayRegistration: {
            include: { team: { select: { name: true } } },
          },
        },
        orderBy: [{ round: 'asc' }, { fixtureNumber: 'asc' }],
      }),
      this.prisma.v1TournamentStanding.findMany({
        where: { group: { tournamentId } },
        include: {
          registration: {
            include: { team: { select: { name: true } } },
          },
        },
        orderBy: [{ groupId: 'asc' }, { position: 'asc' }],
      }),
    ]);

    return {
      groups: groups.map((g) => ({
        ...this.serializeGroup(g),
        groupTeams: g.groupTeams.map((gt) => ({
          ...this.serializeGroupTeam(gt),
          teamName: gt.registration.team.name,
        })),
      })),
      fixtures: fixtures.map((f) => ({
        ...this.serializeFixture(f),
        homeTeamName: f.homeRegistration?.team.name ?? 'TBD',
        awayTeamName: f.awayRegistration?.team.name ?? 'TBD',
        result: f.result
          ? {
              ...this.serializeResult(f.result),
              goals: f.result.goals.map((g) => this.serializeGoal(g)),
            }
          : null,
        videos: f.videos.map((v) => this.serializeVideo(v)),
      })),
      standings: standings.map((s) => ({
        ...this.serializeStanding(s),
        teamName: s.registration.team.name,
      })),
    };
  }

  // ─── serializers ──────────────────────────────────────────────────────────

  private serializeGroup(row: V1TournamentGroup) {
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      name: row.name,
      phase: row.phase,
      sortOrder: row.sortOrder,
      advanceCount: row.advanceCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeGroupTeam(row: V1TournamentGroupTeam) {
    return {
      id: row.id,
      groupId: row.groupId,
      registrationId: row.registrationId,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private serializeFixture(row: V1TournamentFixture) {
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      groupId: row.groupId,
      round: row.round,
      fixtureNumber: row.fixtureNumber,
      legNumber: row.legNumber,
      parentFixtureId: row.parentFixtureId,
      homeRegistrationId: row.homeRegistrationId,
      awayRegistrationId: row.awayRegistrationId,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      venue: row.venue,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeResult(row: V1TournamentFixtureResult) {
    return {
      id: row.id,
      fixtureId: row.fixtureId,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      hasPenalty: row.hasPenalty,
      homePenaltyScore: row.homePenaltyScore,
      awayPenaltyScore: row.awayPenaltyScore,
      note: row.note,
      recordedAt: row.recordedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeVideo(row: V1TournamentFixtureVideo) {
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      sortOrder: row.sortOrder,
    };
  }

  private serializeGoal(row: V1TournamentFixtureGoal) {
    return {
      id: row.id,
      team: row.team,
      playerId: row.playerId,
      playerName: row.playerName,
      minute: row.minute,
    };
  }

  private serializeStanding(row: V1TournamentStanding) {
    return {
      id: row.id,
      groupId: row.groupId,
      registrationId: row.registrationId,
      points: row.points,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalsFor - row.goalsAgainst,
      position: row.position,
      recalculatedAt: row.recalculatedAt?.toISOString() ?? null,
    };
  }
}
