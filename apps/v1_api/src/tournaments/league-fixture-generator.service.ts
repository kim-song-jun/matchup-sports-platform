import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { generateRoundRobin } from '../common/scheduling/round-robin';
import { resolveFixtureStartAt, type FixtureScheduleTemplate } from '../team-match-series/round-robin-schedule';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { GenerateLeagueFixturesDto } from './dto/admin-league.dto';

export interface LeagueGenerationGuardInput {
  format: string;
  groupPhase: string;
  teamCount: number;
  existingFixtureCount: number;
  fixturesWithResultCount: number;
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
}): LeagueFixtureRow[] {
  const pairings = generateRoundRobin(input.registrationIds, {
    legs: input.legs,
    balanceHome: input.balanceHome,
  });
  return pairings.map((pairing, index) => ({
    groupId: input.groupId,
    round: `league_r${pairing.round}`,
    fixtureNumber: index + 1,
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
      include: { groupTeams: { select: { registrationId: true } } },
    });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '해당 대회의 조를 찾을 수 없어요.' });
    }

    const existingFixtures = await this.prisma.v1TournamentFixture.findMany({
      where: { groupId: group.id },
      select: { id: true, game: { select: { currentOfficialRevisionId: true } } },
    });
    const fixturesWithResultCount = existingFixtures.filter(
      (fixture) => fixture.game?.currentOfficialRevisionId != null,
    ).length;

    assertLeagueGenerationAllowed({
      format: tournament.format,
      groupPhase: group.phase,
      teamCount: group.groupTeams.length,
      existingFixtureCount: existingFixtures.length,
      fixturesWithResultCount,
      minMatchesPerTeam: tournament.minMatchesPerTeam,
      legs: dto.legs,
      replaceExisting: dto.replaceExisting ?? false,
    });

    const rows = buildLeagueFixtureRows({
      groupId: group.id,
      groupName: group.name,
      registrationIds: group.groupTeams.map((team) => team.registrationId),
      legs: dto.legs,
      balanceHome: dto.balanceHome ?? true,
      schedule: dto.schedule
        ? { startsOn: new Date(dto.schedule.startsOn), template: dto.schedule.template }
        : null,
    });

    const deleted = await this.prisma.$transaction(async (tx) => {
      let removed = 0;
      if (dto.replaceExisting && existingFixtures.length > 0) {
        const result = await tx.v1TournamentFixture.deleteMany({ where: { groupId: group.id } });
        removed = result.count;
      }
      await tx.v1TournamentFixture.createMany({
        data: rows.map((row) => ({
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
      return removed;
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
