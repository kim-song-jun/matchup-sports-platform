import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  V1CompetitionKind,
  V1GameSideKey,
  V1GameSourceType,
  V1TournamentFixture,
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
  hasTournamentFixtureOfficialResult,
  resolveTournamentFixtureOfficialResult,
  type TournamentFixtureGameForResult,
  type TournamentFixtureLegacyResult,
} from './tournament-fixture-official-result';
import {
  describeFixtureDeleteBlockers,
  restrictedFixtureDeleteBlockers,
} from './league-fixture-generator.service';
import {
  fairPlayByRegistrationFromGroups,
  recalculateAndUpsertGroupStandings,
} from './tournament-group-standings';
import { recalculateAndUpsertOverallStandings } from './tournament-overall-standings';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from './tournament-surface-lookup';

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
    };
  }

  // ─── group ────────────────────────────────────────────────────────────────

  async createGroup(user: V1AuthUser, tournamentId: string, dto: CreateGroupDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const tournament = await this.loadTournament(tournamentId);
    this.assertLeagueGroupShape(tournament.format, tournament.kind, dto.phase ?? 'group', dto.advanceCount);

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
      const pinnedTournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
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

      // fixture may be a pre-existing row created before this fixture's own
      // competitionConfigVersionId was backfilled (that column is nullable
      // until the deferred contract-phase migration lands — see
      // docs/ops/task9-competition-config-contract-phase.md); pinnedTournament
      // having one above does not guarantee this specific fixture row does.
      if (!fixture.competitionConfigVersionId) {
        throw new ConflictException({
          code: 'COMPETITION_CONFIG_REQUIRED',
          message: '대회 경기에는 활성 경기 규칙 버전이 필요해요.',
        });
      }

      const registrationIds = [fixture.homeRegistrationId, fixture.awayRegistrationId].filter(
        (registrationId): registrationId is string => registrationId !== null,
      );
      const registrations = await tx.v1TournamentRegistration.findMany({
        where: { id: { in: registrationIds }, tournamentId, status: 'confirmed' },
        include: {
          team: { select: { id: true, name: true } },
          players: {
            where: { removedAt: null },
            // userId 는 초기 라인업 참가자를 등록 명단의 그 사람과 잇는 열쇠다 — 이름만
            // 넘기면 동명이인을 구분할 수 없어 나중에 라인업 화면이 선발 표시를 엉뚱한
            // 사람에게 붙인다(V1GameParticipant.userId, 2026-08 추가).
            select: { id: true, userId: true, realName: true, registrationId: true },
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
              userId: player.userId,
              sideKey: V1GameSideKey.HOME,
              displayNameSnapshot: player.realName,
            })),
            ...(away?.players ?? []).map((player) => ({
              sourceParticipantId: player.id,
              userId: player.userId,
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
      include: {
        game: {
          select: {
            currentOfficialRevision: { select: { state: true } },
            // 팀 배정이 바뀌면 이 사이드들의 teamId 도 함께 옮겨야 한다 — 아래 트랜잭션 참고.
            id: true,
            sides: { select: { id: true, sideKey: true, teamId: true } },
          },
        },
        // R3 §4-3단계 한시적 레거시 폴백 입력 — hasTournamentFixtureOfficialResult()가
        // 새 경로에 OFFICIAL 리비전이 없을 때만 이 존재 여부를 본다. §4-4단계에서 제거.
        result: { select: { id: true } },
      },
    });
    if (!fixture) {
      throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
    }

    const changesTeams = dto.homeRegistrationId !== undefined || dto.awayRegistrationId !== undefined;
    // 결과가 확정된 경기의 팀 변경을 막는 가드. 신규 경로(V1Game) 자체에는 이 경기의 팀
    // 변경을 막는 코드가 없으므로(games.service.ts 어디에도 없음을 확인했다) 여기서
    // 신규 경로 우선 + 레거시 폴백(officialize된 결과 유무) 기준으로 판정한다 --
    // 레거시 결과만 있는(game 백필 전) 픽스처의 팀을 바꿀 수 있게 되면 안 되므로 폴백도
    // 반드시 반영한다.
    //
    // (이 주석은 원래 "이 메서드는 V1Game.sides를 절대 건드리지 않는다"로 시작했는데,
    //  그 뒤 아래 sideTeamUpdates 블록이 추가되면서 사실과 어긋나게 됐다. 그 서술을
    //  걷어냈다 -- 지금 이 가드가 지키는 것은 "결과가 있으면 팀을 못 바꾼다"이고,
    //  팀이 바뀔 때 사이드가 함께 옮겨간다는 것은 아래 블록이 설명한다.)
    if (changesTeams && hasTournamentFixtureOfficialResult(fixture.game, fixture.result)) {
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

    /* 팀 배정이 바뀌면 V1GameSide 도 같이 옮긴다.
     *
     * 예전에는 이 메서드가 fixture 의 home/awayRegistrationId 만 고치고 sides 는 그대로 뒀다.
     * 그래서 TBD(팀 미정)로 만든 결선 경기에 나중에 팀을 배정하면, fixture 에는 팀이 붙는데
     * side.teamId 는 계속 null 로 남았다. 라인업 접근 판정(games.service 의
     * resolveFixtureLineupAccess)은 `side.teamId === actor.teamId` 로 내 사이드를 찾으므로,
     * 배정된 팀의 매니저조차 mySideId 를 못 받아 "권한이 없어요"만 보게 되고 — 라인업이 없으면
     * 경기 시작도 막히므로 그 경기를 진행할 방법이 아예 사라졌다.
     * 8강 결과 확정 → 4강 자동 배정 경로도 fixture 만 갱신하므로 같은 상태를 만든다.
     *
     * 결과가 확정된 경기의 팀 변경은 위 FIXTURE_HAS_RESULT 가드가 이미 막았으므로, 여기 도달한
     * 시점의 사이드 갱신은 아직 결과가 없는 경기에 한정된다. */
    const sideTeamUpdates: Array<{ sideId: string; teamId: string; teamName: string }> = [];
    if (changesTeams && fixture.game !== null) {
      const pairs = [
        { sideKey: V1GameSideKey.HOME, regId: dto.homeRegistrationId },
        { sideKey: V1GameSideKey.AWAY, regId: dto.awayRegistrationId },
      ] as const;
      for (const { sideKey, regId } of pairs) {
        if (!regId) continue; // undefined(미변경) 와 null(배정 해제) 은 사이드를 건드리지 않는다
        const side = fixture.game.sides.find((s) => s.sideKey === sideKey);
        if (!side) continue;
        const reg = await this.prisma.v1TournamentRegistration.findUnique({
          where: { id: regId },
          select: { team: { select: { id: true, name: true } } },
        });
        if (!reg) continue; // 위 검증 루프가 이미 존재·확정을 확인했다
        if (side.teamId === reg.team.id) continue;
        sideTeamUpdates.push({ sideId: side.id, teamId: reg.team.id, teamName: reg.team.name });
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
      for (const update of sideTeamUpdates) {
        await tx.v1GameSide.update({
          where: { id: update.sideId },
          data: { teamId: update.teamId, displayNameSnapshot: update.teamName },
        });
        /* 사이드의 팀이 바뀌면 그 사이드에 걸려 있던 전술보드는 주인이 없어진다.
         *
         * 전술보드(V1TeamTacticsBoard)는 sideId 로 붙어 있고 자기 teamId 를 따로 들고 있다
         * (V1GameSide.teamId 가 게스트 상대를 위해 nullable 이라 복합 FK 를 걸 수 없었다).
         * 그래서 여기서 지우지 않으면 옛 팀의 배치가 새 팀 자리에 그대로 남는다 —
         * 읽기 쪽 불변식 검사(team-tactics-board.service.ts)가 409 로 막아 주지만, 그건
         * 마지막 방어이지 정상 상태가 아니다. 아무도 그 보드를 고칠 수 없어 그 경기의
         * 전술보드가 영구히 잠긴다.
         *
         * 지우는 것이 옳은 이유: 새 팀은 그 보드를 만든 적이 없고, 옛 팀은 이제 이 경기에
         * 없다. 결과가 있는 경기의 팀 변경은 위 FIXTURE_HAS_RESULT 가드가 이미 막으므로
         * 기록에 영향이 가는 경우도 없다. 엔트리는 boardId FK 의 CASCADE 로 함께 지워진다.
         *
         * delete 가 아니라 deleteMany 인 이유는 보드가 없는 사이드가 정상이기 때문이다
         * (아직 아무도 전술을 짜지 않은 경기 — delete 는 그때 P2025 로 트랜잭션을 깬다). */
        await tx.v1TeamTacticsBoard.deleteMany({ where: { sideId: update.sideId } });
      }
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

  /**
   * 경기 삭제. 결과가 있으면 먼저 결과 삭제를 요구한다(409). 영상은 경기와 함께 삭제(cascade).
   *
   * **경기(`V1Game`)·운영 감사 기록·스태프 배정이 붙은 대진은 지울 수 없다.** 셋 다
   * `onDelete: Restrict` 이고, 그중 감사 기록은 append-only 트리거까지 걸려 있어 어떤 순서로도
   * 떼어낼 수 없다(근거는 `league-fixture-generator.service.ts` 상단 주석). 예전에는 이 경우
   * `delete()` 가 그대로 FK 위반을 던져 운영자가 원인 없는 500 을 봤다 — 대회 경기는 이제
   * 만들어질 때 항상 게임과 `GAME_CREATED` 감사를 동반하므로 흔한 경로다. 무엇이 막고 있는지
   * 이름을 붙여 409 로 돌려준다.
   */
  async deleteFixture(user: V1AuthUser, fixtureId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const fixture = await this.prisma.v1TournamentFixture.findUnique({
      where: { id: fixtureId },
      select: {
        round: true,
        fixtureNumber: true,
        legNumber: true,
        game: { select: { id: true, currentOfficialRevision: { select: { state: true } } } },
        // R3 §4-3단계 한시적 레거시 폴백 입력 — updateFixture()와 동일한 이유. §4-4단계에서 제거.
        result: { select: { id: true } },
        _count: { select: { operationAudits: true, staffScopes: true } },
      },
    });
    if (!fixture) {
      throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
    }
    // (a)와 동일한 이유로 신규 경로 우선 + 레거시 폴백 기준으로 다시 판정한다 -- "결과가
    // 확정된 경기는 지울 수 없다"는 계약을 레거시 결과만 있는 픽스처에서도 그대로 유지한다.
    if (hasTournamentFixtureOfficialResult(fixture.game, fixture.result)) {
      throw new ConflictException({
        code: 'FIXTURE_HAS_RESULT',
        message: '결과가 기록된 경기예요. 결과를 먼저 삭제해 주세요.',
      });
    }
    const blockers = restrictedFixtureDeleteBlockers(fixture);
    if (blockers.length > 0) {
      throw new ConflictException({
        code: 'FIXTURE_NOT_DELETABLE',
        message:
          `${describeFixtureDeleteBlockers(blockers)}이 남아 있어 이 경기를 지울 수 없어요. ` +
          '팀이나 일시를 바꾸려면 "수정" 을 이용해주세요.',
        details: { reasons: blockers },
      });
    }
    await this.prisma.$transaction(async (tx) => {
      // 위 판정과 이 삭제 사이에 다른 요청이 경기를 붙일 수 있다. where 에 전제를 다시 적어
      // (CAS) 그런 경우 0건이 지워지게 하고, 0건이면 롤백한다 — 그대로 delete() 를 부르면
      // 같은 상황이 매핑 없는 FK 위반 500 이 된다.
      const deleted = await tx.v1TournamentFixture.deleteMany({
        where: {
          id: fixtureId,
          game: { is: null },
          operationAudits: { none: {} },
          staffScopes: { none: {} },
        },
      });
      if (deleted.count !== 1) {
        throw new ConflictException({
          code: 'FIXTURE_NOT_DELETABLE',
          message: '다른 요청이 방금 이 경기를 바꿨어요. 새로고침한 뒤 다시 시도해주세요.',
        });
      }
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
    const group = await this.prisma.v1TournamentGroup.findUnique({
      where: { id: groupId },
      include: { tournament: { select: { format: true, kind: true } } },
    });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '조를 찾을 수 없어요.' });
    }
    this.assertLeagueGroupShape(group.tournament.format, group.tournament.kind, group.phase, dto.advanceCount);
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
    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
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
    // validateCompetitionConfig() above already throws when
    // tournament.competitionConfig is null, and competitionConfig/
    // competitionConfigVersionId are always set together — this guard just
    // gives TypeScript the same narrowing (the column is nullable until the
    // deferred contract-phase migration lands; see
    // docs/ops/task9-competition-config-contract-phase.md) without a
    // non-null assertion.
    if (!tournament.competitionConfigVersionId) {
      throw new ConflictException({
        code: 'COMPETITION_CONFIG_REQUIRED',
        message: '대회 경기에는 활성 경기 규칙 버전이 필요해요.',
      });
    }
    // Narrowed into a local binding rather than relying on
    // tournament.competitionConfigVersionId directly, since TypeScript does
    // not carry a property-access narrowing into the $transaction callback
    // closure below.
    const competitionConfigVersionId = tournament.competitionConfigVersionId;

    const groups = await this.prisma.v1TournamentGroup.findMany({
      where: { tournamentId, phase: 'group' },
      include: {
        groupTeams: {
          orderBy: { registrationId: 'asc' },
        },
        fixtures: {
          where: { status: 'completed' },
          include: {
            game: {
              select: {
                currentOfficialRevision: {
                  select: {
                    state: true,
                    score: true,
                    // F5: 페어플레이 벌점 원천(팀별 카드 집계용). 신규 경로 픽스처에만 있다 —
                    // tournament-group-standings.ts의 fairPlayByRegistrationFromGroups() 참고.
                    resultParticipants: { select: { sideId: true, cards: true } },
                  },
                },
                // F5: participant.sideId → home/away 매핑용.
                sides: { select: { id: true, sideKey: true } },
              },
            },
            // R3 §4-3단계 한시적 레거시 폴백 입력 — standingsFixturesFromGroup()이 새 경로에
            // OFFICIAL 리비전이 없는 픽스처(game 백필 전)만 이 스코어로 대체한다. §4-4단계에서 제거.
            result: {
              select: { homeScore: true, awayScore: true, hasPenalty: true, homePenaltyScore: true, awayPenaltyScore: true },
            },
          },
        },
      },
    });
    const now = new Date();
    // F5: 페어플레이 벌점 — 모든 조의 픽스처를 넘겨 한 번에 집계한 registrationId
    // → 벌점 Map을 그룹별 upsert와 통합 upsert 양쪽에 그대로 넘긴다(그룹 픽스처는
    // 조별로 분리돼 있으므로 그룹 하나만 넘겨 계산해도 값은 동일하다).
    const fairPlayByRegistration = fairPlayByRegistrationFromGroups(groups);

    await this.prisma.$transaction(async (tx) => {
      for (const group of groups) {
        // Calculation + upsert extracted to tournament-group-standings.ts —
        // shared verbatim with the automatic per-result trigger
        // (GameResultStandingsProjectionService), which recalculates just
        // the one affected group instead of looping every group.
        await recalculateAndUpsertGroupStandings(
          tx,
          { tournamentId, configVersionId: competitionConfigVersionId, config, group, fairPlayByRegistration },
          now,
        );
      }

      // Invariant: every path that calls recalculateAndUpsertGroupStandings
      // must also call recalculateAndUpsertOverallStandings in the same tx,
      // so the group view and the overall (통합) view never drift. This
      // route already has every group-phase group loaded above, so it can
      // feed them straight in.
      await recalculateAndUpsertOverallStandings(
        tx,
        { tournamentId, configVersionId: competitionConfigVersionId, config, groups, fairPlayByRegistration },
        now,
      );

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.standings.recalculate',
          targetType: 'tournament',
          targetId: tournamentId,
          afterJson: {
            groupCount: groups.length,
            recalculatedAt: now.toISOString(),
            competitionConfigVersionId,
          },
        },
        tx,
      );
    });

    return {
      tournamentId,
      groupCount: groups.length,
      competitionConfigVersionId,
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
          game: {
            select: {
              sides: { select: { id: true, sideKey: true } },
              // `userId` -- 대회 전체에서 안정적인 득점자 신원 판정에 필요(같은 팀 동명이인을
              // 이름만으로 합치는 결함 방지, tournament-fixture-official-result.ts의
              // playerUserId 주석 참고). public-tournament-records.service.ts가 이미 같은
              // 목적으로 select 하는 필드다.
              participants: { select: { id: true, sideId: true, userId: true, displayNameSnapshot: true } },
              currentOfficialRevision: {
                // `outcomeReason` -- 몰수·중단을 정상 종료와 구분해 통계 집계에서 다르게
                // 취급하기 위한 것(tournament-statistics-tab.tsx 소비). public-tournament-
                // records.service.ts의 FIXTURE_SCHEDULE_SELECT와 동일한 필드.
                select: { id: true, state: true, score: true, goalEvents: true, outcomeReason: true, officialAt: true, createdAt: true, updatedAt: true },
              },
              events: {
                where: { OR: [{ type: { in: ['GOAL', 'OWN_GOAL'] } }, { reversesEventId: { not: null } }] },
                // `payload`는 골 이벤트 백필의 `minuteKnown: false` 표식용 --
                // tournaments-read.query.ts의 같은 인라인 select와 정확히 일치해야 한다
                // (tournament-fixture-official-result.ts 하단 주석 참고).
                select: { id: true, type: true, sideId: true, participantId: true, clockMs: true, reversesEventId: true, payload: true },
              },
            },
          },
          // R3 §4-3단계 한시적 레거시 폴백 입력 — serializeOfficialResult()가 새 경로에
          // OFFICIAL 리비전이 없는 픽스처만 이 결과로 대체한다. §4-4단계에서 제거.
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
        result: this.serializeOfficialResult(f.id, f.game, f.result),
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

  /**
   * 어드민 대진표(getBracket) 응답의 픽스처별 result 블록 -- 신규 경로
   * (`V1Game.currentOfficialRevision`)를 우선하고, 새 경로에 OFFICIAL 리비전이 없을
   * 때만(game 백필 전 등) 레거시 `V1TournamentFixtureResult`/`V1TournamentFixtureGoal`로
   * 폴백한다(R3 §4-3~§4-4단계 사이 한시적 — resolveTournamentFixtureOfficialResult() 참고).
   * 응답 필드 형태(스코어/승부차기/골 목록/note)는 레거시 serializeResult()/serializeGoal()과
   * 동일하게 유지한다 — 프런트가 이미 이 모양을 소비하고 있다(apps/v1_web/src/types/api.ts).
   *
   * `note`는 새 경로에서 조립된 결과일 때만 항상 null이다(신규 리비전에 대응 컬럼이 없어
   * 재현 불가 — docs/ops/legacy-game-result-r3-removal-inventory.md 관련 작업 보고 참고).
   * 레거시 폴백 결과는 레거시 note를 그대로 보존한다.
   */
  private serializeOfficialResult(
    fixtureId: string,
    game: TournamentFixtureGameForResult,
    legacyResult: TournamentFixtureLegacyResult,
  ) {
    const resolved = resolveTournamentFixtureOfficialResult(game, legacyResult ?? undefined);
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

  private serializeVideo(row: V1TournamentFixtureVideo) {
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      sortOrder: row.sortOrder,
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
