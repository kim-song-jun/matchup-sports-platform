import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { V1TournamentPlayer, V1TournamentRegistration } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AddPlayerDto, UpdatePlayerEligibilityDto } from './dto/tournament-player.dto';

@Injectable()
export class TournamentPlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  // ─── 팀 권한 게이트 (registration.teamId 기준 manager+) ──────────────────────

  /** 팀장 또는 운영진(manager+)만 명단을 관리할 수 있다. */
  private async assertTeamManager(teamId: string, userId: string) {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        teamId,
        userId,
        status: 'active',
        role: { in: ['owner', 'manager'] },
        team: { status: 'active', deletedAt: null },
      },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only team owners or managers can manage tournament players',
      });
    }
  }

  // ─── 등록 로드 (tournamentId + registrationId 일치 검증) ─────────────────────

  private async loadRegistration(
    tournamentId: string,
    registrationId: string,
  ): Promise<V1TournamentRegistration> {
    const registration = await this.prisma.v1TournamentRegistration.findFirst({
      where: { id: registrationId, tournamentId },
    });
    if (!registration) {
      throw new NotFoundException({
        code: 'REGISTRATION_NOT_FOUND',
        message: 'Registration was not found',
      });
    }
    return registration;
  }

  // ─── 명단 조회 ────────────────────────────────────────────────────────────────

  async listPlayers(user: V1AuthUser, tournamentId: string, registrationId: string) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    await this.assertTeamManager(registration.teamId, user.id);

    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      select: { minPlayers: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament was not found' });
    }

    const players = await this.prisma.v1TournamentPlayer.findMany({
      where: { registrationId, removedAt: null },
      orderBy: { addedAt: 'asc' },
    });

    return {
      players: players.map(this.serializePlayer),
      belowMinimum: players.length < tournament.minPlayers,
    };
  }

  // ─── 선수 추가 ────────────────────────────────────────────────────────────────

  async addPlayer(
    user: V1AuthUser,
    tournamentId: string,
    registrationId: string,
    dto: AddPlayerDto,
  ) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    await this.assertTeamManager(registration.teamId, user.id);

    // 잠금 가드
    if (registration.rosterLockedAt) {
      throw new ConflictException({ code: 'ROSTER_LOCKED', message: 'Roster is locked — contact admin' });
    }

    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      select: { maxPlayers: true, minPlayers: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament was not found' });
    }

    // 활성 선수 수 < maxPlayers 가드
    const activeCount = await this.prisma.v1TournamentPlayer.count({
      where: { registrationId, removedAt: null },
    });
    if (activeCount >= tournament.maxPlayers) {
      throw new ConflictException({
        code: 'ROSTER_FULL',
        message: `Cannot exceed maxPlayers (${tournament.maxPlayers})`,
      });
    }

    // userId가 해당 팀(registration.teamId)의 active 멤버 가드
    const teamMembership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        teamId: registration.teamId,
        userId: dto.userId,
        status: 'active',
        team: { status: 'active', deletedAt: null },
      },
    });
    if (!teamMembership) {
      throw new BadRequestException({
        code: 'USER_NOT_TEAM_MEMBER',
        message: 'The user is not an active member of this team',
      });
    }

    // 동일 registration에 동일 userId 미등록(removedAt=null) 가드 — 활성 중복 체크
    const existingActive = await this.prisma.v1TournamentPlayer.findFirst({
      where: { registrationId, userId: dto.userId, removedAt: null },
    });
    if (existingActive) {
      throw new ConflictException({
        code: 'PLAYER_ALREADY_REGISTERED',
        message: 'This user is already registered as a player in this registration',
      });
    }

    // @@unique([registrationId, userId]) 제약 때문에 soft-deleted 레코드가 있으면
    // create 가 유니크 위반을 일으킨다. upsert 로 재활성화(realName/birth 최신 업데이트).
    const player = await this.prisma.v1TournamentPlayer.upsert({
      where: { registrationId_userId: { registrationId, userId: dto.userId } },
      create: {
        registrationId,
        userId: dto.userId,
        realName: dto.realName,
        birthDateSnapshot: dto.birthDate ?? null,
        eligibilityStatus: dto.eligibilityStatus ?? 'needs_review',
      },
      update: {
        realName: dto.realName,
        birthDateSnapshot: dto.birthDate ?? null,
        eligibilityStatus: dto.eligibilityStatus ?? 'needs_review',
        eligibilityNote: null,
        removedAt: null,
        addedAt: new Date(),
      },
    });

    return this.serializePlayer(player);
  }

  // ─── 선수 soft remove ─────────────────────────────────────────────────────────

  async removePlayer(
    user: V1AuthUser,
    tournamentId: string,
    registrationId: string,
    playerId: string,
  ) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    await this.assertTeamManager(registration.teamId, user.id);

    // 잠금 가드
    if (registration.rosterLockedAt) {
      throw new ConflictException({ code: 'ROSTER_LOCKED', message: 'Roster is locked — contact admin' });
    }

    const player = await this.prisma.v1TournamentPlayer.findFirst({
      where: { id: playerId, registrationId, removedAt: null },
    });
    if (!player) {
      throw new NotFoundException({ code: 'PLAYER_NOT_FOUND', message: 'Player was not found' });
    }

    const removed = await this.prisma.v1TournamentPlayer.update({
      where: { id: playerId },
      data: { removedAt: new Date() },
    });

    return this.serializePlayer(removed);
  }

  // ─── 어드민: CSV 다운로드 ──────────────────────────────────────────────────────

  /**
   * PII 포함 — 어드민 게이트 필수.
   * 서비스는 {filename, csv} 반환. 컨트롤러는 plain 응답으로 전달(전역 인터셉터 래핑).
   */
  async exportCsv(user: V1AuthUser, registrationId: string) {
    // 어드민 게이트(getActiveAdmin: support도 조회 허용)
    await this.adminContext.getActiveAdmin(user.id);

    const registration = await this.prisma.v1TournamentRegistration.findUnique({
      where: { id: registrationId },
      include: { team: { select: { name: true } } },
    });
    if (!registration) {
      throw new NotFoundException({ code: 'REGISTRATION_NOT_FOUND', message: 'Registration was not found' });
    }

    const players = await this.prisma.v1TournamentPlayer.findMany({
      where: { registrationId, removedAt: null },
      include: { user: { select: { profile: { select: { nickname: true } } } } },
      orderBy: { addedAt: 'asc' },
    });

    // CSV 생성 — PII 포함
    const header = 'realName,birthDate,eligibility,nickname';
    const rows = players.map((p) => {
      const nickname = p.user.profile?.nickname ?? '';
      const cols = [
        this.escapeCsvField(p.realName),
        this.escapeCsvField(p.birthDateSnapshot ?? ''),
        this.escapeCsvField(p.eligibilityStatus),
        this.escapeCsvField(nickname),
      ];
      return cols.join(',');
    });
    const csv = [header, ...rows].join('\n');

    const teamName = (registration as any).team?.name ?? registrationId;
    const filename = `players_${teamName.replace(/\s+/g, '_')}_${registrationId.slice(0, 8)}.csv`;

    return { filename, csv };
  }

  // ─── 어드민: 선출여부 확정 ────────────────────────────────────────────────────

  async updateEligibility(user: V1AuthUser, playerId: string, dto: UpdatePlayerEligibilityDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);

    const player = await this.prisma.v1TournamentPlayer.findFirst({
      where: { id: playerId, removedAt: null },
    });
    if (!player) {
      throw new NotFoundException({ code: 'PLAYER_NOT_FOUND', message: 'Player was not found' });
    }

    const before = { eligibilityStatus: player.eligibilityStatus, eligibilityNote: player.eligibilityNote };

    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.v1TournamentPlayer.update({
        where: { id: playerId },
        data: {
          eligibilityStatus: dto.eligibilityStatus,
          eligibilityNote: dto.note ?? null,
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'player.eligibility',
          targetType: 'tournament_player',
          targetId: playerId,
          beforeJson: before,
          afterJson: { eligibilityStatus: dto.eligibilityStatus, eligibilityNote: dto.note ?? null },
        },
        tx,
      );
      return p;
    });

    return this.serializePlayer(updated);
  }

  // ─── 직렬화 ───────────────────────────────────────────────────────────────────

  private serializePlayer(row: V1TournamentPlayer) {
    return {
      id: row.id,
      userId: row.userId,
      realName: row.realName,
      birthDateSnapshot: row.birthDateSnapshot ?? null,
      eligibilityStatus: row.eligibilityStatus,
      eligibilityNote: row.eligibilityNote ?? null,
      addedAt: row.addedAt.toISOString(),
      removedAt: row.removedAt?.toISOString() ?? null,
    };
  }

  private escapeCsvField(value: string): string {
    // RFC 4180: 콤마·쌍따옴표·줄바꿈 포함 시 쌍따옴표로 감싸기
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
