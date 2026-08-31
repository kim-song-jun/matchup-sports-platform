import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  V1TournamentGenderCategory,
  V1TournamentPlayer,
  V1TournamentRegistration,
  V1TournamentStatus,
} from '@prisma/client';
import { isRosterMutableTournamentStatus } from './roster-cleanup';
import { AdminContextService, type V1ActiveAdmin } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { isPhoneVerificationEnforced } from '../verification/phone-verification-access';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AddPlayerDto, UpdatePlayerEligibilityDto } from './dto/tournament-player.dto';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from './tournament-surface-lookup';

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
        message: '팀장 또는 매니저만 명단을 관리할 수 있어요.',
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
        message: '신청 내역을 찾을 수 없어요.',
      });
    }
    return registration;
  }

  private async assertTeamMember(teamId: string, userId: string) {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        teamId,
        userId,
        status: 'active',
        team: { status: 'active', deletedAt: null },
      },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '팀에 속한 멤버만 선수 명단을 볼 수 있어요.',
      });
    }
  }

  /**
   * 어드민이 이 선수의 선출 여부를 이미 확정했는가.
   *
   * 팀이 "선출 여부"를 스스로 신고하는 것은 정상 흐름이다(소비자 명단 화면의 라디오). 문제는
   * 어드민이 심사해 결론을 낸 **뒤에도** 팀이 그걸 되돌릴 수 있고, 그 과정에서 어드민이 남긴
   * 심사 메모(eligibilityNote)까지 지워진다는 것이다 — 흔적도 감사 로그도 남지 않는다.
   *
   * 확정 여부는 감사 로그로 판정한다. eligibilityNote 유무로는 판정할 수 없다 — 어드민이
   * 메모 없이 확정하면(dto.note 미지정) note 가 null 이라 심사 전과 구분되지 않는다.
   */
  private async hasAdminEligibilityRuling(
    tx: Prisma.TransactionClient,
    playerId: string,
  ): Promise<boolean> {
    const ruling = await tx.v1AdminActionLog.findFirst({
      where: {
        action: 'player.eligibility',
        targetType: 'tournament_player',
        targetId: playerId,
      },
      select: { id: true },
    });
    return ruling !== null;
  }

  private assertRosterMutable(
    registration: V1TournamentRegistration,
    tournament: { rosterDeadlineAt: Date | null; status: V1TournamentStatus },
    // 어드민 경로 전용. 잠금(rosterLockedAt)과 마감(rosterDeadlineAt)은 **운영진이 풀라고
    // 있는 장치**이므로 어드민은 넘길 수 있다(이미 roster-lock / roster-deadline-override
    // 엔드포인트가 같은 목적으로 존재한다). 반면 취소된 신청은 어드민도 건드릴 수 없다 —
    // 그건 권한 문제가 아니라 "존재하지 않는 참가"에 선수를 넣는 것이라 의미가 없다.
    options: { allowLockedAndExpired?: boolean } = {},
  ) {
    // 완료·취소된 대회의 명단은 누구도 못 바꾼다. 수상 내역·리뷰·기록이 이 명단을 참조하므로
    // 지난 대회의 선수를 넣고 빼면 과거 기록이 가리키는 대상이 달라진다 — 탈퇴 정리가 완료
    // 대회를 건너뛰는 것과 같은 불변식이다(roster-cleanup.ts 주석 참조).
    if (!isRosterMutableTournamentStatus(tournament.status)) {
      throw new ConflictException({
        code: 'TOURNAMENT_ROSTER_NOT_MUTABLE',
        message: '종료되었거나 취소된 대회는 선수 명단을 수정할 수 없어요.',
      });
    }
    if (!options.allowLockedAndExpired && registration.rosterLockedAt) {
      throw new ConflictException({ code: 'ROSTER_LOCKED', message: '명단이 잠겼어요. 운영진에게 문의해 주세요.' });
    }
    if (registration.status === 'cancel_requested' || registration.status === 'cancelled') {
      throw new ConflictException({
        code: 'REGISTRATION_ROSTER_NOT_MUTABLE',
        message: '취소 요청 또는 취소 완료된 신청은 선수 명단을 수정할 수 없어요.',
      });
    }
    // 명단 제출 마감 하드 차단 — 어드민이 해당 팀에 개별 예외(rosterDeadlineOverrideAt)를 부여한 경우만 예외.
    if (
      !options.allowLockedAndExpired &&
      tournament.rosterDeadlineAt &&
      new Date() > tournament.rosterDeadlineAt &&
      !registration.rosterDeadlineOverrideAt
    ) {
      throw new ConflictException({
        code: 'ROSTER_DEADLINE_PASSED',
        message: '명단 제출 기간이 종료됐어요. 수정이 필요하면 운영진에게 문의해 주세요.',
      });
    }
  }

  // ─── 명단 조회 ────────────────────────────────────────────────────────────────

  async listPlayers(user: V1AuthUser, tournamentId: string, registrationId: string) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    await this.assertTeamMember(registration.teamId, user.id);

    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      select: { minPlayers: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
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

    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      select: {
        maxPlayers: true,
        minPlayers: true,
        rosterDeadlineAt: true,
        genderCategory: true,
        status: true,
      },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    this.assertRosterMutable(registration, tournament);

    const player = await this.insertPlayerIntoRoster(tournamentId, registrationId, dto);
    return this.serializePlayer(player);
  }

  /**
   * 명단 추가의 실제 본체. 팀 매니저 경로와 어드민 경로가 공유한다.
   *
   * 어드민이라고 해서 정원·팀멤버십·프로필·중복 검사를 건너뛰지는 않는다 — 그건 권한이
   * 아니라 데이터 정합성이라서, 넘기면 대회 당일에 문제가 되는 명단이 만들어진다.
   * 어드민이 넘길 수 있는 것은 잠금과 마감뿐이다(assertRosterMutable 주석 참조).
   */
  private async insertPlayerIntoRoster(
    tournamentId: string,
    registrationId: string,
    dto: AddPlayerDto,
    options: {
      allowLockedAndExpired?: boolean;
      auditAs?: { admin: V1ActiveAdmin; action: string };
    } = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndLoadMutableRegistration(tx, tournamentId, registrationId, options);
      const activeCount = await tx.v1TournamentPlayer.count({
        where: { registrationId, removedAt: null },
      });

      // 멤버십 행을 먼저 잠근다. 안 잠그면 "탈퇴 트랜잭션이 멤버십을 끄고 로스터를 정리 →
      // 그 사이 추가 트랜잭션이 아직 활성으로 읽은 멤버십을 근거로 선수를 넣고 커밋" 순서가
      // 가능해, 탈퇴한 사람이 명단에 되살아난다 — 2026-08-03 유령 명단 사고와 같은 상태다.
      // registration → membership 순서로만 잠가 두 경로의 lock 순서를 고정한다(교착 방지).
      await tx.$queryRaw`
        SELECT id FROM "v1_team_memberships"
        WHERE team_id = ${current.registration.teamId} AND user_id = ${dto.userId}
        FOR UPDATE
      `;
      const teamMembership = await tx.v1TeamMembership.findFirst({
        where: {
          teamId: current.registration.teamId,
          userId: dto.userId,
          status: 'active',
          team: { status: 'active', deletedAt: null },
        },
        include: {
          user: {
            select: {
              phone: true,
              phoneVerifiedAt: true,
              profile: { select: { realName: true, birthDate: true, gender: true } },
            },
          },
        },
      });
      const [existingActive, existingOnOtherTeam] = await Promise.all([
        tx.v1TournamentPlayer.findFirst({
          where: { registrationId, userId: dto.userId, removedAt: null },
        }),
        // 감사 finding #50: 대회(tournamentId) 축 중복 검사 — 같은 대회의 다른 팀 명단에
        // 이미 있는지 확인한다. 이게 없으면 한 사람이 두 팀 공식 명단에 동시 등재될 수 있다.
        tx.v1TournamentPlayer.findFirst({
          where: {
            userId: dto.userId,
            removedAt: null,
            registrationId: { not: registrationId },
            registration: { tournamentId },
          },
        }),
      ]);

      // 후보 목록과 **같은 함수**로 판정한다. 조건이 여기와 목록에 따로 적혀 있던 탓에
      // 정원·취소 신청·대회 상태·성별 구분이 한쪽에만 있는 채로 나간 적이 있다.
      const block = evaluateRosterCandidate({
        alreadyOnRoster: existingActive !== null,
        alreadyOnOtherTeamInTournament: existingOnOtherTeam !== null,
        // 잠금·마감과 달리 이 둘은 어드민도 못 넘긴다. lockAndLoadMutableRegistration 이
        // 이미 같은 판정으로 던지므로 여기까지 오면 항상 true 지만, 조건 목록을 한 곳에
        // 모아 두기 위해 함께 넘긴다.
        tournamentMutable: isRosterMutableTournamentStatus(current.tournament.status),
        registrationMutable:
          current.registration.status !== 'cancel_requested' &&
          current.registration.status !== 'cancelled',
        rosterCount: activeCount,
        maxPlayers: current.tournament.maxPlayers,
        member: teamMembership
          ? {
              realName: teamMembership.user.profile?.realName?.trim() ?? null,
              birthDate: teamMembership.user.profile?.birthDate?.trim() ?? null,
              phone: teamMembership.user.phone?.trim() ?? null,
              gender: normalizeGender(teamMembership.user.profile?.gender),
              phoneVerifiedAt: teamMembership.user.phoneVerifiedAt,
            }
          : null,
        genderCategory: current.tournament.genderCategory,
        phoneEnforced: isPhoneVerificationEnforced(),
      });
      if (block) {
        const payload = { code: block.code, message: block.message };
        throw block.conflict
          ? new ConflictException(payload)
          : new BadRequestException(payload);
      }

      // block 이 null 이면 위 판정이 멤버십과 프로필을 모두 통과시킨 것이다.
      const member = teamMembership!.user;
      const memberRealName = member.profile!.realName!.trim();
      const memberBirthDate = member.profile!.birthDate!.trim();
      const memberGender = normalizeGender(member.profile?.gender);

      // 제외했다 다시 넣으면 같은 row 가 되살아난다. 그 자리에서 자격을 needs_review 로
      // 되돌리고 메모를 지우면, 팀이 "제외 → 재추가" 두 번으로 어드민 심사를 무효화할 수
      // 있다 — updatePlayer 를 막아도 이 문이 열려 있으면 소용없다.
      const existingRow = await tx.v1TournamentPlayer.findUnique({
        where: { registrationId_userId: { registrationId, userId: dto.userId } },
        select: { id: true, eligibilityStatus: true, eligibilityNote: true },
      });
      const adminRuled = existingRow
        ? await this.hasAdminEligibilityRuling(tx, existingRow.id)
        : false;

      const saved = await tx.v1TournamentPlayer.upsert({
        where: { registrationId_userId: { registrationId, userId: dto.userId } },
        create: {
          registrationId,
          userId: dto.userId,
          realName: memberRealName,
          birthDateSnapshot: memberBirthDate,
          genderSnapshot: memberGender,
          eligibilityStatus: dto.eligibilityStatus ?? 'needs_review',
        },
        update: {
          realName: memberRealName,
          birthDateSnapshot: memberBirthDate,
          genderSnapshot: memberGender,
          eligibilityStatus: adminRuled
            ? existingRow!.eligibilityStatus
            : (dto.eligibilityStatus ?? 'needs_review'),
          eligibilityNote: adminRuled ? existingRow!.eligibilityNote : null,
          removedAt: null,
          addedAt: new Date(),
        },
      });

      if (options.auditAs) {
        await this.adminContext.logAdminAction(
          options.auditAs.admin,
          {
            action: options.auditAs.action,
            targetType: 'tournament_player',
            targetId: saved.id,
            afterJson: {
              registrationId,
              userId: dto.userId,
              realName: memberRealName,
            },
          },
          tx,
        );
      }

      // 어드민이 잠긴 명단에 인원을 추가했다면(팀 경로는 애초에 잠긴 명단에 못 들어온다)
      // 성별 쿼터가 여전히 맞는지 다시 본다 — reconcileGenderQuotaAfterRosterChange 주석 참조.
      if (options.allowLockedAndExpired) {
        await this.reconcileGenderQuotaAfterRosterChange(tx, registrationId, current.tournament);
      }

      return saved;
    });
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

    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      select: { rosterDeadlineAt: true, status: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    this.assertRosterMutable(registration, {
      rosterDeadlineAt: tournament.rosterDeadlineAt,
      status: tournament.status,
    });

    const removed = await this.prisma.$transaction(async (tx) => {
      await this.lockAndLoadMutableRegistration(tx, tournamentId, registrationId);
      const player = await tx.v1TournamentPlayer.findFirst({
        where: { id: playerId, registrationId, removedAt: null },
      });
      if (!player) {
        throw new NotFoundException({ code: 'PLAYER_NOT_FOUND', message: '선수를 찾을 수 없어요.' });
      }
      return tx.v1TournamentPlayer.update({
        where: { id: playerId },
        data: { removedAt: new Date() },
      });
    });

    return this.serializePlayer(removed);
  }

  // ─── 팀 명단 선수 정보 수정 ─────────────────────────────────────────────────

  async updatePlayer(
    user: V1AuthUser,
    tournamentId: string,
    registrationId: string,
    playerId: string,
    dto: UpdatePlayerEligibilityDto,
  ) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    await this.assertTeamManager(registration.teamId, user.id);

    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      select: { rosterDeadlineAt: true, status: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    this.assertRosterMutable(registration, {
      rosterDeadlineAt: tournament.rosterDeadlineAt,
      status: tournament.status,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockAndLoadMutableRegistration(tx, tournamentId, registrationId);
      const player = await tx.v1TournamentPlayer.findFirst({
        where: { id: playerId, registrationId, removedAt: null },
      });
      if (!player) {
        throw new NotFoundException({ code: 'PLAYER_NOT_FOUND', message: '선수를 찾을 수 없어요.' });
      }
      // 어드민이 이미 확정했으면 팀이 되돌릴 수 없다. 여기까지 오면 심사 결론이 조용히
      // 뒤집히고 심사 메모까지 지워지는데, 감사 로그에는 그 사실이 남지 않는다.
      if (await this.hasAdminEligibilityRuling(tx, playerId)) {
        throw new ConflictException({
          code: 'ELIGIBILITY_ADMIN_REVIEWED',
          message: '운영진이 확정한 선출 여부예요. 변경이 필요하면 운영진에게 문의해 주세요.',
        });
      }
      return tx.v1TournamentPlayer.update({
        where: { id: playerId },
        // 메모는 어드민만 쓴다 — 팀이 라디오를 바꿨다고 지울 이유가 없다.
        data: { eligibilityStatus: dto.eligibilityStatus },
      });
    });

    return this.serializePlayer(updated);
  }

  // ─── 어드민: 명단 조회/CSV 다운로드 ───────────────────────────────────────────

  async listPlayersForAdmin(user: V1AuthUser, registrationId: string) {
    await this.adminContext.getActiveAdmin(user.id);

    const registration = await this.prisma.v1TournamentRegistration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        teamId: true,
        rosterLockedAt: true,
        team: { select: { name: true, ownerUserId: true } },
        tournament: { select: { minPlayers: true } },
      },
    });
    if (!registration) {
      throw new NotFoundException({ code: 'REGISTRATION_NOT_FOUND', message: '신청 내역을 찾을 수 없어요.' });
    }

    const players = await this.prisma.v1TournamentPlayer.findMany({
      where: { registrationId, removedAt: null },
      include: { user: { select: { phone: true } } },
      orderBy: { addedAt: 'asc' },
    });

    const serializedPlayers = players
      .map(({ user: playerUser, ...player }) => ({
        ...this.serializePlayer(player),
        phone: playerUser.phone?.trim() || null,
        isTeamCaptain: player.userId === registration.team.ownerUserId,
      }))
      .sort((left, right) => Number(right.isTeamCaptain) - Number(left.isTeamCaptain));

    return {
      registrationId: registration.id,
      teamId: registration.teamId,
      teamName: registration.team.name,
      rosterLockedAt: registration.rosterLockedAt?.toISOString() ?? null,
      players: serializedPlayers,
      belowMinimum: players.length < registration.tournament.minPlayers,
    };
  }

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
      throw new NotFoundException({ code: 'REGISTRATION_NOT_FOUND', message: '신청 내역을 찾을 수 없어요.' });
    }

    const players = await this.prisma.v1TournamentPlayer.findMany({
      where: { registrationId, removedAt: null },
      include: { user: { select: { profile: { select: { nickname: true } } } } },
      orderBy: { addedAt: 'asc' },
    });

    // CSV 생성 — PII 포함
    const header = 'realName,birthDate,gender,eligibility,nickname';
    const rows = players.map((p) => {
      const nickname = p.user.profile?.nickname ?? '';
      const cols = [
        this.escapeCsvField(p.realName),
        this.escapeCsvField(p.birthDateSnapshot ?? ''),
        this.escapeCsvField(p.genderSnapshot ?? ''),
        this.escapeCsvField(p.eligibilityStatus),
        this.escapeCsvField(nickname),
      ];
      return cols.join(',');
    });
    const csv = [header, ...rows].join('\n');

    const teamName = registration.team.name;
    const filename = `players_${teamName.replace(/\s+/g, '_')}_${registrationId.slice(0, 8)}.csv`;

    return { filename, csv };
  }

  // ─── 어드민: 선출여부 확정 ────────────────────────────────────────────────────

  /**
   * 어드민이 팀 대신 명단에 선수를 넣는다.
   *
   * 2026-08-03 이전에는 어드민 콘솔에 조회·내보내기·자격변경만 있고 **추가·제거가 아예
   * 없었다.** 운영자가 화면에서 아무리 눌러도 서버로 요청이 가지 않아, 로그에는 실패조차
   * 남지 않았다(실측: 24시간 동안 해당 등록 건 POST 0건, 4xx 0건). 팀장이 자리를 비웠거나
   * 마감이 지난 뒤 운영 판단으로 조정해야 하는 상황을 손댈 방법이 없었다.
   */
  async addPlayerForAdmin(user: V1AuthUser, registrationId: string, dto: AddPlayerDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);

    const registration = await this.prisma.v1TournamentRegistration.findUnique({
      where: { id: registrationId },
      select: { tournamentId: true },
    });
    if (!registration) {
      throw new NotFoundException({
        code: 'REGISTRATION_NOT_FOUND',
        message: '신청 내역을 찾을 수 없어요.',
      });
    }

    const player = await this.insertPlayerIntoRoster(registration.tournamentId, registrationId, dto, {
      allowLockedAndExpired: true,
      // 운영자가 팀 대신 명단을 고친 기록은 반드시 남아야 한다. 정원·자격 분쟁이 생겼을 때
      // "누가 언제 넣었나"를 되짚을 수 있는 유일한 근거이고, 잠금·마감을 넘길 수 있는
      // 경로라서 더욱 그렇다. 명단 변경과 같은 트랜잭션에 기록해 둘이 어긋나지 않게 한다.
      auditAs: { admin, action: 'player.add' },
    });
    return this.serializePlayer(player);
  }

  /**
   * 어드민 명단 추가 화면에서 고를 수 있는 팀원 목록.
   *
   * 이게 없던 동안 어드민은 **사용자 UUID 를 직접 입력**해야 했는데, 운영자가 그 값을 얻을
   * 경로가 화면에 없었다(2026-08-04 alpha UI 검수에서 확인). 기능은 동작했지만 실제로는
   * 쓸 수 없는 상태였다.
   *
   * 추가 자격을 여기서 미리 계산해 내려준다 — 왜 못 고르는지가 화면에 보여야, 운영자가
   * 눌러 보고 나서야 400 을 받는 일이 없다. 판정 기준은 addPlayer 의 검사와 같다.
   */
  async listEligiblePlayersForAdmin(user: V1AuthUser, registrationId: string) {
    // 이 목록은 오직 "선수 추가" 폼을 채우기 위해 존재한다. 그런데 명단에 없는 팀원의 실명까지
    // 담고 있으므로, 추가 권한이 없는 support 어드민이 읽을 이유가 없다 — 조회 게이트를 쓰기
    // 게이트와 같은 높이로 맞춘다(addPlayerForAdmin 과 동일한 getMutationAdmin).
    await this.adminContext.getMutationAdmin(user.id);

    const registration = await this.prisma.v1TournamentRegistration.findUnique({
      where: { id: registrationId },
      select: {
        teamId: true,
        status: true,
        tournamentId: true,
        tournament: {
          select: { genderCategory: true, maxPlayers: true, deletedAt: true, status: true },
        },
      },
    });
    // 삭제된 대회는 add 가 404 를 내므로 후보도 내려주지 않는다 — 안 막으면 지난 대회의
    // registration ID 만 알면 그 팀 명단 밖 사람의 실명까지 읽을 수 있는 경로가 남는다.
    if (!registration || registration.tournament.deletedAt) {
      throw new NotFoundException({
        code: 'REGISTRATION_NOT_FOUND',
        message: '신청 내역을 찾을 수 없어요.',
      });
    }

    const [memberships, activePlayers, playersOnOtherTeams] = await Promise.all([
      this.prisma.v1TeamMembership.findMany({
        where: {
          teamId: registration.teamId,
          status: 'active',
          team: { status: 'active', deletedAt: null },
        },
        select: {
          role: true,
          user: {
            select: {
              id: true,
              phone: true,
              phoneVerifiedAt: true,
              profile: { select: { nickname: true, realName: true, birthDate: true, gender: true } },
            },
          },
        },
      }),
      this.prisma.v1TournamentPlayer.findMany({
        where: { registrationId, removedAt: null },
        select: { userId: true },
      }),
      // 감사 finding #50: 같은 대회 다른 팀 명단에 이미 있는 팀원은 "선택 가능"으로 보이면 안 된다.
      this.prisma.v1TournamentPlayer.findMany({
        where: {
          removedAt: null,
          registrationId: { not: registrationId },
          registration: { tournamentId: registration.tournamentId },
        },
        select: { userId: true },
      }),
    ]);

    const onRoster = new Set(activePlayers.map((player) => player.userId));
    const onOtherTeam = new Set(playersOnOtherTeams.map((player) => player.userId));
    const phoneEnforced = isPhoneVerificationEnforced();

    // 명단 전체를 막는 사유. 개인 자격과 무관하게 추가 자체가 거부되므로 여기서 먼저 판정한다 —
    // 빼놓으면 모든 팀원이 "선택 가능" 으로 보이고 눌러야 409 를 받는다. 특히 정원이 찬 경우가
    // 그랬는데, 유령 명단 한 자리 때문에 팀이 선수를 못 넣던 2026-08-03 사고가 바로 이 모양이었다.
    // (잠금·마감은 어드민이 넘길 수 있으므로 여기서 막지 않는다 — assertRosterMutable 주석 참조.)
    const tournamentClosed = !isRosterMutableTournamentStatus(registration.tournament.status);
    const registrationCancelled =
      registration.status === 'cancel_requested' || registration.status === 'cancelled';
    const maxPlayers = registration.tournament.maxPlayers;

    return {
      members: memberships
        .map(({ role, user: member }) => {
          const realName = member.profile?.realName?.trim() || null;

          // addPlayer 와 **같은 함수**로 판정한다 — 조건이 갈라지면 고를 수는 있는데 서버가
          // 거절하는 폼이 되고, 그게 이 기능이 없애려던 상태다.
          const block = evaluateRosterCandidate({
            alreadyOnRoster: onRoster.has(member.id),
            alreadyOnOtherTeamInTournament: onOtherTeam.has(member.id),
            tournamentMutable: !tournamentClosed,
            registrationMutable: !registrationCancelled,
            rosterCount: activePlayers.length,
            maxPlayers,
            member: {
              realName,
              birthDate: member.profile?.birthDate?.trim() ?? null,
              phone: member.phone?.trim() ?? null,
              gender: normalizeGender(member.profile?.gender),
              phoneVerifiedAt: member.phoneVerifiedAt,
            },
            genderCategory: registration.tournament.genderCategory,
            phoneEnforced,
          });
          const ineligibleReason = block?.listReason ?? null;

          // 생년월일·성별은 판정에만 쓰고 응답에는 싣지 않는다 — 화면이 안 쓰는 PII 를
          // 명단 밖 팀원까지 포함해 내보낼 이유가 없다.
          return {
            userId: member.id,
            nickname: member.profile?.nickname ?? null,
            realName,
            role,
            alreadyOnRoster: onRoster.has(member.id),
            eligible: ineligibleReason === null,
            ineligibleReason,
          };
        })
        .sort((left, right) => {
          if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
          return (left.realName ?? left.nickname ?? '').localeCompare(right.realName ?? right.nickname ?? '');
        }),
    };
  }

  /** 어드민이 명단에서 선수를 뺀다. 팀 경로와 달리 잠금·마감을 넘길 수 있다. */
  async removePlayerForAdmin(user: V1AuthUser, playerId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);

    const removed = await this.prisma.$transaction(async (tx) => {
      const player = await tx.v1TournamentPlayer.findFirst({
        where: { id: playerId, removedAt: null },
        select: {
          id: true,
          registrationId: true,
          userId: true,
          realName: true,
          registration: { select: { tournamentId: true } },
        },
      });
      if (!player) {
        throw new NotFoundException({ code: 'PLAYER_NOT_FOUND', message: '선수를 찾을 수 없어요.' });
      }
      // 취소된 신청인지만 확인하고(잠금·마감은 통과) 정합성을 지킨다.
      const { tournament } = await this.lockAndLoadMutableRegistration(
        tx,
        player.registration.tournamentId,
        player.registrationId,
        { allowLockedAndExpired: true },
      );
      // lock **이후에** 활성 상태를 다시 본다. 위 findFirst 는 lock 전에 읽으므로, 두 요청이
      // 나란히 들어오면 둘 다 활성으로 읽고 둘 다 제거에 성공해 감사 로그가 두 번 남는다
      // (소비자 remove 는 lock 뒤에 조회해서 이 문제가 없다).
      const stillActive = await tx.v1TournamentPlayer.updateMany({
        where: { id: playerId, removedAt: null },
        data: { removedAt: new Date() },
      });
      if (stillActive.count === 0) {
        throw new NotFoundException({ code: 'PLAYER_NOT_FOUND', message: '선수를 찾을 수 없어요.' });
      }
      const updated = await tx.v1TournamentPlayer.findUniqueOrThrow({ where: { id: playerId } });

      // 추가와 같은 이유로 제거도 기록한다 — 명단 변경과 같은 트랜잭션에 넣어야 "명단은
      // 바뀌었는데 로그가 없는" 상태가 생기지 않는다.
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'player.remove',
          targetType: 'tournament_player',
          targetId: playerId,
          beforeJson: {
            registrationId: player.registrationId,
            userId: player.userId,
            realName: player.realName,
          },
          afterJson: { removedAt: updated.removedAt },
        },
        tx,
      );

      // 제거로 성별 비율이 바뀌어 쿼터를 벗어날 수도 있다(예: 여성 최소 인원 미달) —
      // reconcileGenderQuotaAfterRosterChange 주석 참조.
      await this.reconcileGenderQuotaAfterRosterChange(tx, player.registrationId, tournament);

      return updated;
    });

    return this.serializePlayer(removed);
  }

  async updateEligibility(user: V1AuthUser, playerId: string, dto: UpdatePlayerEligibilityDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);

    const player = await this.prisma.v1TournamentPlayer.findFirst({
      where: { id: playerId, removedAt: null },
    });
    if (!player) {
      throw new NotFoundException({ code: 'PLAYER_NOT_FOUND', message: '선수를 찾을 수 없어요.' });
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
      genderSnapshot: normalizeGender(row.genderSnapshot),
      eligibilityStatus: row.eligibilityStatus,
      eligibilityNote: row.eligibilityNote ?? null,
      addedAt: row.addedAt.toISOString(),
      removedAt: row.removedAt?.toISOString() ?? null,
    };
  }

  private async lockAndLoadMutableRegistration(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    registrationId: string,
    options: { allowLockedAndExpired?: boolean } = {},
  ) {
    await tx.$queryRaw`SELECT id FROM "v1_tournament_registrations" WHERE id = ${registrationId} FOR UPDATE`;
    const registration = await tx.v1TournamentRegistration.findFirst({
      where: { id: registrationId, tournamentId },
    });
    if (!registration) {
      throw new NotFoundException({
        code: 'REGISTRATION_NOT_FOUND',
        message: '신청 내역을 찾을 수 없어요.',
      });
    }
    const tournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      select: {
        maxPlayers: true,
        minPlayers: true,
        rosterDeadlineAt: true,
        genderCategory: true,
        status: true,
        // 잠긴 명단에 어드민이 추가·제거를 가한 뒤 성별 쿼터 재검증(reconcileGenderQuotaAfterRosterChange)에 쓴다.
        genderMinMale: true,
        genderMaxMale: true,
        genderMinFemale: true,
        genderMaxFemale: true,
      },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    this.assertRosterMutable(registration, tournament, options);
    return { registration, tournament };
  }

  /**
   * 잠긴 명단에 어드민이 변경을 가하면 잠금 시점의 성별 쿼터 보증이 깨질 수 있다 — 잠금은
   * '이 시점 기준으로 성별 인원 조건을 충족했다'는 확정 표시인데, 어드민 추가·제거 경로는
   * allowLockedAndExpired로 잠금·마감을 넘기면서도 쿼터를 재검증하지 않아, 위반 상태인데도
   * '확정(잠금)'으로 계속 표시됐다(감사 finding #53).
   *
   * admin-registrations.service.ts의 rosterLock() 판정(genderQuotaVerdict)과 같은 기준으로
   * 다시 계산하고, 위반이면 rosterLockedAt을 되돌려(자동 잠금 해제) 화면이 위반 상태를
   * '확정'이라고 잘못 말하지 않게 한다. 그 서비스는 이 배치의 ownedFiles 밖이라 판정 로직을
   * 그대로 중복한다 — genderMin/MaxMale/Female 컬럼 의미가 바뀌면 두 곳을 함께 고친다.
   */
  private async reconcileGenderQuotaAfterRosterChange(
    tx: Prisma.TransactionClient,
    registrationId: string,
    tournament: {
      genderCategory: V1TournamentGenderCategory | null;
      genderMinMale: number | null;
      genderMaxMale: number | null;
      genderMinFemale: number | null;
      genderMaxFemale: number | null;
    },
  ) {
    if (tournament.genderCategory !== 'mixed') return;

    const registration = await tx.v1TournamentRegistration.findUnique({
      where: { id: registrationId },
      select: { rosterLockedAt: true },
    });
    // 잠겨 있지 않으면 어드민이 지키려던 '확정 보증' 자체가 없으므로 재검증할 대상이 없다.
    if (!registration?.rosterLockedAt) return;

    const roster = await tx.v1TournamentPlayer.findMany({
      where: { registrationId, removedAt: null },
      select: { genderSnapshot: true },
    });
    const maleCount = roster.filter((p) => p.genderSnapshot === 'male').length;
    const femaleCount = roster.filter((p) => p.genderSnapshot === 'female').length;
    const maleOk =
      (tournament.genderMinMale === null || maleCount >= tournament.genderMinMale) &&
      (tournament.genderMaxMale === null || maleCount <= tournament.genderMaxMale);
    const femaleOk =
      (tournament.genderMinFemale === null || femaleCount >= tournament.genderMinFemale) &&
      (tournament.genderMaxFemale === null || femaleCount <= tournament.genderMaxFemale);
    if (!maleOk || !femaleOk) {
      await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: { rosterLockedAt: null },
      });
    }
  }

  private escapeCsvField(value: string): string {
    // ROSTER-002: CSV 수식 인젝션 차단 — =·+·-·@ 로 시작하는 값에 작은따옴표 prefix 삽입
    let sanitized = value;
    if (/^[=+\-@]/.test(sanitized)) {
      sanitized = `'${sanitized}`;
    }
    // RFC 4180: 콤마·쌍따옴표·줄바꿈 포함 시 쌍따옴표로 감싸기
    if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
      return `"${sanitized.replace(/"/g, '""')}"`;
    }
    return sanitized;
  }
}

function normalizeGender(value: string | null | undefined): 'male' | 'female' | null {
  return value === 'male' || value === 'female' ? value : null;
}

/** 명단 후보의 프로필 사실. 멤버십이 없으면 null 을 넘긴다. */
type RosterCandidateMember = {
  realName: string | null;
  birthDate: string | null;
  phone: string | null;
  gender: 'male' | 'female' | null;
  phoneVerifiedAt: Date | null;
};

type RosterCandidateBlock = {
  /** 서버 에러 코드. add 경로가 그대로 던진다. */
  code: string;
  /** 소비자용 에러 메시지. */
  message: string;
  /** 후보 드롭다운에 붙는 짧은 사유. */
  listReason: string;
  /** 409 인지 400 인지. */
  conflict: boolean;
};

/**
 * 이 사람을 지금 이 명단에 넣을 수 있는가. **추가 경로와 후보 목록이 이 함수 하나만 본다.**
 *
 * 원래는 같은 조건이 두 곳에 따로 적혀 있었고, 그래서 정원·취소 신청·대회 상태·성별 구분이
 * 한쪽에만 있는 채로 나갔다 — 화면은 "선택 가능"이라 하고 서버는 거절하는, 이 기능이 없애려던
 * 바로 그 상태다. 조건을 추가할 곳을 하나로 만들어 다시 갈라지지 않게 한다.
 *
 * 순서는 "그 사람에게 가장 구체적인 사유"부터다. 이미 명단에 있는 사람에게 정원이 찼다고
 * 말해 봐야 조치할 수 없다.
 */
function evaluateRosterCandidate(input: {
  alreadyOnRoster: boolean;
  /**
   * 같은 대회의 **다른** 팀(registration) 명단에 이미 활성 등록돼 있는가.
   * 감사 finding #50: 중복 판정이 registrationId 단위뿐이라, 한 사용자가 대회 T의 두 팀
   * 명단에 동시에 올라갈 수 있었다(두 팀 모두 그 사람이 active 멤버이면 가능한 정상 상태).
   */
  alreadyOnOtherTeamInTournament: boolean;
  tournamentMutable: boolean;
  registrationMutable: boolean;
  rosterCount: number;
  maxPlayers: number;
  member: RosterCandidateMember | null;
  genderCategory: V1TournamentGenderCategory | null;
  phoneEnforced: boolean;
}): RosterCandidateBlock | null {
  if (input.alreadyOnRoster) {
    return {
      code: 'PLAYER_ALREADY_REGISTERED',
      message: '이미 명단에 등록된 선수예요.',
      listReason: '이미 명단에 있어요',
      conflict: true,
    };
  }
  if (input.alreadyOnOtherTeamInTournament) {
    return {
      code: 'PLAYER_ALREADY_ON_ANOTHER_TEAM',
      message: '이 대회의 다른 팀 명단에 이미 등록된 선수예요.',
      listReason: '다른 팀에 이미 등록됐어요',
      conflict: true,
    };
  }
  if (!input.tournamentMutable) {
    return {
      code: 'TOURNAMENT_ROSTER_NOT_MUTABLE',
      message: '종료되었거나 취소된 대회는 선수 명단을 수정할 수 없어요.',
      listReason: '종료되었거나 취소된 대회예요',
      conflict: true,
    };
  }
  if (!input.registrationMutable) {
    return {
      code: 'REGISTRATION_ROSTER_NOT_MUTABLE',
      message: '취소 요청 또는 취소 완료된 신청은 선수 명단을 수정할 수 없어요.',
      listReason: '취소된 신청이라 명단을 수정할 수 없어요',
      conflict: true,
    };
  }
  if (input.rosterCount >= input.maxPlayers) {
    return {
      code: 'ROSTER_FULL',
      message: `최대 인원(${input.maxPlayers}명)을 초과할 수 없어요.`,
      listReason: `정원이 찼어요 (${input.rosterCount}/${input.maxPlayers}명)`,
      conflict: true,
    };
  }
  if (!input.member) {
    return {
      code: 'USER_NOT_TEAM_MEMBER',
      message: '해당 팀의 활성 멤버가 아니에요.',
      listReason: '팀의 활성 멤버가 아니에요',
      conflict: false,
    };
  }

  const { realName, birthDate, phone, gender, phoneVerifiedAt } = input.member;
  const requiresGender = input.genderCategory === 'mixed';
  if (!realName || !birthDate || !phone || (requiresGender && !gender)) {
    return {
      code: 'PLAYER_REQUIRED_PROFILE_MISSING',
      message: requiresGender
        ? '실명, 생년월일, 휴대폰 번호, 성별이 모두 등록된 팀원만 선수로 등록할 수 있어요.'
        : '실명, 생년월일, 휴대폰 번호가 모두 등록된 팀원만 선수로 등록할 수 있어요.',
      listReason: requiresGender
        ? '실명·생년월일·휴대폰·성별이 모두 필요해요'
        : '실명·생년월일·휴대폰이 모두 필요해요',
      conflict: false,
    };
  }
  // 남성부·여성부는 성별이 맞아야 한다. 예전엔 mixed 일 때 "성별이 있는지" 만 보고
  // male/female 대회에서는 아무 검사도 하지 않아, 여성부 대회에 남성을 넣을 수 있었다.
  const requiredGender = genderRequiredByCategory(input.genderCategory);
  if (requiredGender && gender !== requiredGender) {
    return {
      code: 'PLAYER_GENDER_MISMATCH',
      message:
        requiredGender === 'male'
          ? '남성부 대회에는 남성 팀원만 등록할 수 있어요.'
          : '여성부 대회에는 여성 팀원만 등록할 수 있어요.',
      listReason: requiredGender === 'male' ? '남성부 대회예요' : '여성부 대회예요',
      conflict: false,
    };
  }
  // 번호가 "적혀 있는지"만 보면 대회 명단이 약속하는 본인확인이 성립하지 않는다 —
  // 실제로 그 번호의 소유자임을 확인한(phoneVerifiedAt) 팀원만 출전 명단에 올린다.
  if (input.phoneEnforced && !phoneVerifiedAt) {
    return {
      code: 'PLAYER_PHONE_NOT_VERIFIED',
      message: '휴대폰 본인인증을 마친 팀원만 선수로 등록할 수 있어요.',
      listReason: '휴대폰 본인인증이 필요해요',
      conflict: false,
    };
  }
  return null;
}

/**
 * 대회 성별 구분이 요구하는 선수 성별. `mixed`(혼성)와 미지정은 특정 성별을 요구하지 않는다 —
 * 혼성은 "성별이 등록돼 있을 것"만 따로 검사한다.
 */
function genderRequiredByCategory(
  category: V1TournamentGenderCategory | null,
): 'male' | 'female' | null {
  return category === 'male' || category === 'female' ? category : null;
}
