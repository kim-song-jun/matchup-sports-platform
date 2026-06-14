import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  V1TournamentFixture,
  V1TournamentFixtureResult,
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
} from './dto/admin-bracket.dto';

@Injectable()
export class TournamentBracketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async loadTournament(tournamentId: string) {
    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament was not found' });
    }
    return tournament;
  }

  private async loadFixture(fixtureId: string): Promise<V1TournamentFixture> {
    const fixture = await this.prisma.v1TournamentFixture.findUnique({
      where: { id: fixtureId },
    });
    if (!fixture) {
      throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: 'Fixture was not found' });
    }
    return fixture;
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
        message: 'Group was not found in this tournament',
      });
    }

    // 등록이 해당 대회 소속 + confirmed 상태인지 확인
    const registration = await this.prisma.v1TournamentRegistration.findFirst({
      where: { id: dto.registrationId, tournamentId },
    });
    if (!registration) {
      throw new NotFoundException({
        code: 'REGISTRATION_NOT_FOUND',
        message: 'Registration was not found in this tournament',
      });
    }
    if (registration.status !== 'confirmed') {
      throw new ConflictException({
        code: 'REGISTRATION_NOT_CONFIRMED',
        message: 'Only confirmed registrations can be assigned to a group',
      });
    }

    // 같은 group에 중복 배정 방지 (@@unique([groupId, registrationId]))
    const existing = await this.prisma.v1TournamentGroupTeam.findUnique({
      where: { groupId_registrationId: { groupId: dto.groupId, registrationId: dto.registrationId } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'TEAM_ALREADY_IN_GROUP',
        message: 'This registration is already assigned to the group',
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
          message: 'Group was not found in this tournament',
        });
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const fixture = await tx.v1TournamentFixture.create({
        data: {
          tournamentId,
          groupId: dto.groupId ?? null,
          round: dto.round,
          fixtureNumber: dto.fixtureNumber,
          legNumber: dto.legNumber ?? 1,
          parentFixtureId: dto.parentFixtureId ?? null,
          homeRegistrationId: dto.homeRegistrationId ?? null,
          awayRegistrationId: dto.awayRegistrationId ?? null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          venue: dto.venue ?? null,
          status: 'scheduled',
        },
      });
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

  // ─── result ───────────────────────────────────────────────────────────────

  async recordResult(user: V1AuthUser, fixtureId: string, dto: RecordResultDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const fixture = await this.loadFixture(fixtureId);

    // 승부차기(hasPenalty) 시 penalty 점수 양쪽 모두 필수
    if (dto.hasPenalty) {
      if (dto.homePenaltyScore === undefined || dto.awayPenaltyScore === undefined) {
        throw new BadRequestException({
          code: 'PENALTY_SCORES_REQUIRED',
          message: 'homePenaltyScore and awayPenaltyScore are required when hasPenalty is true',
        });
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // V1TournamentFixtureResult upsert (fixtureId unique)
      const fixtureResult = await tx.v1TournamentFixtureResult.upsert({
        where: { fixtureId },
        create: {
          fixtureId,
          homeScore: dto.homeScore,
          awayScore: dto.awayScore,
          hasPenalty: dto.hasPenalty ?? false,
          homePenaltyScore: dto.hasPenalty ? (dto.homePenaltyScore ?? null) : null,
          awayPenaltyScore: dto.hasPenalty ? (dto.awayPenaltyScore ?? null) : null,
          note: dto.note ?? null,
          recordedByAdminUserId: admin.id,
          recordedAt: new Date(),
        },
        update: {
          homeScore: dto.homeScore,
          awayScore: dto.awayScore,
          hasPenalty: dto.hasPenalty ?? false,
          homePenaltyScore: dto.hasPenalty ? (dto.homePenaltyScore ?? null) : null,
          awayPenaltyScore: dto.hasPenalty ? (dto.awayPenaltyScore ?? null) : null,
          note: dto.note ?? null,
          recordedByAdminUserId: admin.id,
          recordedAt: new Date(),
        },
      });

      // fixture.status → completed
      await tx.v1TournamentFixture.update({
        where: { id: fixtureId },
        data: { status: 'completed' },
      });

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.result.record',
          targetType: 'tournament_fixture',
          targetId: fixtureId,
          afterJson: {
            homeScore: dto.homeScore,
            awayScore: dto.awayScore,
            hasPenalty: dto.hasPenalty ?? false,
          },
          toStatus: 'completed',
          fromStatus: fixture.status,
        },
        tx,
      );

      return fixtureResult;
    });

    return this.serializeResult(result);
  }

  // ─── standings recalculate ────────────────────────────────────────────────

  /**
   * 해당 tournament의 phase='group' 그룹들에 대해 완료된 픽스처 결과를 집계해
   * V1TournamentStanding을 upsert한다.
   *
   * 집계 규칙:
   *   - 승 = 3점, 무 = 1점, 패 = 0점
   *   - 정규 스코어 기준으로 집계 (hasPenalty 경기는 정규 스코어 동점 → 무승부로 취급)
   *   - 순위 정렬: 승점 desc → 골득실(goalsFor - goalsAgainst) desc → goalsFor desc
   *
   * NOTE: 4강/결승 합산(non-group phase) 은 이 메서드의 대상이 아님.
   *       어드민이 단계별 수동 recordResult로 처리한다.
   */
  async recalculateStandings(user: V1AuthUser, tournamentId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.loadTournament(tournamentId);

    // phase='group' 그룹만 대상
    const groups = await this.prisma.v1TournamentGroup.findMany({
      where: { tournamentId, phase: 'group' },
      include: {
        groupTeams: true,
        fixtures: {
          where: { status: 'completed' },
          include: { result: true },
        },
      },
    });

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const group of groups) {
        // 각 registration별 누적 집계 맵
        const statsMap = new Map<
          string,
          {
            points: number;
            wins: number;
            draws: number;
            losses: number;
            goalsFor: number;
            goalsAgainst: number;
          }
        >();

        // 그룹 소속 팀 초기화
        for (const gt of group.groupTeams) {
          statsMap.set(gt.registrationId, {
            points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
          });
        }

        // completed 픽스처 결과 집계
        for (const fixture of group.fixtures) {
          const res = fixture.result;
          if (!res) continue;
          if (!fixture.homeRegistrationId || !fixture.awayRegistrationId) continue;

          const homeId = fixture.homeRegistrationId;
          const awayId = fixture.awayRegistrationId;

          // 양 팀 통계가 맵에 없으면 skip (그룹에 미등록된 팀)
          if (!statsMap.has(homeId) || !statsMap.has(awayId)) continue;

          const homeStats = statsMap.get(homeId)!;
          const awayStats = statsMap.get(awayId)!;

          const homeGoals = res.homeScore;
          const awayGoals = res.awayScore;

          // 승부차기(hasPenalty)는 조별리그 집계에서 정규 스코어 기준 무승부로 취급.
          // (정규 스코어가 동점이 아닌 경우도 정규 결과 그대로 적용한다.)
          // NOTE: 토너먼트 운영 정책상 조별리그에서 승부차기는 통상 없으나,
          //       데이터 일관성을 위해 hasPenalty 여부와 무관하게 정규 스코어만 사용.
          if (homeGoals > awayGoals) {
            homeStats.points += 3;
            homeStats.wins += 1;
            awayStats.losses += 1;
          } else if (homeGoals < awayGoals) {
            awayStats.points += 3;
            awayStats.wins += 1;
            homeStats.losses += 1;
          } else {
            // 동점 (승부차기 결과 무시 — 조별리그 집계 무승부 처리)
            homeStats.points += 1;
            homeStats.draws += 1;
            awayStats.points += 1;
            awayStats.draws += 1;
          }

          homeStats.goalsFor += homeGoals;
          homeStats.goalsAgainst += awayGoals;
          awayStats.goalsFor += awayGoals;
          awayStats.goalsAgainst += homeGoals;
        }

        // 순위 정렬: 승점 desc → 골득실 desc → 다득점 desc
        const sorted = Array.from(statsMap.entries()).sort(([, a], [, b]) => {
          const pointsDiff = b.points - a.points;
          if (pointsDiff !== 0) return pointsDiff;
          const gdA = a.goalsFor - a.goalsAgainst;
          const gdB = b.goalsFor - b.goalsAgainst;
          const gdDiff = gdB - gdA;
          if (gdDiff !== 0) return gdDiff;
          return b.goalsFor - a.goalsFor;
        });

        // upsert (groupId + registrationId unique)
        for (let i = 0; i < sorted.length; i++) {
          const [registrationId, stats] = sorted[i];
          await tx.v1TournamentStanding.upsert({
            where: { groupId_registrationId: { groupId: group.id, registrationId } },
            create: {
              groupId: group.id,
              registrationId,
              points: stats.points,
              wins: stats.wins,
              draws: stats.draws,
              losses: stats.losses,
              goalsFor: stats.goalsFor,
              goalsAgainst: stats.goalsAgainst,
              position: i + 1,
              recalculatedAt: now,
            },
            update: {
              points: stats.points,
              wins: stats.wins,
              draws: stats.draws,
              losses: stats.losses,
              goalsFor: stats.goalsFor,
              goalsAgainst: stats.goalsAgainst,
              position: i + 1,
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
          afterJson: { groupCount: groups.length, recalculatedAt: now.toISOString() },
        },
        tx,
      );
    });

    return {
      tournamentId,
      groupCount: groups.length,
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
          result: true,
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
        result: f.result ? this.serializeResult(f.result) : null,
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
