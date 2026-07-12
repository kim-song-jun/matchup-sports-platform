import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  V1TournamentFixture,
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

  /** 결과 삭제(오입력 복구) — 경기 상태를 scheduled로 되돌린다. 영상은 경기 소속이라 유지. */
  async deleteFixtureResult(user: V1AuthUser, fixtureId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const fixture = await this.prisma.v1TournamentFixture.findUnique({
      where: { id: fixtureId },
      include: { result: true },
    });
    if (!fixture) {
      throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
    }
    if (!fixture.result) {
      throw new NotFoundException({ code: 'RESULT_NOT_FOUND', message: '기록된 결과가 없어요.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.v1TournamentFixtureResult.delete({ where: { fixtureId } });
      await tx.v1TournamentFixture.update({ where: { id: fixtureId }, data: { status: 'scheduled' } });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.result.delete',
          targetType: 'tournament_fixture',
          targetId: fixtureId,
          beforeJson: {
            homeScore: fixture.result!.homeScore,
            awayScore: fixture.result!.awayScore,
            hasPenalty: fixture.result!.hasPenalty,
          },
          fromStatus: fixture.status,
          toStatus: 'scheduled',
        },
        tx,
      );
    });
    return { deleted: true };
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

  async recordResult(user: V1AuthUser, fixtureId: string, dto: RecordResultDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const fixture = await this.loadFixture(fixtureId);

    // AGF-1: 양 팀이 배정된 경기만 결과 입력 가능
    if (!fixture.homeRegistrationId || !fixture.awayRegistrationId) {
      throw new BadRequestException({
        code: 'FIXTURE_TEAMS_UNASSIGNED',
        message: '양 팀이 배정된 경기만 결과를 입력할 수 있어요.',
      });
    }

    // 승부차기(hasPenalty) 시 penalty 점수 양쪽 모두 필수
    if (dto.hasPenalty) {
      if (dto.homePenaltyScore === undefined || dto.awayPenaltyScore === undefined) {
        throw new BadRequestException({
          code: 'PENALTY_SCORES_REQUIRED',
          message: '승부차기를 선택하면 양 팀 승부차기 점수를 모두 입력해야 해요.',
        });
      }
      // AGF-2: 승부차기는 정규 스코어 동점일 때만 허용
      if (dto.homeScore !== dto.awayScore) {
        throw new BadRequestException({
          code: 'PENALTY_REQUIRES_DRAW',
          message: '승부차기는 정규 점수가 동점일 때만 입력할 수 있어요.',
        });
      }
      // AGF-2: 승부차기 점수는 서로 달라야 함
      if (dto.homePenaltyScore === dto.awayPenaltyScore) {
        throw new BadRequestException({
          code: 'PENALTY_SCORES_MUST_DIFFER',
          message: '승부차기 점수는 서로 달라야 해요.',
        });
      }
    }

    // AGF-4: 녹아웃 라운드 동점 + 승부차기 없음 → 거부.
    // fixture.round 는 표시 라벨이라 정식 영문 키('semi'/'final'/'third_place')와 어드민 자동생성·
    // 시드가 쓰는 한글 라벨('4강'/'결승'/'3·4위전')이 모두 존재 → 둘 다 매칭해야 실데이터에서 동작한다.
    // (group-stage round 는 'group_a'·'조별 N라운드'라 아래 라벨과 겹치지 않아 오탐 없음)
    const knockoutLabels = ['semi', 'final', 'third_place', '4강', '결승', '3·4위전'];
    const isKnockout =
      fixture.round != null && knockoutLabels.some((r) => fixture.round!.includes(r));
    if (isKnockout && dto.homeScore === dto.awayScore && !dto.hasPenalty) {
      throw new BadRequestException({
        code: 'KNOCKOUT_REQUIRES_WINNER',
        message: '토너먼트 경기는 승자가 필요해요. 동점이면 승부차기 점수를 입력해 주세요.',
      });
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

      // 영상 목록은 replace-all — dto.videos 생략(undefined) 시 기존 목록 유지
      if (dto.videos !== undefined) {
        await tx.v1TournamentFixtureVideo.deleteMany({ where: { fixtureId } });
        const videoRows = dto.videos
          .map((v, i) => ({
            fixtureId,
            title: v.title?.trim() || null,
            url: v.url.trim(),
            sortOrder: i,
          }))
          .filter((v) => v.url.length > 0);
        if (videoRows.length > 0) {
          await tx.v1TournamentFixtureVideo.createMany({ data: videoRows });
        }
      }

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

    const videos = await this.prisma.v1TournamentFixtureVideo.findMany({
      where: { fixtureId },
      orderBy: { sortOrder: 'asc' },
    });
    return { ...this.serializeResult(result), videos: videos.map((v) => this.serializeVideo(v)) };
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

        // 순위 정렬: 승점 desc → 골득실 desc → 다득점 desc → registrationId asc (완전 동점 결정키)
        const sorted = Array.from(statsMap.entries()).sort(([regIdA, a], [regIdB, b]) => {
          const pointsDiff = b.points - a.points;
          if (pointsDiff !== 0) return pointsDiff;
          const gdA = a.goalsFor - a.goalsAgainst;
          const gdB = b.goalsFor - b.goalsAgainst;
          const gdDiff = gdB - gdA;
          if (gdDiff !== 0) return gdDiff;
          const gfDiff = b.goalsFor - a.goalsFor;
          if (gfDiff !== 0) return gfDiff;
          // 완전 동점 결정키: registrationId asc (안정적 순위 보장)
          return regIdA < regIdB ? -1 : regIdA > regIdB ? 1 : 0;
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
        result: f.result ? this.serializeResult(f.result) : null,
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
