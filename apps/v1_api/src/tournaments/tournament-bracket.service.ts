import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  V1CompetitionKind,
  V1GameSideKey,
  V1GameSourceType,
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
  CreateBracketByeDto,
  RecordResultDto,
  UpdateFixtureDto,
  UpdateBracketSourcesDto,
  UpdateGroupDto,
} from './dto/admin-bracket.dto';
import {
  ChangeTournamentCompetitionConfigDto,
  CompetitionConfigListQueryDto,
  CreateCompetitionConfigDto,
  CreateCompetitionConfigVersionDto,
  LineupSizeOptionsQueryDto,
} from './competition-config/competition-config.dto';
import {
  tryNormalizeCompetitionSportCode,
  validateCompetitionConfig,
} from './competition-config/competition-config';
import { CompetitionConfigRegistry } from './competition-config/competition-config-registry';
import { LineupSizeConfigResolver } from './competition-config/lineup-size-config-resolver';
import { canonicalCompetitionConfigForSport } from './competition-config/lineup-size';
import { TournamentCompetitionConfig } from './competition-config/tournament-competition-config';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';
import {
  resolveTournamentFixtureOfficialResult,
  type TournamentFixtureGameForResult,
} from './tournament-fixture-official-result';
import { cascadeCancelTeamMatchSchedulesInTx } from '../team-schedules/team-schedules.service';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from './tournament-surface-lookup';
import { createGroupInTx, ensureGroupPhaseTeamsInTx, recalculateStandingsInTx, updateTournamentFixtureInTx } from './tournament-bracket-tx';
import { participantDisplayName } from './participant-display-name';
import { readJerseyNumbers } from './tournament-player-jersey';
import { createTournamentMatchInTx } from './tournament-match-creation';
import { nextFixtureCreationCommandId } from './tournament-fixture-generation';
import { competitionTeamTargets, enqueueRosterResync } from '../games/roster/roster-resync-events';
import { tournamentTeamMatchBracketInclude, serializeTournamentTeamMatchBracket } from './tournament-team-match-bracket.query';
import { competitionMatchLabel } from './tournament-round-label';

type AdminBracketResult = {
  id: string;
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  hasPenalty: boolean;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  note: string | null;
  outcomeReason: string | null;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
  goals: unknown[];
} | null;

type AdminBracketFixture = ReturnType<typeof serializeTournamentTeamMatchBracket> & {
  result: AdminBracketResult;
  videos: Array<{ id: string; title: string | null; url: string; sortOrder: number }>;
};

@Injectable()
export class TournamentBracketService {
  private readonly competitionConfigs: CompetitionConfigRegistry;
  private readonly tournamentCompetitionConfig: TournamentCompetitionConfig;
  private readonly lineupSizeConfigResolver: LineupSizeConfigResolver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
  ) {
    this.competitionConfigs = new CompetitionConfigRegistry(prisma, adminContext);
    this.tournamentCompetitionConfig = new TournamentCompetitionConfig(prisma, adminContext);
    this.lineupSizeConfigResolver = new LineupSizeConfigResolver(prisma, adminContext);
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async loadTournament(tournamentId: string) {
    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    return tournament;
  }

  /**
   * 리그는 브래킷(토너먼트) 개념을 갖지 않는다.
   * 서버가 실제로 읽어 막지 않으면 관리자 화면에서 실수로 브래킷 액션을 눌렀을 때
   * 데이터가 조용히 뒤섞인다.
   *
   * ## `format` 만 보면 정규 리그 시즌에서 **항상 no-op 이었다**
   * 이 가드는 원래 `format !== 'league'` 하나만 봤다. 그런데 그것과
   * `kind === 'regular_league'` 는 **다른 질문**이다:
   * - `format` = 이 대회를 **어떻게 진행하는가**(리그 방식 / 조별+토너먼트)
   * - `kind`   = 이것이 **무엇인가**(단발 대회 / 정규 리그 시즌)
   *
   * 통합 백필(R3)이 만드는 리그 행은 `format` 을 **쓰지 않는다** — 그 값은 read-swap 이
   * 정할 것이라 비워 두기 때문이다. 그래서 스키마 기본값 `group_knockout` 이 들어가고,
   * 가드는 **리그 행에서 예외 없이 즉시 return** 했다(실측: 백필 create 는
   * id·sportId·title·kind·status·seriesId·tier·seasonNo·competitionConfigVersionId 9개만 쓴다).
   *
   * 데이터를 `format='league'` 로 채워 맞추지 않는다 — 그러면 **가드는 틀린 채로 우연히
   * 맞게 동작**하고, 두 개념이 갈리는 다음 지점에서 또 터진다. 질문을 둘 다 한다.
   *
   * **`kind: null`(R1 이전 행) 자체로는 리그로 판정하지 않는다.** 두 조건은 OR 이므로
   * `format === 'league'` 인 행은 `kind` 가 null 이어도 **여전히 리그로 취급된다** — 그건
   * 이 가드가 원래 하던 일이고 바뀌지 않는다. 이 수정이 더한 것은 `kind` 축 하나뿐이다.
   * null 을 리그 쪽에 묶었다면 `format` 이 리그가 아닌 옛 대회까지 리그 규칙에 걸려
   * **새 회귀**가 됐을 것이다.
   */
  private assertLeagueGroupShape(
    format: string,
    kind: V1CompetitionKind | null,
    phase: string,
    advanceCount?: number | null,
  ) {
    const isLeague = format === 'league' || kind === V1CompetitionKind.regular_league;
    if (!isLeague) return;
    // V1TournamentGroupPhase = 'group' | 'semi' | 'final' | 'third_place'.
    // 리그 대회는 조별리그만 갖고 브래킷(토너먼트) 단계를 갖지 않으므로 'group' 외
    // 나머지 phase(semi/final/third_place)는 전부 knockout 조로 간주해 막는다.
    if (phase !== 'group') {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_KNOCKOUT_GROUP_FORBIDDEN',
        message: '리그 대회에는 토너먼트 조를 만들 수 없어요.',
      });
    }
    if (advanceCount !== undefined && advanceCount !== null) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_ADVANCE_COUNT_FORBIDDEN',
        message: '리그 대회에는 진출 팀 수를 설정할 수 없어요.',
      });
    }
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

  /**
   * 대회 생성/수정 화면의 "출전 인원"·"교체 방식/횟수" 선택지 조회. sportId가 아직 경기
   * 설정 카탈로그에 없는 종목(football/futsal 외)이면 `supported: false` + 빈
   * options/substitutionModes를 돌려준다 — 없는 대형·모드를 지어내지 않고, 프론트는 이
   * 값을 보고 선택지 UI 자체를 숨긴다.
   */
  async getLineupSizeOptions(user: V1AuthUser, query: LineupSizeOptionsQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    const sport = await this.prisma.v1Sport.findUnique({ where: { id: query.sportId } });
    if (!sport) {
      throw new NotFoundException({ code: 'SPORT_NOT_FOUND', message: '종목을 찾을 수 없어요.' });
    }
    const normalizedSportCode = tryNormalizeCompetitionSportCode(sport.code);
    if (normalizedSportCode === null) {
      return {
        sportId: query.sportId,
        supported: false,
        options: [],
        defaultMaxPlayers: null,
        substitutionModes: [],
        defaultSubstitutionMode: null,
        defaultMaxSubstitutions: null,
        defaultPeriods: [],
      };
    }
    const canonical = canonicalCompetitionConfigForSport(normalizedSportCode);
    return {
      sportId: query.sportId,
      supported: true,
      options: this.lineupSizeConfigResolver.selectableLineupSizesForSportCode(normalizedSportCode),
      defaultMaxPlayers: canonical.lineup.maxPlayers,
      substitutionModes: this.lineupSizeConfigResolver.selectableSubstitutionModes(),
      defaultSubstitutionMode: canonical.lineup.substitutions,
      defaultMaxSubstitutions: canonical.lineup.maxSubstitutions,
      // 대회 생성 화면의 "경기 시간"(피리어드별 길이 — 전·후반 또는 단판) 기본값 — 연장은 정규 시간이 아니라 뺀다.
      defaultPeriods: canonical.periods
        .filter((period) => !period.extraTime)
        .map((period) => ({ label: period.label, durationMinutes: period.durationMinutes })),
    };
  }

  // ─── group ────────────────────────────────────────────────────────────────

  async createGroup(user: V1AuthUser, tournamentId: string, dto: CreateGroupDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const tournament = await this.loadTournament(tournamentId);
    this.assertLeagueGroupShape(tournament.format, tournament.kind, dto.phase ?? 'group', dto.advanceCount);

    const created = await this.prisma.$transaction((tx) =>
      createGroupInTx(tx, admin, tournamentId, {
        name: dto.name,
        phase: dto.phase ?? 'group',
        sortOrder: dto.sortOrder ?? 0,
        advanceCount: dto.advanceCount ?? null,
      }),
    );

    return this.serializeGroup(created);
  }

  // ─── group-team ───────────────────────────────────────────────────────────

  async createGroupTeam(user: V1AuthUser, tournamentId: string, dto: CreateGroupTeamDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.loadTournament(tournamentId);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${tournamentId}`}, 0))`;
      // 그룹이 해당 대회 소속인지 확인
      const group = await tx.v1TournamentGroup.findFirst({
        where: { id: dto.groupId, tournamentId },
      });
      if (!group) {
        throw new NotFoundException({
          code: 'GROUP_NOT_FOUND',
          message: '해당 대회의 조를 찾을 수 없어요.',
        });
      }

      if (dto.isBye && group.phase !== 'round12') {
        throw new BadRequestException({ code: 'BYE_PHASE_INVALID', message: '부전승은 12강 단계에서만 지정할 수 있어요.' });
      }
      if (group.phase === 'round12') {
        const assigned = await tx.v1TournamentGroupTeam.findMany({ where: { groupId: group.id } });
        const emptyByeCount = await tx.v1TournamentByeSlot.count({ where: { groupId: group.id } });
        if (assigned.length + emptyByeCount >= 12 || (dto.isBye && assigned.filter((team) => team.isBye).length + emptyByeCount >= 4)) {
          throw new ConflictException({ code: 'ROUND12_CAPACITY', message: '12강은 최대 12팀, 부전승은 최대 4팀이에요.' });
        }
      }

      // 등록이 해당 대회 소속 + confirmed 상태인지 확인
      await tx.$queryRaw`SELECT id FROM v1_tournament_registrations WHERE id = ${dto.registrationId} FOR UPDATE`;
      const registration = await tx.v1TournamentRegistration.findFirst({
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
      const existing = await tx.v1TournamentGroupTeam.findUnique({
        where: { groupId_registrationId: { groupId: dto.groupId, registrationId: dto.registrationId } },
      });
      if (existing) {
        throw new ConflictException({
          code: 'TEAM_ALREADY_IN_GROUP',
          message: '이미 해당 조에 배정된 팀이에요.',
        });
      }

      if (dto.isBye) {
        const booked = await tx.v1TournamentMatchDetails.findFirst({ where: {
          groupId: group.id,
          OR: [{ homeRegistrationId: dto.registrationId }, { awayRegistrationId: dto.registrationId }],
          teamMatch: { deletedAt: null },
        } });
        if (booked) throw new ConflictException({ code: 'BYE_TEAM_HAS_MATCH', message: '12강 경기에 배정된 팀은 부전승으로 지정할 수 없어요.' });
      }

      const groupTeam = await tx.v1TournamentGroupTeam.create({
        data: {
          groupId: dto.groupId,
          registrationId: dto.registrationId,
          isBye: dto.isBye ?? false,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.group_team.create',
          targetType: 'tournament_group_team',
          targetId: groupTeam.id,
          afterJson: { groupId: dto.groupId, registrationId: dto.registrationId, isBye: dto.isBye ?? false },
        },
        tx,
      );
      return groupTeam;
    });

    return this.serializeGroupTeam(created);
  }

  // ─── fixture ──────────────────────────────────────────────────────────────

  /** 부전승은 결과가 있는 경기 대신 라운드의 단독 진출 항목으로 저장한다. */
  async createBye(user: V1AuthUser, tournamentId: string, dto: CreateBracketByeDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.loadTournament(tournamentId);
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${tournamentId}`}, 0))`;
      const group = await tx.v1TournamentGroup.findFirst({ where: { id: dto.groupId, tournamentId } });
      if (!group) throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '해당 대회의 조를 찾을 수 없어요.' });
      const limits: Record<string, { teams: number; byes: number }> = {
        round12: { teams: 12, byes: 4 }, quarter: { teams: 8, byes: 4 }, semi: { teams: 4, byes: 2 },
      };
      const limit = limits[group.phase];
      if (!limit) throw new BadRequestException({ code: 'BYE_PHASE_INVALID', message: '부전승은 12강·8강·4강에서 등록할 수 있어요.' });
      if (dto.sortOrder >= (group.phase === 'semi' ? 4 : 8)) {
        throw new BadRequestException({ code: 'BYE_POSITION_INVALID', message: '해당 라운드의 대진표 위치 범위를 확인해 주세요.' });
      }
      const registrationId = dto.registrationId ?? null;
      const realAssigned = await tx.v1TournamentGroupTeam.findMany({ where: { groupId: group.id } });
      const emptySlots = await tx.v1TournamentByeSlot.findMany({ where: { groupId: group.id } });
      const assigned = [...realAssigned, ...emptySlots.map((slot) => ({ ...slot, registrationId: null, isBye: true }))];
      const existing = dto.byeId
        ? assigned.find((team) => team.id === dto.byeId && team.isBye)
        : registrationId ? assigned.find((team) => team.registrationId === registrationId) : undefined;
      if (dto.byeId && !existing) throw new NotFoundException({ code: 'BYE_NOT_FOUND', message: '해당 조의 부전승 자리를 찾을 수 없어요.' });
      if ((!existing && assigned.length >= limit.teams) || assigned.filter((team) => team.isBye && team.id !== existing?.id).length >= limit.byes) {
        throw new ConflictException({ code: 'BYE_CAPACITY', message: '해당 라운드의 팀 또는 부전승 정원을 초과했어요.' });
      }
      if (assigned.some((team) => team.isBye && team.id !== existing?.id && team.sortOrder === dto.sortOrder)) {
        throw new ConflictException({ code: 'BYE_POSITION_OCCUPIED', message: '이 위치에 이미 부전승 자리가 있어요.' });
      }
      if (registrationId) {
        await tx.$queryRaw`SELECT id FROM v1_tournament_registrations WHERE id = ${registrationId} FOR UPDATE`;
        const registration = await tx.v1TournamentRegistration.findFirst({ where: { id: registrationId, tournamentId } });
        if (!registration) throw new NotFoundException({ code: 'REGISTRATION_NOT_FOUND', message: '해당 대회의 신청을 찾을 수 없어요.' });
        if (registration.status !== 'confirmed') throw new ConflictException({ code: 'REGISTRATION_NOT_CONFIRMED', message: '확정된 신청만 부전승으로 등록할 수 있어요.' });
        const booked = await tx.v1TournamentMatchDetails.findFirst({ where: {
          tournamentId, group: { phase: group.phase },
          OR: [{ homeRegistrationId: registrationId }, { awayRegistrationId: registrationId }], teamMatch: { deletedAt: null },
        } });
        if (booked) throw new ConflictException({ code: 'BYE_TEAM_HAS_MATCH', message: '해당 라운드의 경기에 배정된 팀은 부전승으로 등록할 수 없어요.' });
        const duplicate = await tx.v1TournamentGroupTeam.findFirst({ where: {
          registrationId, group: { tournamentId, phase: group.phase }, NOT: { id: existing?.id ?? '' },
        } });
        if (duplicate) throw new ConflictException({ code: 'BYE_ALREADY_IN_ROUND', message: '이 팀은 해당 라운드에 이미 배정되어 있어요. 기존 배정을 먼저 해제해 주세요.' });
      }
      let row: Parameters<TournamentBracketService['serializeGroupTeam']>[0];
      if (registrationId) {
        if (existing?.registrationId === null) {
          row = await tx.v1TournamentGroupTeam.create({ data: { id: existing.id, groupId: group.id, registrationId, isBye: true, sortOrder: dto.sortOrder, createdAt: existing.createdAt } });
          await tx.v1TournamentByeSlot.delete({ where: { id: existing.id } });
        } else {
          row = existing
            ? await tx.v1TournamentGroupTeam.update({ where: { id: existing.id }, data: { registrationId, isBye: true, sortOrder: dto.sortOrder } })
            : await tx.v1TournamentGroupTeam.create({ data: { groupId: group.id, registrationId, isBye: true, sortOrder: dto.sortOrder } });
        }
      } else {
        const slot = existing?.registrationId === null
          ? await tx.v1TournamentByeSlot.update({ where: { id: existing.id }, data: { sortOrder: dto.sortOrder } })
          : await tx.v1TournamentByeSlot.create({ data: { ...(existing ? { id: existing.id, createdAt: existing.createdAt } : {}), groupId: group.id, sortOrder: dto.sortOrder } });
        if (existing?.registrationId) {
          await tx.v1TournamentGroupTeam.delete({ where: { id: existing.id } });
          await tx.v1TournamentStanding.deleteMany({ where: { groupId: group.id, registrationId: existing.registrationId } });
        }
        row = { ...slot, registrationId: null, isBye: true };
      }
      await this.adminContext.logAdminAction(admin, {
        action: 'tournament.bracket.bye.save', targetType: 'tournament_group_team', targetId: row.id,
        beforeJson: existing ? { registrationId: existing.registrationId, isBye: existing.isBye, sortOrder: existing.sortOrder } : undefined,
        afterJson: { tournamentId, groupId: group.id, phase: group.phase, registrationId: dto.registrationId ?? null, isBye: true, sortOrder: dto.sortOrder },
      }, tx);
      return row;
    });
    return this.serializeGroupTeam(saved);
  }

  async createFixture(user: V1AuthUser, tournamentId: string, dto: CreateFixtureDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const tournament = await this.loadTournament(tournamentId);

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
      venue: dto.venue ?? tournament.venue ?? null,
    };
    const durableCommandId = `tournament-fixture:${tournamentId}:${dto.round}:${dto.fixtureNumber}:${legNumber}`;
    const payloadHash = canonicalGameCommandPayloadHash(commandPayload);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${tournamentId}`}, 0))`;
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', durableCommandId);
      const group = dto.groupId
        ? await tx.v1TournamentGroup.findFirst({ where: { id: dto.groupId, tournamentId }, select: { name: true, phase: true } })
        : null;
      if (dto.groupId && group === null) {
        throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '해당 대회의 조를 찾을 수 없어요.' });
      }
      if (dto.groupId && group && ['round12', 'quarter', 'semi'].includes(group.phase)) {
        const byeTeam = await tx.v1TournamentGroupTeam.findFirst({ where: {
          groupId: dto.groupId, isBye: true,
          registrationId: { in: [dto.homeRegistrationId, dto.awayRegistrationId].filter((id): id is string => typeof id === 'string') },
        } });
        if (byeTeam) throw new ConflictException({ code: 'BYE_TEAM_HAS_MATCH', message: '부전승팀은 해당 라운드의 경기에 넣을 수 없어요. 다음 라운드에 직접 배정해 주세요.' });
      }
      const pinnedTournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
        where: { id: tournamentId, deletedAt: null },
        select: {
          id: true,
          sportId: true,
          regionId: true,
          title: true,
          venue: true,
          competitionConfigVersionId: true,
        },
      });
      if (!pinnedTournament?.competitionConfigVersionId) {
        throw new ConflictException({
          code: 'COMPETITION_CONFIG_REQUIRED',
          message: '대회 경기에는 활성 경기 규칙 버전이 필요해요.',
        });
      }

      let parentTeamMatchId: string | null = null;
      if (dto.parentFixtureId) {
        const canonicalParent = await tx.v1TournamentMatchDetails.findFirst({
          where: {
            tournamentId,
            teamMatchId: dto.parentFixtureId,
            teamMatch: { deletedAt: null },
          },
          select: { teamMatchId: true },
        });
        if (canonicalParent === null) {
          throw new NotFoundException({
            code: 'PARENT_MATCH_NOT_FOUND',
            message: '상위 대진을 찾을 수 없어요.',
          });
        }
        parentTeamMatchId = canonicalParent.teamMatchId;
      }

      const existingDetails = await tx.v1TournamentMatchDetails.findFirst({
        where: { tournamentId, round: dto.round, fixtureNumber: dto.fixtureNumber, legNumber },
        select: {
          teamMatchId: true,
          tournamentId: true,
          groupId: true,
          round: true,
          fixtureNumber: true,
          legNumber: true,
          parentTeamMatchId: true,
          homeRegistrationId: true,
          awayRegistrationId: true,
          teamMatch: {
            select: {
              id: true,
              tournamentId: true,
              hostTeamId: true,
              approvedApplicantTeamId: true,
              competitionConfigVersionId: true,
              game: { select: { sourceType: true, teamMatchId: true, competitionConfigVersionId: true, sides: { select: { sideKey: true, teamId: true } } } },
              startAt: true,
              placeName: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });
      if (existingDetails?.teamMatch) {
        const aggregate = existingDetails.teamMatch;
        if (aggregate.tournamentId !== tournamentId || aggregate.game === null ||
          aggregate.game.sourceType !== V1GameSourceType.TEAM_MATCH ||
          aggregate.game.teamMatchId !== aggregate.id ||
          aggregate.game.competitionConfigVersionId !== aggregate.competitionConfigVersionId ||
          aggregate.game.sides.length !== 2 ||
          !aggregate.game.sides.some((side) => side.sideKey === V1GameSideKey.HOME && side.teamId === aggregate.hostTeamId) ||
          !aggregate.game.sides.some((side) => side.sideKey === V1GameSideKey.AWAY && side.teamId === aggregate.approvedApplicantTeamId)) {
          throw new ConflictException({ code: 'TEAM_MATCH_IDEMPOTENCY_INCOMPLETE', message: '기존 대진 생성 기록이 완전하지 않아요.' });
        }
        const existingPayload = {
          tournamentId: existingDetails.tournamentId,
          groupId: existingDetails.groupId,
          round: existingDetails.round,
          fixtureNumber: existingDetails.fixtureNumber,
          legNumber: existingDetails.legNumber,
          parentFixtureId: existingDetails.parentTeamMatchId,
          homeRegistrationId: existingDetails.homeRegistrationId,
          awayRegistrationId: existingDetails.awayRegistrationId,
          scheduledAt: existingDetails.teamMatch.startAt?.toISOString() ?? null,
          venue: existingDetails.teamMatch.placeName,
        };
        if (canonicalGameCommandPayloadHash(existingPayload) !== payloadHash) {
          throw new ConflictException({
            code: 'COMMAND_IDEMPOTENCY_PAYLOAD_REUSE',
            message: '같은 경기 생성 키를 다른 내용으로 다시 사용할 수 없어요.',
          });
        }
        return {
          ...existingDetails.teamMatch,
          tournamentId: existingDetails.tournamentId,
          groupId: existingDetails.groupId,
          round: existingDetails.round,
          fixtureNumber: existingDetails.fixtureNumber,
          legNumber: existingDetails.legNumber,
          parentTeamMatchId: existingDetails.parentTeamMatchId,
          homeRegistrationId: existingDetails.homeRegistrationId,
          awayRegistrationId: existingDetails.awayRegistrationId,
        };
      }

      const archived = await tx.v1TournamentMatchDetails.findMany({
        where: { tournamentId, round: { startsWith: dto.round + ':deleted:' }, fixtureNumber: dto.fixtureNumber, legNumber, teamMatch: { deletedAt: { not: null } } },
        select: { teamMatchId: true },
      });
      const creationCommandId = await nextFixtureCreationCommandId(tx, durableCommandId, tournamentId, archived.length, user.id);
      const registrationIds = [dto.homeRegistrationId, dto.awayRegistrationId].filter(
        (registrationId): registrationId is string => registrationId !== null && registrationId !== undefined,
      );
      const registrations = await tx.v1TournamentRegistration.findMany({
        where: { id: { in: registrationIds }, tournamentId, status: 'confirmed' },
        include: {
          team: { select: { id: true, name: true } },
          players: {
            where: { removedAt: null },
            select: {
              id: true,
              userId: true,
              realName: true,
              registrationId: true,
              user: { select: { profile: { select: { nickname: true, displayName: true } } } },
            },
            orderBy: { id: 'asc' },
          },
        },
      });
      const registrationById = new Map(registrations.map((registration) => [registration.id, registration]));
      const home = dto.homeRegistrationId ? registrationById.get(dto.homeRegistrationId) : undefined;
      const away = dto.awayRegistrationId ? registrationById.get(dto.awayRegistrationId) : undefined;
      if (dto.homeRegistrationId && !home) {
        throw new BadRequestException({
          code: 'HOME_REGISTRATION_INVALID',
          message: '홈 팀 신청이 해당 대회에 존재하지 않거나 확정되지 않았어요.',
        });
      }
      if (dto.awayRegistrationId && !away) {
        throw new BadRequestException({
          code: 'AWAY_REGISTRATION_INVALID',
          message: '어웨이 팀 신청이 해당 대회에 존재하지 않거나 확정되지 않았어요.',
        });
      }

      if (dto.groupId && group) {
        await ensureGroupPhaseTeamsInTx(tx, admin, tournamentId, dto.groupId, group.phase, [dto.homeRegistrationId, dto.awayRegistrationId]);
      }

      const [homeJerseys, awayJerseys] = await Promise.all([
        home ? readJerseyNumbers(tx, home.id) : Promise.resolve(new Map<string, number>()),
        away ? readJerseyNumbers(tx, away.id) : Promise.resolve(new Map<string, number>()),
      ]);
      const creation = await createTournamentMatchInTx(tx, this.games, {
        tournamentId,
        groupId: dto.groupId ?? null,
        round: dto.round,
        fixtureNumber: dto.fixtureNumber,
        legNumber,
        parentTeamMatchId,
        homeRegistrationId: dto.homeRegistrationId ?? null,
        awayRegistrationId: dto.awayRegistrationId ?? null,
        sportId: pinnedTournament.sportId,
        regionId: pinnedTournament.regionId ?? null,
        title: `${pinnedTournament.title} · ${competitionMatchLabel({ groupName: group?.name, round: dto.round, legNumber })} ${dto.fixtureNumber}`,
        placeName: commandPayload.venue,
        startAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        createdByUserId: user.id,
        competitionConfigVersionId: pinnedTournament.competitionConfigVersionId,
        home: {
          id: home?.team.id ?? null,
          name: home?.team.name ?? '홈 팀 미정',
          participants: home?.players.map((player) => ({
            sourceParticipantId: player.id,
            userId: player.userId,
            sideKey: V1GameSideKey.HOME,
            displayNameSnapshot: participantDisplayName(player),
            jerseyNumber: homeJerseys.get(player.id),
          })),
        },
        away: {
          id: away?.team.id ?? null,
          name: away?.team.name ?? '어웨이 팀 미정',
          participants: away?.players.map((player) => ({
            sourceParticipantId: player.id,
            userId: player.userId,
            sideKey: V1GameSideKey.AWAY,
            displayNameSnapshot: participantDisplayName(player),
            jerseyNumber: awayJerseys.get(player.id),
          })),
        },
        actor: {
          actorType: 'USER',
          actorUserId: user.id,
          role: 'platform_ops',
          tournamentId,
        },
        durableCommandId: creationCommandId,
        payloadHash,
      });
      // 위 참가자 복사는 이 순간의 스냅샷이라, 신청 확정 타이밍이 어긋나거나 그 뒤로
      // 명단이 바뀌면 복사가 낡아진다. 양 팀의 명단 재계산 이벤트를 남겨 실제 신청 명단과
      // 다시 맞춘다 — 이미 같으면 no-op이다.
      await enqueueRosterResync(tx, competitionTeamTargets(tournamentId, [home?.team.id, away?.team.id]));
      const teamMatch = await tx.v1TeamMatch.findUniqueOrThrow({
        where: { id: creation.teamMatchId },
        select: {
          id: true,
          tournamentId: true,
          hostTeamId: true,
          approvedApplicantTeamId: true,
          startAt: true,
          placeName: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.fixture.create',
          targetType: 'team_match',
          targetId: teamMatch.id,
          afterJson: {
            tournamentId,
            round: dto.round,
            fixtureNumber: dto.fixtureNumber,
            status: teamMatch.status,
          },
        },
        tx,
      );
      return {
        ...teamMatch,
        tournamentId,
        groupId: dto.groupId ?? null,
        round: dto.round,
        fixtureNumber: dto.fixtureNumber,
        legNumber,
        parentTeamMatchId,
        homeRegistrationId: dto.homeRegistrationId ?? null,
        awayRegistrationId: dto.awayRegistrationId ?? null,
      };
    });

    return this.serializeCanonicalFixture(created);
  }

  /** Persist the next match's HOME/AWAY source. Existing result projection owns promotion. */
  async updateBracketSources(user: V1AuthUser, fixtureId: string, dto: UpdateBracketSourcesDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const initial = await this.prisma.v1TournamentMatchDetails.findUnique({ where: { teamMatchId: fixtureId }, select: { tournamentId: true } });
    if (!initial) throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
    await this.loadTournament(initial.tournamentId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${initial.tournamentId}`}, 0))`;
      const old = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { targetTeamMatchId: fixtureId } });
      const desired = (['HOME', 'AWAY'] as const).map((side) => ({ side, id: (side === 'HOME' ? dto.homeSourceFixtureId : dto.awaySourceFixtureId) === undefined
        ? old.find((edge) => edge.targetSide === side)?.sourceTeamMatchId ?? null
        : (side === 'HOME' ? dto.homeSourceFixtureId : dto.awaySourceFixtureId) ?? null }));
      const ids = [...new Set([fixtureId, ...old.map((edge) => edge.sourceTeamMatchId), ...desired.flatMap((source) => source.id ? [source.id] : [])])].sort();
      // Result projection locks the source Game before downstream Games. Validate
      // the phase graph before taking any locks, then use that same direction;
      // UUID ordering across phases can deadlock with officialization.
      const phases = await tx.v1TournamentMatchDetails.findMany({
        where: { tournamentId: initial.tournamentId, teamMatchId: { in: ids }, teamMatch: { deletedAt: null } },
        select: { teamMatchId: true, group: { select: { phase: true } } },
      });
      if (phases.length !== ids.length) throw new BadRequestException({ code: 'BRACKET_SOURCE_INVALID', message: '같은 대회의 삭제되지 않은 경기만 연결할 수 있어요.' });
      const sourcePhase: Record<string, string> = { quarter: 'round12', semi: 'quarter', final: 'semi', third_place: 'semi' };
      const targetPhase = phases.find((match) => match.teamMatchId === fixtureId)?.group?.phase;
      const upstreamIds = ids.filter((id) => id !== fixtureId);
      if (desired.some((source) => source.id === fixtureId) || upstreamIds.some((id) => {
        const phase = phases.find((match) => match.teamMatchId === id)?.group?.phase;
        return !targetPhase || !phase || phase !== sourcePhase[targetPhase];
      })) throw new BadRequestException({ code: 'BRACKET_SOURCE_PHASE_INVALID', message: '바로 이전 단계의 경기만 연결할 수 있어요. 3·4위전은 4강 패자를 연결해요.' });
      if (upstreamIds.length) await tx.$queryRaw`SELECT id FROM v1_games WHERE team_match_id IN (${Prisma.join(upstreamIds)}) ORDER BY id FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM v1_games WHERE team_match_id = ${fixtureId} FOR UPDATE`;
      await tx.$queryRaw`SELECT team_match_id FROM v1_tournament_match_details WHERE tournament_id = ${initial.tournamentId} AND team_match_id IN (${Prisma.join(ids)}) ORDER BY team_match_id FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM v1_team_matches WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
      const matches = await tx.v1TournamentMatchDetails.findMany({
        where: { tournamentId: initial.tournamentId, teamMatchId: { in: ids }, teamMatch: { deletedAt: null } },
        include: { group: { select: { phase: true } }, teamMatch: { select: { status: true, game: { select: { state: true, currentOfficialRevisionId: true } } } } },
      });
      if (matches.length !== ids.length) throw new BadRequestException({ code: 'BRACKET_SOURCE_INVALID', message: '같은 대회의 삭제되지 않은 경기만 연결할 수 있어요.' });
      if (matches.some((match) => match.legNumber !== 1 || match.parentTeamMatchId !== null || match.teamMatch.status !== 'matched' || match.teamMatch.game?.state !== 'SCHEDULED' || match.teamMatch.game.currentOfficialRevisionId !== null)) {
        throw new ConflictException({ code: 'BRACKET_SOURCE_LOCKED', message: '연결은 모든 대상 경기가 시작되기 전에 설정해 주세요. 홈·어웨이 2차전 연결은 지원하지 않아요.' });
      }
      const target = matches.find((match) => match.teamMatchId === fixtureId)!;
      const outcome = target.group?.phase === 'third_place' ? 'LOSER' as const : 'WINNER' as const;
      const picked = desired.filter((source): source is { side: 'HOME' | 'AWAY'; id: string } => source.id !== null);
      if (picked.length === 2 && picked[0].id === picked[1].id) throw new BadRequestException({ code: 'BRACKET_SOURCE_INVALID', message: '양쪽 자리에 같은 경기를 연결할 수 없어요.' });
      for (const source of picked) {
        const sourceMatch = matches.find((match) => match.teamMatchId === source.id)!;
        if (!target.group || sourceMatch.group?.phase !== sourcePhase[target.group.phase]) throw new BadRequestException({ code: 'BRACKET_SOURCE_PHASE_INVALID', message: '바로 이전 단계의 경기만 연결할 수 있어요. 3·4위전은 4강 패자를 연결해요.' });
        const registrationId = source.side === 'HOME' ? target.homeRegistrationId : target.awayRegistrationId;
        if (registrationId !== null) throw new ConflictException({ code: 'BRACKET_SOURCE_SLOT_ASSIGNED', message: '진출 경기를 연결할 자리는 팀을 미정으로 설정해 주세요.' });
        const occupied = await tx.v1TournamentMatchAdvancementEdge.findFirst({ where: { sourceTeamMatchId: source.id, sourceOutcome: outcome, targetTeamMatchId: { not: fixtureId } } });
        if (occupied) throw new ConflictException({ code: 'BRACKET_SOURCE_ALREADY_LINKED', message: '이미 다른 경기에 진출하도록 연결된 경기예요.' });
      }
      await tx.v1TournamentMatchAdvancementEdge.deleteMany({ where: { targetTeamMatchId: fixtureId } });
      for (const source of picked) await tx.v1TournamentMatchAdvancementEdge.create({ data: { tournamentId: initial.tournamentId, sourceTeamMatchId: source.id, sourceOutcome: outcome, targetTeamMatchId: fixtureId, targetSide: source.side } });
      const bracketSources = picked.map((source) => ({ fixtureId: source.id, side: source.side, outcome }));
      await this.adminContext.logAdminAction(admin, { action: 'tournament.bracket.sources.update', targetType: 'team_match', targetId: fixtureId, beforeJson: old, afterJson: bracketSources }, tx);
      return { fixtureId, bracketSources };
    });
  }

  /** 경기 일정·장소·대진(홈/어웨이) 수정. 결과가 기록된 경기는 팀 변경 불가(409). */
  async updateFixture(user: V1AuthUser, fixtureId: string, dto: UpdateFixtureDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const canonical = await this.prisma.v1TournamentMatchDetails.findUnique({
      where: { teamMatchId: fixtureId },
      select: {
        tournamentId: true,
        groupId: true,
        homeRegistrationId: true,
        awayRegistrationId: true,
        teamMatch: {
          select: {
            deletedAt: true,
            game: { select: { id: true, sourceType: true, state: true, currentOfficialRevision: { select: { state: true } } } },
          },
        },
      },
    });
    if (canonical !== null) {
      if (canonical.teamMatch.deletedAt !== null) {
        throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
      }
      if (canonical.teamMatch.game === null || canonical.teamMatch.game.sourceType !== V1GameSourceType.TEAM_MATCH) {
        throw new ConflictException({ code: 'TOURNAMENT_MATCH_GAME_MISSING', message: '대회 경기의 정본 게임을 찾을 수 없어요.' });
      }
      const changesTeams = dto.homeRegistrationId !== undefined || dto.awayRegistrationId !== undefined;
      if (changesTeams && (canonical.teamMatch.game.state !== 'SCHEDULED' || canonical.teamMatch.game.currentOfficialRevision?.state === 'OFFICIAL')) {
        throw new ConflictException({
          code: 'FIXTURE_HAS_RESULT',
          message: '진행 중이거나 결과가 확정된 경기는 팀을 바꿀 수 없어요. 결과를 먼저 처리해 주세요.',
        });
      }
      for (const [side, registrationId] of [['홈', dto.homeRegistrationId], ['어웨이', dto.awayRegistrationId]] as const) {
        if (registrationId === undefined || registrationId === null) continue;
        const registration = await this.prisma.v1TournamentRegistration.findFirst({
          where: { id: registrationId, tournamentId: canonical.tournamentId, status: 'confirmed' },
          select: { id: true },
        });
        if (registration === null) {
          throw new BadRequestException({
            code: side === '홈' ? 'HOME_REGISTRATION_INVALID' : 'AWAY_REGISTRATION_INVALID',
            message: `${side} 팀 신청이 해당 대회에 존재하지 않거나 확정되지 않았어요.`,
          });
        }
      }
      const requestedRegistrationIds = [dto.homeRegistrationId, dto.awayRegistrationId].filter(
        (registrationId): registrationId is string => registrationId !== undefined && registrationId !== null,
      );
      const requestedRegistrations = await this.prisma.v1TournamentRegistration.findMany({
        where: { id: { in: requestedRegistrationIds }, tournamentId: canonical.tournamentId, status: 'confirmed' },
        select: { id: true, teamId: true },
      });
      const requestedTeamIds = new Map(requestedRegistrations.map((registration) => [registration.id, registration.teamId]));
      const requestedHomeTeam = dto.homeRegistrationId === undefined || dto.homeRegistrationId === null ? null : requestedTeamIds.get(dto.homeRegistrationId);
      const requestedAwayTeam = dto.awayRegistrationId === undefined || dto.awayRegistrationId === null ? null : requestedTeamIds.get(dto.awayRegistrationId);
      const existingHomeTeam = canonical.homeRegistrationId === null ? null : (await this.prisma.v1TournamentRegistration.findUnique({ where: { id: canonical.homeRegistrationId }, select: { teamId: true } }))?.teamId ?? null;
      const existingAwayTeam = canonical.awayRegistrationId === null ? null : (await this.prisma.v1TournamentRegistration.findUnique({ where: { id: canonical.awayRegistrationId }, select: { teamId: true } }))?.teamId ?? null;
      if (
        (dto.homeRegistrationId !== undefined ? requestedHomeTeam : existingHomeTeam) !== null &&
        (dto.awayRegistrationId !== undefined ? requestedAwayTeam : existingAwayTeam) !== null &&
        (dto.homeRegistrationId !== undefined ? requestedHomeTeam : existingHomeTeam) ===
          (dto.awayRegistrationId !== undefined ? requestedAwayTeam : existingAwayTeam)
      ) {
        throw new BadRequestException({ code: 'FIXTURE_SAME_TEAM', message: '같은 팀끼리 경기를 만들 수 없어요.' });
      }
      const updated = await this.prisma.$transaction(async (tx) => {
        // Same lock as assignment/creation: a concurrent bye designation cannot
        // race between the participant check and the canonical match update.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${canonical.tournamentId}`}, 0))`;
        return updateTournamentFixtureInTx(tx, admin, {
          fixtureId,
          tournamentId: canonical.tournamentId,
          groupId: canonical.groupId,
          fixtureNumber: dto.fixtureNumber,
          scheduledAt: dto.scheduledAt !== undefined ? new Date(dto.scheduledAt) : undefined,
          venue: dto.venue,
          homeRegistrationId: dto.homeRegistrationId,
          awayRegistrationId: dto.awayRegistrationId,
        });
      });
      return this.serializeCanonicalFixture(updated);
    }
    throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
  }

  /** Hide an unstarted fixture while retaining its Game and append-only history. */
  async deleteFixture(user: V1AuthUser, fixtureId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const initial = await this.prisma.v1TournamentMatchDetails.findUnique({ where: { teamMatchId: fixtureId } });
    if (!initial) throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${initial.tournamentId}`}, 0))`;
      await tx.$queryRaw`SELECT id FROM v1_tournaments WHERE id = ${initial.tournamentId} FOR UPDATE`;
      const tournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, { where: { id: initial.tournamentId, deletedAt: null } });
      if (!tournament) throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
      await tx.$queryRaw`SELECT id FROM v1_games WHERE team_match_id = ${fixtureId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM v1_team_matches WHERE id = ${fixtureId} FOR UPDATE`;
      const canonical = await tx.v1TournamentMatchDetails.findUnique({ where: { teamMatchId: fixtureId },
        include: { tournament: true, teamMatch: { include: { game: true } } } });
      if (!canonical || canonical.teamMatch.deletedAt !== null) throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
      const game = canonical.teamMatch.game;
      if (!game || game.sourceType !== V1GameSourceType.TEAM_MATCH) throw new ConflictException({ code: 'TOURNAMENT_MATCH_GAME_MISSING', message: '대회 경기의 정본 TeamMatch 게임을 찾을 수 없어요.' });
      if (game.currentOfficialRevisionId !== null) throw new ConflictException({ code: 'FIXTURE_HAS_RESULT', message: '결과가 기록된 경기는 삭제할 수 없어요.' });
      if (!['draft', 'open', 'closed'].includes(canonical.tournament.status) || game.state !== 'SCHEDULED' || canonical.teamMatch.status !== 'matched') {
        throw new ConflictException({ code: 'FIXTURE_ALREADY_STARTED', message: '대회 시작 전의 아직 시작하지 않은 경기만 삭제할 수 있어요.' });
      }
      await tx.$queryRaw`SELECT g.id FROM v1_games g JOIN v1_tournament_match_advancement_edges e ON g.team_match_id = e.target_team_match_id WHERE e.source_team_match_id = ${fixtureId} ORDER BY g.id FOR UPDATE OF g`;
      const linked = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { sourceTeamMatchId: fixtureId }, include: { target: { include: { teamMatch: { include: { game: true } } } } } });
      if (linked.some((edge) => edge.target.homeRegistrationId !== null || edge.target.awayRegistrationId !== null || edge.target.teamMatch.game?.state !== 'SCHEDULED' || edge.target.teamMatch.game.currentOfficialRevisionId !== null)) {
        throw new ConflictException({ code: 'FIXTURE_DOWNSTREAM_ASSIGNED', message: '연결된 다음 경기의 팀 배정을 먼저 해제해 주세요. 시작된 다음 경기가 있으면 삭제할 수 없어요.' });
      }
      const children = await tx.v1TournamentMatchDetails.findMany({ where: { parentTeamMatchId: fixtureId, teamMatch: { deletedAt: null } }, select: { teamMatchId: true } });
      if (children.length) throw new ConflictException({ code: 'FIXTURE_HAS_CHILDREN', message: '연결된 하위 경기를 먼저 삭제해 주세요.' });
      await cascadeCancelTeamMatchSchedulesInTx(tx, fixtureId, 'admin_bracket_deleted_before_start');
      await tx.v1Game.update({ where: { id: game.id }, data: { state: 'CANCELLED', version: { increment: 1 } } });
      await tx.v1GameVisibilityPolicy.update({ where: { gameId: game.id }, data: { mode: 'STATUS_ONLY', lineupAt: null, version: { increment: 1 } } });
      await tx.v1TeamMatch.update({ where: { id: fixtureId }, data: { status: 'archived', deletedAt: new Date() } });
      await tx.v1TournamentMatchAdvancementEdge.deleteMany({ where: { OR: [{ sourceTeamMatchId: fixtureId }, { targetTeamMatchId: fixtureId }] } });
      // Free the original round/number unique key; the original identity is retained in the audit below.
      await tx.v1TournamentMatchDetails.update({ where: { teamMatchId: fixtureId }, data: { groupId: null, parentTeamMatchId: null, round: canonical.round + ':deleted:' + fixtureId } });
      await tx.v1StatusChangeLog.create({ data: { targetType: 'team_match', targetId: fixtureId, fromStatus: canonical.teamMatch.status, toStatus: 'archived', actorType: 'admin', actorUserId: user.id, reason: 'admin_bracket_deleted_before_start' } });
      await this.adminContext.logAdminAction(admin, { action: 'tournament.bracket.fixture.delete', targetType: 'team_match', targetId: fixtureId,
        beforeJson: { tournamentId: canonical.tournamentId, groupId: canonical.groupId, round: canonical.round, fixtureNumber: canonical.fixtureNumber, legNumber: canonical.legNumber },
        afterJson: { deleted: true, gameId: game.id, state: 'CANCELLED' } }, tx);
      return { deleted: true };
    });
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
    const group = await this.prisma.v1TournamentGroup.findUnique({
      where: { id: groupId },
      include: { tournament: { select: { format: true, kind: true } } },
    });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '조를 찾을 수 없어요.' });
    }
    this.assertLeagueGroupShape(group.tournament.format, group.tournament.kind, group.phase, dto.advanceCount);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${group.tournamentId}`}, 0))`;
      const previous = await tx.v1TournamentGroup.findUnique({ where: { id: groupId } });
      if (!previous) {
        throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '조를 찾을 수 없어요.' });
      }
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
          beforeJson: { name: previous.name, advanceCount: previous.advanceCount },
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
      include: { _count: { select: { groupTeams: true, byeSlots: true, tournamentMatchDetails: true } } },
    });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '조를 찾을 수 없어요.' });
    }
    if (group._count.groupTeams > 0 || (group._count.byeSlots ?? 0) > 0) {
      throw new ConflictException({
        code: 'GROUP_HAS_TEAMS',
        message: '조에 배정된 팀이 있어요. 팀 배정을 먼저 해제해 주세요.',
      });
    }
    if (group._count.tournamentMatchDetails > 0) {
      throw new ConflictException({
        code: 'GROUP_HAS_FIXTURES',
        message: '조에 연결된 경기가 있어요. 경기를 먼저 삭제해 주세요.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${group.tournamentId}`}, 0))`;
      const current = await tx.v1TournamentGroup.findUnique({
        where: { id: groupId },
        include: { _count: { select: { groupTeams: true, byeSlots: true, tournamentMatchDetails: true } } },
      });
      if (!current) {
        throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '조를 찾을 수 없어요.' });
      }
      if (current._count.groupTeams > 0 || (current._count.byeSlots ?? 0) > 0) {
        throw new ConflictException({ code: 'GROUP_HAS_TEAMS', message: '조에 배정된 팀이 있어요. 팀 배정을 먼저 해제해 주세요.' });
      }
      if (current._count.tournamentMatchDetails > 0) {
        throw new ConflictException({ code: 'GROUP_HAS_FIXTURES', message: '조에 연결된 경기가 있어요. 경기를 먼저 삭제해 주세요.' });
      }
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
    const assignedTeam = await this.prisma.v1TournamentGroupTeam.findUnique({
      where: { id: groupTeamId }, include: { group: { select: { tournamentId: true, phase: true } } },
    });
    const emptySlot = assignedTeam ? null : await this.prisma.v1TournamentByeSlot.findUnique({
      where: { id: groupTeamId }, include: { group: { select: { tournamentId: true, phase: true } } },
    });
    const groupTeam = assignedTeam ?? (emptySlot ? { ...emptySlot, registrationId: null } : null);
    if (!groupTeam) {
      throw new NotFoundException({ code: 'GROUP_TEAM_NOT_FOUND', message: '조 팀 배정을 찾을 수 없어요.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${groupTeam.group.tournamentId}`}, 0))`;
      const current = emptySlot
        ? await tx.v1TournamentByeSlot.findUnique({ where: { id: groupTeamId }, select: { id: true } })
        : await tx.v1TournamentGroupTeam.findUnique({ where: { id: groupTeamId }, select: { id: true } });
      if (!current) {
        throw new NotFoundException({ code: 'GROUP_TEAM_NOT_FOUND', message: '조 팀 배정을 찾을 수 없어요.' });
      }
      if (groupTeam.registrationId && groupTeam.group.phase === 'group') {
        const booked = await tx.v1TournamentMatchDetails.count({
          where: {
            groupId: groupTeam.groupId,
            OR: [{ homeRegistrationId: groupTeam.registrationId }, { awayRegistrationId: groupTeam.registrationId }],
            teamMatch: { deletedAt: null },
          },
        });
        if (booked > 0) {
          throw new ConflictException({
            code: 'GROUP_TEAM_HAS_FIXTURES',
            message: '이 조에 경기가 남아 있는 팀은 조 편성에서 뺄 수 없어요. 경기를 먼저 삭제하거나 팀을 바꿔 주세요.',
          });
        }
      }
      if (emptySlot) await tx.v1TournamentByeSlot.delete({ where: { id: groupTeamId } });
      else await tx.v1TournamentGroupTeam.delete({ where: { id: groupTeamId } });
      if (groupTeam.registrationId) await tx.v1TournamentStanding.deleteMany({
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
    const recalculated = await this.prisma.$transaction(async (tx) => {
      const { audit, ...result } = await recalculateStandingsInTx(tx, tournamentId);
      await this.adminContext.logAdminAction(
        admin,
        { action: 'tournament.bracket.standings.recalculate', targetType: 'tournament', targetId: tournamentId, afterJson: audit },
        tx,
      );
      return result;
    });

    return {
      tournamentId,
      groupCount: recalculated.groupCount,
      competitionConfigVersionId: recalculated.competitionConfigVersionId,
      recalculatedAt: recalculated.recalculatedAt.toISOString(),
    };
  }

  // ─── bracket view ─────────────────────────────────────────────────────────

  async getBracket(user: V1AuthUser, tournamentId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    const tournament = await this.loadTournament(tournamentId);

    const [groups, standings, canonicalMatches, canonicalTeamMatchCandidates] = await Promise.all([
      this.prisma.v1TournamentGroup.findMany({
        where: { tournamentId },
        include: {
          byeSlots: true,
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
      this.prisma.v1TournamentStanding.findMany({
        where: { group: { tournamentId } },
        include: {
          registration: {
            include: { team: { select: { name: true } } },
          },
        },
        orderBy: [{ groupId: 'asc' }, { position: 'asc' }],
      }),
      this.prisma.v1TournamentMatchDetails.findMany({
        where: { tournamentId, teamMatch: { deletedAt: null } },
        include: tournamentTeamMatchBracketInclude,
        orderBy: [{ round: 'asc' }, { fixtureNumber: 'asc' }, { legNumber: 'asc' }],
      }),
      (tournament.kind === 'regular_tournament' || tournament.kind === null)
        ? this.prisma.v1TeamMatch.findMany({
          where: { tournamentId, leagueId: null, deletedAt: null },
          select: { id: true },
        })
        : Promise.resolve([]),
    ]);

    const invalidCanonicalIds = canonicalMatches
      .filter((match) => {
        const game = match.teamMatch.game;
        return match.teamMatch.tournamentId !== tournamentId ||
          match.teamMatch.deletedAt !== null ||
          game === null ||
          game === undefined ||
          game.sourceType !== V1GameSourceType.TEAM_MATCH ||
          game.teamMatchId !== match.teamMatchId;
      })
      .map((match) => match.teamMatchId)
      .sort();
    if (invalidCanonicalIds.length > 0) {
      throw new ConflictException({
        code: 'TOURNAMENT_MATCH_GAME_MISSING',
        message: '대회 경기의 정본 TeamMatch 게임을 찾을 수 없어요.',
        details: { teamMatchIds: invalidCanonicalIds },
      });
    }

    const canonicalIds = new Set(canonicalMatches.map((match) => match.teamMatchId));
    const missingCanonicalDetailsIds = canonicalTeamMatchCandidates
      .map((teamMatch) => teamMatch.id)
      .filter((teamMatchId) => !canonicalIds.has(teamMatchId))
      .sort();
    if (missingCanonicalDetailsIds.length > 0) {
      throw new ConflictException({
        code: 'TOURNAMENT_MATCH_GAME_MISSING',
        message: '대회 경기의 정본 상세 정보를 찾을 수 없어요.',
        details: { teamMatchIds: missingCanonicalDetailsIds },
      });
    }
    const fixtureRows = new Map<string, AdminBracketFixture>();
    for (const match of canonicalMatches) {
      const game = match.teamMatch.game;
      if (game === null || game.sourceType !== V1GameSourceType.TEAM_MATCH) {
        // Kept as a local guard for TypeScript and for future query changes; the
        // batch validation above is the user-facing error path.
        throw new ConflictException({
          code: 'TOURNAMENT_MATCH_GAME_MISSING',
          message: '대회 경기의 정본 TeamMatch 게임을 찾을 수 없어요.',
          details: { teamMatchIds: [match.teamMatchId] },
        });
      }
      fixtureRows.set(match.teamMatchId, {
        ...serializeTournamentTeamMatchBracket(match),
        result: this.serializeOfficialResult(match.teamMatchId, game),
        videos: match.teamMatch.videos,
      });
    }

    return {
      groups: groups.map((g) => ({
        ...this.serializeGroup(g),
        groupTeams: [...g.groupTeams.map((gt) => ({
          ...this.serializeGroupTeam(gt),
          teamName: gt.registration.team.name,
        })), ...(g.byeSlots ?? []).map((slot) => ({ ...this.serializeGroupTeam({ ...slot, registrationId: null, isBye: true }), teamName: null }))],
      })),
      fixtures: [...fixtureRows.values()].sort((a, b) =>
        a.round.localeCompare(b.round) || a.fixtureNumber - b.fixtureNumber || a.legNumber - b.legNumber),
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

  private serializeGroupTeam(row: Omit<V1TournamentGroupTeam, 'registrationId'> & { registrationId: string | null }) {
    return {
      id: row.id,
      groupId: row.groupId,
      registrationId: row.registrationId,
      isBye: row.isBye,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Canonical bracket creation stores a TeamMatch + TournamentMatchDetails pair.
   * Keep the admin DTO stable while the canonical read path is authoritative.
   */
  private serializeCanonicalFixture(row: {
    id: string;
    tournamentId: string;
    groupId: string | null;
    round: string;
    fixtureNumber: number;
    legNumber: number;
    parentTeamMatchId: string | null;
    homeRegistrationId: string | null;
    awayRegistrationId: string | null;
    startAt: Date | null;
    placeName: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const status =
      row.status === 'completed'
        ? 'completed'
        : row.status === 'cancelled'
          ? 'cancelled'
          : 'scheduled';
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      groupId: row.groupId,
      round: row.round,
      fixtureNumber: row.fixtureNumber,
      legNumber: row.legNumber,
      parentFixtureId: row.parentTeamMatchId,
      homeRegistrationId: row.homeRegistrationId,
      awayRegistrationId: row.awayRegistrationId,
      scheduledAt: row.startAt?.toISOString() ?? null,
      venue: row.placeName,
      status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * 어드민 대진표(getBracket) 응답의 픽스처별 result 블록. canonical
   * (`V1Game.currentOfficialRevision`) 결과를 기존 fixture-shaped DTO로 변환한다.
   * 응답 필드 형태(스코어/승부차기/골 목록/note)는 레거시 serializeResult()/serializeGoal()과
   * 동일하게 유지한다 — 프런트가 이미 이 모양을 소비하고 있다(apps/v1_web/src/types/api.ts).
   *
   * `note`는 canonical revision에 연결된 immutable lineage note가 있으면 그 값을
   * 반환하고, 없으면 null이다. 정정 revision은 이전 lineage note를 임의로 되붙이지 않는다.
   */
  private serializeOfficialResult(
    fixtureId: string,
    game: TournamentFixtureGameForResult,
  ) {
    const resolved = resolveTournamentFixtureOfficialResult(game);
    if (!resolved) return null;
    return {
      id: resolved.revisionId,
      fixtureId,
      homeScore: resolved.score.homeScore,
      awayScore: resolved.score.awayScore,
      hasPenalty: resolved.score.hasPenalty,
      homePenaltyScore: resolved.score.homePenaltyScore,
      awayPenaltyScore: resolved.score.awayPenaltyScore,
      note: resolved.note,
      outcomeReason: resolved.outcomeReason,
      recordedAt: (resolved.officialAt ?? resolved.createdAt).toISOString(),
      createdAt: resolved.createdAt.toISOString(),
      updatedAt: resolved.updatedAt.toISOString(),
      goals: resolved.goals,
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
