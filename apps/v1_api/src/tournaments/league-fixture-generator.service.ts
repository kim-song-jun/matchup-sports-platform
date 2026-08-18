import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { generateRoundRobin } from '../common/scheduling/round-robin';
import { resolveFixtureStartAt, type FixtureScheduleTemplate } from '../team-match-series/round-robin-schedule';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { GenerateLeagueFixturesDto } from './dto/admin-league.dto';
import { hasTournamentFixtureOfficialResult } from './tournament-fixture-official-result';

export interface LeagueGenerationGuardInput {
  format: string;
  groupPhase: string;
  teamCount: number;
  existingFixtureCount: number;
  fixturesWithResultCount: number;
  /** Game 이 연결된 fixture 수. Restrict FK 때문에 이런 fixture 는 삭제할 수 없다. */
  fixturesWithGameCount: number;
  minMatchesPerTeam: number | null;
  legs: number;
  replaceExisting: boolean;
}

/** 한 팀이 치르는 경기 수 = (참가팀 수 - 1) × 회전 수. */
export function matchesPerTeam(teamCount: number, legs: number): number {
  return Math.max(teamCount - 1, 0) * legs;
}

export function assertLeagueGenerationAllowed(input: LeagueGenerationGuardInput): void {
  if (input.format !== 'league') {
    throw new UnprocessableEntityException({
      code: 'TOURNAMENT_NOT_LEAGUE',
      message: '리그 대회에서만 리그 대진을 생성할 수 있어요.',
    });
  }
  if (input.groupPhase !== 'group') {
    throw new UnprocessableEntityException({
      code: 'LEAGUE_GROUP_PHASE_INVALID',
      message: '리그 대진은 조별 단계에서만 생성할 수 있어요.',
    });
  }
  if (input.teamCount < 2) {
    throw new UnprocessableEntityException({
      code: 'LEAGUE_TEAMS_INSUFFICIENT',
      message: '조에 배정된 팀이 2팀 이상이어야 대진을 만들 수 있어요.',
    });
  }
  if (!input.replaceExisting && input.existingFixtureCount > 0) {
    throw new ConflictException({
      code: 'LEAGUE_FIXTURES_ALREADY_EXIST',
      message: '이미 대진이 있어요. 다시 만들려면 기존 대진을 교체해주세요.',
    });
  }
  if (input.replaceExisting && input.fixturesWithResultCount > 0) {
    throw new ConflictException({
      code: 'LEAGUE_FIXTURES_HAVE_RESULTS',
      message: '결과가 확정된 경기가 있어 대진을 다시 만들 수 없어요.',
    });
  }
  // 결과가 없어도 Game 이 연결돼 있으면 지울 수 없다. `V1Game.tournamentFixtureId` 는
  // `onDelete: Restrict`(schema.prisma) 라서 deleteMany 가 FK 위반으로 터지고 500 이 된다
  // (2026-08-17 alpha 실측: liveStatus=live 인 조별 fixture 가 있는 조에서 재현).
  // Restrict 는 라인업·이벤트·결과 리비전을 지키려는 의도된 보호이므로 우회하지 않고
  // 무엇을 먼저 정리해야 하는지 알려준다.
  if (input.replaceExisting && input.fixturesWithGameCount > 0) {
    throw new ConflictException({
      code: 'LEAGUE_FIXTURES_HAVE_GAMES',
      message: '경기 기록이 연결된 대진이 있어 다시 만들 수 없어요. 해당 경기를 먼저 정리해주세요.',
      fixturesWithGameCount: input.fixturesWithGameCount,
    });
  }
  const perTeam = matchesPerTeam(input.teamCount, input.legs);
  if (input.minMatchesPerTeam !== null && perTeam < input.minMatchesPerTeam) {
    const requiredLegs = Math.ceil(input.minMatchesPerTeam / Math.max(input.teamCount - 1, 1));
    throw new UnprocessableEntityException({
      code: 'LEAGUE_MIN_MATCHES_NOT_MET',
      message: `최소 ${input.minMatchesPerTeam}경기를 보장하려면 회전 수를 ${requiredLegs} 이상으로 설정해주세요.`,
      requiredLegs,
      currentMatchesPerTeam: perTeam,
    });
  }
}

export interface LeagueFixtureRow {
  groupId: string;
  round: string;
  fixtureNumber: number;
  legNumber: number;
  homeRegistrationId: string;
  awayRegistrationId: string;
  startAt: Date | null;
}

export function buildLeagueFixtureRows(input: {
  groupId: string;
  groupName: string;
  registrationIds: readonly string[];
  legs: number;
  balanceHome: boolean;
  schedule: { startsOn: Date; template: FixtureScheduleTemplate } | null;
  /**
   * 대회 전체에서 fixtureNumber가 연속 증가해야 하는 관례를 지키기 위한 오프셋.
   * `@@unique([tournamentId, round, fixtureNumber, legNumber])` 제약 때문에, 같은 대회의
   * 다른 조가 이미 만든 fixtureNumber와 겹치면 안 된다(F3). 호출부가 대회 전체의 현재
   * max fixtureNumber를 넘겨준다. 생략 시 0(기존 동작과 동일하게 1부터 시작).
   */
  fixtureNumberOffset?: number;
}): LeagueFixtureRow[] {
  const offset = input.fixtureNumberOffset ?? 0;
  const pairings = generateRoundRobin(input.registrationIds, {
    legs: input.legs,
    balanceHome: input.balanceHome,
  });
  return pairings.map((pairing, index) => ({
    groupId: input.groupId,
    round: `league_r${pairing.round}`,
    fixtureNumber: offset + index + 1,
    legNumber: pairing.leg,
    homeRegistrationId: pairing.homeId,
    awayRegistrationId: pairing.awayId,
    startAt: input.schedule
      ? resolveFixtureStartAt(input.schedule.startsOn, pairing.round, input.schedule.template)
      : null,
  }));
}

@Injectable()
export class LeagueFixtureGeneratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async generate(user: V1AuthUser, tournamentId: string, dto: GenerateLeagueFixturesDto) {
    await this.adminContext.getMutationAdmin(user.id);

    const tournament = await this.prisma.v1Tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, format: true, minMatchesPerTeam: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    const group = await this.prisma.v1TournamentGroup.findFirst({
      where: { id: dto.groupId, tournamentId },
      include: { groupTeams: { select: { registrationId: true, sortOrder: true } } },
    });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '해당 대회의 조를 찾을 수 없어요.' });
    }

    // F1: DB 반환 순서는 정렬 순서를 보장하지 않는다. 라운드로빈 커널의 홈 균형
    // tie-break(pickHomeByBalance)가 입력 순서에 의존하므로, sortOrder(동률이면
    // registrationId)로 명시 정렬해 대진 생성이 실행마다 흔들리지 않게 한다.
    const sortedRegistrationIds = [...group.groupTeams]
      .sort((a, b) => a.sortOrder - b.sortOrder || (a.registrationId < b.registrationId ? -1 : a.registrationId > b.registrationId ? 1 : 0))
      .map((team) => team.registrationId);

    // F2: `game?.currentOfficialRevisionId != null` 만으로는 결과 확정 여부를 정확히
    // 판정할 수 없다(VOID 리비전에도 값이 있을 수 있고, 레거시 result-only 픽스처는
    // 놓친다). `hasTournamentFixtureOfficialResult`가 이 판정의 단일 기준이다.
    const existingFixtures = await this.prisma.v1TournamentFixture.findMany({
      where: { groupId: group.id },
      select: {
        id: true,
        game: { select: { id: true, currentOfficialRevision: { select: { state: true } } } },
        result: { select: { id: true } },
      },
    });
    const fixturesWithResultCount = existingFixtures.filter((fixture) =>
      hasTournamentFixtureOfficialResult(fixture.game, fixture.result),
    ).length;
    const fixturesWithGameCount = existingFixtures.filter((fixture) => fixture.game != null).length;

    assertLeagueGenerationAllowed({
      format: tournament.format,
      groupPhase: group.phase,
      teamCount: group.groupTeams.length,
      existingFixtureCount: existingFixtures.length,
      fixturesWithResultCount,
      fixturesWithGameCount,
      minMatchesPerTeam: tournament.minMatchesPerTeam,
      legs: dto.legs,
      replaceExisting: dto.replaceExisting ?? false,
    });

    const schedule = dto.schedule
      ? { startsOn: new Date(dto.schedule.startsOn), template: dto.schedule.template }
      : null;

    // F3: fixtureNumber는 대회 전체에서 연속 증가해야 한다
    // (`@@unique([tournamentId, round, fixtureNumber, legNumber])`) — 조가 2개 이상이면
    // 각 조가 1부터 매기던 기존 방식은 unique 위반으로 createMany가 실패한다. 트랜잭션
    // 안에서(replaceExisting이면 삭제 이후) 대회 전체 max fixtureNumber를 조회해 오프셋을
    // 준다. rows도 이 오프셋이 정해진 뒤에야 확정되므로 트랜잭션 안에서 빌드한다.
    const { deleted, rows } = await this.prisma.$transaction(async (tx) => {
      let removed = 0;
      if (dto.replaceExisting && existingFixtures.length > 0) {
        const result = await tx.v1TournamentFixture.deleteMany({ where: { groupId: group.id } });
        removed = result.count;
      }

      const maxFixtureNumber = await tx.v1TournamentFixture.aggregate({
        where: { tournamentId },
        _max: { fixtureNumber: true },
      });
      const fixtureNumberOffset = maxFixtureNumber._max.fixtureNumber ?? 0;

      const builtRows = buildLeagueFixtureRows({
        groupId: group.id,
        groupName: group.name,
        registrationIds: sortedRegistrationIds,
        legs: dto.legs,
        balanceHome: dto.balanceHome ?? true,
        schedule,
        fixtureNumberOffset,
      });

      await tx.v1TournamentFixture.createMany({
        data: builtRows.map((row) => ({
          tournamentId,
          groupId: row.groupId,
          round: row.round,
          fixtureNumber: row.fixtureNumber,
          legNumber: row.legNumber,
          homeRegistrationId: row.homeRegistrationId,
          awayRegistrationId: row.awayRegistrationId,
          scheduledAt: row.startAt,
        })),
      });
      return { deleted: removed, rows: builtRows };
    });

    const warnings: Array<{ code: string; message: string }> = [];
    if (!dto.schedule) {
      warnings.push({ code: 'SCHEDULE_NOT_SET', message: '경기 일시가 지정되지 않았어요.' });
    }
    if (group.groupTeams.length % 2 !== 0) {
      warnings.push({ code: 'ODD_TEAM_COUNT_BYE', message: '팀 수가 홀수라 라운드마다 한 팀이 쉬어요.' });
    }

    return {
      created: rows.length,
      deleted,
      perTeamMatches: matchesPerTeam(group.groupTeams.length, dto.legs),
      rounds: rows.length === 0 ? 0 : new Set(rows.map((r) => r.round)).size,
      warnings,
    };
  }
}
