import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeCompetitionSportCode } from './competition-config';
import { ChangeTournamentCompetitionConfigDto } from './competition-config.dto';
import { findTournamentOnSurface, findTournamentOnSurfaceOrThrow, TOURNAMENT_KINDS } from '../tournament-surface-lookup';

export class TournamentCompetitionConfig {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async change(
    user: V1AuthUser,
    tournamentId: string,
    dto: ChangeTournamentCompetitionConfigDto,
  ) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      include: { sport: true },
    });
    if (!tournament) {
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: '대회를 찾을 수 없어요.',
      });
    }
    if (tournament.updatedAt.toISOString() !== dto.expectedVersion) {
      throw new ConflictException({
        code: 'TOURNAMENT_VERSION_CONFLICT',
        message: '대회 설정이 다른 요청에서 변경됐어요. 다시 확인해 주세요.',
      });
    }
    const selected = await this.prisma.v1CompetitionConfigVersion.findUnique({
      where: { id: dto.competitionConfigVersionId },
    });
    if (!selected) {
      throw new NotFoundException({
        code: 'COMPETITION_CONFIG_NOT_FOUND',
        message: '경기 설정을 찾을 수 없어요.',
      });
    }
    if (selected.sportCode !== normalizeCompetitionSportCode(tournament.sport.code)) {
      throw new BadRequestException({
        code: 'COMPETITION_CONFIG_SPORT_MISMATCH',
        message: '대회 종목과 경기 설정 종목이 달라요.',
      });
    }

    const [
      fixtureCount,
      completedFixtureCount,
      standingCount,
      recordedStandingCount,
      legacyResultFixtureCount,
      startedGameCount,
    ] = await Promise.all([
      this.prisma.v1TournamentFixture.count({ where: { tournamentId } }),
      this.prisma.v1TournamentFixture.count({ where: { tournamentId, status: 'completed' } }),
      this.prisma.v1TournamentStanding.count({ where: { group: { tournamentId } } }),
      // 조에 팀을 배정하면 0점 순위 행이 미리 생긴다. 그 초기 행은 경기 결과가 아니므로
      // 설정 변경을 막지 않고, 실제 성적 값이 들어간 행만 소급 영향으로 본다.
      this.prisma.v1TournamentStanding.count({
        where: {
          group: { tournamentId },
          OR: [
            { points: { not: 0 } },
            { wins: { not: 0 } },
            { draws: { not: 0 } },
            { losses: { not: 0 } },
            { goalsFor: { not: 0 } },
            { goalsAgainst: { not: 0 } },
          ],
        },
      }),
      this.prisma.v1TournamentFixture.count({
        where: { tournamentId, result: { isNot: null } },
      }),
      // 대진 생성만으로 V1Game과 side/period 뼈대가 생긴다. 그 뼈대는 새 설정으로
      // 안전하게 repoint할 수 있지만, 라인업·이벤트·결과 리비전 또는 경기 시작 상태가
      // 하나라도 있으면 이미 경기 운영이 시작된 것이므로 확인 없이 바꾸지 않는다.
      this.prisma.v1Game.count({
        where: {
          tournamentFixture: { tournamentId },
          OR: [
            { state: { not: 'SCHEDULED' } },
            { lineups: { some: {} } },
            { events: { some: {} } },
            { resultRevisions: { some: {} } },
          ],
        },
      }),
    ]);
    const impact = {
      fixtureCount,
      completedFixtureCount,
      standingCount,
      requiresRecalculation:
        completedFixtureCount > 0 ||
        recordedStandingCount > 0 ||
        legacyResultFixtureCount > 0 ||
        startedGameCount > 0,
    };
    const effectivePreviewHash = selected.contentHash;

    if (
      impact.requiresRecalculation &&
      (!dto.confirmRecalculation || dto.previewHash !== effectivePreviewHash)
    ) {
      return {
        changed: false,
        currentCompetitionConfigVersionId: tournament.competitionConfigVersionId,
        requestedCompetitionConfigVersionId: selected.id,
        expectedVersion: tournament.updatedAt.toISOString(),
        previewHash: effectivePreviewHash,
        impact,
        confirmationRequired: true,
      };
    }
    if (tournament.competitionConfigVersionId === selected.id) {
      return {
        changed: false,
        currentCompetitionConfigVersionId: selected.id,
        expectedVersion: tournament.updatedAt.toISOString(),
        previewHash: effectivePreviewHash,
        impact,
        confirmationRequired: false,
      };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.v1Tournament.updateMany({
        where: { id: tournament.id, updatedAt: tournament.updatedAt },
        data: { competitionConfigVersionId: selected.id },
      });
      if (changed.count !== 1) {
        throw new ConflictException({
          code: 'TOURNAMENT_VERSION_CONFLICT',
          message: '대회 설정이 다른 요청에서 변경됐어요. 다시 확인해 주세요.',
        });
      }
      await tx.v1TournamentFixture.updateMany({
        where: { tournamentId, status: { not: 'completed' } },
        data: { competitionConfigVersionId: selected.id },
      });
      // GamesService의 라인업 검증은 fixture가 아니라 V1Game에 pin된 버전을 읽는다.
      // 따라서 아직 손대지 않은 scheduled game도 같은 트랜잭션에서 함께 바꿔야 관리자
      // 화면의 출전 인원과 실제 라인업 저장 규칙이 서로 어긋나지 않는다.
      await tx.v1Game.updateMany({
        where: {
          tournamentFixture: { tournamentId, status: { not: 'completed' } },
          state: 'SCHEDULED',
          lineups: { none: {} },
          events: { none: {} },
          resultRevisions: { none: {} },
        },
        data: { competitionConfigVersionId: selected.id },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.competition_config.change',
          targetType: 'tournament',
          targetId: tournamentId,
          beforeJson: { competitionConfigVersionId: tournament.competitionConfigVersionId },
          afterJson: { competitionConfigVersionId: selected.id, impact },
        },
        tx,
      );
      // 이 재조회는 CAS 갱신 직후 최신 행을 읽는 것이라 종류 조건이 이미 위에서
      // 검증됐지만, **원시 호출을 남기지 않는다** — 남기면 다음 사람이 여기만 예외라고
      // 읽고 새 원시 호출을 붙일 여지가 생긴다.
      return findTournamentOnSurfaceOrThrow(tx, TOURNAMENT_KINDS, { where: { id: tournamentId } });
    });
    return {
      changed: true,
      currentCompetitionConfigVersionId: selected.id,
      expectedVersion: updated.updatedAt.toISOString(),
      previewHash: effectivePreviewHash,
      impact,
      confirmationRequired: false,
    };
  }
}
