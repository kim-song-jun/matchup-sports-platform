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
    const tournament = await this.prisma.v1Tournament.findFirst({
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

    const [fixtureCount, completedFixtureCount, standingCount] = await Promise.all([
      this.prisma.v1TournamentFixture.count({ where: { tournamentId } }),
      this.prisma.v1TournamentFixture.count({ where: { tournamentId, status: 'completed' } }),
      this.prisma.v1TournamentStanding.count({ where: { group: { tournamentId } } }),
    ]);
    const impact = {
      fixtureCount,
      completedFixtureCount,
      standingCount,
      requiresRecalculation: completedFixtureCount > 0 || standingCount > 0,
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
      return tx.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId } });
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
